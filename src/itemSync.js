const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { itemArtUrlForName } = require('./itemArt');

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value || '');
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashObject(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function hashItemContent(item) {
  if (!item || typeof item !== 'object') return hashObject(item);
  const { source, ...content } = item;
  return hashObject(content);
}

function splitList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function statMap(stats = {}) {
  const output = {};
  const rows = Array.isArray(stats.statModifiers) ? stats.statModifiers : [];
  for (const row of rows) {
    const stat = String(row.stat || row.name || row.Stat || row.Name || '').trim();
    if (!stat) continue;
    const value = Number(row.value ?? row.Value ?? row.amount ?? row.Amount ?? row.modifier ?? row.Modifier);
    output[stat] = Number.isFinite(value) ? value : row.value ?? row.Value ?? row.amount ?? row.Amount ?? row.modifier ?? row.Modifier;
  }
  return output;
}

function normalizeSourceRows(value) {
  const rows = parseJson(value, []);
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const raw = parseJson(row.rawJson, {});
      const acquisition = raw.acquisition && typeof raw.acquisition === 'object' ? raw.acquisition : {};
      const sourceObject = acquisition.source && typeof acquisition.source === 'object' ? acquisition.source : null;
      const name = String(row.source || sourceObject?.name || acquisition.source || '').trim();
      if (!name) return null;
      const key = name.toLowerCase();
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        name,
        method: acquisition.method || null,
        confidence: acquisition.confidence || null,
        entityType: sourceObject?.entityType || null,
        level: sourceObject?.level ?? null,
        x: sourceObject?.x ?? null,
        y: sourceObject?.y ?? null,
        z: sourceObject?.z ?? null,
        lastSeen: row.observedAt || null
      };
    })
    .filter(Boolean);
}

function mergeSourceLists(...lists) {
  const seen = new Set();
  const output = [];
  for (const source of lists.flat()) {
    if (!source?.name) continue;
    const key = String(source.name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(source);
  }
  return output;
}

function normalizeItemRow(row) {
  const template = parseJson(row.templateJson, {});
  const stats = parseJson(row.statsJson, {});
  const maxDamage = Number(row.maxDamage);
  const delay = Number(row.delay);
  return {
    itemId: String(row.itemId),
    name: row.name,
    rarity: row.rarity || null,
    itemType: row.itemType || null,
    armorTypeName: row.armorTypeName || null,
    weaponType: row.weaponType && row.weaponType !== 'None' ? row.weaponType : null,
    equipSlotName: template.equipSlotName || null,
    classRequirementNames: splitList(template.classRequirementNames),
    requiredProficiency: template.requiredProficiency && template.requiredProficiency !== 'None' ? template.requiredProficiency : null,
    requiredLevel: row.requiredLevel === null || row.requiredLevel === undefined ? null : Number(row.requiredLevel),
    itemLevel: row.itemLevel === null || row.itemLevel === undefined ? null : Number(row.itemLevel),
    maxDamage: Number.isFinite(maxDamage) && maxDamage > 0 ? maxDamage : null,
    delay: Number.isFinite(delay) && delay > 0 ? delay : null,
    weaponDps: Number.isFinite(maxDamage) && maxDamage > 0 && Number.isFinite(delay) && delay > 0
      ? Number((maxDamage / delay).toFixed(2))
      : null,
    coinValue: row.coinValue === null || row.coinValue === undefined ? null : Number(row.coinValue),
    weight: row.weight === null || row.weight === undefined ? null : Number(row.weight),
    flags: parseJson(row.flagsJson, []),
    stats: statMap(stats),
    iconKey: template.iconKey || null,
    artUrl: template.artUrl || template.iconUrl || itemArtUrlForName(row.name) || null,
    description: template.itemDescription || null,
    sources: mergeSourceLists(Array.isArray(template.communitySources) ? template.communitySources : [], normalizeSourceRows(row.sourcesJson)),
    source: {
      firstSeen: row.firstSeen,
      lastSeen: row.lastSeen,
      seenCount: Number(row.seenCount || 0)
    }
  };
}

function getNormalizedItems(db, limit = 5000) {
  return db.prepare(`
    SELECT item_id itemId, name, rarity, item_type itemType,
           armor_type_name armorTypeName, weapon_type weaponType,
           required_level requiredLevel, item_level itemLevel,
           max_damage maxDamage, delay, coin_value coinValue, weight,
           flags_json flagsJson, stats_json statsJson, template_json templateJson,
           first_seen firstSeen, last_seen lastSeen, seen_count seenCount
           , (
             SELECT json_group_array(json_object(
               'observedAt', source_rows.observed_at,
               'source', source_rows.source,
               'rawJson', source_rows.raw_json
             ))
             FROM (
               SELECT observed_at, source, raw_json
               FROM loot_events
               WHERE item_id = loot_items.item_id
                 AND (source IS NOT NULL OR raw_json LIKE '%"acquisition"%')
               ORDER BY observed_at DESC, id DESC
               LIMIT 12
             ) source_rows
           ) sourcesJson
    FROM loot_items
    ORDER BY last_seen DESC, name
    LIMIT ?
  `).all(Math.max(1, Math.min(50_000, Number(limit) || 5000))).map(normalizeItemRow);
}

function loadState(statePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : { itemHashes: {} };
  } catch {
    return { itemHashes: {} };
  }
}

