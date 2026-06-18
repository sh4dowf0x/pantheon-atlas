const path = require('node:path');
const fs = require('node:fs');
const readline = require('node:readline');
const { execFile } = require('node:child_process');
const { readConfig } = require('./config');
const { AddonLogIngestor } = require('./addonLog');
const { EntityScannerLogIngestor } = require('./entityScannerLog');
const { LootLogIngestor } = require('./lootLog');
const { CommunityItemSync } = require('./itemSync');
const { CommunityMobSync } = require('./mobSync');
const { sampleProcessMemoryStrings } = require('./memoryProbe');
const { openStore } = require('./store');
const { startDashboard } = require('./dashboard');

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv = process.argv) {
  const args = {
    configPath: path.resolve(process.cwd(), 'config.json'),
    port: null,
    pid: null,
    character: null,
    headless: false
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--config') args.configPath = path.resolve(argv[++i]);
    else if (arg === '--port') args.port = Number(argv[++i]);
    else if (arg === '--pid') args.pid = Number(argv[++i]);
    else if (arg === '--character' || arg === '-c') args.character = String(argv[++i] || '').trim() || null;
    else if (arg === '--headless') args.headless = true;
  }
  return args;
}

function sanitizeCharacterName(value) {
  const name = String(value || '').trim();
  if (!name) return null;
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim() || null;
}

function canonicalCharacterLogName(value) {
  const name = sanitizeCharacterName(value);
  if (!name) return null;
  return name.toLowerCase() === 'current' ? 'Current' : name;
}

function characterLogPath(existingPath, filePrefix, characterName, fallbackDir) {
  const safeName = canonicalCharacterLogName(characterName);
  if (!safeName) return existingPath;
  const fileName = safeName.toLowerCase() === 'current' ? 'current' : safeName;
  const current = String(existingPath || '');
  if (current.includes('{character}')) return current.replace(/\{character\}/g, fileName);
  const dir = current ? path.dirname(current) : fallbackDir;
  return path.join(dir, `${filePrefix}-${fileName}.jsonl`);
}

function logDirectory(filePath, fallbackDir) {
  const current = String(filePath || '');
  if (!current) return fallbackDir;
  return path.dirname(current.replace(/\{character\}/g, 'current'));
}

function discoverCharactersInDirectory(dir, pattern) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const match = entry.name.match(pattern);
        if (!match) return null;
        const name = canonicalCharacterLogName(match[1]);
        if (!name) return null;
        const stat = fs.statSync(path.join(dir, entry.name));
        return {
          name,
          path: path.join(dir, entry.name),
          lastWriteMs: stat.mtimeMs,
          size: stat.size
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function discoverCharacterLogChoices(config) {
  const programData = process.env.ProgramData || 'C:\\ProgramData';
  const combatDir = logDirectory(config.addonLogs?.liveFile, path.join(programData, 'PantheonCombatData'));
  const entityDir = logDirectory(config.entityScannerLogs?.liveFile, path.join(programData, 'PantheonEntityScanner'));
  const byName = new Map();
  for (const row of discoverCharactersInDirectory(combatDir, /^combat-live-(.+)\.jsonl$/i)) {
    const current = byName.get(row.name) || { name: row.name, combat: null, entity: null, lastWriteMs: 0, totalSize: 0 };
    current.combat = row;
    current.lastWriteMs = Math.max(current.lastWriteMs, row.lastWriteMs);
    current.totalSize += row.size;
    byName.set(row.name, current);
  }
  for (const row of discoverCharactersInDirectory(entityDir, /^entities-live-(.+)\.jsonl$/i)) {
    const current = byName.get(row.name) || { name: row.name, combat: null, entity: null, lastWriteMs: 0, totalSize: 0 };
    current.entity = row;
    current.lastWriteMs = Math.max(current.lastWriteMs, row.lastWriteMs);
    current.totalSize += row.size;
    byName.set(row.name, current);
  }
  return [...byName.values()]
    .sort((left, right) => right.lastWriteMs - left.lastWriteMs || left.name.localeCompare(right.name));
}

function promptLine(question, input = process.stdin, output = process.stdout) {
  const rl = readline.createInterface({ input, output });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || '').trim());
    });
  });
}

