const fs = require('node:fs');
const path = require('node:path');

const APP_ROOT = path.resolve(__dirname, '..');
const DATA_ROOT = process.env.PANTHEON_ATLAS_HOME
  ? path.resolve(process.env.PANTHEON_ATLAS_HOME)
  : APP_ROOT;

const COMMUNITY_WORKER_BASE_URL = 'https://pantheon-atlas.com';

function communityWorkerBaseUrl() {
  return String(process.env.PANTHEON_ATLAS_COMMUNITY_WORKER_BASE_URL || COMMUNITY_WORKER_BASE_URL || '').trim().replace(/\/+$/, '');
}

function communityWorkerEndpoint(leaf) {
  const base = communityWorkerBaseUrl();
  return base ? `${base}/${leaf}` : '';
}

const DEFAULT_CONFIG = {
  server: { port: 3117 },
  database: { path: 'data/pantheon-network.sqlite' },
  retention: {
    enabled: true,
    keepMinutes: 60,
    pruneEveryMinutes: 5,
    walCheckpointEveryMinutes: 5
  },
  pantheon: { processName: 'Pantheon', processId: null },
  memory: {
    enabled: false,
    pollEveryMs: 5000,
    processName: 'Pantheon.exe',
    maxRegionsPerSweep: 32,
    maxBytesPerRegion: 65536,
    minStringLength: 6,
    keywords: [
      'dealt',
      'healed',
      'damage',
      'resisted',
      'missed',
      'slain',
      'experience',
      'ability',
      'cooldown',
      'casting',
      'global cooldown',
      'nexendia',
      'shadowfox',
      'blast',
      'mana',
      'venom',
      'harune',
      'serpentine',
      'minion'
    ]
  },
  addonLogs: {
    enabled: true,
    liveFile: path.join(
      process.env.ProgramData || 'C:\\ProgramData',
      'PantheonCombatData',
      'combat-live-current.jsonl'
    ),
    pollEveryMs: 1000,
    readExistingOnStart: false
  },
  entityScannerLogs: {
    enabled: true,
    liveFile: path.join(
      process.env.ProgramData || 'C:\\ProgramData',
      'PantheonEntityScanner',
      'entities-live-current.jsonl'
    ),
    pollEveryMs: 1000,
    readExistingOnStart: false
  },
  lootLogs: {
    enabled: true,
    liveFile: path.join(
      process.env.ProgramData || 'C:\\ProgramData',
      'PantheonLootData',
      'loot-events-current.jsonl'
    ),
    pollEveryMs: 1000,
    readExistingOnStart: false
  },
  communityItems: {
    enabled: true,
    downloadEnabled: true,
    uploadEnabled: false,
    uploadMode: 'worker',
    uploadEndpoint: communityWorkerEndpoint('items'),
    publicBaseUrl: 'https://pub-bb6b866e2c73493f83b42111abb2e1c9.r2.dev',
    manifestUrl: 'https://pub-bb6b866e2c73493f83b42111abb2e1c9.r2.dev/items-manifest.json',
    downloadEveryMinutes: 60,
    uploadEveryMinutes: 30,
    batchSize: 100,
    maxItems: 5000,
    statePath: 'data/community-item-sync.json',
    r2: {
      endpoint: 'https://7e51af449fba623b17c429354bda9f69.r2.cloudflarestorage.com',
      bucket: 'pantheon-item-database',
      region: 'auto',
      objectPrefix: 'contributions',
      accessKeyIdEnv: 'PANTHEON_ATLAS_R2_ACCESS_KEY_ID',
      secretAccessKeyEnv: 'PANTHEON_ATLAS_R2_SECRET_ACCESS_KEY'
    }
  },
  communityMobs: {
    enabled: true,
    downloadEnabled: true,
    uploadEnabled: false,
    uploadMode: 'worker',
    uploadEndpoint: communityWorkerEndpoint('mobs'),
    publicBaseUrl: 'https://pub-bb6b866e2c73493f83b42111abb2e1c9.r2.dev',
    manifestUrl: 'https://pub-bb6b866e2c73493f83b42111abb2e1c9.r2.dev/mobs-manifest.json',
    downloadEveryMinutes: 60,
    uploadEveryMinutes: 30,
    batchSize: 100,
    maxMobs: 5000,
    statePath: 'data/community-mob-sync.json',
    r2: {
      endpoint: 'https://7e51af449fba623b17c429354bda9f69.r2.cloudflarestorage.com',
      bucket: 'pantheon-item-database',
      region: 'auto',
      objectPrefix: 'mob-contributions',
      manifestKey: 'mobs-manifest.json',
      accessKeyIdEnv: 'PANTHEON_ATLAS_R2_ACCESS_KEY_ID',
      secretAccessKeyEnv: 'PANTHEON_ATLAS_R2_SECRET_ACCESS_KEY'
    }
  }
};

