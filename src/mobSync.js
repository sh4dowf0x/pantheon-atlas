const crypto = require('node:crypto');
const path = require('node:path');
const zlib = require('node:zlib');
const { getMobDetail, getMobSummary } = require('./dashboard');
const { normalizeMobName } = require('./namedMobs');
const {
  fetchCommunityManifest,
  fetchJsonMaybeGzip,
  hashObject,
  loadState,
  normalizeManifestRows,
  publicObjectUrl,
  resolveSecret,
  saveState,
  sha256,
  signedR2Fetch
} = require('./itemSync');

function mobSyncStatePath(config) {
  return config.statePath || path.resolve(process.cwd(), 'data', 'community-mob-sync.json');
}

function normalizeMobForSync(row = {}) {
  const key = normalizeMobName(row.name);
  if (!key) return null;
  return {
    key,
    name: row.name,
    named: Boolean(row.named),
    namedName: row.namedName || null,
    namedSourceUrl: row.namedSourceUrl || null,
    className: row.className || null,
    classConfidence: Number(row.classConfidence || 0),
    race: row.race || null,
    kind: row.kind || null,
    location: row.location || null,
    zoneName: row.zoneName || null,
    levelMin: row.levelMin ?? null,
    levelMax: row.levelMax ?? null,
    firstSeen: row.firstSeen || null,
    lastSeen: row.lastSeen || null,
    seenCount: Number(row.seenCount || 0),
    abilities: Array.isArray(row.abilities) ? row.abilities.map((ability) => ({
      ability: ability.ability,
      count: Number(ability.count || 0),
      totalDamage: Number(ability.totalDamage || 0),
      lastSeen: ability.lastSeen || null
    })).filter((ability) => ability.ability) : [],
    drops: Array.isArray(row.drops) ? row.drops.map((drop) => ({
      itemId: drop.itemId ? String(drop.itemId) : null,
      name: drop.name || null,
      rarity: drop.rarity || null,
      count: Number(drop.count || 0),
      lastSeen: drop.lastSeen || null
    })).filter((drop) => drop.name || drop.itemId) : [],
    damageDone: Number(row.damageDone || 0),
    damageTaken: Number(row.damageTaken || 0),
    combatEvents: Number(row.combatEvents || 0),
    killCount: Number(row.killCount || 0),
    lastLocation: row.lastLocation || null
  };
}

function getNormalizedMobs(db, limit = 5000) {
  const summary = getMobSummary(db, { limit: Math.max(1, Math.min(50_000, Number(limit) || 5000)) });
  return summary.rows
    .map((row) => getMobDetail(db, row.name) || row)
    .map(normalizeMobForSync)
    .filter(Boolean);
}

function hashMobContent(mob) {
  if (!mob || typeof mob !== 'object') return hashObject(mob);
  const { community, source, ...content } = mob;
  return hashObject(content);
}

function changedMobs(mobs, state) {
  const mobHashes = state.mobHashes || {};
  return mobs
    .map((mob) => ({ mob, hash: hashMobContent(mob) }))
    .filter(({ mob, hash }) => mobHashes[mob.key] !== hash);
}

function contributionPayload(mobs, options = {}) {
  return {
    atlasVersion: options.atlasVersion || '0.1.0',
    installId: options.installId || null,
    generatedAt: new Date().toISOString(),
    format: 'pantheon-atlas-mobs-v1',
    mobs
  };
}

