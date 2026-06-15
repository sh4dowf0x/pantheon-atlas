const http = require('node:http');
const { readConfig } = require('../src/config');
const { openStore } = require('../src/store');
const { insertMapCalibrationSample, mapCalibrationLayerKeyForLabel } = require('../src/dashboard');

function parseArgs(argv = process.argv) {
  const args = {
    configPath: 'config.json',
    port: null,
    label: null,
    mapKey: null,
    layerKey: null,
    intervalMs: 1000,
    minDistance: 3,
    durationMs: 0
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--config') args.configPath = argv[++i];
    else if (arg === '--port') args.port = Number(argv[++i]);
    else if (arg === '--label') args.label = String(argv[++i] || '').trim();
    else if (arg === '--map') args.mapKey = String(argv[++i] || '').trim();
    else if (arg === '--layer') args.layerKey = String(argv[++i] || '').trim();
    else if (arg === '--interval-ms') args.intervalMs = Math.max(250, Number(argv[++i]) || args.intervalMs);
    else if (arg === '--min-distance') args.minDistance = Math.max(0, Number(argv[++i]) || args.minDistance);
    else if (arg === '--duration-sec') args.durationMs = Math.max(0, (Number(argv[++i]) || 0) * 1000);
  }
  return args;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 5000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`${res.statusCode} ${res.statusMessage}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });
    req.on('error', reject);
  });
}

function distance(left, right) {
  if (!left || !right) return Infinity;
  return Math.hypot(
    Number(left.x) - Number(right.x),
    Number(left.y) - Number(right.y),
    Number(left.z) - Number(right.z)
  );
}

function inferMapKey(row, fallback) {
  if (fallback) return fallback;
  const x = Number(row?.x);
  const y = Number(row?.y);
  const z = Number(row?.z);
  if (Number.isFinite(x) && Number.isFinite(z) && x >= -320 && x <= 320 && z >= -420 && z <= 240) return 'halnir_cave';
  if (
    Number.isFinite(x) && x >= 3300 && x <= 3700
    && Number.isFinite(z) && z >= 3000 && z <= 3350
    && Number.isFinite(y) && y >= 430 && y <= 560
  ) return 'goblin_cave';
  return 'kingsreach';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs();
  if (!args.label) {
    console.error('Usage: node scripts/record-map-calibration.js --label <surface-road|upper|mid|lower1|lower2> [--map goblin_cave]');
    process.exitCode = 1;
    return;
  }

  const config = readConfig(args.configPath);
  const port = args.port || Number(config.server?.port || 3117);
  const store = openStore(config.database.path);
  const startedAt = Date.now();
  const sessionName = `${args.label}-${new Date().toISOString()}`;
  let lastSample = null;
  let saved = 0;
  let seen = 0;

  console.log(`Recording ${args.label} calibration from http://localhost:${port}/api/positions`);
  console.log(`Database: ${config.database.path}`);
  console.log('Press Ctrl+C to stop.');

  const stop = () => {
    console.log(`\nStopped. Saved ${saved} sample${saved === 1 ? '' : 's'} from ${seen} poll${seen === 1 ? '' : 's'}.`);
    store.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  while (!args.durationMs || Date.now() - startedAt < args.durationMs) {
    try {
      const params = new URLSearchParams({
        limit: '1',
        actors: '1',
        since: new Date(Date.now() - 30_000).toISOString()
      });
      const data = await fetchJson(`http://localhost:${port}/api/positions?${params}`);
      const row = data.latest?.[0] || data.trail?.[0] || null;
      seen += 1;
      if (row && Number.isFinite(Number(row.x)) && Number.isFinite(Number(row.y)) && Number.isFinite(Number(row.z))) {
        if (!lastSample || distance(row, lastSample) >= args.minDistance) {
          const sample = insertMapCalibrationSample(store.db, {
            observedAt: row.observedAt,
            sessionName,
            label: args.label,
            mapKey: inferMapKey(row, args.mapKey),
            layerKey: args.layerKey || mapCalibrationLayerKeyForLabel(args.label),
            source: row.source,
            entityId: row.entityId,
            x: row.x,
            y: row.y,
            z: row.z,
            heading: row.heading
          });
          lastSample = sample;
          saved += 1;
          process.stdout.write(`\rSaved ${saved} | ${sample.mapKey}/${sample.layerKey || '-'} | X ${sample.x.toFixed(1)} Y ${sample.y.toFixed(1)} Z ${sample.z.toFixed(1)}      `);
        }
      }
    } catch (error) {
      process.stdout.write(`\rWaiting for live positions: ${error.message}      `);
    }
    await sleep(args.intervalMs);
  }
  stop();
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
