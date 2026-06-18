const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { LOCAL_ITEM_ART_PROTOCOL, itemArtCachePath, itemArtContentType, itemArtUrlForName } = require('./itemArt');

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
    const error = new Error(`Community item download failed: ${await responseErrorText(response)}`);
    error.status = response.status;
    error.url = url;
    throw error;
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

async function fetchCommunityManifest(url) {
  try {
    return await fetchJsonMaybeGzip(url);
  } catch (error) {
    if (error.status === 404) {
      return { format: 'pantheon-atlas-items-manifest-v1', objects: [] };
    }
    throw error;
  }
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

function signedS3Request({ endpoint, bucket, key, accessKeyId, secretAccessKey, method = 'PUT', body = Buffer.alloc(0), contentType = null, contentEncoding = null, region = 'auto', now = new Date() }) {
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
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': date
  };
  if (contentEncoding) headers['content-encoding'] = contentEncoding;
  if (contentType) headers['content-type'] = contentType;
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map((name) => `${name}:${headers[name]}\n`).join('');
  const canonicalRequest = [
    method.toUpperCase(),
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

function signedS3PutRequest(options) {
  return signedS3Request({
    ...options,
    method: 'PUT',
    contentType: options.contentType || 'application/json',
    contentEncoding: options.contentEncoding || 'gzip'
  });
}

function compactHttpErrorText(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    return String(parsed.error || parsed.message || raw).trim();
  } catch {
    const code = raw.match(/<Code>([^<]+)<\/Code>/i)?.[1];
    const message = raw.match(/<Message>([^<]+)<\/Message>/i)?.[1];
    if (code || message) return [code, message].filter(Boolean).join(': ');
    const title = raw.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    const heading = raw.match(/<h[1-3][^>]*>([^<]+)<\/h[1-3]>/i)?.[1];
    const paragraph = raw.match(/<p[^>]*>([^<]+)<\/p>/i)?.[1];
    if (title || heading || paragraph) return [title, heading, paragraph].filter(Boolean).join(': ').replace(/\s+/g, ' ').slice(0, 500);
    return raw.replace(/\s+/g, ' ').slice(0, 500);
  }
}

async function responseErrorText(response) {
  const text = await response.text().catch(() => '');
  const compact = compactHttpErrorText(text);
  return compact ? `${response.status} ${compact}` : String(response.status);
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
    throw new Error(`Community item upload failed: ${await responseErrorText(response)}`);
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
  const label = String(config.payloadLabel || 'items').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 40) || 'items';
  return `${prefix}/${installId}/${label}-${stamp}-${digest}.json.gz`;
}

function r2ManifestKey(config) {
  return String(config.manifestKey || 'items-manifest.json').replace(/^\/+/, '') || 'items-manifest.json';
}

function isLocalItemArtUrl(value) {
  return String(value || '').trim().startsWith(LOCAL_ITEM_ART_PROTOCOL);
}

function r2PublicObjectUrl(config, key) {
  const base = String(config.publicBaseUrl || '').trim().replace(/\/+$/, '');
  if (!base) return null;
  return `${base}/${String(key || '').split('/').map((part) => encodeURIComponent(part)).join('/')}`;
}

function r2IconObjectKey(config, filePath) {
  const prefix = String(config.iconPrefix || 'item-icons').replace(/^\/+|\/+$/g, '') || 'item-icons';
  const basename = path.basename(filePath).replace(/[^a-z0-9._-]+/gi, '_') || 'item-icon.png';
  return `${prefix}/${basename}`;
}

async function signedR2Fetch(config, credentials, { method = 'GET', key, body = Buffer.alloc(0), contentType = null, contentEncoding = null }) {
  const request = signedS3Request({
    endpoint: config.endpoint,
    bucket: config.bucket,
    key,
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    method,
    body,
    contentType,
    contentEncoding,
    region: config.region || 'auto'
  });
  const init = {
    method,
    headers: request.headers
  };
  if (method !== 'GET' && method !== 'HEAD') init.body = body;
  return fetch(request.url, init);
}

async function readR2Manifest(config, credentials) {
  const response = await signedR2Fetch(config, credentials, {
    method: 'GET',
    key: r2ManifestKey(config)
  });
  if (response.status === 404) return { format: config.manifestFormat || 'pantheon-atlas-items-manifest-v1', objects: [] };
  if (!response.ok) throw new Error(`R2 manifest read failed: ${await responseErrorText(response)}`);
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    return {
      format: config.manifestFormat || 'pantheon-atlas-items-manifest-v1',
      generatedAt: parsed.generatedAt || null,
      objects: Array.isArray(parsed.objects) ? parsed.objects : []
    };
  } catch (error) {
    throw new Error(`R2 manifest read failed: invalid JSON (${error.message})`);
  }
}

async function updateR2Manifest(config, credentials, row) {
  const manifest = await readR2Manifest(config, credentials);
  const objects = manifest.objects.filter((item) => item && item.key !== row.key);
  objects.unshift(row);
  const next = {
    format: config.manifestFormat || 'pantheon-atlas-items-manifest-v1',
    generatedAt: new Date().toISOString(),
    objects: objects.slice(0, 5000)
  };
  const body = Buffer.from(JSON.stringify(next, null, 2), 'utf8');
  const response = await signedR2Fetch(config, credentials, {
    method: 'PUT',
    key: r2ManifestKey(config),
    body,
    contentType: 'application/json'
  });
  if (!response.ok) throw new Error(`R2 manifest update failed: ${await responseErrorText(response)}`);
  return next;
}