async function chooseCharacter(config, options = {}) {
  const explicit = canonicalCharacterLogName(options.character || process.env.PANTHEON_CHARACTER);
  if (explicit) return explicit;
  const choices = discoverCharacterLogChoices(config);
  const configured = canonicalCharacterLogName(config.pantheon?.localPlayerName);
  if (!choices.length) return configured;
  if (!options.input?.isTTY && options.input !== undefined) return configured || choices[0].name;
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  if (!input.isTTY) return configured || choices[0].name;

  output.write('\nAvailable Pantheon character logs:\n');
  choices.forEach((choice, index) => {
    const parts = [
      choice.combat ? 'combat' : null,
      choice.entity ? 'entities' : null
    ].filter(Boolean).join(' + ') || 'logs';
    const ageSeconds = Math.max(0, Math.round((Date.now() - choice.lastWriteMs) / 1000));
    const marker = configured && choice.name.toLowerCase() === configured.toLowerCase() ? ' [configured]' : '';
    output.write(`  ${index + 1}. ${choice.name}${marker} (${parts}, ${ageSeconds}s ago)\n`);
  });
  const defaultIndex = configured
    ? Math.max(0, choices.findIndex((choice) => choice.name.toLowerCase() === configured.toLowerCase()))
    : 0;
  const fallback = choices[defaultIndex] || choices[0];
  const answer = await promptLine(`Choose character log files [${defaultIndex + 1}]: `, input, output);
  if (!answer) return fallback.name;
  const numeric = Number(answer);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= choices.length) return choices[numeric - 1].name;
  const named = choices.find((choice) => choice.name.toLowerCase() === answer.toLowerCase());
  return named ? named.name : canonicalCharacterLogName(answer) || fallback.name;
}

function applyCharacterSelection(config, requestedCharacter = null) {
  const character = canonicalCharacterLogName(
    requestedCharacter
    || process.env.PANTHEON_CHARACTER
    || config.pantheon?.localPlayerName
  );
  if (!character) return config;
  config.pantheon = { ...(config.pantheon || {}), localPlayerName: character };
  if (config.addonLogs?.liveFile) {
    config.addonLogs.liveFile = characterLogPath(
      config.addonLogs.liveFile,
      'combat-live',
      character,
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'PantheonCombatData')
    );
  }
  if (config.entityScannerLogs?.liveFile) {
    config.entityScannerLogs.liveFile = characterLogPath(
      config.entityScannerLogs.liveFile,
      'entities-live',
      character,
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'PantheonEntityScanner')
    );
  }
  if (config.lootLogs?.liveFile && String(config.lootLogs.liveFile).includes('{character}')) {
    config.lootLogs.liveFile = characterLogPath(
      config.lootLogs.liveFile,
      'loot-events',
      character,
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'PantheonLootData')
    );
  }
  return config;
}

function seedActorNames(store, parserContext) {
  if (!parserContext.actorNameById) parserContext.actorNameById = new Map();
  let count = 0;
  for (const record of store.getActorNames()) {
    parserContext.actorNameById.set(record.entityId, record.name);
    count += 1;
  }
  return count;
}

function seedPetNames(store, parserContext) {
  if (!parserContext.petNameById) parserContext.petNameById = new Map();
  if (!parserContext.petDisplayNameById) parserContext.petDisplayNameById = new Map();
  let count = 0;
  for (const record of store.getPetNames()) {
    parserContext.petNameById.set(record.entityId, record.name);
    const displayName = String(record.rawName || '').trim();
    const rawTitle = String(record.rawTitle || '').trim().replace(/^<|>$/g, '').trim();
    parserContext.petDisplayNameById.set(
      record.entityId,
      rawTitle || (record.ownerName ? `${record.ownerName}'s Minion` : displayName)
    );
    count += 1;
  }
  return count;
}

