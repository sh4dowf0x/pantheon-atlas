const fs = require('node:fs');
const path = require('node:path');
const { readConfig } = require('../src/config');
const { openStore } = require('../src/store');
const { insertMapCalibrationSample, mapCalibrationLayerKeyForLabel } = require('../src/dashboard');

function parseArgs(argv = process.argv) {
  const args = {
    configPath: 'config.json',
    label: null,
    mapKey: null,
    layerKey: null,
    file: null,
    minDistance: 2,
    pollMs: 500,
    fromStart: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--config') args.configPath = argv[++i];
    else if (arg === '--label') args.label = String(argv[++i] || '').trim();
    else if (arg === '--map') args.mapKey = String(argv[++i] || '').trim();
    else if (arg === '--layer') args.layerKey = String(argv[++i] || '').trim();
    else if (arg === '--file') args.file = String(argv[++i] || '').trim();
    else if (arg === '--min-distance') args.minDistance = Math.max(0, Number(argv[++i]) || args.minDistance);
    else if (arg === '--poll-ms') args.pollMs = Math.max(100, Number(argv[++i]) || args.pollMs);
    else if (arg === '--from-start') args.fromStart = true;
  }
  return args;
}

function distance(left, right) {
  if (!left || !right) return Infinity;
  return Math.hypot(
    Number(left.x) - Number(right.x),
    Number(left.y) - Number(right.y),
    Number(left.z) - Number(right.z)
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultEntityScannerFile(config) {
  return config.entityScannerLogs?.liveFile || path.join(
    process.env.ProgramData || 'C:\\ProgramData',
    'PantheonEntityScanner',
    'entities-live-current.jsonl'
  );
}

async function main() {
  const args = parseArgs();
  if (!args.label || !args.mapKey) {
    console.error('Usage: node scripts/record-map-calibration-log.js --label <label> --map <mapKey> [--layer <layerKey>]');
    process.exitCode = 1;
    return;
  }
  const config = readConfig(args.configPath);
  const file = path.resolve(args.file || defaultEntityScannerFile(config));
  const store = openStore(config.database.path);
  const sessionName = `${args.label}-${new Date().toISOString()}`;
  let offset = args.fromStart ? 0 : fs.existsSync(file) ? fs.statSync(file).size : 0;
  let buffered = '';
  let lastSample = null;
  let saved = 0;
  let seen = 0;

  console.log(`Recording ${args.label} calibration from ${file}`);
  console.log(`Database: ${config.database.path}`);
  console.log('Press Ctrl+C to stop.');

  const stop = () => {
    console.log(`\nStopped. Saved ${saved} sample${saved === 1 ? '' : 's'} from ${seen} local-player row${seen === 1 ? '' : 's'}.`);
    store.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  while (true) {
    try {
      const stat = fs.statSync(file);
      if (stat.size < offset) offset = 0;
      if (stat.size > offset) {
        const fd = fs.openSync(file, 'r');
        const length = stat.size - offset;
        const buffer = Buffer.alloc(length);
        fs.readSync(fd, buffer, 0, length, offset);
        fs.closeSync(fd);
        offset = stat.size;
        buffered += buffer.toString('utf8');
        const lines = buffered.split(/\r?\n/);
        buffered = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let record;
          try {
            record = JSON.parse(line);
          } catch {
            continue;
          }
          if (String(record.EventType || '').toLowerCase() !== 'localplayer') continue;
          seen += 1;
          const row = {
            observedAt: record.TimestampUtc,
            source: record.Name || null,
            entityId: record.CharacterId ? `scanner:character:${record.CharacterId}` : null,
            x: Number(record.X),
            y: Number(record.Y),
            z: Number(record.Z),
            heading: Number(record.HeadingY)
          };
          if (![row.x, row.y, row.z].every(Number.isFinite)) continue;
          if (lastSample && distance(row, lastSample) < args.minDistance) continue;
          const sample = insertMapCalibrationSample(store.db, {
            ...row,
            sessionName,
            label: args.label,
            mapKey: args.mapKey,
            layerKey: args.layerKey || mapCalibrationLayerKeyForLabel(args.label)
          });
          lastSample = sample;
          saved += 1;
          process.stdout.write(`\rSaved ${saved} | ${sample.mapKey}/${sample.layerKey || '-'} | X ${sample.x.toFixed(1)} Y ${sample.y.toFixed(1)} Z ${sample.z.toFixed(1)}      `);
        }
      }
    } catch (error) {
      process.stdout.write(`\rWaiting for log file: ${error.message}      `);
    }
    await sleep(args.pollMs);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