function upsertCommunityMob(db, mob, options = {}) {
  const normalized = normalizeMobForSync(mob);
  if (!normalized) return false;
  const observedAt = options.observedAt || normalized.lastSeen || new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO community_mobs (
      key, name, normalized_name, payload_json, source_install_id, first_seen, last_seen, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      name = excluded.name,
      normalized_name = excluded.normalized_name,
      payload_json = excluded.payload_json,
      source_install_id = excluded.source_install_id,
      first_seen = COALESCE(community_mobs.first_seen, excluded.first_seen),
      last_seen = CASE
        WHEN excluded.last_seen IS NOT NULL AND (community_mobs.last_seen IS NULL OR excluded.last_seen > community_mobs.last_seen)
        THEN excluded.last_seen
        ELSE community_mobs.last_seen
      END,
      updated_at = excluded.updated_at
  `).run(
    normalized.key,
    normalized.name,
    normalized.key,
    JSON.stringify(normalized),
    options.installId || null,
    normalized.firstSeen || observedAt,
    normalized.lastSeen || observedAt,
    observedAt
  );
  return Number(result.changes || 0) > 0;
}

async function readR2Manifest(config, credentials) {
  const response = await signedR2Fetch(config, credentials, {
    method: 'GET',
    key: String(config.manifestKey || 'mobs-manifest.json').replace(/^\/+/, '') || 'mobs-manifest.json'
  });
  if (response.status === 404) return { format: 'pantheon-atlas-mobs-manifest-v1', objects: [] };
  if (!response.ok) throw new Error(`R2 mob manifest read failed: ${response.status}`);
  const parsed = JSON.parse(await response.text());
  return {
    format: 'pantheon-atlas-mobs-manifest-v1',
    generatedAt: parsed.generatedAt || null,
    objects: Array.isArray(parsed.objects) ? parsed.objects : []
  };
}

async function updateR2Manifest(config, credentials, row) {
  const manifest = await readR2Manifest(config, credentials);
  const objects = manifest.objects.filter((item) => item && item.key !== row.key);
  objects.unshift(row);
  const next = {
    format: 'pantheon-atlas-mobs-manifest-v1',
    generatedAt: new Date().toISOString(),
    objects: objects.slice(0, 5000)
  };
  const body = Buffer.from(JSON.stringify(next, null, 2), 'utf8');
  const response = await signedR2Fetch(config, credentials, {
    method: 'PUT',
    key: String(config.manifestKey || 'mobs-manifest.json').replace(/^\/+/, '') || 'mobs-manifest.json',
    body,
    contentType: 'application/json'
  });
  if (!response.ok) throw new Error(`R2 mob manifest update failed: ${response.status}`);
  return next;
}

function r2MobObjectKey(config, payload) {
  const prefix = String(config.objectPrefix || 'mob-contributions').replace(/^\/+|\/+$/g, '') || 'mob-contributions';
  const installId = String(payload.installId || config.installId || 'anonymous').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'anonymous';
  const stamp = payload.generatedAt.replace(/[:-]|\.\d{3}/g, '').replace(/\D/g, '').slice(0, 14);
  const digest = hashObject(payload).slice(0, 16);
  return `${prefix}/${installId}/mobs-${stamp}-${digest}.json.gz`;
}

async function putMobPayloadToR2(config, payload) {
  const accessKeyId = resolveSecret(config.accessKeyId, config.accessKeyIdEnv || 'PANTHEON_ATLAS_R2_ACCESS_KEY_ID');
  const secretAccessKey = resolveSecret(config.secretAccessKey, config.secretAccessKeyEnv || 'PANTHEON_ATLAS_R2_SECRET_ACCESS_KEY');
  const credentials = { accessKeyId, secretAccessKey };
  const body = zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'));
  const key = r2MobObjectKey(config, payload);
  const response = await signedR2Fetch(config, credentials, {
    method: 'PUT',
    key,
    body,
    contentType: 'application/json',
    contentEncoding: 'gzip'
  });
  if (!response.ok) throw new Error(`R2 mob upload failed: ${response.status}`);
  await updateR2Manifest(config, credentials, {
    key,
    sha256: sha256(body),
    generatedAt: payload.generatedAt || new Date().toISOString(),
    uploadedAt: new Date().toISOString(),
    installId: payload.installId || 'anonymous'
  });
  return { response, key };
}

class CommunityMobSync {
  constructor(config, store, options = {}) {
    this.config = config || {};
    this.store = store;
    this.options = options || {};
    this.timer = null;
    this.downloadTimer = null;
    this.running = false;
    this.uploadBusy = false;
    this.downloadBusy = false;
    this.status = {
      enabled: Boolean(this.config.enabled),
      downloadEnabled: this.config.downloadEnabled !== false,
      uploadEnabled: Boolean(this.config.uploadEnabled),
      uploadMode: this.config.uploadMode || 'r2',
      bucket: this.config.r2?.bucket || null,
      r2Endpoint: this.config.r2?.endpoint || null,
      publicBaseUrl: this.config.publicBaseUrl || null,
      manifestUrl: this.config.manifestUrl || null,
      downloadEveryMinutes: Number(this.config.downloadEveryMinutes || 60) || 60,
      uploadEveryMinutes: Number(this.config.uploadEveryMinutes || 30) || 30,
      lastCheckedAt: null,
      lastDownloadedAt: null,
      lastUploadedAt: null,
      lastDownloadedCount: 0,
      lastChangedCount: 0,
      lastUploadedCount: 0,
      lastError: null
    };
  }

  start() {
    if (this.running || !this.config.enabled) return;
    this.running = true;
    setTimeout(() => this.downloadCommunityMobs().catch(() => {}), Math.max(1500, Number(this.config.initialDelayMs || 12_000)));
    setTimeout(() => this.uploadChangedMobs().catch(() => {}), Math.max(3000, Number(this.config.initialDelayMs || 12_000) + 1500));
    this.downloadTimer = setInterval(() => this.downloadCommunityMobs().catch(() => {}), Math.max(60_000, Number(this.config.downloadEveryMinutes || 60) * 60_000));
    this.timer = setInterval(() => this.uploadChangedMobs().catch(() => {}), Math.max(60_000, Number(this.config.uploadEveryMinutes || 30) * 60_000));
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    if (this.downloadTimer) clearInterval(this.downloadTimer);
    this.timer = null;
    this.downloadTimer = null;
  }

  async downloadCommunityMobs() {
    if (this.downloadBusy || this.config.downloadEnabled === false) return { downloaded: 0, imported: 0 };
    if (!this.config.manifestUrl) {
      this.status.lastError = 'Community mob manifest URL is not configured.';
      return { downloaded: 0, imported: 0 };
    }
    this.downloadBusy = true;
    this.status.lastCheckedAt = new Date().toISOString();
    try {
      const state = loadState(mobSyncStatePath(this.config));
      state.downloadedKeys = state.downloadedKeys || {};
      state.mobHashes = state.mobHashes || {};
      const manifest = await fetchCommunityManifest(this.config.manifestUrl);
      const rows = normalizeManifestRows(manifest);
      let downloaded = 0;
      let imported = 0;
      for (const row of rows) {
        const key = row.key || row.url;
        if (!key || state.downloadedKeys[key] === (row.sha256 || true)) continue;
        const url = publicObjectUrl(this.config, row);
        if (!url) continue;
        const payload = await fetchJsonMaybeGzip(url);
        const mobs = Array.isArray(payload?.mobs) ? payload.mobs : Array.isArray(payload) ? payload : [];
        downloaded += 1;
        for (const mob of mobs) {
          if (upsertCommunityMob(this.store.db, mob, { observedAt: payload.generatedAt || row.generatedAt, installId: payload.installId })) {
            imported += 1;
            const normalized = normalizeMobForSync(mob);
            if (normalized) state.mobHashes[normalized.key] = hashMobContent(normalized);
          }
        }
        state.downloadedKeys[key] = row.sha256 || true;
      }
      state.lastDownloadedAt = new Date().toISOString();
      saveState(mobSyncStatePath(this.config), state);
      this.status.lastDownloadedAt = state.lastDownloadedAt;
      this.status.lastDownloadedCount = imported;
      this.status.lastError = null;
      return { downloaded, imported };
    } catch (error) {
      this.status.lastError = error.message;
      throw error;
    } finally {
      this.downloadBusy = false;
    }
  }

  async uploadChangedMobs(options = {}) {
    if (this.uploadBusy || !this.config.uploadEnabled) return { uploaded: 0, changed: 0 };
    if (!this.config.r2?.endpoint || !this.config.r2?.bucket) {
      this.status.lastError = 'R2 mob upload endpoint or bucket is not configured.';
      return { uploaded: 0, changed: 0 };
    }
    this.uploadBusy = true;
    this.status.lastCheckedAt = new Date().toISOString();
    try {
      const state = loadState(mobSyncStatePath(this.config));
      const maxMobs = Math.max(1, Math.min(50_000, Number(this.config.maxMobs || 5000)));
      const mobs = getNormalizedMobs(this.store.db, maxMobs);
      const changes = options.full ? mobs.map((mob) => ({ mob, hash: hashMobContent(mob) })) : changedMobs(mobs, state);
      const batchSize = options.full ? maxMobs : Math.max(1, Math.min(500, Number(this.config.batchSize || 100)));
      const batch = changes.slice(0, batchSize);
      this.status.lastChangedCount = changes.length;
      if (!batch.length) {
        this.status.lastUploadedCount = 0;
        this.status.lastError = null;
        return { uploaded: 0, changed: 0 };
      }
      state.installId = state.installId || this.config.installId || crypto.randomUUID();
      const payload = contributionPayload(batch.map((entry) => entry.mob), {
        atlasVersion: this.options.atlasVersion,
        installId: state.installId
      });
      const uploadResult = await putMobPayloadToR2(this.config.r2, payload);
      state.mobHashes = state.mobHashes || {};
      for (const entry of batch) state.mobHashes[entry.mob.key] = entry.hash;
      state.lastUploadedAt = new Date().toISOString();
      if (uploadResult?.key) state.lastUploadedKey = uploadResult.key;
      saveState(mobSyncStatePath(this.config), state);
      this.status.lastUploadedAt = state.lastUploadedAt;
      this.status.lastUploadedCount = batch.length;
      this.status.lastError = null;
      return { uploaded: batch.length, changed: changes.length };
    } catch (error) {
      this.status.lastError = error.message;
      throw error;
    } finally {
      this.uploadBusy = false;
    }
  }
}

module.exports = {
  CommunityMobSync,
  changedMobs,
  contributionPayload,
  getNormalizedMobs,
  hashMobContent,
  normalizeMobForSync,
  upsertCommunityMob
};
