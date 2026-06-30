const { readConfig } = require('../src/config');
const { cacheItemArt, itemArtCachePath, writeItemArtIndex } = require('../src/itemArt');
const { openStore } = require('../src/store');

function parseArgs(argv) {
  const args = {
    force: false,
    limit: 5000,
    delayMs: 50
  };
  for (const arg of argv) {
    if (arg === '--force') args.force = true;
    else if (arg.startsWith('--limit=')) args.limit = Math.max(1, Number(arg.slice('--limit='.length)) || args.limit);
    else if (arg.startsWith('--delay-ms=')) args.delayMs = Math.max(0, Number(arg.slice('--delay-ms='.length)) || args.delayMs);
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadArtRows(db, limit) {
  return db.prepare(`
    SELECT item_id itemId, name, json_extract(template_json, '$.artUrl') artUrl
    FROM loot_items
    WHERE json_extract(template_json, '$.artUrl') IS NOT NULL
      AND json_extract(template_json, '$.artUrl') != ''
    ORDER BY name
    LIMIT ?
  `).all(limit).map((row) => ({
    itemId: String(row.itemId),
    name: row.name,
    artUrl: row.artUrl
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = readConfig();
  const store = openStore(config.database.path);
  let downloaded = 0;
  let cached = 0;
  let failed = 0;
  try {
    const rows = loadArtRows(store.db, args.limit);
    writeItemArtIndex(rows.map((row) => ({ name: row.name, artUrl: row.artUrl, artSource: 'shalazam' })));
    for (const row of rows) {
      try {
        const result = await cacheItemArt(row.artUrl, { force: args.force });
        if (result.downloaded) downloaded += 1;
        else cached += 1;
        console.log(`${result.downloaded ? 'downloaded' : 'cached'} ${row.name} -> ${itemArtCachePath(row.artUrl)}`);
      } catch (error) {
        failed += 1;
        console.warn(`failed ${row.name}: ${error.message}`);
      }
      if (args.delayMs) await sleep(args.delayMs);
    }
    console.log(`item art cache complete: ${downloaded} downloaded, ${cached} already cached, ${failed} failed`);
  } finally {
    store.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
