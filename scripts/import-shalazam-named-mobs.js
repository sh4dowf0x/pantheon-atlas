const path = require('node:path');
const { readConfig } = require('../src/config');
const { openStore } = require('../src/store');
const {
  SHALAZAM_BASE_URL,
  parseMonsterDetailPage,
  parseNamedMobListPage,
  upsertNamedMob
} = require('../src/namedMobs');

function parseArgs(argv = process.argv) {
  const args = {
    configPath: path.resolve(process.cwd(), 'config.json'),
    databasePath: null,
    maxPages: null,
    limit: null,
    details: true,
    missingDetailsOnly: false,
    detailDelayMs: 500
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--config') args.configPath = path.resolve(argv[++i]);
    else if (arg === '--database') args.databasePath = path.resolve(argv[++i]);
    else if (arg === '--pages') args.maxPages = Number(argv[++i]);
    else if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg === '--no-details') args.details = false;
    else if (arg === '--missing-details') args.missingDetailsOnly = true;
    else if (arg === '--detail-delay') args.detailDelayMs = Number(argv[++i]);
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHtml(url, options = {}) {
  const attempts = Math.max(1, Number(options.attempts || 1));
  const retryDelayMs = Math.max(250, Number(options.retryDelayMs || 1000));
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          'accept': 'text/html',
          'user-agent': 'PantheonParser2 local named mob seed'
        }
      });
      if (res.ok) return res.text();
      lastError = new Error(`Fetch failed ${res.status} ${res.statusText}: ${url}`);
      if (res.status !== 429 || attempt === attempts) throw lastError;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
    }
    await sleep(retryDelayMs * attempt);
  }
  throw lastError;
}

function mobHasDetails(db, shalazamId) {
  const row = db.prepare(`
    SELECT nm.difficulty, nm.level_min levelMin, nm.location,
           COUNT(sp.id) spawnPoints
    FROM named_mobs nm
    LEFT JOIN named_spawn_points sp ON sp.shalazam_id = nm.shalazam_id
    WHERE nm.shalazam_id = ?
    GROUP BY nm.shalazam_id
  `).get(shalazamId);
  return Boolean(row && row.location && (row.difficulty || row.levelMin !== null || Number(row.spawnPoints || 0) > 0));
}

async function importShalazamNamedMobs(options = {}) {
  const config = readConfig(options.configPath || path.resolve(process.cwd(), 'config.json'));
  const databasePath = options.databasePath || config.database.path;
  const store = openStore(databasePath);
  const importedAt = new Date().toISOString();
  const maxPages = Number.isFinite(Number(options.maxPages)) && Number(options.maxPages) > 0
    ? Number(options.maxPages)
    : Infinity;
  const limit = Number.isFinite(Number(options.limit)) && Number(options.limit) > 0
    ? Number(options.limit)
    : Infinity;
  const detailDelayMs = Math.max(120, Number(options.detailDelayMs || 500));
  let imported = 0;
  let detailCount = 0;
  let page = 1;
  let totalCount = Infinity;
  const seen = new Set();

  try {
    while (page <= maxPages && imported < limit && seen.size < totalCount) {
      const listUrl = `${SHALAZAM_BASE_URL}/monsters?named=yes&page=${page}`;
      const listPage = parseNamedMobListPage(await fetchHtml(listUrl));
      totalCount = listPage.totalCount || totalCount;
      if (!listPage.rows.length) break;
      for (const row of listPage.rows) {
        if (seen.has(row.shalazamId) || imported >= limit) continue;
        seen.add(row.shalazamId);
        let mob = row;
        if (options.details !== false && (!options.missingDetailsOnly || !mobHasDetails(store.db, row.shalazamId))) {
          await sleep(detailDelayMs);
          try {
            mob = parseMonsterDetailPage(await fetchHtml(row.sourceUrl, {
              attempts: 4,
              retryDelayMs: detailDelayMs * 2
            }), row);
            detailCount += 1;
          } catch (error) {
            console.warn(`Detail import failed for ${row.name}: ${error.message}`);
          }
        }
        if (upsertNamedMob(store.db, mob, importedAt)) imported += 1;
      }
      console.log(`Imported page ${page}: ${imported}/${Number.isFinite(totalCount) ? totalCount : '?'} named mobs`);
      page += 1;
      await sleep(180);
    }
    return {
      databasePath,
      imported,
      detailCount,
      totalCount: Number.isFinite(totalCount) ? totalCount : null,
      importedAt
    };
  } finally {
    store.close();
  }
}

if (require.main === module) {
  importShalazamNamedMobs(parseArgs()).then((result) => {
    console.log(JSON.stringify(result, null, 2));
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  importShalazamNamedMobs,
  parseArgs
};