function mergeConfig(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return base;
  const output = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      output[key] = mergeConfig(base[key] || {}, value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function expandEnvPath(filePath) {
  if (!filePath) return filePath;
  return String(filePath)
    .replace(/%([^%]+)%/g, (_match, name) => process.env[name] || process.env[name.toUpperCase()] || '')
    .replace(/\$\{([^}]+)\}/g, (_match, name) => process.env[name] || '');
}

function resolveFromRoot(filePath, root = DATA_ROOT) {
  if (!filePath) return filePath;
  const expanded = expandEnvPath(filePath);
  return path.isAbsolute(expanded) ? expanded : path.resolve(root, expanded);
}

function applyCommunityWorkerDefaults(config) {
  if (!config?.communityItems || !config?.communityMobs) return config;
  if ((config.communityItems.uploadMode || 'worker') === 'worker' && !config.communityItems.uploadEndpoint) {
    config.communityItems.uploadEndpoint = communityWorkerEndpoint('items');
  }
  if ((config.communityMobs.uploadMode || 'worker') === 'worker' && !config.communityMobs.uploadEndpoint) {
    config.communityMobs.uploadEndpoint = config.communityItems.uploadEndpoint
      ? siblingWorkerEndpoint(config.communityItems.uploadEndpoint, 'mobs')
      : communityWorkerEndpoint('mobs');
  }
  return config;
}

function siblingWorkerEndpoint(uploadEndpoint, leaf) {
  if (!uploadEndpoint) return '';
  try {
    const url = new URL(uploadEndpoint);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length && ['items', 'mobs', 'icons'].includes(parts[parts.length - 1])) {
      parts[parts.length - 1] = leaf;
    } else {
      parts.push(leaf);
    }
    url.pathname = `/${parts.join('/')}`;
    return url.toString();
  } catch {
    return '';
  }
}

function readConfig(configPath = path.join(DATA_ROOT, 'config.json')) {
  let config = DEFAULT_CONFIG;
  if (fs.existsSync(configPath)) {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config = mergeConfig(DEFAULT_CONFIG, parsed);
  }
  applyCommunityWorkerDefaults(config);

  config.database.path = resolveFromRoot(config.database.path);
  if (config.addonLogs?.liveFile) config.addonLogs.liveFile = resolveFromRoot(config.addonLogs.liveFile);
  if (config.entityScannerLogs?.liveFile) config.entityScannerLogs.liveFile = resolveFromRoot(config.entityScannerLogs.liveFile);
  if (config.lootLogs?.liveFile) config.lootLogs.liveFile = resolveFromRoot(config.lootLogs.liveFile);
  if (config.communityItems?.statePath) config.communityItems.statePath = resolveFromRoot(config.communityItems.statePath);
  if (config.communityMobs?.statePath) config.communityMobs.statePath = resolveFromRoot(config.communityMobs.statePath);
  return config;
}

module.exports = {
  COMMUNITY_WORKER_BASE_URL,
  DEFAULT_CONFIG,
  DATA_ROOT,
  communityWorkerEndpoint,
  readConfig,
  resolveFromRoot
};