function seedWorldEntities(store, parserContext, limit = 5000) {
  if (!parserContext.entityNameById) parserContext.entityNameById = new Map();
  if (!parserContext.entityLevelById) parserContext.entityLevelById = new Map();
  if (!parserContext.entityKindById) parserContext.entityKindById = new Map();
  if (!parserContext.lastPositionById) parserContext.lastPositionById = new Map();
  let count = 0;
  const rows = store.db.prepare(`
    SELECT damage_type AS entityId, target AS name, amount AS level, ability,
           x, y, z, observed_at AS observedAt
    FROM game_events
    WHERE event_type IN ('world_entity', 'harvest_node')
      AND damage_type IS NOT NULL
      AND target IS NOT NULL
    ORDER BY observed_at DESC, id DESC
    LIMIT ?
  `).all(limit);

  for (const row of rows) {
    if (!row.entityId || !row.name || parserContext.entityNameById.has(row.entityId)) continue;
    parserContext.entityNameById.set(row.entityId, row.name);
    if (Number.isFinite(Number(row.level)) && Number(row.level) > 0) {
      parserContext.entityLevelById.set(row.entityId, Number(row.level));
    }
    if (String(row.ability || '').startsWith('entityKind:')) {
      parserContext.entityKindById.set(row.entityId, String(row.ability).slice('entityKind:'.length));
    }
    const x = Number(row.x);
    const y = Number(row.y);
    const z = Number(row.z);
    if ([x, y, z].every(Number.isFinite)) {
      parserContext.lastPositionById.set(row.entityId, {
        observedAt: row.observedAt,
        x,
        y,
        z
      });
    }
    count += 1;
  }
  return count;
}

