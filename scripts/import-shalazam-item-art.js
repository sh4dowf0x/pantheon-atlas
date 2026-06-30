const https = require('node:https');
const { readConfig } = require('../src/config');
const { cacheItemArt, writeItemArtIndex } = require('../src/itemArt');
const { openStore } = require('../src/store');

const SHALAZAM_ORIGIN = 'https://shalazam.info';

function parseArgs(argv) {
  const args = {
    configPath: null,
    databasePath: null,
    pages: 104,
    startPage: 1,
    delayMs: 750,
    download: false,
    dryRun: false,
    searchMissing: false,
    retries: 4,
    retryDelayMs: 5000
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--download') args.download = true;
    else if (arg === '--search-missing') args.searchMissing = true;
    else if (arg === '--config') args.configPath = argv[++index];
    else if (arg.startsWith('--config=')) args.configPath = arg.slice('--config='.length);
    else if (arg === '--database') args.databasePath = argv[++index];
    else if (arg.startsWith('--database=')) args.databasePath = arg.slice('--database='.length);
    else if (arg.startsWith('--pages=')) args.pages = Math.max(1, Number(arg.slice('--pages='.length)) || args.pages);
    else if (arg.startsWith('--start-page=')) args.startPage = Math.max(1, Number(arg.slice('--start-page='.length)) || args.startPage);
    else if (arg.startsWith('--delay-ms=')) {
      const value = Number(arg.slice('--delay-ms='.length));
      args.delayMs = Number.isFinite(value) ? Math.max(0, value) : args.delayMs;
    }
    else if (arg.startsWith('--retries=')) args.retries = Math.max(1, Number(arg.slice('--retries='.length)) || args.retries);
    else if (arg.startsWith('--retry-delay-ms=')) args.retryDelayMs = Math.max(250, Number(arg.slice('--retry-delay-ms='.length)) || args.retryDelayMs);
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url, options = {}) {
  const attempts = Math.max(1, Number(options.retries || 1));
  const retryDelayMs = Math.max(250, Number(options.retryDelayMs || 5000));
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await new Promise((resolve, reject) => {
        https.get(url, {
          headers: {
            'User-Agent': 'Pantheon Atlas item art importer',
            'Accept': 'text/html,application/xhtml+xml',
            ...(options.turboFrame ? { 'Turbo-Frame': options.turboFrame } : {})
          }
        }, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            fetchText(new URL(res.headers.location, url).toString(), options).then(resolve, reject);
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
    } catch (error) {
      lastError = error;
      if (!/Fetch failed 429/.test(error.message) || attempt === attempts) throw error;
      const waitMs = retryDelayMs * attempt;
      console.warn(`rate limited; retrying in ${waitMs}ms (${attempt}/${attempts})`);
      await sleep(waitMs);
    }
  }
  throw lastError;
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
    .replace(/^image:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseImageRows(html) {
  const rows = new Map();
  const imgPattern = /<img\b[^>]*\balt="([^"]+)"[^>]*\bsrc="([^"]+)"[^>]*>/gi;
  let match;
  while ((match = imgPattern.exec(html))) {
    const name = decodeHtml(match[1]).replace(/^Image:\s*/i, '').trim();
    const src = decodeHtml(match[2]).trim();
    if (!name || !src || !src.startsWith('/static/icons/')) continue;
    rows.set(normalizeName(name), {
      name,
      artUrl: new URL(src, SHALAZAM_ORIGIN).toString()
    });
  }
  const itemLinkPattern = /<a\b[^>]*href="\/items\/[^"]+"[^>]*>([\s\S]*?)<\/a>/gi;
  while ((match = itemLinkPattern.exec(html))) {
    const linkHtml = match[0];
    const text = decodeHtml(match[1].replace(/<[^>]+>/g, ' ')).trim();
    const img = linkHtml.match(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/i);
    if (!text || !img) continue;
    const src = decodeHtml(img[1]).trim();
    if (!src || !src.startsWith('/static/icons/')) continue;
    rows.set(normalizeName(text), {
      name: text,
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

function loadMissingArtItems(db) {
  return db.prepare(`
    SELECT item_id itemId, name, template_json templateJson
    FROM loot_items
    WHERE json_extract(template_json, '$.artUrl') IS NULL
       OR json_extract(template_json, '$.artUrl') = ''
    ORDER BY last_seen DESC, name
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
  const config = readConfig(args.configPath || undefined);
  const store = openStore(args.databasePath || config.database.path);
  try {
    const localItems = loadLocalItems(store.db);
    const wanted = new Map(localItems.map((item) => [item.key, item]));
    const matches = new Map();

    for (let page = args.startPage; !args.searchMissing && page < args.startPage + args.pages && matches.size < wanted.size; page += 1) {
      let html;
      try {
        html = await fetchText(`${SHALAZAM_ORIGIN}/items?page=${page}`, {
          retries: args.retries,
          retryDelayMs: args.retryDelayMs
        });
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

    if (args.searchMissing) {
      const missingItems = loadMissingArtItems(store.db);
      for (const local of missingItems) {
        let html;
        try {
          html = await fetchText(`${SHALAZAM_ORIGIN}/items?q=${encodeURIComponent(local.name)}`, {
            turboFrame: 'itemList',
            retries: args.retries,
            retryDelayMs: args.retryDelayMs
          });
        } catch (error) {
          console.warn(`search failed for ${local.name}: ${error.message}`);
          continue;
        }
        const remote = parseImageRows(html).get(local.key);
        if (remote) {
          matches.set(local.itemId, {
            ...local,
            shalazamName: remote.name,
            artUrl: remote.artUrl
          });
        }
        console.log(`search ${local.name}: ${remote ? 'matched' : 'no art'} (${matches.size}/${missingItems.length})`);
        if (args.delayMs) await sleep(args.delayMs);
      }
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
