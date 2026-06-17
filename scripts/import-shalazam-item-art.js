const https = require('node:https');
const { readConfig } = require('../src/config');
const { cacheItemArt, writeItemArtIndex } = require('../src/itemArt');
const { openStore } = require('../src/store');

const SHALAZAM_ORIGIN = 'https://shalazam.info';

function parseArgs(argv) {
  const args = {
    pages: 104,
    startPage: 1,
    delayMs: 750,
    download: false,
    dryRun: false
  };
  for (const arg of argv) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--download') args.download = true;
    else if (arg.startsWith('--pages=')) args.pages = Math.max(1, Number(arg.slice('--pages='.length)) || args.pages);
    else if (arg.startsWith('--start-page=')) args.startPage = Math.max(1, Number(arg.slice('--start-page='.length)) || args.startPage);
    else if (arg.startsWith('--delay-ms=')) args.delayMs = Math.max(0, Number(arg.slice('--delay-ms='.length)) || args.delayMs);
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Pantheon Atlas item art importer',
        'Accept': 'text/html,application/xhtml+xml'
      }
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        fetchText(new URL(res.headers.location, url).toString()).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Fetch failed ${res.statusCode}: ${url}`));
        return;
      }
      const chunks = [];
      res.setEncoding('utf8');
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(chunks.join('')));
    }).on('error', reject);
  });
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalizeName(value) {
  return decodeHtml(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseImageRows(html) {
  const rows = new Map();
  const imgPattern = /<img\b[^>]*\balt="([^"]+)"[^>]*\bsrc="([^"]+)"[^>]*>/gi;
  let match;
  while ((match = imgPattern.exec(html))) {
    const name = decodeHtml(match[1]).trim();
    const src = decodeHtml(match[2]).trim();
    if (!name || !src || !src.startsWith('/static/icons/')) continue;
    rows.set(normalizeName(name), {
      name,
      artUrl: new URL(src, SHALAZAM_ORIGIN).toString()
    });
  }
  return rows;
}

function loadLocalItems(db) {
  return db.prepare(`
    SELECT item_id itemId, name, template_json templateJson
    FROM loot_items
    ORDER BY name
  `).all().map((row) => ({
    itemId: String(row.itemId),
    name: row.name,
    key: normalizeName(row.name),
    template: JSON.parse(row.templateJson || '{}')
  }));
}

function updateArtUrls(db, matches, dryRun = false) {
  const update = db.prepare('UPDATE loot_items SET template_json = ? WHERE item_id = ?');
  const rows = matches.filter((row) => row.artUrl && row.template.artUrl !== row.artUrl);
  if (dryRun || !rows.length) return { matched: matches.length, updated: rows.length };
  let updated = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const row of rows) {
      const nextTemplate = { ...row.template, artUrl: row.artUrl, artSource: 'shalazam' };
      update.run(JSON.stringify(nextTemplate), row.itemId);
      updated += 1;
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { matched: matches.length, updated };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = readConfig();
  const store = openStore(config.database.path);
  try {
    const localItems = loadLocalItems(store.db);
    const wanted = new Map(localItems.map((item) => [item.key, item]));
    const matches = new Map();

    for (let page = args.startPage; page < args.startPage + args.pages && matches.size < wanted.size; page += 1) {
      let html;
      try {
        html = await fetchText(`${SHALAZAM_ORIGIN}/items?page=${page}`);
      } catch (error) {
        console.warn(`stopping at page ${page}: ${error.message}`);
        break;
      }
      const remoteRows = parseImageRows(html);
      for (const [key, remote] of remoteRows) {
        const local = wanted.get(key);
        if (local && !matches.has(local.itemId)) {
          matches.set(local.itemId, {
            ...local,
            shalazamName: remote.name,
            artUrl: remote.artUrl
          });
        }
      }
      console.log(`page ${page}: ${matches.size}/${wanted.size} local items matched`);
      if (args.delayMs) await sleep(args.delayMs);
    }

    const result = updateArtUrls(store.db, [...matches.values()], args.dryRun);
    console.log(`${args.dryRun ? 'would update' : 'updated'} ${result.updated} item art URLs (${result.matched} matched)`);
    if (!args.dryRun) {
      writeItemArtIndex([...matches.values()].map((item) => ({
        name: item.name,
        artUrl: item.artUrl,
        artSource: 'shalazam'
      })));
      console.log(`indexed ${matches.size} item art associations`);
    }
    if (args.download && !args.dryRun) {
      let downloaded = 0;
      let cached = 0;
      let failed = 0;
      for (const item of matches.values()) {
        try {
          const cachedArt = await cacheItemArt(item.artUrl);
          if (cachedArt.downloaded) downloaded += 1;
          else cached += 1;
        } catch (error) {
          failed += 1;
          console.warn(`failed art download for ${item.name}: ${error.message}`);
        }
      }
      console.log(`downloaded item art: ${downloaded} new, ${cached} already cached, ${failed} failed`);
    }
  } finally {
    store.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