async function runApp(argv = process.argv) {
  const args = parseArgs(argv);
  const config = readConfig(args.configPath);
  if (config.communityMobs && config.communityItems) {
    config.communityMobs.r2 = {
      ...(config.communityItems.r2 || {}),
      ...(config.communityMobs.r2 || {})
    };
    if (config.communityItems.uploadEnabled && config.communityMobs.uploadEnabled === false) {
      config.communityMobs.uploadEnabled = true;
    }
    if (config.communityItems.uploadMode && !config.communityMobs.uploadMode) {
      config.communityMobs.uploadMode = config.communityItems.uploadMode;
    }
  }
  if (args.port) config.server.port = args.port;
  if (args.pid) config.pantheon.processId = args.pid;
  const selectedCharacter = await chooseCharacter(config, { character: args.character });
  applyCharacterSelection(config, selectedCharacter);

  const store = openStore(config.database.path);
  const startedAt = new Date().toISOString();
  const parserContext = {
    actorNameById: new Map(),
    petNameById: new Map(),
    petDisplayNameById: new Map(),
    entityNameById: new Map(),
    lastHealthById: new Map()
  };
  const seededActorNames = seedActorNames(store, parserContext);
  const seededWorldEntities = seedWorldEntities(store, parserContext);
  const seededPetNames = seedPetNames(store, parserContext);
  let addonLogIngestor = null;
  let entityScannerLogIngestor = null;
  let lootLogIngestor = null;
  let communityItemSync = null;
  let communityMobSync = null;
  let server = null;
  let retentionTimer = null;
  let memoryTimer = null;
  let memoryProbeBusy = false;
  let shuttingDown = false;
  let memoryProbeState = {
    enabled: Boolean(config.memory?.enabled),
    lastStartedAt: null,
    lastObservedAt: null,
    lastPid: null,
    lastSweepCount: 0,
    lastObservationCount: 0,
    nextAddress: 0,
    lastError: null
  };
  const runRetentionPrune = () => {
    const retention = config.retention || {};
    if (!retention.enabled) return;
    try {
      const result = store.prune({
        keepMinutes: retention.keepMinutes,
        checkpoint: true
      });
      const deletedCount = Object.values(result.deleted).reduce((sum, value) => sum + Number(value || 0), 0);
      if (deletedCount) {
        console.log(`Pruned ${deletedCount} old rows before ${result.cutoff}.`);
      }
    } catch (error) {
      console.error(`Retention prune failed: ${error.message}`);
      }
  };
  const runMemoryProbe = async () => {
    if (!config.memory?.enabled || memoryProbeBusy) return;
    const pid = config.pantheon.processId || null;
    if (!Number.isFinite(Number(pid))) return;
    memoryProbeBusy = true;
    try {
      Object.assign(memoryProbeState, {
        enabled: true,
        lastStartedAt: new Date().toISOString(),
        lastPid: Number(pid),
        lastError: null
      });
      const result = await sampleProcessMemoryStrings(pid, {
        processName: config.memory.processName,
        maxRegionsPerSweep: config.memory.maxRegionsPerSweep,
        maxBytesPerRegion: config.memory.maxBytesPerRegion,
        minStringLength: config.memory.minStringLength,
        keywords: config.memory.keywords,
        startAddress: memoryProbeState.nextAddress || 0
      });
      const observations = result.observations || [];
      const observedAt = new Date().toISOString();
      let stored = 0;
      let scanned = 0;
      for (const region of observations) {
        scanned += 1;
        for (const text of region.strings || []) {
          if (!text || text.length < Number(config.memory.minStringLength || 6)) continue;
          const confidence = Math.min(1, Math.max(0.25, text.length / 80));
          if (store.insertMemoryObservation({
            observedAt,
            pid: Number(pid),
            processName: config.memory.processName,
            source: 'readable_strings',
            text,
            regionBase: region.baseAddress,
            regionSize: region.regionSize,
            confidence
          })) stored += 1;
        }
      }
      Object.assign(memoryProbeState, {
        enabled: true,
        lastObservedAt: observedAt,
        lastPid: Number(pid),
        lastSweepCount: scanned,
        lastObservationCount: stored,
        nextAddress: Number(result.nextAddress || 0) || 0,
        lastError: null
      });
      if (stored) {
        console.log(`Memory probe stored ${stored} readable strings from PID ${pid}.`);
      }
    } catch (error) {
      Object.assign(memoryProbeState, {
        enabled: Boolean(config.memory?.enabled),
        lastError: error.message
      });
      console.error(`Memory probe failed: ${error.message}`);
    } finally {
      memoryProbeBusy = false;
    }
  };
  const communityItemStatus = () => communityItemSync?.status || {
    enabled: Boolean(config.communityItems?.enabled),
    downloadEnabled: config.communityItems?.downloadEnabled !== false,
    uploadEnabled: Boolean(config.communityItems?.uploadEnabled),
    uploadMode: config.communityItems?.uploadMode || 'worker',
    uploadEndpoint: config.communityItems?.uploadEndpoint || null,
    bucket: config.communityItems?.r2?.bucket || null,
    r2Endpoint: config.communityItems?.r2?.endpoint || null,
    r2AccessKeyConfigured: Boolean(
      config.communityItems?.r2?.accessKeyId
      || process.env[config.communityItems?.r2?.accessKeyIdEnv || 'PANTHEON_ATLAS_R2_ACCESS_KEY_ID']
    ),
    r2SecretKeyConfigured: Boolean(
      config.communityItems?.r2?.secretAccessKey
      || process.env[config.communityItems?.r2?.secretAccessKeyEnv || 'PANTHEON_ATLAS_R2_SECRET_ACCESS_KEY']
    ),
    publicBaseUrl: config.communityItems?.publicBaseUrl || null,
    manifestUrl: config.communityItems?.manifestUrl || null,
    downloadEveryMinutes: Number(config.communityItems?.downloadEveryMinutes || 60) || 60,
    uploadEveryMinutes: Number(config.communityItems?.uploadEveryMinutes || 30) || 30,
    lastCheckedAt: null,
    lastDownloadedAt: null,
    lastUploadedAt: null,
    lastDownloadedCount: 0,
    lastChangedCount: 0,
    lastUploadedCount: 0,
    lastError: config.communityItems?.enabled ? null : 'Community item sync is disabled.'
  };
  const communityMobStatus = () => communityMobSync?.status || {
    enabled: Boolean(config.communityMobs?.enabled),
    downloadEnabled: config.communityMobs?.downloadEnabled !== false,
    uploadEnabled: Boolean(config.communityMobs?.uploadEnabled),
    uploadMode: config.communityMobs?.uploadMode || 'r2',
    bucket: config.communityMobs?.r2?.bucket || null,
    r2Endpoint: config.communityMobs?.r2?.endpoint || null,
    publicBaseUrl: config.communityMobs?.publicBaseUrl || null,
    manifestUrl: config.communityMobs?.manifestUrl || null,
    downloadEveryMinutes: Number(config.communityMobs?.downloadEveryMinutes || 60) || 60,
    uploadEveryMinutes: Number(config.communityMobs?.uploadEveryMinutes || 30) || 30,
    lastCheckedAt: null,
    lastDownloadedAt: null,
    lastUploadedAt: null,
    lastDownloadedCount: 0,
    lastChangedCount: 0,
    lastUploadedCount: 0,
    lastError: config.communityMobs?.enabled ? null : 'Community mob sync is disabled.'
  };
  const persistCommunityItemConfig = () => {
    try {
      const fileConfig = fs.existsSync(args.configPath)
        ? JSON.parse(fs.readFileSync(args.configPath, 'utf8'))
        : {};
      fileConfig.communityItems = {
        ...(fileConfig.communityItems || {}),
        ...(config.communityItems || {}),
        r2: {
          ...(fileConfig.communityItems?.r2 || {}),
          ...(config.communityItems?.r2 || {})
        }
      };
      writeJsonFile(args.configPath, fileConfig);
    } catch (error) {
      console.error(`Community item config save failed: ${error.message}`);
      throw error;
    }
  };
  const ensureCommunityItemSync = () => {
    if (communityItemSync || !config.communityItems?.enabled) return communityItemSync;
    communityItemSync = new CommunityItemSync(config.communityItems, store, {
      atlasVersion: require('../package.json').version
    });
    communityItemSync.start();
    return communityItemSync;
  };
  const updateCommunityItemConfig = (patch = {}) => {
    const next = { ...(config.communityItems || {}) };
    if (patch.enabled !== undefined) next.enabled = Boolean(patch.enabled);
    if (patch.downloadEnabled !== undefined) next.downloadEnabled = Boolean(patch.downloadEnabled);
    if (patch.uploadEnabled !== undefined) next.uploadEnabled = Boolean(patch.uploadEnabled);
    if (patch.uploadMode) next.uploadMode = String(patch.uploadMode);
    if (patch.downloadEveryMinutes !== undefined) next.downloadEveryMinutes = Math.max(1, Math.min(1440, Number(patch.downloadEveryMinutes) || 60));
    if (patch.uploadEveryMinutes !== undefined) next.uploadEveryMinutes = Math.max(1, Math.min(1440, Number(patch.uploadEveryMinutes) || 30));
    if (patch.r2 && typeof patch.r2 === 'object') {
      next.r2 = { ...(next.r2 || {}) };
      if (patch.r2.accessKeyId) next.r2.accessKeyId = String(patch.r2.accessKeyId).trim();
      if (patch.r2.secretAccessKey) next.r2.secretAccessKey = String(patch.r2.secretAccessKey).trim();
      if (patch.r2.clearCredentials) {
        delete next.r2.accessKeyId;
        delete next.r2.secretAccessKey;
      }
    }
    config.communityItems = next;
    if (communityItemSync) {
      communityItemSync.stop();
      communityItemSync = null;
    }
    ensureCommunityItemSync();
    persistCommunityItemConfig();
    return communityItemStatus();
  };
  const uploadCommunityItemsNow = async (options = {}) => {
    const sync = ensureCommunityItemSync();
    if (!sync) return { uploaded: 0, changed: 0, status: communityItemStatus() };
    const result = await sync.uploadChangedItems(options);
    return { ...result, status: communityItemStatus() };
  };
  const downloadCommunityItemsNow = async () => {
    const sync = ensureCommunityItemSync();
    if (!sync) return { downloaded: 0, imported: 0, status: communityItemStatus() };
    const result = await sync.downloadCommunityItems();
    return { ...result, status: communityItemStatus() };
  };
  const ensureCommunityMobSync = () => {
    if (communityMobSync || !config.communityMobs?.enabled) return communityMobSync;
    communityMobSync = new CommunityMobSync(config.communityMobs, store, {
      atlasVersion: require('../package.json').version
    });
    communityMobSync.start();
    return communityMobSync;
  };
  const uploadCommunityMobsNow = async (options = {}) => {
    const sync = ensureCommunityMobSync();
    if (!sync) return { uploaded: 0, changed: 0, status: communityMobStatus() };
    const result = await sync.uploadChangedMobs(options);
    return { ...result, status: communityMobStatus() };
  };
  const downloadCommunityMobsNow = async () => {
    const sync = ensureCommunityMobSync();
    if (!sync) return { downloaded: 0, imported: 0, status: communityMobStatus() };
    const result = await sync.downloadCommunityMobs();
    return { ...result, status: communityMobStatus() };
  };
  const livePositionTrail = [];
  const liveLatestPositions = new Map();
  let liveLocalPlayerIdentity = null;
  const configuredLocalPlayerName = String(config.pantheon?.localPlayerName || '').trim() || null;
  const rememberLivePosition = (event) => {
    if (
      event.eventType === 'player_position'
      && event.damageType
      && event.source
      && configuredLocalPlayerName
      && event.source.toLowerCase() === configuredLocalPlayerName.toLowerCase()
    ) {
      liveLocalPlayerIdentity = {
        entityId: event.damageType,
        name: event.source,
        observedAt: event.observedAt
      };
      return;
    }
    if (event.eventType !== 'position_update') return;
    const isAuthoritativeLocal = liveLocalPlayerIdentity
      && event.damageType
      && event.damageType === liveLocalPlayerIdentity.entityId;
    const isClientLocal = event.source === 'Player' && event.damageType;
    const source = isAuthoritativeLocal
      ? liveLocalPlayerIdentity.name
      : isClientLocal && configuredLocalPlayerName
        ? configuredLocalPlayerName
        : event.source;
    const row = {
      id: `live-${event.eventKey || event.observedAt}`,
      observedAt: event.observedAt,
      source,
      target: isAuthoritativeLocal
        ? liveLocalPlayerIdentity.name
        : isClientLocal && configuredLocalPlayerName
          ? configuredLocalPlayerName
          : event.target,
      entityId: event.damageType,
      x: event.x,
      y: event.y,
      z: event.z,
      heading: event.heading ?? null,
      headingRaw: event.headingRaw ?? null,
      rawText: event.rawText
    };
    const key = row.entityId || row.source || row.target || 'unknown';
    liveLatestPositions.set(key, row);
    livePositionTrail.push(row);
    if (livePositionTrail.length > 160) livePositionTrail.splice(0, livePositionTrail.length - 160);
  };
  const getLivePositions = ({ limit = 80, actors = 20, since = null } = {}) => {
    const sinceMs = since && !Number.isNaN(Date.parse(since)) ? Date.parse(since) : null;
    const trailLimit = Math.max(1, Math.min(500, Number(limit) || 80));
    const actorLimit = Math.max(1, Math.min(100, Number(actors) || 20));
    const trail = livePositionTrail
      .filter((row) => !sinceMs || Date.parse(row.observedAt) >= sinceMs)
      .slice(-trailLimit)
      .reverse();
    const latest = [...liveLatestPositions.values()]
      .filter((row) => !sinceMs || Date.parse(row.observedAt) >= sinceMs)
      .sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt))
      .slice(0, actorLimit);
    return { latest, trail };
  };

  const spawnSelfRestart = () => {
    const childArgs = [...process.execArgv, ...process.argv.slice(1)];
    const child = execFile(process.execPath, childArgs, {
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
      env: { ...process.env }
    });
    if (child && typeof child.unref === 'function') child.unref();
  };

  const shutdown = (shouldRestart = false) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(shouldRestart ? '\nRestarting Pantheon Atlas...' : '\nStopping Pantheon Atlas...');
    if (retentionTimer) clearInterval(retentionTimer);
    if (memoryTimer) clearInterval(memoryTimer);
    if (addonLogIngestor) addonLogIngestor.stop();
    if (entityScannerLogIngestor) entityScannerLogIngestor.stop();
    if (lootLogIngestor) lootLogIngestor.stop();
    if (communityItemSync) communityItemSync.stop();
    if (communityMobSync) communityMobSync.stop();
    const finalize = () => {
      try {
        store.close();
      } catch (error) {
        console.error(`Store close failed: ${error.message}`);
      }
      if (shouldRestart) {
        try {
          spawnSelfRestart();
        } catch (error) {
          console.error(`Restart spawn failed: ${error.message}`);
          process.exitCode = 1;
        }
      }
      process.exit(0);
    };
    if (server) {
      server.close(finalize);
    } else {
      finalize();
    }
  };

  if (config.addonLogs?.enabled) {
    addonLogIngestor = new AddonLogIngestor(config.addonLogs, store);
    addonLogIngestor.start();
  }
  if (config.entityScannerLogs?.enabled) {
    entityScannerLogIngestor = new EntityScannerLogIngestor(config.entityScannerLogs, store, {
      onEvent: rememberLivePosition
    });
    entityScannerLogIngestor.start();
  }
  if (config.lootLogs?.enabled) {
    lootLogIngestor = new LootLogIngestor(config.lootLogs, store);
    lootLogIngestor.start();
  }
  ensureCommunityItemSync();
  ensureCommunityMobSync();

  server = startDashboard(store, {
    port: config.server.port,
    startedAt,
    getLivePositions,
    localPlayerName: configuredLocalPlayerName,
    memoryStatus: memoryProbeState,
    addonLogStatus: addonLogIngestor?.status || null,
    entityScannerStatus: entityScannerLogIngestor?.status || null,
    lootLogStatus: lootLogIngestor?.status || null,
    communityItemStatus,
    communityMobStatus,
    onCommunityItemsConfig: updateCommunityItemConfig,
    onCommunityItemsUpload: uploadCommunityItemsNow,
    onCommunityItemsDownload: downloadCommunityItemsNow,
    onCommunityMobsUpload: uploadCommunityMobsNow,
    onCommunityMobsDownload: downloadCommunityMobsNow,
    onRestart: () => shutdown(true)
  });

  if (config.retention?.enabled) {
    const everyMs = Math.max(60_000, Number(config.retention.pruneEveryMinutes || 5) * 60_000);
    setTimeout(runRetentionPrune, 30_000);
    retentionTimer = setInterval(runRetentionPrune, everyMs);
  }

  if (config.memory?.enabled) {
    const everyMs = Math.max(2_000, Number(config.memory.pollEveryMs || 5000));
    setTimeout(runMemoryProbe, 3_000);
    memoryTimer = setInterval(runMemoryProbe, everyMs);
  }

  process.on('SIGINT', () => {
    shutdown(false);
  });

  console.log(`Database: ${config.database.path}`);
  if (seededActorNames) console.log(`Seeded ${seededActorNames} actor name hints.`);
  if (seededPetNames) console.log(`Seeded ${seededPetNames} pet name hints.`);
  if (seededWorldEntities) console.log(`Seeded ${seededWorldEntities} world entity hints.`);
  if (config.memory?.enabled) console.log(`Memory probe enabled: every ${Math.max(2_000, Number(config.memory.pollEveryMs || 5000))}ms.`);
  if (addonLogIngestor) console.log(`Addon combat log enabled: ${addonLogIngestor.status.path}`);
  if (entityScannerLogIngestor) console.log(`Entity scanner log enabled: ${entityScannerLogIngestor.status.path}`);
  if (lootLogIngestor) console.log(`Loot log enabled: ${lootLogIngestor.status.path}`);
  if (communityItemSync) console.log(`Community item sync enabled: ${communityItemSync.status.publicBaseUrl || 'upload only'}`);
  if (communityMobSync) console.log(`Community mob sync enabled: ${communityMobSync.status.publicBaseUrl || 'upload only'}`);
  return { config, store, addonLogIngestor, entityScannerLogIngestor, lootLogIngestor, communityItemSync, communityMobSync, server };
}

if (require.main === module) {
  runApp().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  applyCharacterSelection,
  chooseCharacter,
  discoverCharacterLogChoices,
  parseArgs,
  sanitizeCharacterName,
  seedActorNames,
  seedWorldEntities,
  runApp
};