function saveState(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function changedItems(items, state) {
  const itemHashes = state.itemHashes || {};
  return items
    .map((item) => ({ item, hash: hashItemContent(item) }))
    .filter(({ item, hash }) => itemHashes[item.itemId] !== hash);
}

function contributionPayload(items, options = {}) {
  return {
    atlasVersion: options.atlasVersion || '0.1.0',
    installId: options.installId || null,
    generatedAt: new Date().toISOString(),
    format: 'pantheon-atlas-items-v1',
    items
  };
}

function itemRecordFromCommunityItem(item, observedAt = new Date().toISOString()) {
  if (!item?.itemId || !item?.name) return null;
  const stats = item.stats && typeof item.stats === 'object' && !Array.isArray(item.stats)
    ? Object.entries(item.stats).map(([stat, value]) => ({ stat, value }))
    : [];
  const template = {
    itemId: String(item.itemId),
    itemName: item.name,
    itemType: item.itemType || null,
    rarity: item.rarity || null,
    armorTypeName: item.armorTypeName || null,
    weaponType: item.weaponType || null,
    equipSlotName: item.equipSlotName || null,
    classRequirementNames: Array.isArray(item.classRequirementNames) ? item.classRequirementNames.join(', ') : item.classRequirementNames || null,
    requiredProficiency: item.requiredProficiency || null,
    requiredLevel: item.requiredLevel ?? null,
    itemLevel: item.itemLevel ?? null,
    maxDamage: item.maxDamage ?? null,
    delay: item.delay ?? null,
    coinValue: item.coinValue ?? null,
    weight: item.weight ?? null,
    iconKey: item.iconKey || null,
    artUrl: item.artUrl || null,
    itemDescription: item.description || null,
    itemFlags: Array.isArray(item.flags) ? item.flags.join(', ') : item.flags || null,
    communitySource: true
  };
  if (Array.isArray(item.sources) && item.sources.length) template.communitySources = item.sources;
  return {
    observedAt,
    itemId: String(item.itemId),
    name: item.name,
    rarity: item.rarity || null,
    itemType: item.itemType || null,
    armorTypeName: item.armorTypeName || null,
    weaponType: item.weaponType || null,
    requiredLevel: item.requiredLevel ?? null,
    itemLevel: item.itemLevel ?? null,
    maxDamage: item.maxDamage ?? null,
    delay: item.delay ?? null,
    coinValue: item.coinValue ?? null,
    weight: item.weight ?? null,
    flagsJson: JSON.stringify(Array.isArray(item.flags) ? item.flags : []),
    statsJson: JSON.stringify({ statModifiers: stats }),
    templateJson: JSON.stringify(template)
  };
}

function normalizeManifestRows(manifest) {
  const rows = Array.isArray(manifest?.objects) ? manifest.objects : Array.isArray(manifest?.contributions) ? manifest.contributions : [];
  return rows
    .map((row) => {
      if (typeof row === 'string') return { key: row };
      if (!row || typeof row !== 'object') return null;
      const key = String(row.key || row.path || '').trim();
      const url = String(row.url || '').trim();
      if (!key && !url) return null;
      return {
        key: key || url,
        url: url || null,
        sha256: row.sha256 || row.payloadSha256 || null,
        generatedAt: row.generatedAt || row.uploadedAt || null
      };
    })
    .filter(Boolean);
}

function publicObjectUrl(config, row) {
  if (row.url) return row.url;
  const base = String(config.publicBaseUrl || '').replace(/\/+$/g, '');
  if (!base || !row.key) return null;
  return `${base}/${String(row.key).split('/').map((part) => encodeURIComponent(part)).join('/')}`;
}

async function fetchJsonMaybeGzip(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Community item download failed: ${response.status} ${text}`.trim());
  }
  const raw = Buffer.from(await response.arrayBuffer());
  const encoding = String(response.headers.get('content-encoding') || '').toLowerCase();
  const shouldGunzip = encoding === 'gzip' || new URL(url).pathname.endsWith('.gz');
  let body = raw;
  if (shouldGunzip) {
    try {
      body = zlib.gunzipSync(raw);
    } catch {
      body = raw;
    }
  }
  return JSON.parse(body.toString('utf8'));
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function sha256(value, encoding = 'hex') {
  return crypto.createHash('sha256').update(value).digest(encoding);
}

function amzDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function signingKey(secretAccessKey, dateStamp, region, service) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function signedS3PutRequest({ endpoint, bucket, key, accessKeyId, secretAccessKey, body, contentType = 'application/json', contentEncoding = 'gzip', region = 'auto', now = new Date() }) {
  const missing = [
    endpoint ? null : 'endpoint',
    bucket ? null : 'bucket',
    key ? null : 'object key',
    accessKeyId ? null : 'access key',
    secretAccessKey ? null : 'secret key'
  ].filter(Boolean);
  if (missing.length) throw new Error(`R2 upload missing: ${missing.join(', ')}.`);
  const base = new URL(endpoint);
  const encodedKey = key.split('/').map((part) => encodeURIComponent(part)).join('/');
  const pathName = `/${encodeURIComponent(bucket)}/${encodedKey}`;
  const url = new URL(pathName, `${base.protocol}//${base.host}`);
  const date = amzDate(now);
  const dateStamp = date.slice(0, 8);
  const payloadHash = sha256(body);
  const headers = {
    'content-encoding': contentEncoding,
    'content-sha256': payloadHash,
    'content-type': contentType,
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': date
  };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map((name) => `${name}:${headers[name]}\n`).join('');
  const canonicalRequest = [
    'PUT',
    url.pathname,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    date,
    credentialScope,
    sha256(canonicalRequest)
  ].join('\n');
  const signature = hmac(signingKey(secretAccessKey, dateStamp, region, 's3'), stringToSign, 'hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { url: url.toString(), headers };
}

async function postJsonGzip(url, payload, config = {}) {
  const body = zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'));
  const payloadHash = sha256(body);
  const headers = {
    'Content-Type': 'application/json',
    'Content-Encoding': 'gzip',
    'X-Atlas-Format': payload.format || 'pantheon-atlas-items-v1',
    'X-Atlas-Generated-At': payload.generatedAt || new Date().toISOString(),
    'X-Atlas-Install-Id': payload.installId || 'anonymous',
    'X-Atlas-Payload-SHA256': payloadHash
  };
  if (config.uploadToken) headers.Authorization = `Bearer ${config.uploadToken}`;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Community item upload failed: ${response.status} ${text}`.trim());
  }
  const text = await response.text().catch(() => '');
  if (!text) return { response };
  try {
    const parsed = JSON.parse(text);
    return { response, ...parsed };
  } catch {
    return { response };
  }
}

function resolveSecret(value, envName) {
  return value || (envName ? process.env[envName] : null) || '';
}

function hasSecret(value, envName) {
  return Boolean(resolveSecret(value, envName));
}

function r2ObjectKey(config, payload) {
  const prefix = String(config.objectPrefix || 'contributions').replace(/^\/+|\/+$/g, '');
  const installId = String(payload.installId || config.installId || 'anonymous').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'anonymous';
  const stamp = payload.generatedAt.replace(/[:-]|\.\d{3}/g, '').replace(/\D/g, '').slice(0, 14);
  const digest = hashObject(payload).slice(0, 16);
  return `${prefix}/${installId}/items-${stamp}-${digest}.json.gz`;
}

async function putJsonGzipToR2(config, payload) {
  const body = zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'));
  const accessKeyId = resolveSecret(config.accessKeyId, config.accessKeyIdEnv || 'PANTHEON_ATLAS_R2_ACCESS_KEY_ID');
  const secretAccessKey = resolveSecret(config.secretAccessKey, config.secretAccessKeyEnv || 'PANTHEON_ATLAS_R2_SECRET_ACCESS_KEY');
  const key = r2ObjectKey(config, payload);
  const request = signedS3PutRequest({
    endpoint: config.endpoint,
    bucket: config.bucket,
    key,
    accessKeyId,
    secretAccessKey,
    body,
    region: config.region || 'auto'
  });
  const response = await fetch(request.url, {
    method: 'PUT',
    headers: request.headers,
    body
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`R2 item upload failed: ${response.status} ${text}`.trim());
  }
  return { response, key };
}

async function uploadPayload(config, payload) {
  if (config.uploadMode === 'r2') return putJsonGzipToR2(config.r2 || {}, payload);
  return postJsonGzip(config.uploadEndpoint, payload, config);
}

class CommunityItemSync {
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
      uploadMode: this.config.uploadMode || 'worker',
      uploadEndpoint: this.config.uploadEndpoint || null,
      bucket: this.config.r2?.bucket || null,
      r2Endpoint: this.config.r2?.endpoint || null,
      r2AccessKeyConfigured: hasSecret(this.config.r2?.accessKeyId, this.config.r2?.accessKeyIdEnv || 'PANTHEON_ATLAS_R2_ACCESS_KEY_ID'),
      r2SecretKeyConfigured: hasSecret(this.config.r2?.secretAccessKey, this.config.r2?.secretAccessKeyEnv || 'PANTHEON_ATLAS_R2_SECRET_ACCESS_KEY'),
      publicBaseUrl: this.config.publicBaseUrl || null,
      manifestUrl: this.config.manifestUrl || null,
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
    setTimeout(() => this.downloadCommunityItems().catch(() => {}), Math.max(1000, Number(this.config.initialDelayMs || 10_000)));
    setTimeout(() => this.uploadChangedItems().catch(() => {}), Math.max(2000, Number(this.config.initialDelayMs || 10_000) + 1000));
    const downloadEveryMs = Math.max(60_000, Number(this.config.downloadEveryMinutes || 60) * 60_000);
    const uploadEveryMs = Math.max(60_000, Number(this.config.uploadEveryMinutes || 30) * 60_000);
    this.downloadTimer = setInterval(() => this.downloadCommunityItems().catch(() => {}), downloadEveryMs);
    this.timer = setInterval(() => this.uploadChangedItems().catch(() => {}), uploadEveryMs);
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    if (this.downloadTimer) clearInterval(this.downloadTimer);
    this.timer = null;
    this.downloadTimer = null;
  }

  async downloadCommunityItems() {
    if (this.downloadBusy || this.config.downloadEnabled === false) return { downloaded: 0, imported: 0 };
    if (!this.config.manifestUrl) {
      this.status.lastError = 'Community item manifest URL is not configured.';
      return { downloaded: 0, imported: 0 };
    }
    this.downloadBusy = true;
    this.status.lastCheckedAt = new Date().toISOString();
    try {
      const statePath = this.config.statePath || path.resolve(process.cwd(), 'data', 'community-item-sync.json');
      const state = loadState(statePath);
      state.downloadedKeys = state.downloadedKeys || {};
      state.itemHashes = state.itemHashes || {};
      const manifest = await fetchJsonMaybeGzip(this.config.manifestUrl);
      const rows = normalizeManifestRows(manifest);
      let downloaded = 0;
      let imported = 0;
      for (const row of rows) {
        const key = row.key || row.url;
        if (!key || state.downloadedKeys[key] === (row.sha256 || true)) continue;
        const url = publicObjectUrl(this.config, row);
        if (!url) continue;
        const payload = await fetchJsonMaybeGzip(url);
        const items = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [];
        const observedAt = payload?.generatedAt || row.generatedAt || new Date().toISOString();
        downloaded += 1;
        for (const item of items) {
          const record = itemRecordFromCommunityItem(item, observedAt);
          if (record && this.store.upsertLootItem(record)) {
            imported += 1;
            state.itemHashes[String(record.itemId)] = hashItemContent(normalizeItemRow({
              itemId: record.itemId,
              name: record.name,
              rarity: record.rarity,
              itemType: record.itemType,
              armorTypeName: record.armorTypeName,
              weaponType: record.weaponType,
              requiredLevel: record.requiredLevel,
              itemLevel: record.itemLevel,
              maxDamage: record.maxDamage,
              delay: record.delay,
              coinValue: record.coinValue,
              weight: record.weight,
              flagsJson: record.flagsJson,
              statsJson: record.statsJson,
              templateJson: record.templateJson,
              firstSeen: observedAt,
              lastSeen: observedAt,
              seenCount: 1
            }));
          }
        }
        state.downloadedKeys[key] = row.sha256 || true;
      }
      state.lastDownloadedAt = new Date().toISOString();
      saveState(statePath, state);
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

  async uploadChangedItems() {
    if (this.uploadBusy || !this.config.uploadEnabled) return { uploaded: 0, changed: 0 };
    if (this.config.uploadMode === 'r2') {
      if (!this.config.r2?.endpoint || !this.config.r2?.bucket) {
        this.status.lastError = 'R2 item upload endpoint or bucket is not configured.';
        return { uploaded: 0, changed: 0 };
      }
      this.status.r2AccessKeyConfigured = hasSecret(this.config.r2?.accessKeyId, this.config.r2?.accessKeyIdEnv || 'PANTHEON_ATLAS_R2_ACCESS_KEY_ID');
      this.status.r2SecretKeyConfigured = hasSecret(this.config.r2?.secretAccessKey, this.config.r2?.secretAccessKeyEnv || 'PANTHEON_ATLAS_R2_SECRET_ACCESS_KEY');
    } else if (!this.config.uploadEndpoint) {
      this.status.lastError = 'Community item upload endpoint is not configured.';
      return { uploaded: 0, changed: 0 };
    }
    this.uploadBusy = true;
    this.status.lastCheckedAt = new Date().toISOString();
    try {
      const statePath = this.config.statePath || path.resolve(process.cwd(), 'data', 'community-item-sync.json');
      const state = loadState(statePath);
      const items = getNormalizedItems(this.store.db, this.config.maxItems || 5000);
      const changes = changedItems(items, state);
      const batchSize = Math.max(1, Math.min(500, Number(this.config.batchSize || 100)));
      const batch = changes.slice(0, batchSize);
      this.status.lastChangedCount = changes.length;
      if (!batch.length) {
        this.status.lastUploadedCount = 0;
        this.status.lastError = null;
        return { uploaded: 0, changed: 0 };
      }
      state.installId = state.installId || this.config.installId || crypto.randomUUID();
      const payload = contributionPayload(batch.map((entry) => entry.item), {
        atlasVersion: this.options.atlasVersion,
        installId: state.installId
      });
      const uploadResult = await uploadPayload(this.config, payload);
      state.itemHashes = state.itemHashes || {};
      for (const entry of batch) state.itemHashes[entry.item.itemId] = entry.hash;
      state.lastUploadedAt = new Date().toISOString();
      if (uploadResult?.key) state.lastUploadedKey = uploadResult.key;
      saveState(statePath, state);
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
  CommunityItemSync,
  changedItems,
  contributionPayload,
  getNormalizedItems,
  hashItemContent,
  hashObject,
  itemRecordFromCommunityItem,
  normalizeItemRow,
  normalizeManifestRows,
  r2ObjectKey,
  signedS3PutRequest
};
