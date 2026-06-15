const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { readConfig } = require('../src/config');

function parseArgs(argv = process.argv) {
  const args = {
    configPath: path.resolve(process.cwd(), 'config.json'),
    keepMinutes: 30,
    all: false,
    vacuum: true,
    yes: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--config') args.configPath = path.resolve(argv[++i]);
    else if (arg === '--keep-minutes') args.keepMinutes = Number(argv[++i]);
    else if (arg === '--all') args.all = true;
    else if (arg === '--no-vacuum') args.vacuum = false;
    else if (arg === '--yes') args.yes = true;
  }
  if (!Number.isFinite(args.keepMinutes) || args.keepMinutes < 0) args.keepMinutes = 30;
  return args;
}

function fileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Number(bytes || 0);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit ? 1 : 0)} ${units[unit]}`;
}

function tableCount(db, table) {
  return Number(db.prepare(`SELECT COUNT(*) count FROM ${table}`).get().count || 0);
}

function deleteRows(db, sql, params = []) {
  return Number(db.prepare(sql).run(...params).changes || 0);
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function compactDatabase(db, databasePath, vacuum) {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  if (!vacuum) return;
  const compactPath = `${databasePath}.compact`;
  try {
    if (fs.existsSync(compactPath)) fs.unlinkSync(compactPath);
  } catch {
    // If an old compact file cannot be removed, VACUUM INTO will fail clearly.
  }
  db.exec(`VACUUM INTO ${sqlString(compactPath)}`);
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  return compactPath;
}

function cleanup() {
  const args = parseArgs();
  if (!args.yes) {
    console.error('Refusing to clean without --yes. Use CleanPantheonParserDB.bat for an interactive cleanup.');
    process.exitCode = 2;
    return;
  }

  const config = readConfig(args.configPath);
  const databasePath = config.database.path;
  if (!fs.existsSync(databasePath)) {
    console.error(`Database not found: ${databasePath}`);
    process.exitCode = 1;
    return;
  }

  const before = {
    db: fileSize(databasePath),
    wal: fileSize(`${databasePath}-wal`),
    shm: fileSize(`${databasePath}-shm`)
  };

  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA busy_timeout = 10000');
  db.exec('PRAGMA journal_mode = WAL');

  const countsBefore = {
    rawPackets: tableCount(db, 'raw_packets'),
    decodedMessages: tableCount(db, 'decoded_messages'),
    gameEvents: tableCount(db, 'game_events'),
    actorNames: tableCount(db, 'actor_names'),
    petNames: tableCount(db, 'pet_names')
  };

  const cutoff = new Date(Date.now() - args.keepMinutes * 60_000).toISOString();
  let deleted = {};

  db.exec('BEGIN IMMEDIATE');
  try {
    if (args.all) {
      deleted = {
        gameEvents: deleteRows(db, 'DELETE FROM game_events'),
        decodedMessages: deleteRows(db, 'DELETE FROM decoded_messages'),
        rawPackets: deleteRows(db, 'DELETE FROM raw_packets')
      };
    } else {
      deleted = {
        gameEvents: deleteRows(db, 'DELETE FROM game_events WHERE observed_at < ?', [cutoff]),
        decodedMessages: deleteRows(db, 'DELETE FROM decoded_messages WHERE observed_at < ?', [cutoff]),
        rawPackets: deleteRows(db, 'DELETE FROM raw_packets WHERE captured_at < ?', [cutoff])
      };
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  const compactPath = compactDatabase(db, databasePath, args.vacuum);

  const countsAfter = {
    rawPackets: tableCount(db, 'raw_packets'),
    decodedMessages: tableCount(db, 'decoded_messages'),
    gameEvents: tableCount(db, 'game_events'),
    actorNames: tableCount(db, 'actor_names'),
    petNames: tableCount(db, 'pet_names')
  };
  db.close();
  if (!compactPath) for (const suffix of ['-wal', '-shm']) {
    const sidecarPath = `${databasePath}${suffix}`;
    try {
      if (fs.existsSync(sidecarPath) && fileSize(sidecarPath) === 0) fs.unlinkSync(sidecarPath);
    } catch {
      // Sidecar files are harmless if SQLite keeps them open or recreates them.
    }
  }

  const after = {
    db: fileSize(databasePath),
    wal: fileSize(`${databasePath}-wal`),
    shm: fileSize(`${databasePath}-shm`)
  };

  console.log(JSON.stringify({
    databasePath,
    mode: args.all ? 'wipe-parser-data' : 'keep-recent',
    cutoff: args.all ? null : cutoff,
    keepMinutes: args.all ? null : args.keepMinutes,
    compactPath: compactPath || null,
    replacementPending: Boolean(compactPath),
    deleted,
    countsBefore,
    countsAfter,
    sizesBefore: {
      db: formatBytes(before.db),
      wal: formatBytes(before.wal),
      shm: formatBytes(before.shm)
    },
    sizesAfter: {
      db: formatBytes(after.db),
      wal: formatBytes(after.wal),
      shm: formatBytes(after.shm)
    }
  }, null, 2));
}

cleanup();