async function uploadR2ItemIcon(config, credentials, item, uploadedKeys) {
  const artUrl = String(item?.artUrl || '').trim();
  if (!isLocalItemArtUrl(artUrl)) return null;
  const filePath = itemArtCachePath(artUrl);
  if (!filePath) throw new Error(`R2 item icon upload failed: unsupported local item icon for ${item.name || item.itemId || 'item'}.`);
  let body;
  try {
    body = await fs.promises.readFile(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`R2 item icon upload failed: missing local item icon for ${item.name || item.itemId || 'item'}.`);
    }
    throw error;
  }
  const key = r2IconObjectKey(config, filePath);
  const publicUrl = r2PublicObjectUrl(config, key);
  if (!publicUrl) throw new Error('R2 item icon upload failed: publicBaseUrl is required to publish item art URLs.');
  if (!uploadedKeys.has(key)) {
    const response = await signedR2Fetch(config, credentials, {
      method: 'PUT',
      key,
      body,
      contentType: itemArtContentType(artUrl)
    });
    if (!response.ok) throw new Error(`R2 item icon upload failed: ${await responseErrorText(response)}`);
    uploadedKeys.add(key);
  }
  return { key, publicUrl };
}

async function prepareR2PayloadWithArt(config, credentials, payload) {
  if (!Array.isArray(payload?.items) || !payload.items.some((item) => isLocalItemArtUrl(item?.artUrl))) {
    return { payload, artUploaded: 0 };
  }
  const uploadedKeys = new Set();
  let artUploaded = 0;
  const items = [];
  for (const item of payload.items) {
    const uploaded = await uploadR2ItemIcon(config, credentials, item, uploadedKeys);
    if (!uploaded) {
      items.push(item);
      continue;
    }
    artUploaded += 1;
    items.push({
      ...item,
      artUrl: uploaded.publicUrl,
      artSource: item.artSource || 'lootdata-r2',
      artObjectKey: uploaded.key
    });
  }
  return {
    payload: { ...payload, items },
    artUploaded
  };
}

async function putJsonGzipToR2(config, payload) {
  const accessKeyId = resolveSecret(config.accessKeyId, config.accessKeyIdEnv || 'PANTHEON_ATLAS_R2_ACCESS_KEY_ID');
  const secretAccessKey = resolveSecret(config.secretAccessKey, config.secretAccessKeyEnv || 'PANTHEON_ATLAS_R2_SECRET_ACCESS_KEY');
  const credentials = { accessKeyId, secretAccessKey };
  const prepared = config.preparePayload
    ? await config.preparePayload(config, credentials, payload)
    : await prepareR2PayloadWithArt(config, credentials, payload);
  const uploadPayload = prepared.payload;
  const body = zlib.gzipSync(Buffer.from(JSON.stringify(uploadPayload), 'utf8'));
  const key = r2ObjectKey(config, uploadPayload);
  const response = await signedR2Fetch(config, credentials, {
    method: 'PUT',
    key,
    body,
    contentType: 'application/json',
    contentEncoding: 'gzip'
  });
  if (!response.ok) {
    throw new Error(`R2 item upload failed: ${await responseErrorText(response)}`);
  }
  await updateR2Manifest(config, credentials, {
    key,
    sha256: sha256(body),
    generatedAt: uploadPayload.generatedAt || new Date().toISOString(),
    uploadedAt: new Date().toISOString(),
    installId: uploadPayload.installId || 'anonymous'
  });
  return { response, key, artUploaded: prepared.artUploaded };
}

async function uploadPayload(config, payload) {
  if (config.uploadMode === 'r2') {
    return putJsonGzipToR2({
      ...(config.r2 || {}),
      publicBaseUrl: config.publicBaseUrl || config.r2?.publicBaseUrl || null
    }, payload);
  }
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
      const manifest = await fetchCommunityManifest(this.config.manifestUrl);
      const rows = normalizeManifestRows(manifest);
      let downloaded = 0;
      let imported = 0;
      let skipped = 0;
      for (const row of rows) {
        const key = row.key || row.url;
        if (!key || state.downloadedKeys[key] === (row.sha256 || true)) continue;
        const url = publicObjectUrl(this.config, row);
        if (!url) continue;
        let payload = null;
        try {
          payload = await fetchJsonMaybeGzip(url);
        } catch (error) {
          if (error.status === 404 || error.status === 403) {
            skipped += 1;
            state.downloadedKeys[key] = row.sha256 || `unavailable:${error.status}`;
            continue;
          }
          throw error;
        }
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
      this.status.lastError = skipped ? `Skipped ${skipped} unavailable community item object${skipped === 1 ? '' : 's'}.` : null;
      return skipped ? { downloaded, imported, skipped } : { downloaded, imported };
    } catch (error) {
      this.status.lastError = error.message;
      throw error;
    } finally {
      this.downloadBusy = false;
    }
  }

  async uploadChangedItems(options = {}) {
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
      const maxItems = Math.max(1, Math.min(50_000, Number(this.config.maxItems || 5000)));
      const items = getNormalizedItems(this.store.db, maxItems);
      const changes = options.full ? items.map((item) => ({ item, hash: hashItemContent(item) })) : changedItems(items, state);
      const batchSize = options.full ? maxItems : Math.max(1, Math.min(500, Number(this.config.batchSize || 100)));
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
  fetchCommunityManifest,
  fetchJsonMaybeGzip,
  contributionPayload,
  getNormalizedItems,
  hashItemContent,
  hashObject,
  itemRecordFromCommunityItem,
  loadState,
  normalizeItemRow,
  normalizeManifestRows,
  publicObjectUrl,
  r2ObjectKey,
  resolveSecret,
  saveState,
  sha256,
  signedR2Fetch,
  signedS3PutRequest
};
