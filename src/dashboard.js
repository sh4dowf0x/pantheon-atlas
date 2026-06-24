const fs = require('node:fs');
const https = require('node:https');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');
const { inferAbilityClass, normalizeAbilityName } = require('./abilityRegistry');
const { cacheItemArt, isAllowedItemArtUrl, itemArtContentType, itemArtUrlForName, readCachedItemArt } = require('./itemArt');
const { extractSpawnRecords } = require('./parser');
const { getNamedMobSummary, normalizeMobName } = require('./namedMobs');

const APP_ROOT = path.resolve(__dirname, '..');
const DATA_ROOT = process.env.PANTHEON_ATLAS_HOME
  ? path.resolve(process.env.PANTHEON_ATLAS_HOME)
  : APP_ROOT;
const PUBLIC_DIR = path.join(APP_ROOT, 'public');
const MAP_CACHE_ROOT = path.join(DATA_ROOT, 'data', 'map-cache', 'shalazam');
const SHALAZAM_TILE_HOST = 'shalazam.info';
const PLAYER_MARKER_TTL_MS = 15_000;
const NPC_MARKER_TTL_MS = 60 * 60_000;
const DEAD_NPC_MARKER_TTL_MS = 30_000;
const ENTITY_COMBAT_TTL_MS = 20_000;
const TARGET_CON_TTL_MS = 10 * 60_000;
const MAPS = {
  kingsreach: {
    key: 'kingsreach',
    id: 1,
    name: 'Kingsreach',
    source: 'https://shalazam.info/maps/1',
    minZoom: 3,
    maxZoom: 9,
    maxNativeZoom: 10,
    defaultZoom: 6,
    coordinatePlane: 'xz',
    bounds: { width: 552, height: 412 },
    calibrations: {
      a: { loc: { x: -1029.81, y: -2183.15 }, latlng: { lat: 280.14, lng: 232.69 } },
      b: { loc: { x: 3778, y: 3065 }, latlng: { lat: 154.03, lng: 348.2 } }
    },
    tileLayers: [{
      key: 'base',
      name: 'Kingsreach',
      tilePath: '/api/map/tile/kingsreach/base/{z}/{x}/{y}.webp',
      remotePath: '/static/maps/KR_EA_Feb2025/{z}/{x}/{y}.webp',
      cacheFolder: 'KR_EA_Feb2025',
      nativePixelWidth: 141312,
      nativePixelHeight: 105472
    }]
  },
  halnir_cave: {
    key: 'halnir_cave',
    id: 2,
    name: 'Halnir Cave',
    source: 'https://shalazam.info/maps/2',
    minZoom: 3,
    maxZoom: 8,
    maxNativeZoom: 7,
    defaultZoom: 4,
    coordinatePlane: 'xz',
    bounds: { width: 824, height: 376 },
    calibrations: {
      a: { loc: { x: -69.03, y: 139.39 }, latlng: { lat: 54.08, lng: 338.52 } },
      b: { loc: { x: 109.59, y: -97.11 }, latlng: { lat: 234.16, lng: 474.55 } }
    },
    tileLayers: [{
      key: 'upper',
      name: 'Upper Dungeon Area',
      verticalRange: { minY: 20 },
      tilePath: '/api/map/tile/halnir_cave/upper/{z}/{x}/{y}.webp',
      remotePath: '/static/maps/halnir-cave-20241116/HC_MAP_L1_UpperArea/{z}/{x}/{y}.webp',
      cacheFolder: path.join('halnir-cave-20241116', 'HC_MAP_L1_UpperArea'),
      nativePixelWidth: 26368,
      nativePixelHeight: 12032
    }, {
      key: 'mid',
      name: 'Mid Dungeon Area',
      verticalRange: { minY: 0, maxY: 20 },
      tilePath: '/api/map/tile/halnir_cave/mid/{z}/{x}/{y}.webp',
      remotePath: '/static/maps/halnir-cave-20241116/HC_MAP_L23_MidArea/{z}/{x}/{y}.webp',
      cacheFolder: path.join('halnir-cave-20241116', 'HC_MAP_L23_MidArea'),
      nativePixelWidth: 26368,
      nativePixelHeight: 12032
    }, {
      key: 'lower',
      name: 'Lower Dungeon Area',
      verticalRange: { maxY: 0 },
      tilePath: '/api/map/tile/halnir_cave/lower/{z}/{x}/{y}.webp',
      remotePath: '/static/maps/halnir-cave-20241116/HC_MAP_L4_LowerArea/{z}/{x}/{y}.webp',
      cacheFolder: path.join('halnir-cave-20241116', 'HC_MAP_L4_LowerArea'),
      nativePixelWidth: 26368,
      nativePixelHeight: 12032
    }]
  },
  goblin_cave: {
    key: 'goblin_cave',
    id: 8,
    name: 'Goblin Cave',
    source: 'https://shalazam.info/maps/8',
    minZoom: 2,
    maxZoom: 6,
    maxNativeZoom: 6,
    defaultZoom: 3,
    coordinatePlane: 'xz',
    bounds: { width: 720, height: 464 },
    calibrations: {
      a: { loc: { x: 3427.1, y: 3080.2 }, latlng: { lat: 426.8751, lng: 96.875 } },
      b: { loc: { x: 3607.8, y: 3253.4 }, latlng: { lat: 162.9987, lng: 372.7504 } }
    },
    tileLayers: [{
      key: 'upper',
      name: 'Upper Dungeon Area',
      verticalRange: { minY: 520 },
      tilePath: '/api/map/tile/goblin_cave/upper/{z}/{x}/{y}.webp',
      remotePath: '/static/maps/goblin-caves-20260424/HGC_04_Upper/{z}/{x}/{y}.webp',
      cacheFolder: path.join('goblin-caves-20260424', 'HGC_04_Upper'),
      nativePixelWidth: 11520,
      nativePixelHeight: 7424
    }, {
      key: 'mid',
      name: 'Mid Dungeon Area',
      verticalRange: { minY: 495, maxY: 520 },
      tilePath: '/api/map/tile/goblin_cave/mid/{z}/{x}/{y}.webp',
      remotePath: '/static/maps/goblin-caves-20260424/HGC_03_Mid/{z}/{x}/{y}.webp',
      cacheFolder: path.join('goblin-caves-20260424', 'HGC_03_Mid'),
      nativePixelWidth: 11520,
      nativePixelHeight: 7424
    }, {
      key: 'lower1',
      name: 'Lower 1 Dungeon Area',
      verticalRange: { minY: 480, maxY: 495 },
      tilePath: '/api/map/tile/goblin_cave/lower1/{z}/{x}/{y}.webp',
      remotePath: '/static/maps/goblin-caves-20260424/HGC_02_Lower1/{z}/{x}/{y}.webp',
      cacheFolder: path.join('goblin-caves-20260424', 'HGC_02_Lower1'),
      nativePixelWidth: 11520,
      nativePixelHeight: 7424
    }, {
      key: 'lower2',
      name: 'Lower 2 Dungeon Area',
      verticalRange: { maxY: 480 },
      tilePath: '/api/map/tile/goblin_cave/lower2/{z}/{x}/{y}.webp',
      remotePath: '/static/maps/goblin-caves-20260424/HGC_01_Lower2/{z}/{x}/{y}.webp',
      cacheFolder: path.join('goblin-caves-20260424', 'HGC_01_Lower2'),
      nativePixelWidth: 11520,
      nativePixelHeight: 7424
    }]
  }
};

function getMapConfig(key) {
  return MAPS[key] || MAPS.kingsreach;
}

function mapKeyForZoneName(zoneName) {
  const text = String(zoneName || '').toLowerCase();
  if (text.includes('halnir')) return 'halnir_cave';
  if (/\bwild'?s?\s+end\b/.test(text)) return 'kingsreach';
  if (text.includes('eastern plains') || text.includes('thronefast') || text.includes('avendyr') || text.includes('kingsreach')) return 'kingsreach';
  return null;
}

function mapKeyForCoordinates(x, z, y = null) {
  const locX = Number(x);
  const locZ = Number(z);
  const locY = Number(y);
  if (!Number.isFinite(locX) || !Number.isFinite(locZ)) return null;
  if (locX >= -320 && locX <= 320 && locZ >= -420 && locZ <= 240) return 'halnir_cave';
  if (
    locX >= 3300 && locX <= 3700
    && locZ >= 3000 && locZ <= 3350
    && Number.isFinite(locY) && locY >= 430 && locY <= 560
  ) return 'goblin_cave';
  if (Math.abs(locX) > 500 || Math.abs(locZ) > 500) return 'kingsreach';
  return null;
}

function calibrationHorizontalDistance(left, right) {
  const lx = Number(left?.x);
  const lz = Number(left?.z);
  const rx = Number(right?.x);
  const rz = Number(right?.z);
  if (![lx, lz, rx, rz].every(Number.isFinite)) return Infinity;
  return Math.hypot(lx - rx, lz - rz);
}

function calibrationScore(row, sample) {
  const horizontal = calibrationHorizontalDistance(row, sample);
  const vertical = Math.abs(Number(row?.y) - Number(sample?.y));
  if (!Number.isFinite(horizontal) || !Number.isFinite(vertical)) return Infinity;
  return horizontal + vertical * 0.25;
}

function isSurfaceCalibrationSample(sample) {
  const label = String(sample?.label || '').toLowerCase();
  return sample?.mapKey === 'kingsreach'
    || sample?.layerKey === 'base'
    || label.includes('surface')
    || label.includes('road')
    || label.includes('above');
}

function isTransitionCalibrationSample(sample) {
  const label = String(sample?.label || '').toLowerCase();
  return !sample?.layerKey || label.includes('ramp') || label.includes('transition');
}

function goblinLayerForY(y) {
  const value = Number(y);
  if (!Number.isFinite(value)) return null;
  if (value < 480) return 'lower2';
  if (value < 495) return 'lower1';
  if (value < 520) return 'mid';
  return 'upper';
}

function sampleMatchesGoblinLayerBand(sample) {
  if (sample?.mapKey !== 'goblin_cave') return true;
  if (!sample?.layerKey || isTransitionCalibrationSample(sample)) return false;
  return goblinLayerForY(sample.y) === sample.layerKey;
}

function nearestMapCalibrationSample(row, samples, predicate = () => true) {
  let best = null;
  let bestScore = Infinity;
  for (const sample of samples || []) {
    if (!predicate(sample)) continue;
    const score = calibrationScore(row, sample);
    if (score < bestScore) {
      best = sample;
      bestScore = score;
    }
  }
  return best ? { sample: best, score: bestScore, horizontal: calibrationHorizontalDistance(row, best) } : null;
}

function inferMapFromCalibration(row, samples = []) {
  if (!row) return null;
  const surface = nearestMapCalibrationSample(row, samples, isSurfaceCalibrationSample);
  const cave = nearestMapCalibrationSample(row, samples, (sample) => sample.mapKey === 'goblin_cave' && !isTransitionCalibrationSample(sample));
  if (surface && surface.horizontal <= 90 && (!cave || surface.score <= cave.score + 5)) {
    return {
      mapKey: 'kingsreach',
      zoneName: 'Avendyr/Kingsreach',
      source: 'calibration_surface',
      confidence: Number(Math.max(0, 1 - surface.score / 120).toFixed(3)),
      calibration: {
        label: surface.sample.label,
        layerKey: surface.sample.layerKey || null,
        distance: Number(surface.horizontal.toFixed(1)),
        score: Number(surface.score.toFixed(1))
      }
    };
  }
  if (cave && cave.horizontal <= 90) {
    return {
      mapKey: 'goblin_cave',
      zoneName: 'Goblin Cave',
      source: 'calibration_cave',
      confidence: Number(Math.max(0, 1 - cave.score / 120).toFixed(3)),
      calibration: {
        label: cave.sample.label,
        layerKey: sampleMatchesGoblinLayerBand(cave.sample) ? cave.sample.layerKey : goblinLayerForY(row.y),
        distance: Number(cave.horizontal.toFixed(1)),
        score: Number(cave.score.toFixed(1))
      }
    };
  }
  return null;
}

function mapKeyForCoordinatesWithCalibration(db, x, z, y = null) {
  const row = { x: Number(x), y: Number(y), z: Number(z) };
  if (![row.x, row.z].every(Number.isFinite)) return null;
  const samples = db ? getMapCalibrationSamples(db, { limit: 5000 }) : [];
  const calibrated = inferMapFromCalibration(row, samples);
  return calibrated?.mapKey || mapKeyForCoordinates(x, z, y);
}

function publicMapConfig(map) {
  return {
    key: map.key,
    id: map.id,
    name: map.name,
    source: map.source,
    minZoom: map.minZoom,
    maxZoom: map.maxZoom,
    maxNativeZoom: map.maxNativeZoom,
    defaultZoom: map.defaultZoom,
    coordinatePlane: map.coordinatePlane,
    bounds: map.bounds,
    calibrations: map.calibrations,
    tileLayers: map.tileLayers.map((layer) => ({
      key: layer.key,
      name: layer.name,
      verticalRange: layer.verticalRange || null,
      tilePath: layer.tilePath,
      nativePixelWidth: layer.nativePixelWidth,
      nativePixelHeight: layer.nativePixelHeight
    }))
  };
}

function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Cache-Control': 'no-store'
  });
  res.end(json);
}

function readJsonBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function mapCalibrationLayerKeyForLabel(label) {
  const value = String(label || '').trim().toLowerCase();
  if (!value) return null;
  if (value.includes('lower2') || value.includes('lower 2') || value.includes('lowest')) return 'lower2';
  if (value.includes('lower1') || value.includes('lower 1')) return 'lower1';
  if (value.includes('lower')) return 'lower1';
  if (value.includes('mid')) return 'mid';
  if (value.includes('upper') || value.includes('first') || value.includes('entrance')) return 'upper';
  if (value.includes('surface') || value.includes('road') || value.includes('above')) return 'base';
  return null;
}

function insertMapCalibrationSample(db, sample = {}) {
  const x = Number(sample.x);
  const y = Number(sample.y);
  const z = Number(sample.z);
  const observedAt = sample.observedAt && !Number.isNaN(Date.parse(sample.observedAt))
    ? new Date(sample.observedAt).toISOString()
    : new Date().toISOString();
  const label = String(sample.label || '').trim();
  const mapKey = String(sample.mapKey || '').trim();
  if (!label) throw new Error('Calibration label is required');
  if (!mapKey || !MAPS[mapKey]) throw new Error('Known map key is required');
  if (![x, y, z].every(Number.isFinite)) throw new Error('Finite x, y, and z are required');
  const layerKey = String(sample.layerKey || '').trim() || mapCalibrationLayerKeyForLabel(label);
  const source = String(sample.source || '').trim() || null;
  const entityId = String(sample.entityId || '').trim() || null;
  const sessionName = String(sample.sessionName || '').trim() || null;
  const heading = Number(sample.heading);
  const raw = {
    observedAt,
    sessionName,
    label,
    mapKey,
    layerKey,
    source,
    entityId,
    x,
    y,
    z,
    heading: Number.isFinite(heading) ? heading : null
  };
  const result = db.prepare(`
    INSERT INTO map_calibration_samples (
      observed_at, recorded_at, session_name, label, map_key, layer_key,
      source, entity_id, x, y, z, heading, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    observedAt,
    new Date().toISOString(),
    sessionName,
    label,
    mapKey,
    layerKey || null,
    source,
    entityId,
    x,
    y,
    z,
    Number.isFinite(heading) ? heading : null,
    JSON.stringify(raw)
  );
  return { id: Number(result.lastInsertRowid), ...raw };
}

function getMapCalibrationSamples(db, options = {}) {
  const mapKey = String(options.mapKey || '').trim();
  const limit = Math.max(1, Math.min(5000, Number(options.limit) || 2000));
  const rows = mapKey
    ? db.prepare(`
      SELECT id, observed_at observedAt, recorded_at recordedAt, session_name sessionName,
             label, map_key mapKey, layer_key layerKey, source, entity_id entityId,
             x, y, z, heading
      FROM map_calibration_samples
      WHERE map_key = ?
      ORDER BY observed_at DESC, id DESC
      LIMIT ?
    `).all(mapKey, limit)
    : db.prepare(`
      SELECT id, observed_at observedAt, recorded_at recordedAt, session_name sessionName,
             label, map_key mapKey, layer_key layerKey, source, entity_id entityId,
             x, y, z, heading
      FROM map_calibration_samples
      ORDER BY observed_at DESC, id DESC
      LIMIT ?
    `).all(limit);
  return rows.map((row) => ({
    ...row,
    id: Number(row.id),
    x: Number(row.x),
    y: Number(row.y),
    z: Number(row.z),
    heading: row.heading === null ? null : Number(row.heading)
  }));
}

function getMapCalibrationSummary(db, options = {}) {
  const samples = getMapCalibrationSamples(db, options);
  const grouped = new Map();
  for (const sample of samples) {
    const key = `${sample.mapKey}|${sample.layerKey || ''}|${sample.label}`;
    const current = grouped.get(key) || {
      mapKey: sample.mapKey,
      layerKey: sample.layerKey || null,
      label: sample.label,
      count: 0,
      firstSeen: sample.observedAt,
      lastSeen: sample.observedAt
    };
    current.count += 1;
    if (sample.observedAt < current.firstSeen) current.firstSeen = sample.observedAt;
    if (sample.observedAt > current.lastSeen) current.lastSeen = sample.observedAt;
    grouped.set(key, current);
  }
  return {
    generatedAt: new Date().toISOString(),
    samples,
    groups: [...grouped.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
  };
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.webp': 'image/webp'
  };
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

function sendBuffer(res, status, data, contentType) {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': data.length,
    'Cache-Control': 'public, max-age=604800'
  });
  res.end(data);
}

function fetchHttpsBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Pantheon Atlas local map cache',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
      }
    }, (remoteRes) => {
      if (remoteRes.statusCode && remoteRes.statusCode >= 300 && remoteRes.statusCode < 400 && remoteRes.headers.location) {
        remoteRes.resume();
        fetchHttpsBuffer(new URL(remoteRes.headers.location, url).toString()).then(resolve, reject);
        return;
      }
      if (remoteRes.statusCode !== 200) {
        remoteRes.resume();
        reject(new Error(`Tile fetch failed: ${remoteRes.statusCode}`));
        return;
      }
      const chunks = [];
      remoteRes.on('data', (chunk) => chunks.push(chunk));
      remoteRes.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function sendRemoteImage(res, url) {
  if (!isAllowedItemArtUrl(url)) {
    sendJson(res, 400, { error: 'Unsupported image URL' });
    return;
  }
  try {
    let data = await readCachedItemArt(url);
    if (!data) {
      await cacheItemArt(url);
      data = await readCachedItemArt(url);
    }
    if (!data) throw new Error('Item art cache miss');
    sendBuffer(res, 200, data, itemArtContentType(url));
  } catch (error) {
    sendJson(res, 502, { error: error.message || 'Image fetch failed' });
  }
}

async function sendMapTile(res, mapKey, layerKey, z, x, y) {
  const map = getMapConfig(mapKey);
  const layer = map.tileLayers.find((item) => item.key === layerKey) || map.tileLayers[0];
  const tileZ = Number(z);
  const tileX = Number(x);
  const tileY = Number(y);
  if (![tileZ, tileX, tileY].every(Number.isInteger) || tileZ < map.minZoom || tileZ > map.maxNativeZoom || tileX < 0 || tileY < 0) {
    sendJson(res, 400, { error: 'Invalid map tile' });
    return;
  }
  const maxTileX = Math.ceil((layer.nativePixelWidth / 256) / (2 ** (map.maxNativeZoom - tileZ)));
  const maxTileY = Math.ceil((layer.nativePixelHeight / 256) / (2 ** (map.maxNativeZoom - tileZ)));
  if (tileX >= maxTileX || tileY >= maxTileY) {
    sendJson(res, 404, { error: 'Map tile outside bounds' });
    return;
  }

  const tilePath = path.join(MAP_CACHE_ROOT, layer.cacheFolder, String(tileZ), String(tileX), `${tileY}.webp`);
  try {
    const cached = await fs.promises.readFile(tilePath);
    sendBuffer(res, 200, cached, 'image/webp');
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const remotePath = layer.remotePath
    .replace('{z}', encodeURIComponent(tileZ))
    .replace('{x}', encodeURIComponent(tileX))
    .replace('{y}', encodeURIComponent(tileY));
  const data = await fetchHttpsBuffer(`https://${SHALAZAM_TILE_HOST}${remotePath}`);
  await fs.promises.mkdir(path.dirname(tilePath), { recursive: true });
  await fs.promises.writeFile(tilePath, data);
  sendBuffer(res, 200, data, 'image/webp');
}

function getSummary(db, since = null) {
  const whereObserved = since ? 'WHERE observed_at >= ?' : '';
  const observedParams = since ? [since] : [];
  const totals = since
    ? db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM game_events ${whereObserved}) AS events,
        (SELECT COUNT(*) FROM actor_names) AS actors,
        (SELECT MAX(observed_at) FROM game_events ${whereObserved}) AS lastEventAt
    `).get(...observedParams, ...observedParams)
    : db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM game_events) AS events,
        (SELECT COUNT(*) FROM actor_names) AS actors,
        (SELECT MAX(observed_at) FROM game_events) AS lastEventAt
    `).get();
  const eventTypes = since
    ? db.prepare(`
      SELECT event_type AS eventType, COUNT(*) AS count
      FROM game_events
      ${whereObserved}
      GROUP BY event_type
      ORDER BY count DESC
    `).all(...observedParams)
    : db.prepare(`
      SELECT event_type AS eventType, COUNT(*) AS count
      FROM (
        SELECT event_type
        FROM game_events
        ORDER BY id DESC
        LIMIT 5000
      )
      GROUP BY event_type
      ORDER BY count DESC
    `).all();
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      events: Number(totals?.events || 0),
      actors: Number(totals?.actors || 0),
      lastEventAt: totals?.lastEventAt || null
    },
    eventTypes
  };
}

function getLatestMapState(db) {
  const candidates = [];
  let teleportZoneName = null;
  let teleportMapKey = null;

  const teleportSignal = db.prepare(`
    SELECT observed_at AS observedAt, raw_text AS text
    FROM game_events
    WHERE event_type = 'system_message'
      AND raw_text LIKE 'Teleporting to %.'
    ORDER BY observed_at DESC, id DESC
    LIMIT 1
  `).get();
  if (teleportSignal) {
    const match = String(teleportSignal.text || '').match(/Teleporting to\s+(.+?)\./i);
    const zoneName = match ? match[1].trim() : null;
    const mapKey = mapKeyForZoneName(zoneName);
    if (mapKey) {
      teleportZoneName = zoneName;
      teleportMapKey = mapKey;
      candidates.push({
        mapKey,
        zoneName,
        observedAt: teleportSignal.observedAt,
        source: 'teleport',
        priority: 3
      });
    }
  }

  const positionSignal = db.prepare(`
    SELECT observed_at AS observedAt, x, y, z
    FROM game_events
    WHERE event_type = 'position_update'
      AND x IS NOT NULL
      AND z IS NOT NULL
    ORDER BY observed_at DESC, id DESC
    LIMIT 1
  `).get();
  if (positionSignal) {
    const calibrated = inferMapFromCalibration(positionSignal, getMapCalibrationSamples(db, { limit: 5000 }));
    const mapKey = calibrated?.mapKey || mapKeyForCoordinates(positionSignal.x, positionSignal.z, positionSignal.y);
    if (mapKey) {
      candidates.push({
        mapKey,
        zoneName: calibrated?.zoneName || (teleportMapKey === mapKey && teleportZoneName
          ? teleportZoneName
          : mapKey === 'halnir_cave' ? 'Halnir Cave' : mapKey === 'goblin_cave' ? 'Goblin Cave' : 'Avendyr/Kingsreach'),
        observedAt: positionSignal.observedAt,
        source: calibrated?.source || 'position',
        calibration: calibrated?.calibration || null,
        confidence: calibrated?.confidence || null,
        priority: 2
      });
    }
  }

  const entitySignal = db.prepare(`
    SELECT observed_at AS observedAt, target, raw_text AS text, x, y, z
    FROM game_events
    WHERE observed_at >= datetime('now', '-15 minutes')
      AND event_type = 'world_entity'
      AND (
        target LIKE 'rockbone %'
        OR ability LIKE 'Goblin_%'
        OR (
          x BETWEEN 3300 AND 3700
          AND z BETWEEN 3000 AND 3350
          AND y BETWEEN 430 AND 560
        )
        OR
        target LIKE 'Drawn %'
        OR target LIKE 'Celis %'
        OR ability LIKE 'Ratkin_Drawn_%'
        OR ability LIKE 'Spider_Grass_Crystal'
        OR (
          x BETWEEN -300 AND 300
          AND z BETWEEN -400 AND 220
        )
      )
    ORDER BY observed_at DESC, id DESC
    LIMIT 1
  `).get();
  if (entitySignal) {
    const calibrated = inferMapFromCalibration(entitySignal, getMapCalibrationSamples(db, { limit: 5000 }));
    const mapKey = calibrated?.mapKey || mapKeyForCoordinates(entitySignal.x, entitySignal.z, entitySignal.y);
    if (mapKey) {
      candidates.push({
        mapKey,
        zoneName: calibrated?.zoneName || (mapKey === 'goblin_cave' ? 'Goblin Cave' : mapKey === 'halnir_cave' ? 'Halnir Cave' : 'Avendyr/Kingsreach'),
        observedAt: entitySignal.observedAt,
        source: calibrated?.source || 'entity',
        calibration: calibrated?.calibration || null,
        confidence: calibrated?.confidence || null,
        priority: 1
      });
    }
  }

  const combatSignal = db.prepare(`
    SELECT observed_at AS observedAt, target, source, raw_text AS text
    FROM game_events
    WHERE observed_at >= datetime('now', '-15 minutes')
      AND (target LIKE 'Drawn %' OR source LIKE 'Drawn %' OR raw_text LIKE '%Drawn %')
    ORDER BY observed_at DESC, id DESC
    LIMIT 1
  `).get();
  if (combatSignal) {
    candidates.push({
      mapKey: 'halnir_cave',
      zoneName: 'Halnir Cave',
      observedAt: combatSignal.observedAt,
      source: 'combat',
      priority: 1
    });
  }

  if (!candidates.length) return { mapKey: 'kingsreach', zoneName: null, observedAt: null, source: 'default' };

  const teleportCandidate = candidates.find((candidate) => candidate.source === 'teleport');
  const newestNonTeleport = candidates
    .filter((candidate) => candidate.source !== 'teleport')
    .sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt))[0];
  if (
    teleportCandidate
    && (!newestNonTeleport || Date.parse(newestNonTeleport.observedAt) - Date.parse(teleportCandidate.observedAt) <= 12000)
  ) {
    return teleportCandidate;
  }

  return candidates.sort((left, right) => {
    const timeDelta = Date.parse(right.observedAt) - Date.parse(left.observedAt);
    if (timeDelta) return timeDelta;
    return right.priority - left.priority;
  })[0];
}

function getRecentRows(db, since = null) {
  const observedWhere = since ? 'WHERE observed_at >= ?' : '';
  const observedParams = since ? [since] : [];
  return {
    events: db.prepare(`
      SELECT id, observed_at AS observedAt, event_type AS eventType, source, target, ability,
             amount, damage_type AS damageType, x, y, z, raw_text AS rawText
      FROM game_events
      ${observedWhere}
      ORDER BY id DESC
      LIMIT 40
    `).all(...observedParams)
  };
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function acquisitionFromLootEvent(row = {}) {
  const raw = parseJsonObject(row.rawJson);
  const acquisition = raw.acquisition && typeof raw.acquisition === 'object' ? raw.acquisition : {};
  const parsed = raw.parsed && typeof raw.parsed === 'object' ? raw.parsed : {};
  const source = acquisition.source && typeof acquisition.source === 'object'
    ? acquisition.source.name
    : acquisition.source;
  return {
    method: acquisition.method || null,
    confidence: acquisition.confidence || null,
    corpseId: acquisition.corpseId ?? raw.corpseId ?? null,
    source: acquisition.source && typeof acquisition.source === 'object'
      ? acquisition.source
      : source || parsed.source || parsed.corpse
        ? { name: source || parsed.source || parsed.corpse }
        : null,
    lootChat: acquisition.lootChat || null,
    evidence: Array.isArray(acquisition.evidence) ? acquisition.evidence : []
  };
}

function sourceNameFromLootEvent(row = {}) {
  return row.source || acquisitionFromLootEvent(row).source?.name || null;
}

function lootSourceMapContext(source = {}) {
  const x = Number(source.x);
  const y = Number(source.y);
  const z = Number(source.z);
  if (![x, y, z].every(Number.isFinite)) return { x: null, y: null, z: null, mapKey: null, zoneName: null };
  const mapKey = mapKeyForCoordinates(x, z, y);
  return {
    x,
    y,
    z,
    mapKey,
    zoneName: mapKey === 'halnir_cave'
      ? 'Halnir Cave'
      : mapKey === 'goblin_cave'
        ? 'Goblin Cave'
        : mapKey === 'kingsreach'
          ? 'Avendyr/Kingsreach'
          : null
  };
}

function getLootDropSources(db, itemId) {
  const rows = db.prepare(`
    SELECT observed_at observedAt, event_type eventType, source, raw_json rawJson
    FROM loot_events
    WHERE item_id = ?
      AND (source IS NOT NULL OR raw_json LIKE '%"acquisition"%')
    ORDER BY observed_at DESC, id DESC
    LIMIT 500
  `).all(String(itemId));
  const bySource = new Map();
  for (const row of rows) {
    const acquisition = acquisitionFromLootEvent(row);
    const sourceName = sourceNameFromLootEvent(row);
    if (!sourceName || /^player$/i.test(sourceName)) continue;
    const key = sourceName.toLowerCase();
    const current = bySource.get(key) || {
      name: sourceName,
      count: 0,
      firstSeen: row.observedAt,
      lastSeen: row.observedAt,
      methods: new Set(),
      confidences: new Set(),
      level: null,
      entityType: null,
      x: null,
      y: null,
      z: null,
      mapKey: null,
      zoneName: null
    };
    current.count += 1;
    if (Date.parse(row.observedAt) < Date.parse(current.firstSeen)) current.firstSeen = row.observedAt;
    if (Date.parse(row.observedAt) > Date.parse(current.lastSeen)) current.lastSeen = row.observedAt;
    if (acquisition.method) current.methods.add(acquisition.method);
    if (acquisition.confidence) current.confidences.add(acquisition.confidence);
    const source = acquisition.source || {};
    if (source.level !== undefined && source.level !== null && Number.isFinite(Number(source.level))) current.level = Number(source.level);
    if (source.entityType) current.entityType = source.entityType;
    const mapContext = lootSourceMapContext(source);
    if (mapContext.mapKey || mapContext.x !== null) {
      current.x = mapContext.x;
      current.y = mapContext.y;
      current.z = mapContext.z;
      current.mapKey = mapContext.mapKey;
      current.zoneName = mapContext.zoneName;
    }
    bySource.set(key, current);
  }
  return [...bySource.values()]
    .map((source) => ({
      ...source,
      methods: [...source.methods],
      confidences: [...source.confidences]
    }))
    .sort((left, right) => right.count - left.count || Date.parse(right.lastSeen) - Date.parse(left.lastSeen) || left.name.localeCompare(right.name));
}

function normalizeCommunityDropSources(rows = []) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((source) => {
      if (!source || typeof source !== 'object') return null;
      const name = String(source.name || '').trim();
      if (!name || /^player$/i.test(name)) return null;
      return {
        name,
        count: Number(source.count || 0),
        firstSeen: source.firstSeen || source.lastSeen || null,
        lastSeen: source.lastSeen || source.firstSeen || null,
        methods: Array.isArray(source.methods) ? source.methods.filter(Boolean) : source.method ? [source.method] : [],
        confidences: Array.isArray(source.confidences) ? source.confidences.filter(Boolean) : source.confidence ? [source.confidence] : [],
        level: source.level ?? null,
        entityType: source.entityType || null,
        x: source.x ?? null,
        y: source.y ?? null,
        z: source.z ?? null,
        mapKey: source.mapKey || null,
        zoneName: source.zoneName || null
      };
    })
    .filter(Boolean);
}

function mergeLootDropSources(...lists) {
  const bySource = new Map();
  for (const source of lists.flat()) {
    if (!source?.name) continue;
    const key = String(source.name).toLowerCase();
    const current = bySource.get(key);
    if (!current) {
      bySource.set(key, {
        ...source,
        count: Number(source.count || 0),
        methods: new Set(Array.isArray(source.methods) ? source.methods : []),
        confidences: new Set(Array.isArray(source.confidences) ? source.confidences : [])
      });
      continue;
    }
    current.count = Math.max(Number(current.count || 0), Number(source.count || 0));
    if (source.firstSeen && (!current.firstSeen || source.firstSeen < current.firstSeen)) current.firstSeen = source.firstSeen;
    if (source.lastSeen && (!current.lastSeen || source.lastSeen > current.lastSeen)) current.lastSeen = source.lastSeen;
    for (const method of Array.isArray(source.methods) ? source.methods : []) current.methods.add(method);
    for (const confidence of Array.isArray(source.confidences) ? source.confidences : []) current.confidences.add(confidence);
    for (const field of ['level', 'entityType', 'x', 'y', 'z', 'mapKey', 'zoneName']) {
      if ((current[field] === null || current[field] === undefined || current[field] === '') && source[field] !== null && source[field] !== undefined && source[field] !== '') {
        current[field] = source[field];
      }
    }
  }
  return [...bySource.values()]
    .map((source) => ({
      ...source,
      methods: [...source.methods],
      confidences: [...source.confidences]
    }))
    .sort((left, right) => right.count - left.count || Date.parse(right.lastSeen || 0) - Date.parse(left.lastSeen || 0) || left.name.localeCompare(right.name));
}

function statValueFromStats(stats = {}, statName = '') {
  const wanted = String(statName || '').toLowerCase();
  if (!wanted) return null;
  const rows = Array.isArray(stats.statModifiers) ? stats.statModifiers : [];
  const row = rows.find((stat) => String(stat.stat || stat.name || stat.Stat || stat.Name || stat.StatName || stat.statName || '').toLowerCase() === wanted);
  if (!row) return null;
  const value = row.value ?? row.Value ?? row.amount ?? row.Amount ?? row.modifier ?? row.Modifier;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mapLootItemRow(row, options = {}) {
  const template = row.templateJson ? parseJsonObject(row.templateJson) : {};
  const stats = parseJsonObject(row.statsJson);
  const itemType = row.itemType || 'Unknown';
  const weaponType = row.weaponType && row.weaponType !== 'None' ? row.weaponType : null;
  const armorTypeName = row.armorTypeName && row.armorTypeName !== 'HeavyPlate' ? row.armorTypeName : row.armorTypeName;
  const displaySubtype = itemType === 'Weapon'
    ? weaponType || 'Weapon'
    : itemType === 'Armor'
      ? armorTypeName || 'Armor'
      : itemType;
  const output = {
    itemId: row.itemId,
    name: row.name,
    rarity: row.rarity || 'Unknown',
    itemType,
    armorTypeName: row.armorTypeName || null,
    weaponType,
    primarySkill: template.primarySkill && template.primarySkill !== 'None' ? template.primarySkill : null,
    requiredProficiency: template.requiredProficiency && template.requiredProficiency !== 'None' ? template.requiredProficiency : null,
    equipSlotName: template.equipSlotName && template.equipSlotName !== 'None' ? template.equipSlotName : null,
    equipSlotSource: template.equipSlotSource || null,
    classRequirementNames: template.classRequirementNames && template.classRequirementNames !== '0' ? template.classRequirementNames : null,
    classRequirementSource: template.classRequirementSource || null,
    displaySubtype,
    requiredLevel: row.requiredLevel === null || row.requiredLevel === undefined ? null : Number(row.requiredLevel),
    itemLevel: row.itemLevel === null || row.itemLevel === undefined ? null : Number(row.itemLevel),
    maxDamage: row.maxDamage === null || row.maxDamage === undefined ? null : Number(row.maxDamage),
    delay: row.delay === null || row.delay === undefined ? null : Number(row.delay),
    coinValue: row.coinValue === null || row.coinValue === undefined ? null : Number(row.coinValue),
    weight: row.weight === null || row.weight === undefined ? null : Number(row.weight),
    flags: parseJsonArray(row.flagsJson),
    stats,
    armorValue: statValueFromStats(stats, 'Armor'),
    weaponDps: Number(row.maxDamage) > 0 && Number(row.delay) > 0 ? Number((Number(row.maxDamage) / Number(row.delay)).toFixed(2)) : null,
    iconKey: template.iconKey || null,
    artUrl: template.artUrl || template.iconUrl || itemArtUrlForName(row.name) || null,
    description: template.itemDescription || null,
    firstSeen: row.firstSeen,
    lastSeen: row.lastSeen,
    seenCount: Number(row.seenCount || 0),
    instanceCount: Number(row.instanceCount || 0),
    characterCount: Number(row.characterCount || 0),
    equippedCount: Number(row.equippedCount || 0),
    storageCount: Number(row.storageCount || 0),
    bankCount: Number(row.bankCount || 0)
  };
  if (options.includeTemplate) output.template = template;
  return output;
}

function lootItemWhere(options = {}) {
  const search = String(options.search || '').trim();
  const rarity = String(options.rarity || '').trim();
  const type = String(options.type || '').trim();
  const className = String(options.className || '').trim();
  const slot = String(options.slot || '').trim();
  const maxLevel = Number(options.maxLevel);
  const clauses = [];
  const params = [];
  if (search) {
    clauses.push('(li.name LIKE ? OR li.item_type LIKE ? OR li.armor_type_name LIKE ? OR li.weapon_type LIKE ? OR li.template_json LIKE ? OR li.stats_json LIKE ?)');
    const pattern = `%${search}%`;
    params.push(pattern, pattern, pattern, pattern, pattern, pattern);
  }
  if (rarity) {
    clauses.push('li.rarity = ?');
    params.push(rarity);
  }
  if (type) {
    clauses.push('li.item_type = ?');
    params.push(type);
  }
  if (className) {
    clauses.push('li.template_json LIKE ?');
    params.push(`%"classRequirementNames":"%${className}%`);
  }
  if (slot) {
    clauses.push('li.template_json LIKE ?');
    params.push(`%"equipSlotName":"%${slot}%`);
  }
  if (Number.isFinite(maxLevel) && maxLevel > 0) {
    clauses.push('(li.required_level IS NULL OR li.required_level <= ?)');
    params.push(Math.trunc(maxLevel));
  }
  return {
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
}

function getLootSummary(db, options = {}) {
  const search = String(options.search || '').trim();
  const rarity = String(options.rarity || '').trim();
  const type = String(options.type || '').trim();
  const className = String(options.className || '').trim();
  const slot = String(options.slot || '').trim();
  const maxLevel = Number(options.maxLevel);
  const sort = String(options.sort || 'lastSeen').trim();
  const limit = Math.max(1, Math.min(500, Number(options.limit) || 120));
  const { where, params } = lootItemWhere({ search, rarity, type, className, slot, maxLevel });
  const totals = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM loot_items) items,
      (SELECT COUNT(*) FROM loot_instances) instances,
      (SELECT COUNT(*) FROM loot_events) events,
      (SELECT COUNT(*) FROM loot_items WHERE rarity IN ('Rare', 'Epic', 'Legendary')) rareItems,
      (SELECT COALESCE(SUM(coin_value), 0) FROM loot_items) totalValue,
      (SELECT MAX(observed_at) FROM loot_events) lastEventAt
  `).get();
  const rarities = db.prepare(`
    SELECT COALESCE(rarity, 'Unknown') rarity, COUNT(*) count
    FROM loot_items
    GROUP BY COALESCE(rarity, 'Unknown')
    ORDER BY count DESC, rarity
  `).all().map((row) => ({ rarity: row.rarity, count: Number(row.count || 0) }));
  const types = db.prepare(`
    SELECT COALESCE(item_type, 'Unknown') itemType, COUNT(*) count
    FROM loot_items
    GROUP BY COALESCE(item_type, 'Unknown')
    ORDER BY count DESC, itemType
  `).all().map((row) => ({ itemType: row.itemType, count: Number(row.count || 0) }));
  const slots = db.prepare(`
    SELECT json_extract(template_json, '$.equipSlotName') slot, COUNT(*) count
    FROM loot_items
    WHERE json_extract(template_json, '$.equipSlotName') IS NOT NULL
      AND json_extract(template_json, '$.equipSlotName') != ''
    GROUP BY json_extract(template_json, '$.equipSlotName')
    ORDER BY count DESC, slot
  `).all().map((row) => ({ slot: row.slot, count: Number(row.count || 0) }));
  const classNames = db.prepare(`
    SELECT json_extract(template_json, '$.classRequirementNames') classRequirementNames
    FROM loot_items
    WHERE json_extract(template_json, '$.classRequirementNames') IS NOT NULL
      AND json_extract(template_json, '$.classRequirementNames') != ''
  `).all()
    .flatMap((row) => String(row.classRequirementNames || '').split(',').map((name) => name.trim()).filter(Boolean))
    .reduce((items, name) => {
      const current = items.get(name) || 0;
      items.set(name, current + 1);
      return items;
    }, new Map());
  let rows = db.prepare(`
    SELECT li.item_id itemId, li.name, li.rarity, li.item_type itemType,
           li.armor_type_name armorTypeName, li.weapon_type weaponType,
           li.required_level requiredLevel, li.item_level itemLevel,
           li.max_damage maxDamage, li.delay, li.coin_value coinValue, li.weight,
           li.flags_json flagsJson, li.stats_json statsJson, li.template_json templateJson,
           li.first_seen firstSeen, li.last_seen lastSeen, li.seen_count seenCount,
           COUNT(DISTINCT inst.instance_id) instanceCount,
           COUNT(DISTINCT inst.character) characterCount,
           SUM(CASE WHEN inst.slot_type = 'Equipped' THEN 1 ELSE 0 END) equippedCount,
           SUM(CASE WHEN inst.slot_type = 'Storage' THEN 1 ELSE 0 END) storageCount,
           SUM(CASE WHEN inst.slot_type = 'Bank' THEN 1 ELSE 0 END) bankCount
    FROM loot_items li
    LEFT JOIN loot_instances inst ON inst.item_id = li.item_id
    ${where}
    GROUP BY li.item_id
    ORDER BY li.last_seen DESC, li.name
    LIMIT ?
  `).all(...params, limit).map((row) => mapLootItemRow(row));
  const sorters = {
    name: (left, right) => left.name.localeCompare(right.name),
    level: (left, right) => Number(left.requiredLevel || 0) - Number(right.requiredLevel || 0) || left.name.localeCompare(right.name),
    armor: (left, right) => Number(right.armorValue || 0) - Number(left.armorValue || 0) || left.name.localeCompare(right.name),
    damage: (left, right) => Number(right.maxDamage || 0) - Number(left.maxDamage || 0) || left.name.localeCompare(right.name),
    dps: (left, right) => Number(right.weaponDps || 0) - Number(left.weaponDps || 0) || left.name.localeCompare(right.name),
    value: (left, right) => Number(right.coinValue || 0) - Number(left.coinValue || 0) || left.name.localeCompare(right.name)
  };
  if (sorters[sort]) rows = rows.sort(sorters[sort]);
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      items: Number(totals.items || 0),
      instances: Number(totals.instances || 0),
      events: Number(totals.events || 0),
      rareItems: Number(totals.rareItems || 0),
      totalValue: Number(totals.totalValue || 0),
      lastEventAt: totals.lastEventAt || null
    },
    filters: { search, rarity, type, className, slot, maxLevel: Number.isFinite(maxLevel) && maxLevel > 0 ? Math.trunc(maxLevel) : null, sort },
    rarities,
    types,
    slots,
    classNames: [...classNames.entries()].map(([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
    rows
  };
}

function getLootItemDetail(db, itemId) {
  if (!itemId) return null;
  const row = db.prepare(`
    SELECT li.item_id itemId, li.name, li.rarity, li.item_type itemType,
           li.armor_type_name armorTypeName, li.weapon_type weaponType,
           li.required_level requiredLevel, li.item_level itemLevel,
           li.max_damage maxDamage, li.delay, li.coin_value coinValue, li.weight,
           li.flags_json flagsJson, li.stats_json statsJson, li.template_json templateJson,
           li.first_seen firstSeen, li.last_seen lastSeen, li.seen_count seenCount,
           COUNT(DISTINCT inst.instance_id) instanceCount,
           COUNT(DISTINCT inst.character) characterCount,
           SUM(CASE WHEN inst.slot_type = 'Equipped' THEN 1 ELSE 0 END) equippedCount,
           SUM(CASE WHEN inst.slot_type = 'Storage' THEN 1 ELSE 0 END) storageCount,
           SUM(CASE WHEN inst.slot_type = 'Bank' THEN 1 ELSE 0 END) bankCount
    FROM loot_items li
    LEFT JOIN loot_instances inst ON inst.item_id = li.item_id
    WHERE li.item_id = ?
    GROUP BY li.item_id
  `).get(String(itemId));
  if (!row) return null;
  const item = mapLootItemRow(row, { includeTemplate: true });
  item.instances = db.prepare(`
    SELECT instance_id instanceId, character, character_id characterId,
           slot_type slotType, slot_index slotIndex, stack_size stackSize,
           corpse_id corpseId, parent_guid parentGuid, first_seen firstSeen,
           last_seen lastSeen, last_event_type lastEventType
    FROM loot_instances
    WHERE item_id = ?
    ORDER BY last_seen DESC, character, slot_type, slot_index
    LIMIT 80
  `).all(String(itemId)).map((instance) => ({
    ...instance,
    characterId: instance.characterId === null || instance.characterId === undefined ? null : Number(instance.characterId),
    slotIndex: instance.slotIndex === null || instance.slotIndex === undefined ? null : Number(instance.slotIndex),
    stackSize: instance.stackSize === null || instance.stackSize === undefined ? null : Number(instance.stackSize)
  }));
  item.events = db.prepare(`
    SELECT observed_at observedAt, event_type eventType, character, item_instance_id itemInstanceId,
           item_name itemName, source, quantity, raw_json rawJson
    FROM loot_events
    WHERE item_id = ?
    ORDER BY observed_at DESC, id DESC
    LIMIT 40
  `).all(String(itemId)).map((event) => ({
    ...event,
    source: sourceNameFromLootEvent(event),
    acquisition: acquisitionFromLootEvent(event),
    rawJson: undefined,
    quantity: event.quantity === null || event.quantity === undefined ? null : Number(event.quantity)
  }));
  item.dropSources = mergeLootDropSources(
    getLootDropSources(db, itemId),
    normalizeCommunityDropSources(item.template?.communitySources)
  ).slice(0, 40);
  return item;
}

function mobKey(name) {
  return normalizeMobName(String(name || '').trim());
}

function cleanMobName(name) {
  const value = String(name || '').trim();
  if (!value || value.toLowerCase().startsWith('unknown entity')) return null;
  return value;
}

function validMobLocation(value = {}) {
  if (!value || typeof value !== 'object') return false;
  const x = Number(value.x);
  const y = Number(value.y);
  const z = Number(value.z);
  if (![x, y, z].every(Number.isFinite)) return false;
  return Math.abs(x) > 0.001 || Math.abs(y) > 0.001 || Math.abs(z) > 0.001;
}

function rememberMobLocation(mob, row = {}) {
  const location = { x: row.x, y: row.y, z: row.z };
  if (!validMobLocation(location)) return;
  if (row.observedAt >= (mob.locationObservedAt || '')) {
    mob.lastX = Number(row.x);
    mob.lastY = Number(row.y);
    mob.lastZ = Number(row.z);
    mob.locationObservedAt = row.observedAt;
  }
  mob.locationHistory = mob.locationHistory || [];
  const duplicate = mob.locationHistory.some((entry) => (
    Math.abs(Number(entry.x) - Number(row.x)) < 1
    && Math.abs(Number(entry.y) - Number(row.y)) < 1
    && Math.abs(Number(entry.z) - Number(row.z)) < 1
  ));
  if (!duplicate) {
    mob.locationHistory.push({
      x: Number(row.x),
      y: Number(row.y),
      z: Number(row.z),
      observedAt: row.observedAt || null,
      source: row.source || 'local'
    });
  }
  mob.locationHistory.sort((left, right) => Date.parse(right.observedAt || 0) - Date.parse(left.observedAt || 0));
  mob.locationHistory = mob.locationHistory.slice(0, 12);
}

function buildMobIndex(db) {
  const mobs = new Map();
  const addMob = (name) => {
    const clean = cleanMobName(name);
    if (!clean) return null;
    const key = mobKey(clean);
    if (!key) return null;
    if (!mobs.has(key)) {
      mobs.set(key, {
        key,
        name: clean,
        className: null,
        race: null,
        kind: null,
        levelMin: null,
        levelMax: null,
        firstSeen: null,
        lastSeen: null,
        seenCount: 0,
        lastX: null,
        lastY: null,
        lastZ: null,
        locationHistory: [],
        entityIds: new Set(),
        abilities: new Map(),
        drops: new Map(),
        damageDone: 0,
        damageTaken: 0,
        combatEvents: 0,
        killCount: 0
      });
    }
    return mobs.get(key);
  };
  const touch = (mob, observedAt) => {
    if (!mob || !observedAt) return;
    mob.seenCount += 1;
    if (!mob.firstSeen || observedAt < mob.firstSeen) mob.firstSeen = observedAt;
    if (!mob.lastSeen || observedAt > mob.lastSeen) mob.lastSeen = observedAt;
  };

  const entityRows = db.prepare(`
    SELECT observed_at observedAt, target name, ability, amount level, damage_type entityId,
           x, y, z, raw_text rawText
    FROM game_events
    WHERE event_type = 'world_entity'
      AND target IS NOT NULL
      AND (ability = 'entityKind:mob' OR ability IS NULL OR ability NOT LIKE 'entityKind:npc')
    ORDER BY observed_at DESC, id DESC
    LIMIT 15000
  `).all();
  for (const row of entityRows) {
    const kind = String(row.ability || '').startsWith('entityKind:') ? String(row.ability).slice('entityKind:'.length) : 'mob';
    if (kind && !['mob', 'enemy', 'hostile'].includes(kind)) continue;
    const mob = addMob(row.name);
    if (!mob) continue;
    touch(mob, row.observedAt);
    const level = Number(row.level);
    if (Number.isFinite(level) && level > 0) {
      mob.levelMin = mob.levelMin === null ? level : Math.min(mob.levelMin, level);
      mob.levelMax = mob.levelMax === null ? level : Math.max(mob.levelMax, level);
    }
    if (row.entityId) mob.entityIds.add(row.entityId);
    rememberMobLocation(mob, row);
    const metadata = scannerMetadataFromRawText(row.rawText);
    if (metadata?.className) mob.className = metadata.className;
    if (metadata?.race) mob.race = metadata.race;
    if (metadata?.scannerKind) mob.kind = metadata.scannerKind;
  }

  const conRows = db.prepare(`
    SELECT observed_at observedAt, target name, amount level, damage_type entityId
    FROM game_events
    WHERE event_type = 'target_con'
      AND target IS NOT NULL
    ORDER BY observed_at DESC, id DESC
    LIMIT 5000
  `).all();
  for (const row of conRows) {
    const mob = addMob(row.name);
    if (!mob) continue;
    touch(mob, row.observedAt);
    const level = Number(row.level);
    if (Number.isFinite(level) && level > 0) {
      mob.levelMin = mob.levelMin === null ? level : Math.min(mob.levelMin, level);
      mob.levelMax = mob.levelMax === null ? level : Math.max(mob.levelMax, level);
    }
    if (row.entityId) mob.entityIds.add(row.entityId);
  }

  const dropRows = db.prepare(`
    SELECT le.observed_at observedAt, le.source, le.raw_json rawJson,
           le.item_id itemId, COALESCE(li.name, le.item_name) itemName, li.rarity
    FROM loot_events le
    LEFT JOIN loot_items li ON li.item_id = le.item_id
    WHERE le.item_id IS NOT NULL
      AND (le.source IS NOT NULL OR le.raw_json LIKE '%"acquisition"%')
    ORDER BY le.observed_at DESC, le.id DESC
    LIMIT 5000
  `).all();
  for (const row of dropRows) {
    const source = sourceNameFromLootEvent(row);
    const mob = addMob(source);
    if (!mob || !row.itemId) continue;
    touch(mob, row.observedAt);
    const key = String(row.itemId);
    const current = mob.drops.get(key) || {
      itemId: key,
      name: row.itemName || key,
      rarity: row.rarity || null,
      count: 0,
      lastSeen: null
    };
    current.count += 1;
    if (!current.lastSeen || row.observedAt > current.lastSeen) current.lastSeen = row.observedAt;
    mob.drops.set(key, current);
  }

  const combatRows = db.prepare(`
    SELECT observed_at observedAt, event_type eventType, source, target, ability, amount
    FROM game_events
    WHERE event_type IN ('damage_estimate', 'mitigation_estimate')
      AND source IS NOT NULL
      AND target IS NOT NULL
      AND raw_text NOT LIKE '[EntityScanner]%'
    ORDER BY observed_at DESC, id DESC
    LIMIT 20000
  `).all();
  for (const row of combatRows) {
    const sourceMob = mobs.get(mobKey(row.source));
    const targetMob = mobs.get(mobKey(row.target));
    if (sourceMob) {
      touch(sourceMob, row.observedAt);
      sourceMob.combatEvents += 1;
      if (row.eventType === 'damage_estimate') {
        sourceMob.damageDone += Number(row.amount || 0);
        const ability = String(row.ability || 'Unknown ability').trim() || 'Unknown ability';
        const current = sourceMob.abilities.get(ability) || {
          ability,
          count: 0,
          totalDamage: 0,
          lastSeen: null
        };
        current.count += 1;
        current.totalDamage += Number(row.amount || 0);
        if (!current.lastSeen || row.observedAt > current.lastSeen) current.lastSeen = row.observedAt;
        sourceMob.abilities.set(ability, current);
      }
    }
    if (targetMob) {
      touch(targetMob, row.observedAt);
      targetMob.combatEvents += 1;
      if (row.eventType === 'damage_estimate') targetMob.damageTaken += Number(row.amount || 0);
    }
  }

  const killRows = db.prepare(`
    SELECT observed_at observedAt, target
    FROM game_events
    WHERE event_type = 'kill'
      AND target IS NOT NULL
    ORDER BY observed_at DESC, id DESC
    LIMIT 5000
  `).all();
  for (const row of killRows) {
    const mob = mobs.get(mobKey(row.target));
    if (!mob) continue;
    mob.killCount += 1;
    touch(mob, row.observedAt);
  }

  const namedRows = db.prepare(`
    SELECT a.normalized_alias normalizedAlias, a.confidence, nm.name, nm.location, nm.zone,
           nm.level_min levelMin, nm.level_max levelMax, nm.source_url sourceUrl
    FROM named_mob_aliases a
    JOIN named_mobs nm ON nm.shalazam_id = a.shalazam_id
    ORDER BY a.confidence DESC
  `).all();
  const namedByAlias = new Map();
  for (const row of namedRows) {
    if (!row.normalizedAlias || namedByAlias.has(row.normalizedAlias)) continue;
    namedByAlias.set(row.normalizedAlias, row);
  }
  for (const mob of mobs.values()) {
    const named = namedByAlias.get(mob.key);
    if (!named) continue;
    mob.named = true;
    mob.namedCatalog = true;
    mob.namedName = named.name || mob.name;
    mob.namedLocation = named.location || null;
    mob.namedZone = named.zone || null;
    mob.namedSourceUrl = named.sourceUrl || null;
    if (mob.levelMin === null && Number.isFinite(Number(named.levelMin))) mob.levelMin = Number(named.levelMin);
    if (mob.levelMax === null && Number.isFinite(Number(named.levelMax))) mob.levelMax = Number(named.levelMax);
  }

  const communityRows = db.prepare(`
    SELECT payload_json payloadJson
    FROM community_mobs
    ORDER BY last_seen DESC, updated_at DESC
    LIMIT 20000
  `).all();
  for (const row of communityRows) {
    const payload = parseJsonObject(row.payloadJson);
    const mob = addMob(payload.name);
    if (!mob) continue;
    mob.community = true;
    if (payload.named) {
      mob.named = true;
      mob.namedName = mob.namedName || payload.namedName || payload.name;
      if (!mob.namedCatalog) {
        mob.namedLocation = mob.namedLocation || payload.location || null;
        mob.namedZone = mob.namedZone || payload.zoneName || null;
      }
      mob.namedSourceUrl = mob.namedSourceUrl || payload.namedSourceUrl || null;
    }
    if (!mob.className && payload.className) mob.className = payload.className;
    if (!mob.race && payload.race) mob.race = payload.race;
    if (!mob.kind && payload.kind) mob.kind = payload.kind;
    if (mob.levelMin === null && Number.isFinite(Number(payload.levelMin))) mob.levelMin = Number(payload.levelMin);
    if (mob.levelMax === null && Number.isFinite(Number(payload.levelMax))) mob.levelMax = Number(payload.levelMax);
    if (!mob.firstSeen || (payload.firstSeen && payload.firstSeen < mob.firstSeen)) mob.firstSeen = payload.firstSeen || mob.firstSeen;
    if (!mob.lastSeen || (payload.lastSeen && payload.lastSeen > mob.lastSeen)) mob.lastSeen = payload.lastSeen || mob.lastSeen;
    mob.seenCount = Math.max(mob.seenCount, Number(payload.seenCount || 0));
    mob.killCount = Math.max(mob.killCount, Number(payload.killCount || 0));
    mob.combatEvents = Math.max(mob.combatEvents, Number(payload.combatEvents || 0));
    mob.damageDone = Math.max(mob.damageDone, Number(payload.damageDone || 0));
    mob.damageTaken = Math.max(mob.damageTaken, Number(payload.damageTaken || 0));
    for (const location of Array.isArray(payload.locationHistory) ? payload.locationHistory : []) {
      rememberMobLocation(mob, { ...location, source: location.source || 'community' });
    }
    if (!mob.locationObservedAt && validMobLocation(payload.lastLocation)) {
      rememberMobLocation(mob, { ...payload.lastLocation, observedAt: payload.lastLocation.observedAt || payload.lastSeen || null, source: 'community' });
    }
    for (const ability of Array.isArray(payload.abilities) ? payload.abilities : []) {
      const name = String(ability.ability || '').trim();
      if (!name || mob.abilities.has(name)) continue;
      mob.abilities.set(name, {
        ability: name,
        count: Number(ability.count || 0),
        totalDamage: Number(ability.totalDamage || 0),
        lastSeen: ability.lastSeen || payload.lastSeen || null
      });
    }
    for (const drop of Array.isArray(payload.drops) ? payload.drops : []) {
      const key = String(drop.itemId || drop.name || '').trim();
      if (!key || mob.drops.has(key)) continue;
      mob.drops.set(key, {
        itemId: String(drop.itemId || key),
        name: drop.name || key,
        rarity: drop.rarity || null,
        count: Number(drop.count || 0),
        lastSeen: drop.lastSeen || payload.lastSeen || null
      });
    }
  }

  return mobs;
}

const MOB_INDEX_CACHE_TTL_MS = 10_000;
const mobIndexCache = new WeakMap();

function getCachedMobIndex(db, options = {}) {
  const now = Date.now();
  const cached = mobIndexCache.get(db);
  if (!options.force && cached && now - cached.createdAt < MOB_INDEX_CACHE_TTL_MS) return cached.mobs;
  const mobs = buildMobIndex(db);
  mobIndexCache.set(db, { createdAt: now, mobs });
  return mobs;
}

function mobZoneName(mob) {
  const namedLocation = String(mob.namedLocation || '').trim();
  if (namedLocation) return namedLocation;
  const namedZone = String(mob.namedZone || '').trim();
  if (namedZone) return namedZone;
  const mapKey = mapKeyForCoordinates(mob.lastX, mob.lastZ, mob.lastY);
  return mapKey && MAPS[mapKey]?.name ? MAPS[mapKey].name : null;
}

function publicMobRow(mob) {
  const abilities = [...mob.abilities.values()].sort((left, right) => right.count - left.count || left.ability.localeCompare(right.ability));
  const drops = [...mob.drops.values()].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  const inferredClass = mob.className ? null : inferClassFromAbilities(abilities.map((row) => row.ability));
  const zoneName = mobZoneName(mob);
  const dropEventCount = drops.reduce((sum, drop) => sum + Number(drop.count || 0), 0);
  return {
    key: mob.key,
    name: mob.name,
    named: Boolean(mob.named),
    namedName: mob.namedName || null,
    namedSourceUrl: mob.namedSourceUrl || null,
    community: Boolean(mob.community),
    className: mob.className || (inferredClass?.className !== 'Unknown' ? inferredClass.className : null),
    classConfidence: mob.className ? 100 : inferredClass?.classConfidence || 0,
    race: mob.race || null,
    kind: mob.kind || null,
    location: mob.namedLocation || zoneName || null,
    zoneName,
    levelMin: mob.levelMin,
    levelMax: mob.levelMax,
    firstSeen: mob.firstSeen,
    lastSeen: mob.lastSeen,
    seenCount: mob.seenCount,
    abilityCount: abilities.length,
    dropCount: drops.length,
    dropEventCount,
    damageDone: Number(mob.damageDone.toFixed(1)),
    damageTaken: Number(mob.damageTaken.toFixed(1)),
    combatEvents: mob.combatEvents,
    killCount: mob.killCount,
    lastLocation: validMobLocation({ x: mob.lastX, y: mob.lastY, z: mob.lastZ })
      ? { x: mob.lastX, y: mob.lastY, z: mob.lastZ, observedAt: mob.locationObservedAt || null }
      : null,
    locationHistory: (mob.locationHistory || []).filter(validMobLocation).slice(0, 12)
  };
}

function getMobSummary(db, options = {}) {
  const search = String(options.search || '').trim().toLowerCase();
  const location = String(options.location || '').trim();
  const named = String(options.named || '').trim().toLowerCase();
  const minLevel = Number(options.minLevel || 0);
  const maxLevel = Number(options.maxLevel || 0);
  const hasMinLevel = Number.isFinite(minLevel) && minLevel > 0;
  const hasMaxLevel = Number.isFinite(maxLevel) && maxLevel > 0;
  const limit = Math.max(1, Math.min(1000, Number(options.limit) || 250));
  const searchedRows = [...getCachedMobIndex(db, options).values()]
    .map(publicMobRow)
    .filter((row) => !search || [
      row.name,
      row.location,
      row.zoneName,
      row.className,
      row.race,
      row.kind,
      row.named ? 'named' : null
    ].filter(Boolean).join(' ').toLowerCase().includes(search));
  const locationCounts = new Map();
  for (const row of searchedRows) {
    const label = row.zoneName || row.location || 'Unknown';
    locationCounts.set(label, (locationCounts.get(label) || 0) + 1);
  }
  const rows = searchedRows
    .filter((row) => !location || (row.zoneName || row.location || 'Unknown') === location)
    .filter((row) => named === 'named' ? row.named : named === 'regular' ? !row.named : true)
    .filter((row) => !hasMinLevel || (row.levelMax !== null && row.levelMax !== undefined && Number(row.levelMax) >= minLevel))
    .filter((row) => !hasMaxLevel || (row.levelMin !== null && row.levelMin !== undefined && Number(row.levelMin) <= maxLevel))
    .sort((left, right) => {
      if (left.named !== right.named) return left.named ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      mobs: rows.length,
      withAbilities: rows.filter((row) => row.abilityCount > 0).length,
      withDrops: rows.filter((row) => row.dropCount > 0).length,
      kills: rows.reduce((sum, row) => sum + Number(row.killCount || 0), 0),
      lastSeenAt: searchedRows.reduce((latest, row) => !latest || (row.lastSeen && row.lastSeen > latest) ? row.lastSeen : latest, null)
    },
    locations: [...locationCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
    rows: rows.slice(0, limit)
  };
}

function getMobDetail(db, name, options = {}) {
  const wanted = mobKey(name);
  if (!wanted) return null;
  const mob = getCachedMobIndex(db, options).get(wanted);
  if (!mob) return null;
  const row = publicMobRow(mob);
  return {
    ...row,
    entityIds: [...mob.entityIds].slice(0, 20),
    abilities: [...mob.abilities.values()]
      .sort((left, right) => right.count - left.count || right.totalDamage - left.totalDamage || left.ability.localeCompare(right.ability))
      .slice(0, 40)
      .map((ability) => ({
        ...ability,
        totalDamage: Number(ability.totalDamage.toFixed(1))
      })),
    drops: [...mob.drops.values()]
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
      .slice(0, 40)
  };
}

function getRecentMemoryObservations(db, limit = 100) {
  return db.prepare(`
    SELECT id, observed_at AS observedAt, pid, process_name AS processName, source, text,
           region_base AS regionBase, region_size AS regionSize, confidence
    FROM memory_observations
    ORDER BY observed_at DESC, id DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(500, Number(limit) || 100)));
}

function getWindowStart(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(Date.now() - seconds * 1000).toISOString();
}

function resolveSince(seconds, sinceParam = null) {
  const windowStart = getWindowStart(Number(seconds));
  const displayStart = sinceParam && !Number.isNaN(Date.parse(sinceParam)) ? sinceParam : null;
  if (windowStart && displayStart) return Date.parse(windowStart) > Date.parse(displayStart) ? windowStart : displayStart;
  return windowStart || displayStart;
}

function addonCombatDuplicateFilter(alias = 'ge') {
  return `NOT (
    ${alias}.event_type IN ('damage_estimate', 'mitigation_estimate')
    AND ${alias}.source = 'Player'
    AND EXISTS (
      SELECT 1
      FROM game_events addon_ge
      WHERE addon_ge.event_type = ${alias}.event_type
        AND addon_ge.amount = ${alias}.amount
        AND COALESCE(addon_ge.damage_type, '') = COALESCE(${alias}.damage_type, '')
        AND addon_ge.raw_text LIKE '[CombatDamage%'
        AND ABS((julianday(addon_ge.observed_at) - julianday(${alias}.observed_at)) * 86400.0) <= 2
      LIMIT 1
    )
  )`;
}

function parserEventFilter(alias = 'ge') {
  return `NOT (${alias}.event_type = 'damage_estimate' AND ${alias}.raw_text LIKE '% hp % -> %') AND ${addonCombatDuplicateFilter(alias)}`;
}

function actorNameJoin(alias = 'ge') {
  return `
    LEFT JOIN actor_names ans
      ON ${alias}.source LIKE 'Unknown actor %'
     AND ans.entity_id = substr(${alias}.source, 15)
    LEFT JOIN pet_names pns
      ON (${alias}.source LIKE 'Unknown actor %' AND pns.entity_id = substr(${alias}.source, 15))
      OR pns.name = ${alias}.source
    LEFT JOIN actor_names ant
      ON ${alias}.target LIKE 'Unknown actor %'
     AND ant.entity_id = substr(${alias}.target, 15)
    LEFT JOIN pet_names pnt
      ON (${alias}.target LIKE 'Unknown actor %' AND pnt.entity_id = substr(${alias}.target, 15))
      OR pnt.name = ${alias}.target
  `;
}

function petDisplayExpression(alias = 'pns') {
  return `COALESCE(
    NULLIF(TRIM(${alias}.raw_title, '<>'), ''),
    CASE WHEN ${alias}.owner_name IS NOT NULL THEN ${alias}.owner_name || '''s Minion' END,
    ${alias}.name
  )`;
}

function latestLocalPlayerNameExpression() {
  return `(
    SELECT lp.source
    FROM game_events lp
    WHERE lp.event_type = 'local_player'
      AND lp.source IS NOT NULL
    ORDER BY lp.observed_at DESC, lp.id DESC
    LIMIT 1
  )`;
}

function latestAddonSelfCombatNameExpression() {
  return `(
    SELECT ge.source
    FROM game_events ge
    WHERE ge.event_type IN ('damage_estimate', 'mitigation_estimate', 'healing')
      AND ge.source IS NOT NULL
      AND ge.source != 'Player'
      AND ge.raw_text LIKE '%Outgoing/%/Self%'
    ORDER BY ge.observed_at DESC, ge.id DESC
    LIMIT 1
  )`;
}

function latestAuthoritativeLocalNameExpression() {
  return `COALESCE(${latestLocalPlayerNameExpression()}, ${latestAddonSelfCombatNameExpression()})`;
}

function resolvedSourceExpression(alias = 'ge') {
  return `CASE
    WHEN ${alias}.event_type = 'damage_estimate' AND ${alias}.raw_text LIKE '% hp % -> %' THEN 'Unattributed damage'
    WHEN ${alias}.source = 'Player' AND ${alias}.event_type IN ('damage_estimate', 'mitigation_estimate', 'healing')
      THEN COALESCE(${latestAuthoritativeLocalNameExpression()}, 'Player')
    ELSE COALESCE(ans.name, ${petDisplayExpression('pns')}, ${alias}.source, 'Player')
  END`;
}

function resolvedTargetExpression(alias = 'ge') {
  return `COALESCE(ant.name, ${petDisplayExpression('pnt')}, ${alias}.target)`;
}

function resolvedAbilityExpression(alias = 'ge') {
  const resolvedSource = resolvedSourceExpression(alias);
  const resolvedTarget = resolvedTargetExpression(alias);
  return `CASE
    WHEN ${alias}.event_type = 'damage_estimate' AND ${alias}.raw_text LIKE '% hp % -> %' THEN 'Health delta (estimated)'
    WHEN ${resolvedSource} = 'Jessa' AND ${alias}.amount = 23 AND ${alias}.raw_text LIKE '%(4 mitigated)%' THEN 'Conjure Bolt I (estimated)'
    WHEN ${resolvedSource} = 'Jessa' AND ${alias}.amount IN (6, 9) AND ${alias}.raw_text LIKE '%(1 mitigated)%' THEN 'Ignite II (estimated)'
    WHEN ${resolvedSource} = 'Katja' AND ${resolvedTarget} LIKE '%thrasher%' AND ${alias}.amount IN (7, 8) AND ${alias}.raw_text LIKE '%(2 mitigated)%' THEN 'Mocking Blow II (estimated)'
    WHEN ${resolvedSource} = 'Katja' AND ${resolvedTarget} LIKE '%shaman%' AND ${alias}.amount = 7 AND ${alias}.raw_text LIKE '%(2 mitigated)%' THEN 'Storm I (estimated)'
    WHEN ${resolvedSource} = 'Katja' AND ${alias}.amount = 7 AND ${alias}.raw_text LIKE '%(2 mitigated)%' THEN 'Storm I (estimated)'
    WHEN ${resolvedSource} = 'Katja' AND ${alias}.amount IN (7, 8) AND ${alias}.raw_text LIKE '%(2 mitigated)%' THEN 'Mocking Blow II (estimated)'
    WHEN ${resolvedSource} = 'Katja' AND ${alias}.amount IN (11, 12) AND ${alias}.raw_text LIKE '%(3 mitigated)%' THEN 'Assault I (estimated)'
    WHEN ${resolvedSource} = 'Katja' AND ${alias}.amount = 14 AND ${alias}.raw_text LIKE '%(3 mitigated)%' THEN 'Commanding Strike II (estimated)'
    WHEN ${resolvedSource} = 'Katja' AND ${alias}.amount = 14 AND ${alias}.raw_text LIKE '%(4 mitigated)%' THEN 'Commanding Strike II (estimated)'
    WHEN ${resolvedSource} = 'Katja' AND ${alias}.amount IN (4, 5) AND ${alias}.raw_text LIKE '%(1 mitigated)%' THEN 'Auto Attack (estimated)'
    WHEN ${resolvedSource} = 'Jessa' AND ${alias}.amount IN (6, 7) AND ${alias}.raw_text LIKE '%(1 mitigated)%' AND ${alias}.raw_text LIKE '%Physical damage%' THEN 'Auto Attack (estimated)'
    WHEN ${resolvedSource} = 'Polona' AND ${alias}.amount IN (17, 20) AND ${alias}.raw_text LIKE '%(4 mitigated)%' THEN 'Strange Magic II (estimated)'
    WHEN ${resolvedSource} = 'Polona' AND ${alias}.amount IN (17, 20) AND ${alias}.raw_text LIKE '%(5 mitigated)%' THEN 'Strange Magic II (estimated)'
    WHEN ${resolvedSource} = 'Polona' AND ${alias}.amount IN (26, 27) AND ${alias}.raw_text LIKE '%(6 mitigated)%' THEN 'Mind Vice II (estimated)'
    WHEN ${resolvedSource} = 'Rhea' AND ${alias}.amount IN (3, 4, 7, 8) AND ${alias}.raw_text LIKE '%(1 mitigated)%' THEN 'Ignite I (estimated)'
    WHEN ${resolvedSource} = 'Rhea' AND ${alias}.amount = 23 AND ${alias}.raw_text LIKE '%(13 mitigated)%' THEN 'Ignite I (estimated)'
    WHEN ${resolvedSource} = 'Rhea' AND ${alias}.amount IN (3, 4) AND ${alias}.raw_text LIKE '%(1 mitigated)%' THEN 'Auto Attack (estimated)'
    WHEN ${alias}.raw_text LIKE '%Clash Charge%' THEN 'Clash Charge (estimated)'
    WHEN ${resolvedSource} = 'Nexendia' AND ${alias}.amount IN (26, 27) AND ${alias}.raw_text LIKE '%(6 mitigated)%' THEN 'Clash Charge (estimated)'
    WHEN ${resolvedSource} = 'Nexendia' AND ${alias}.amount = 22 AND ${alias}.raw_text LIKE '%(5 mitigated)%' THEN 'Frail Mana Bomb (estimated)'
    WHEN ${alias}.raw_text LIKE '%Aether Shards%' THEN 'Aether Shards (estimated)'
    WHEN ${alias}.raw_text LIKE '%Blast Creation II%' THEN 'Blast Creation II (estimated)'
    WHEN ${alias}.raw_text LIKE '%Blast Creation X%' THEN 'Blast Creation X (estimated)'
    WHEN ${resolvedSource} = 'Nexendia' AND ${alias}.amount IN (34, 35, 36) AND ${alias}.raw_text LIKE '%(8 mitigated)%' THEN 'Blast Creation II (estimated)'
    WHEN ${resolvedSource} = 'Nexendia' AND ${alias}.amount IN (34, 35, 36) AND ${alias}.raw_text LIKE '%(9 mitigated)%' THEN 'Blast Creation II (estimated)'
    WHEN ${resolvedSource} = 'Nexendia' AND ${alias}.amount IN (42, 43, 44, 45, 46, 47, 48) AND ${alias}.raw_text LIKE '%(10 mitigated)%' THEN 'Blast Creation II (estimated)'
    WHEN ${resolvedSource} = 'Nexendia' AND ${alias}.amount IN (44, 45, 46, 47, 48) AND ${alias}.raw_text LIKE '%(11 mitigated)%' THEN 'Blast Creation II (estimated)'
    WHEN ${resolvedSource} = 'Nexendia' AND ${alias}.amount = 48 AND ${alias}.raw_text LIKE '%(12 mitigated)%' THEN 'Blast Creation II (estimated)'
    WHEN ${resolvedSource} = 'Nexendia' AND ${alias}.amount = 29 AND ${alias}.raw_text LIKE '%(7 mitigated)%' THEN 'Auto Attack (estimated)'
    WHEN ${resolvedSource} = 'Nexendia' AND ${alias}.amount IN (13, 14) AND ${alias}.raw_text LIKE '%(3 mitigated)%' THEN 'Aether Shards (estimated)'
    WHEN ${alias}.raw_text LIKE '%Blast of Magic%' THEN 'Blast of Magic (estimated)'
    WHEN ${alias}.raw_text LIKE '%Mana Spike%' THEN 'Mana Spike (estimated)'
    WHEN ${alias}.raw_text LIKE '%Mana Flame%' THEN 'Mana Flame (estimated)'
    WHEN ${resolvedSource} IN ('Jotik', 'Zotik', 'Nexendia''s Minion') AND ${alias}.amount = 9 THEN 'Blast of Magic (estimated)'
    WHEN ${resolvedSource} IN ('Jotik', 'Zotik', 'Nexendia''s Minion') AND ${alias}.amount = 7 THEN 'Blast of Magic (estimated)'
    WHEN ${resolvedSource} IN ('Jotik', 'Zotik', 'Nexendia''s Minion') AND ${alias}.amount IN (22, 23) THEN 'Mana Spike (estimated)'
    WHEN ${resolvedSource} IN ('Jotik', 'Zotik', 'Nexendia''s Minion') AND ${alias}.amount = 17 THEN 'Mana Flame (estimated)'
    WHEN ${resolvedSource} = 'Shadowfox' AND ${alias}.amount IN (19, 20) AND ${alias}.raw_text LIKE '%(4 mitigated)%' THEN 'Fang of Harune I (estimated)'
    WHEN ${resolvedSource} = 'Shadowfox' AND ${alias}.amount = 4 AND ${alias}.raw_text LIKE '%(1 mitigated)%' THEN 'Bane of Venom I (estimated)'
    WHEN ${resolvedSource} = 'Shadowfox' AND ${alias}.amount IN (12, 13, 14) AND ${alias}.raw_text LIKE '%(3 mitigated)%' THEN 'Serpentine Strike I (estimated)'
    WHEN ${resolvedSource} = 'Shadowfox' AND ${alias}.amount IN (5, 6) AND ${alias}.raw_text LIKE '%(1 mitigated)%' THEN 'Auto Attack (estimated)'
    WHEN ${resolvedSource} = 'Tina' AND ${resolvedTarget} LIKE '%thrasher%' AND ${alias}.amount IN (12, 13, 14) AND ${alias}.raw_text LIKE '%(3 mitigated)%' THEN 'Serpentine Strike I (estimated)'
    WHEN ${resolvedSource} = 'Tina' AND ${alias}.amount IN (19, 20) AND ${alias}.raw_text LIKE '%(4 mitigated)%' THEN 'Fang of Harune I (estimated)'
    WHEN ${resolvedSource} = 'Tina' AND ${alias}.amount = 4 AND ${alias}.raw_text LIKE '%(1 mitigated)%' THEN 'Bane of Venom I (estimated)'
    WHEN ${resolvedSource} = 'Tina' AND ${alias}.amount IN (5, 6) AND ${alias}.raw_text LIKE '%(1 mitigated)%' THEN 'Auto Attack (estimated)'
    WHEN ${resolvedSource} = 'Tormentilia' AND ${alias}.amount = 4 AND ${alias}.raw_text LIKE '%Fire damage%' THEN 'Corrupt Blood I (estimated)'
    WHEN ${resolvedSource} = 'Tormentilia' AND ${alias}.amount = 8 AND ${alias}.raw_text LIKE '%(2 mitigated)%' THEN 'Fleshcarver (estimated)'
    WHEN ${resolvedSource} = 'Tormentilia' AND ${alias}.amount IN (1, 3, 5, 6) THEN 'Auto Attack (estimated)'
    ELSE ${alias}.ability
  END`;
}

const CLASS_IDENTIFYING_ABILITIES = {
  Wizard: [
    'Combustion',
    'Evoke Embers',
    'Flat Spell Damage (Fire)'
  ],
  Shaman: [
    'Bane of Venom I',
    'Fang of Harune I',
    'Serpentine Strike I'
  ],
  'Dire Lord': [
    'Corrupt Blood I',
    'Corrupt Blood II',
    'Fleshcarver'
  ],
  Druid: [
    'Conjure Bolt I',
    'Ignite II',
    'Stinging Swarm I'
  ],
  Enchanter: [
    'Mind Vice I',
    'Mind Vice II',
    'Strange Magic',
    'Strange Magic II'
  ],
  Ranger: [
    'Brightfire Blast I',
    'Howling Arrow II',
    "Predator's Fury I",
    'Swift Shot II',
    'Volley of Arrows I'
  ],
  Rogue: [
    'Backstab',
    'Backstab I',
    'Bleeding Wound',
    'Bloodletter II',
    'Lucky Strike',
    'Lucky Strike I',
    'Twin Fangs I',
    'Veiled Strike II'
  ],
  'Summoner Pet': [
    'Blast of Magic',
    'Mana Burst',
    'Mana Burst I',
    'Mana Spike',
    'Tempest',
    'Tempest I',
    'Tempest II',
    'Galestrike',
    'Galestrike I',
    'Galestrike II',
    'Wind Blade',
    'Wind Blade I',
    'Wind Blade II'
  ],
  Warrior: [
    'Assault I',
    'Commanding Strike II',
    'Mocking Blow II',
    'Storm I'
  ],
  Summoner: [
    'Aether Shards',
    'Clash Charge',
    'Frail Mana Bomb',
    'Blast Creation II',
    'Blast Creation X'
  ]
};

const CLASS_COLORS = {
  'Dire Lord': '#ff2d4d',
  Paladin: '#dc4d95',
  Warrior: '#c28a4a',
  Cleric: '#f1d991',
  Druid: '#d97b00',
  Shaman: '#1687f2',
  Enchanter: '#8175c7',
  Necromancer: '#37a383',
  Summoner: '#bc35dd',
  'Summoner Pet': '#bc35dd',
  Wizard: '#31c5c5',
  Ranger: '#93c95a',
  Monk: '#00d48a',
  Rogue: '#efcc49',
  Mob: '#6f7a86',
  Pet: '#8a98a8',
  Unknown: '#8a98a8'
};

function classColorForName(className) {
  return CLASS_COLORS[className] || CLASS_COLORS.Unknown;
}

function inferClassFromAbilities(abilities = []) {
  const normalized = abilities
    .map((ability) => normalizeAbilityName(ability))
    .filter(Boolean);
  let best = { className: 'Unknown', classConfidence: 0 };
  for (const [className, classAbilities] of Object.entries(CLASS_IDENTIFYING_ABILITIES)) {
    const hits = classAbilities.filter((ability) => normalized.includes(ability)).length;
    if (!hits) continue;
    const confidence = Math.min(100, Math.round((hits / classAbilities.length) * 100));
    if (confidence > best.classConfidence) best = { className, classConfidence: confidence };
  }
  for (const ability of normalized) {
    const inferred = inferAbilityClass(ability);
    if (inferred.confidence > best.classConfidence) {
      best = { className: inferred.className, classConfidence: inferred.confidence };
    }
  }
  return {
    ...best,
    classColor: classColorForName(best.className)
  };
}

function inferCombatantClass(source, abilities = []) {
  const sourceName = String(source || '');
  if (
    /^Drawn\b/i.test(sourceName)
    || /^Zthir the Foul$/i.test(sourceName)
    || /^Celis Creeper\b/i.test(sourceName)
    || /^Psyrachnid\b/i.test(sourceName)
  ) {
    return {
      className: 'Mob',
      classConfidence: 100,
      classColor: classColorForName('Mob')
    };
  }
  if (/'s Minion$/i.test(sourceName)) {
    return {
      className: 'Summoner Pet',
      classConfidence: 100,
      classColor: classColorForName('Summoner Pet')
    };
  }
  return inferClassFromAbilities(abilities);
}

function resolvedRawTextExpression(alias = 'ge') {
  const resolvedSource = resolvedSourceExpression(alias);
  const resolvedTarget = resolvedTargetExpression(alias);
  return `CASE
    WHEN ${alias}.event_type = 'damage_estimate' AND ${alias}.raw_text LIKE '% hp % -> %'
      THEN COALESCE(${resolvedTarget}, 'Target') || ' took ' || ${alias}.amount || ' observed damage'
    ELSE replace(replace(${alias}.raw_text, ${alias}.source, ${resolvedSource}), COALESCE(${alias}.target, ''), COALESCE(${resolvedTarget}, ''))
  END`;
}

function getParserSummary(db, seconds = 300, sinceParam = null) {
  const since = resolveSince(Number(seconds), sinceParam);
  const where = since ? 'WHERE ge.observed_at >= ?' : '';
  const params = since ? [since] : [];
  const damageWhere = since
    ? `WHERE ge.observed_at >= ? AND ge.event_type IN ('damage_estimate', 'mitigation_estimate') AND ${parserEventFilter('ge')}`
    : `WHERE ge.event_type IN ('damage_estimate', 'mitigation_estimate') AND ${parserEventFilter('ge')}`;
  const resolvedSource = resolvedSourceExpression('ge');
  const resolvedTarget = resolvedTargetExpression('ge');
  const resolvedAbility = resolvedAbilityExpression('ge');
  const resolvedRawText = resolvedRawTextExpression('ge');

  const bounds = db.prepare(`
    SELECT MIN(ge.observed_at) firstSeen, MAX(ge.observed_at) lastSeen
    FROM game_events ge
    ${where}
  `).get(...params);
  const durationSeconds = bounds && bounds.firstSeen && bounds.lastSeen
    ? Math.max(1, (Date.parse(bounds.lastSeen) - Date.parse(bounds.firstSeen)) / 1000)
    : 0;
  const totals = db.prepare(`
    SELECT
      COUNT(*) events,
      SUM(CASE WHEN ge.event_type = 'damage_estimate' AND ${parserEventFilter('ge')} THEN ge.amount ELSE 0 END) damage,
      SUM(CASE WHEN ge.event_type = 'kill' THEN 1 ELSE 0 END) kills
    FROM game_events ge
    ${where}
  `).get(...params);
  const combatants = db.prepare(`
    SELECT
      ${resolvedSource} source,
      SUM(CASE WHEN ge.event_type = 'damage_estimate' THEN ge.amount ELSE 0 END) total,
      COUNT(CASE WHEN ge.event_type = 'damage_estimate' THEN 1 END) events,
      SUM(CASE WHEN ge.event_type = 'mitigation_estimate' THEN ge.amount ELSE 0 END) mitigated,
      COUNT(DISTINCT ge.target) targets,
      GROUP_CONCAT(DISTINCT CASE WHEN ge.event_type = 'damage_estimate' THEN ${resolvedAbility} END) abilities,
      MIN(ge.observed_at) firstSeen,
      MAX(ge.observed_at) lastSeen
    FROM game_events ge
    ${actorNameJoin('ge')}
    ${damageWhere}
    GROUP BY ${resolvedSource}
    ORDER BY total DESC, events DESC
  `).all(...params).map((row) => ({
    ...row,
    ...inferCombatantClass(row.source, row.abilities ? row.abilities.split(',') : []),
    total: Number(row.total || 0),
    damage: Number(row.total || 0),
    events: Number(row.events || 0),
    targets: Number(row.targets || 0),
    damageTaken: 0,
    mitigated: Number(row.mitigated || 0),
    mitigatedTaken: 0,
    crits: 0,
    rate: durationSeconds ? Number((Number(row.total || 0) / durationSeconds).toFixed(2)) : 0
  }));
  const recentEvents = db.prepare(`
    SELECT ge.observed_at observedAt, ge.event_type eventType, ${resolvedSource} source,
           ${resolvedTarget} target, ${resolvedAbility} ability, ge.amount, ge.damage_type damageType,
           ${resolvedRawText} rawText
    FROM game_events ge
    ${actorNameJoin('ge')}
    ${where ? `${where} AND ge.event_type != 'client_action_candidate' AND ${addonCombatDuplicateFilter('ge')}` : `WHERE ge.event_type != 'client_action_candidate' AND ${addonCombatDuplicateFilter('ge')}`}
    ORDER BY ge.observed_at DESC, ge.id DESC
    LIMIT 80
  `).all(...params);

  return {
    generatedAt: new Date().toISOString(),
    windowSeconds: Number(seconds) || null,
    durationSeconds,
    firstSeen: bounds ? bounds.firstSeen : null,
    lastSeen: bounds ? bounds.lastSeen : null,
    totals: {
      events: Number(totals.events || 0),
      damage: Number(totals.damage || 0),
      kills: Number(totals.kills || 0),
      dps: durationSeconds ? Number((Number(totals.damage || 0) / durationSeconds).toFixed(2)) : 0
    },
    combatants,
    recentEvents
  };
}

function getRespawnDeathRows(db, seconds = 6 * 60 * 60, sinceParam = null, limit = 300) {
  const since = resolveSince(Number(seconds), sinceParam);
  const params = since ? [since] : [];
  const where = since ? 'WHERE ge.observed_at >= ?' : '';
  const resolvedTarget = resolvedTargetExpression('ge');
  const rows = db.prepare(`
    SELECT ge.id, ge.observed_at observedAt, ge.event_type eventType,
           ${resolvedTarget} target, ge.amount, ge.ability, ge.damage_type entityId,
           ge.raw_text rawText
    FROM game_events ge
    ${actorNameJoin('ge')}
    ${where ? `${where} AND` : 'WHERE'} (
      ge.event_type = 'kill'
      OR (
        ge.event_type = 'health_update'
        AND ge.amount <= 0.01
        AND ge.target IS NOT NULL
      )
    )
    ORDER BY ge.observed_at DESC, ge.id DESC
    LIMIT ?
  `).all(...params, Math.max(1, Math.min(1000, Number(limit) || 300)));

  const namedRows = db.prepare(`
    SELECT a.normalized_alias normalizedAlias, nm.name, nm.location, nm.zone,
           nm.level_min levelMin, nm.level_max levelMax, nm.source_url sourceUrl
    FROM named_mob_aliases a
    JOIN named_mobs nm ON nm.shalazam_id = a.shalazam_id
    ORDER BY a.confidence DESC
  `).all();
  const namedByAlias = new Map();
  for (const named of namedRows) {
    if (!named.normalizedAlias || namedByAlias.has(named.normalizedAlias)) continue;
    namedByAlias.set(named.normalizedAlias, named);
  }

  const seen = new Set();
  const deaths = [];
  for (const row of rows) {
    const targetKey = String(row.target || row.entityId || '').trim().toLowerCase();
    const observedAtMs = Date.parse(row.observedAt || '');
    const bucket = Number.isFinite(observedAtMs) ? Math.floor(observedAtMs / 10000) : row.id;
    const key = `${targetKey}|${row.entityId || ''}|${bucket}`;
    if (!targetKey || seen.has(key)) continue;
    seen.add(key);
    const named = namedByAlias.get(normalizeMobName(row.target || '')) || null;
    deaths.push({
      ...row,
      target: row.target || `Unknown entity ${row.entityId}`,
      amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
      namedMob: named ? {
        name: named.name,
        location: named.location || null,
        zone: named.zone || null,
        levelMin: named.levelMin ?? null,
        levelMax: named.levelMax ?? null,
        sourceUrl: named.sourceUrl || null
      } : null
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    windowSeconds: Number(seconds) || null,
    rows: deaths
  };
}

function getHealingSummary(db, seconds = 300, sinceParam = null) {
  const since = resolveSince(Number(seconds), sinceParam);
  const where = since ? 'WHERE ge.observed_at >= ?' : '';
  const params = since ? [since] : [];
  const healingWhere = since
    ? `WHERE ge.observed_at >= ? AND ge.event_type = 'healing' AND ${parserEventFilter('ge')}`
    : `WHERE ge.event_type = 'healing' AND ${parserEventFilter('ge')}`;
  const resolvedSource = resolvedSourceExpression('ge');
  const resolvedTarget = resolvedTargetExpression('ge');
  const resolvedAbility = resolvedAbilityExpression('ge');
  const resolvedRawText = resolvedRawTextExpression('ge');

  const bounds = db.prepare(`
    SELECT MIN(ge.observed_at) firstSeen, MAX(ge.observed_at) lastSeen
    FROM game_events ge
    ${healingWhere}
  `).get(...params);
  const durationSeconds = bounds && bounds.firstSeen && bounds.lastSeen
    ? Math.max(1, (Date.parse(bounds.lastSeen) - Date.parse(bounds.firstSeen)) / 1000)
    : 0;
  const totals = db.prepare(`
    SELECT
      COUNT(*) events,
      SUM(CASE WHEN ge.event_type = 'healing' AND ${parserEventFilter('ge')} THEN ge.amount ELSE 0 END) healing
    FROM game_events ge
    ${healingWhere}
  `).get(...params);
  const combatants = db.prepare(`
    SELECT
      ${resolvedSource} source,
      SUM(CASE WHEN ge.event_type = 'healing' THEN ge.amount ELSE 0 END) total,
      COUNT(CASE WHEN ge.event_type = 'healing' THEN 1 END) events,
      COUNT(DISTINCT ge.target) targets,
      GROUP_CONCAT(DISTINCT CASE WHEN ge.event_type = 'healing' THEN ${resolvedAbility} END) abilities,
      MIN(ge.observed_at) firstSeen,
      MAX(ge.observed_at) lastSeen
    FROM game_events ge
    ${actorNameJoin('ge')}
    ${healingWhere}
    GROUP BY ${resolvedSource}
    ORDER BY total DESC, events DESC
  `).all(...params).map((row) => ({
    ...row,
    ...inferCombatantClass(row.source, row.abilities ? row.abilities.split(',') : []),
    total: Number(row.total || 0),
    healing: Number(row.total || 0),
    events: Number(row.events || 0),
    targets: Number(row.targets || 0),
    rate: durationSeconds ? Number((Number(row.total || 0) / durationSeconds).toFixed(2)) : 0
  }));
  const recentEvents = db.prepare(`
    SELECT ge.observed_at observedAt, ge.event_type eventType, ${resolvedSource} source,
           ${resolvedTarget} target, ${resolvedAbility} ability, ge.amount, ge.damage_type damageType,
           ${resolvedRawText} rawText
    FROM game_events ge
    ${actorNameJoin('ge')}
    ${where ? `${where} AND ge.event_type = 'healing'` : "WHERE ge.event_type = 'healing'"}
    ORDER BY ge.observed_at DESC, ge.id DESC
    LIMIT 80
  `).all(...params);

  return {
    generatedAt: new Date().toISOString(),
    windowSeconds: Number(seconds) || null,
    durationSeconds,
    firstSeen: bounds ? bounds.firstSeen : null,
    lastSeen: bounds ? bounds.lastSeen : null,
    totals: {
      events: Number(totals.events || 0),
      healing: Number(totals.healing || 0),
      hps: durationSeconds ? Number((Number(totals.healing || 0) / durationSeconds).toFixed(2)) : 0
    },
    combatants,
    recentEvents
  };
}

function parseLevelFromAbility(ability) {
  const match = String(ability || '').match(/\bLevel\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

function getXpSummary(db, seconds = 0, sinceParam = null) {
  const since = resolveSince(Number(seconds), sinceParam);
  const where = since ? 'WHERE ge.observed_at >= ? AND ge.event_type = ?' : 'WHERE ge.event_type = ?';
  const params = since ? [since, 'experience'] : ['experience'];
  const bounds = db.prepare(`
    SELECT MIN(ge.observed_at) firstSeen, MAX(ge.observed_at) lastSeen
    FROM game_events ge
    ${where}
  `).get(...params);
  const durationSeconds = bounds && bounds.firstSeen && bounds.lastSeen
    ? Math.max(1, (Date.parse(bounds.lastSeen) - Date.parse(bounds.firstSeen)) / 1000)
    : 0;
  const totals = db.prepare(`
    SELECT COUNT(*) events, SUM(COALESCE(ge.amount, 0)) xp
    FROM game_events ge
    ${where}
  `).get(...params);
  const latest = db.prepare(`
    SELECT ge.observed_at observedAt, ge.source, ge.amount deltaXp, ge.x currentXp,
           ge.y toNextLevel, ge.z progress, ge.heading previousCurrent, ge.damage_type damageType
    FROM game_events ge
    ${where}
    ORDER BY ge.observed_at DESC, ge.id DESC
    LIMIT 1
  `).get(...params);
  const xpRows = db.prepare(`
    SELECT ge.id, ge.observed_at observedAt, ge.source, ge.amount deltaXp, ge.x currentXp,
           ge.y toNextLevel, ge.z progress, ge.heading previousCurrent, ge.raw_text rawText
    FROM game_events ge
    ${where}
    ORDER BY ge.observed_at DESC, ge.id DESC
    LIMIT 120
  `).all(...params);
  const resolvedDamageSource = resolvedSourceExpression('d');
  const resolvedDamageTarget = resolvedTargetExpression('d');
  const damageContextStmt = db.prepare(`
    SELECT ${resolvedDamageTarget} target, d.observed_at observedAt
    FROM game_events d
    ${actorNameJoin('d')}
    WHERE d.event_type = 'damage_estimate'
      AND ${parserEventFilter('d')}
      AND d.observed_at >= ?
      AND d.observed_at <= ?
      AND (? IS NULL OR ${resolvedDamageSource} = ?)
      AND ${resolvedDamageTarget} IS NOT NULL
      AND ${resolvedDamageTarget} != ${resolvedDamageSource}
    ORDER BY d.observed_at DESC, d.id DESC
    LIMIT 1
  `);
  const targetLevelStmt = db.prepare(`
    SELECT amount level
    FROM game_events
    WHERE target = ?
      AND event_type IN ('world_entity', 'target_con')
      AND amount IS NOT NULL
    ORDER BY observed_at DESC, id DESC
    LIMIT 1
  `);
  const playerLevelStmt = db.prepare(`
    SELECT ability
    FROM game_events
    WHERE event_type = 'local_player'
      AND source = ?
      AND ability LIKE 'Level %'
    ORDER BY observed_at DESC, id DESC
    LIMIT 1
  `);
  const rows = xpRows.map((row) => {
    const start = new Date(Date.parse(row.observedAt) - 20_000).toISOString();
    const context = damageContextStmt.get(start, row.observedAt, row.source || null, row.source || null) || {};
    const targetLevel = context.target ? targetLevelStmt.get(context.target) : null;
    const playerLevel = row.source ? playerLevelStmt.get(row.source) : null;
    const currentXp = row.currentXp === null || row.currentXp === undefined ? null : Number(row.currentXp);
    const toNextLevel = row.toNextLevel === null || row.toNextLevel === undefined ? null : Number(row.toNextLevel);
    const progress = row.progress === null || row.progress === undefined ? null : Number(row.progress);
    return {
      observedAt: row.observedAt,
      source: row.source,
      deltaXp: Number(row.deltaXp || 0),
      currentXp,
      previousCurrent: row.previousCurrent === null || row.previousCurrent === undefined ? null : Number(row.previousCurrent),
      toNextLevel,
      progress,
      progressPercent: progress === null ? null : Number((progress * 100).toFixed(2)),
      remainingXp: currentXp !== null && toNextLevel !== null ? Math.max(0, toNextLevel - currentXp) : null,
      target: context.target || null,
      targetLevel: targetLevel ? Number(targetLevel.level) : null,
      playerLevel: playerLevel ? parseLevelFromAbility(playerLevel.ability) : null,
      rawText: row.rawText
    };
  });
  const targetMap = new Map();
  for (const row of rows) {
    const target = row.target || 'Unknown source';
    const entry = targetMap.get(target) || {
      target,
      targetLevel: row.targetLevel,
      xp: 0,
      events: 0,
      lastSeen: row.observedAt
    };
    entry.xp += Number(row.deltaXp || 0);
    entry.events += 1;
    if (row.targetLevel !== null && row.targetLevel !== undefined) entry.targetLevel = row.targetLevel;
    if (Date.parse(row.observedAt) > Date.parse(entry.lastSeen)) entry.lastSeen = row.observedAt;
    targetMap.set(target, entry);
  }
  const targets = [...targetMap.values()]
    .map((row) => ({
      ...row,
      averageXp: row.events ? Number((row.xp / row.events).toFixed(1)) : 0
    }))
    .sort((left, right) => right.xp - left.xp || right.events - left.events);
  const totalXp = Number(totals.xp || 0);
  const latestProgress = latest?.progress === null || latest?.progress === undefined ? null : Number(latest.progress);
  const latestCurrentXp = latest?.currentXp === null || latest?.currentXp === undefined ? null : Number(latest.currentXp);
  const latestToNext = latest?.toNextLevel === null || latest?.toNextLevel === undefined ? null : Number(latest.toNextLevel);
  return {
    generatedAt: new Date().toISOString(),
    windowSeconds: Number(seconds) || null,
    durationSeconds,
    firstSeen: bounds ? bounds.firstSeen : null,
    lastSeen: bounds ? bounds.lastSeen : null,
    latest: latest ? {
      observedAt: latest.observedAt,
      source: latest.source,
      deltaXp: Number(latest.deltaXp || 0),
      currentXp: latestCurrentXp,
      toNextLevel: latestToNext,
      remainingXp: latestCurrentXp !== null && latestToNext !== null ? Math.max(0, latestToNext - latestCurrentXp) : null,
      progress: latestProgress,
      progressPercent: latestProgress === null ? null : Number((latestProgress * 100).toFixed(2)),
      previousCurrent: latest.previousCurrent === null || latest.previousCurrent === undefined ? null : Number(latest.previousCurrent),
      damageType: latest.damageType
    } : null,
    totals: {
      events: Number(totals.events || 0),
      xp: totalXp,
      averageXp: Number(totals.events || 0) ? Number((totalXp / Number(totals.events || 1)).toFixed(1)) : 0,
      xpPerHour: durationSeconds ? Number(((totalXp / durationSeconds) * 3600).toFixed(1)) : 0
    },
    rows,
    targets
  };
}

function getParserBreakdown(db, seconds, source, sinceParam = null) {
  const since = resolveSince(Number(seconds), sinceParam);
  const params = since ? [since, source] : [source];
  const resolvedSource = resolvedSourceExpression('ge');
  const resolvedTarget = resolvedTargetExpression('ge');
  const resolvedAbility = resolvedAbilityExpression('ge');
  const where = since
    ? `WHERE ge.observed_at >= ? AND ge.event_type IN ('damage_estimate', 'mitigation_estimate') AND ${parserEventFilter('ge')} AND ${resolvedSource} = ?`
    : `WHERE ge.event_type IN ('damage_estimate', 'mitigation_estimate') AND ${parserEventFilter('ge')} AND ${resolvedSource} = ?`;
  return db.prepare(`
    SELECT ${resolvedAbility} ability,
           COUNT(DISTINCT ${resolvedTarget}) targetCount,
           GROUP_CONCAT(DISTINCT ${resolvedTarget}) targets,
           SUM(CASE WHEN ge.event_type = 'damage_estimate' THEN ge.amount ELSE 0 END) total,
           COUNT(CASE WHEN ge.event_type = 'damage_estimate' THEN 1 END) events,
           SUM(CASE WHEN ge.event_type = 'mitigation_estimate' THEN ge.amount ELSE 0 END) mitigated,
           MIN(ge.observed_at) firstSeen, MAX(ge.observed_at) lastSeen
    FROM game_events ge
    ${actorNameJoin('ge')}
    ${where}
    GROUP BY ${resolvedAbility}
    HAVING COUNT(CASE WHEN ge.event_type = 'damage_estimate' THEN 1 END) > 0
    ORDER BY total DESC, events DESC
  `).all(...params).map((row) => ({
    ...row,
    target: Number(row.targetCount || 0) === 1
      ? String(row.targets || '')
      : `${Number(row.targetCount || 0)} targets`,
    targetCount: Number(row.targetCount || 0),
    targets: row.targets ? row.targets.split(',').slice(0, 12) : [],
    total: Number(row.total || 0),
    events: Number(row.events || 0),
    mitigated: Number(row.mitigated || 0),
    crits: 0
  }));
}

function getParserAbilityEvents(db, seconds, source, ability, target = '', limit = 20, sinceParam = null) {
  const since = resolveSince(Number(seconds), sinceParam);
  const params = since ? [since, source, ability] : [source, ability];
  const resolvedSource = resolvedSourceExpression('ge');
  const resolvedTarget = resolvedTargetExpression('ge');
  const resolvedAbility = resolvedAbilityExpression('ge');
  const resolvedRawText = resolvedRawTextExpression('ge');
  const targetFilter = target ? ` AND ${resolvedTarget} = ?` : '';
  if (target) params.push(target);
  const where = since
    ? `WHERE ge.observed_at >= ? AND ge.event_type = 'damage_estimate' AND ${parserEventFilter('ge')} AND ${resolvedSource} = ? AND ${resolvedAbility} = ?${targetFilter}`
    : `WHERE ge.event_type = 'damage_estimate' AND ${parserEventFilter('ge')} AND ${resolvedSource} = ? AND ${resolvedAbility} = ?${targetFilter}`;
  return db.prepare(`
    SELECT ge.observed_at observedAt, ge.event_type eventType, ${resolvedSource} source,
           ${resolvedTarget} target, ${resolvedAbility} ability, ge.amount, ge.damage_type damageType,
           ${resolvedRawText} rawText
    FROM game_events ge
    ${actorNameJoin('ge')}
    ${where}
    ORDER BY ge.observed_at DESC, ge.id DESC
    LIMIT ?
  `).all(...params, Math.max(1, Math.min(100, Number(limit) || 20)));
}

function encodeEncounterId(encounter) {
  return Buffer.from(JSON.stringify({
    target: encounter.target,
    firstSeen: encounter.firstSeen,
    lastSeen: encounter.lastSeen
  })).toString('base64url');
}

function decodeEncounterId(id) {
  try {
    const parsed = JSON.parse(Buffer.from(String(id || ''), 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || !parsed.target || !parsed.firstSeen || !parsed.lastSeen) return null;
    return {
      target: String(parsed.target),
      firstSeen: String(parsed.firstSeen),
      lastSeen: String(parsed.lastSeen)
    };
  } catch {
    return null;
  }
}

function getEncounterSeedRows(db, seconds = 0, sinceParam = null) {
  const since = resolveSince(Number(seconds), sinceParam);
  const resolvedSource = resolvedSourceExpression('ge');
  const resolvedTarget = resolvedTargetExpression('ge');
  const resolvedAbility = resolvedAbilityExpression('ge');
  const resolvedRawText = resolvedRawTextExpression('ge');
  const where = since
    ? `WHERE ge.observed_at >= ? AND ge.event_type = 'damage_estimate' AND ${parserEventFilter('ge')} AND ${resolvedTarget} IS NOT NULL`
    : `WHERE ge.event_type = 'damage_estimate' AND ${parserEventFilter('ge')} AND ${resolvedTarget} IS NOT NULL`;
  const params = since ? [since] : [];
  return db.prepare(`
    SELECT ge.id, ge.observed_at observedAt, ${resolvedSource} source,
           ${resolvedTarget} target, ${resolvedAbility} ability, ge.amount,
           ge.damage_type damageType, ${resolvedRawText} rawText
    FROM game_events ge
    ${actorNameJoin('ge')}
    ${where}
    ORDER BY ${resolvedTarget}, ge.observed_at, ge.id
  `).all(...params).map((row) => ({
    ...row,
    amount: Number(row.amount || 0)
  }));
}

function buildEncounterSegments(rows, gapMs = 30_000) {
  const segments = [];
  let current = null;
  for (const row of rows) {
    const target = String(row.target || '').trim();
    if (!target) continue;
    const observedMs = Date.parse(row.observedAt);
    if (!Number.isFinite(observedMs)) continue;
    if (!current || current.target !== target || observedMs - current.lastSeenMs > gapMs) {
      current = {
        target,
        firstSeen: row.observedAt,
        lastSeen: row.observedAt,
        firstSeenMs: observedMs,
        lastSeenMs: observedMs,
        damage: 0,
        hits: 0,
        sources: new Set(),
        abilities: new Set()
      };
      segments.push(current);
    }
    current.lastSeen = row.observedAt;
    current.lastSeenMs = observedMs;
    current.damage += Number(row.amount || 0);
    current.hits += 1;
    if (row.source) current.sources.add(row.source);
    if (row.ability) current.abilities.add(row.ability);
  }
  return segments.map((segment) => {
    const durationSeconds = Math.max(1, Math.round((segment.lastSeenMs - segment.firstSeenMs) / 1000));
    const row = {
      target: segment.target,
      firstSeen: segment.firstSeen,
      lastSeen: segment.lastSeen,
      durationSeconds,
      damage: Math.round(segment.damage),
      hits: segment.hits,
      sourceCount: segment.sources.size,
      abilityCount: segment.abilities.size,
      dps: Number((segment.damage / durationSeconds).toFixed(2))
    };
    return { ...row, id: encodeEncounterId(row) };
  }).sort((left, right) => Date.parse(right.lastSeen) - Date.parse(left.lastSeen) || Number(right.damage) - Number(left.damage));
}

function getEncounterTargetNames(db, seconds = 0, sinceParam = null) {
  const since = resolveSince(Number(seconds), sinceParam);
  const where = since ? 'AND observed_at >= ?' : '';
  const params = since ? [since] : [];
  return new Set(db.prepare(`
    SELECT DISTINCT target
    FROM game_events
    WHERE target IS NOT NULL
      AND event_type IN ('world_entity', 'target_con')
      AND (
        event_type = 'target_con'
        OR ability = 'entityKind:mob'
        OR raw_text LIKE '%prepared to attack%'
        OR raw_text LIKE '%opponent%'
      )
      ${where}
  `).all(...params).map((row) => row.target).filter(Boolean));
}

function groupEncounterRows(rows, keyFields, valueFilter = () => true) {
  const grouped = new Map();
  for (const row of rows) {
    if (!valueFilter(row)) continue;
    const keys = keyFields.map((field) => row[field] || (field === 'ability' ? 'Unknown ability' : 'Unknown'));
    const key = keys.join('\u001f');
    const current = grouped.get(key) || Object.fromEntries(keyFields.map((field, index) => [field, keys[index]]));
    current.total = Number(current.total || 0) + Number(row.amount || 0);
    current.events = Number(current.events || 0) + 1;
    if (!current.firstSeen || row.observedAt < current.firstSeen) current.firstSeen = row.observedAt;
    if (!current.lastSeen || row.observedAt > current.lastSeen) current.lastSeen = row.observedAt;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((left, right) => Number(right.total || 0) - Number(left.total || 0) || Number(right.events || 0) - Number(left.events || 0));
}

function buildEncounterTimeline(rows, firstSeen, lastSeen, bucketCount = 20) {
  const start = Date.parse(firstSeen);
  const end = Date.parse(lastSeen);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  const span = Math.max(1000, end - start);
  const count = Math.max(5, Math.min(40, Number(bucketCount) || 20));
  const buckets = Array.from({ length: count }, (_, index) => ({
    index,
    startOffsetSeconds: Math.round((span / count / 1000) * index),
    damageDone: 0,
    damageTaken: 0,
    healing: 0
  }));
  for (const row of rows) {
    const at = Date.parse(row.observedAt);
    if (!Number.isFinite(at)) continue;
    const index = Math.min(count - 1, Math.max(0, Math.floor(((at - start) / span) * count)));
    if (row.timelineKind === 'damageDone') buckets[index].damageDone += Number(row.amount || 0);
    if (row.timelineKind === 'damageTaken') buckets[index].damageTaken += Number(row.amount || 0);
    if (row.timelineKind === 'healing') buckets[index].healing += Number(row.amount || 0);
  }
  const max = Math.max(1, ...buckets.flatMap((bucket) => [bucket.damageDone, bucket.damageTaken, bucket.healing]));
  return buckets.map((bucket) => ({
    ...bucket,
    damageDone: Math.round(bucket.damageDone),
    damageTaken: Math.round(bucket.damageTaken),
    healing: Math.round(bucket.healing),
    damageDonePercent: Number(((bucket.damageDone / max) * 100).toFixed(2)),
    damageTakenPercent: Number(((bucket.damageTaken / max) * 100).toFixed(2)),
    healingPercent: Number(((bucket.healing / max) * 100).toFixed(2))
  }));
}

function getEncounterDetail(db, encounter) {
  if (!encounter) return null;
  const start = new Date(Date.parse(encounter.firstSeen) - 5000).toISOString();
  const end = new Date(Date.parse(encounter.lastSeen) + 10_000).toISOString();
  const target = encounter.target;
  const resolvedSource = resolvedSourceExpression('ge');
  const resolvedTarget = resolvedTargetExpression('ge');
  const resolvedAbility = resolvedAbilityExpression('ge');
  const resolvedRawText = resolvedRawTextExpression('ge');
  const rows = db.prepare(`
    SELECT ge.id, ge.observed_at observedAt, ge.event_type eventType,
           ${resolvedSource} source, ${resolvedTarget} target, ${resolvedAbility} ability,
           ge.amount, ge.damage_type damageType, ${resolvedRawText} rawText
    FROM game_events ge
    ${actorNameJoin('ge')}
    WHERE ge.observed_at >= ?
      AND ge.observed_at <= ?
      AND ge.event_type IN ('damage_estimate', 'mitigation_estimate', 'healing', 'ability_resist', 'ability_miss')
      AND (
        ge.event_type NOT IN ('damage_estimate', 'mitigation_estimate')
        OR ${parserEventFilter('ge')}
      )
    ORDER BY ge.observed_at, ge.id
  `).all(start, end).map((row) => ({
    ...row,
    amount: Number(row.amount || 0)
  }));
  const damageDoneRows = rows.filter((row) => row.eventType === 'damage_estimate' && row.target === target);
  const mitigationRows = rows.filter((row) => row.eventType === 'mitigation_estimate' && row.target === target);
  const enemyDamageRows = rows.filter((row) => row.eventType === 'damage_estimate' && row.source === target);
  const healingRows = rows.filter((row) => row.eventType === 'healing');
  const resistRows = rows.filter((row) => ['ability_resist', 'ability_miss'].includes(row.eventType) && (row.target === target || row.source === target));
  const timelineRows = [
    ...damageDoneRows.map((row) => ({ ...row, timelineKind: 'damageDone' })),
    ...enemyDamageRows.map((row) => ({ ...row, timelineKind: 'damageTaken' })),
    ...healingRows.map((row) => ({ ...row, timelineKind: 'healing' }))
  ];
  const totalDamage = damageDoneRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalEnemyDamage = enemyDamageRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalHealing = healingRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalMitigated = mitigationRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const durationSeconds = Math.max(1, Math.round((Date.parse(encounter.lastSeen) - Date.parse(encounter.firstSeen)) / 1000));
  return {
    ...encounter,
    durationSeconds,
    totals: {
      damage: Math.round(totalDamage),
      enemyDamage: Math.round(totalEnemyDamage),
      healing: Math.round(totalHealing),
      mitigated: Math.round(totalMitigated),
      hits: damageDoneRows.length,
      enemyHits: enemyDamageRows.length,
      resists: resistRows.length,
      dps: Number((totalDamage / durationSeconds).toFixed(2)),
      hps: Number((totalHealing / durationSeconds).toFixed(2))
    },
    damageBySource: groupEncounterRows(damageDoneRows, ['source']),
    damageByAbility: groupEncounterRows(damageDoneRows, ['ability']),
    damageBySourceAbility: groupEncounterRows(damageDoneRows, ['source', 'ability']).slice(0, 40),
    enemyDamageByAbility: groupEncounterRows(enemyDamageRows, ['ability']),
    enemyDamageByTarget: groupEncounterRows(enemyDamageRows, ['target']),
    healingBySource: groupEncounterRows(healingRows, ['source']),
    healingByAbility: groupEncounterRows(healingRows, ['ability']),
    resistedAbilities: groupEncounterRows(resistRows, ['source', 'ability', 'eventType']),
    timeline: buildEncounterTimeline(timelineRows, encounter.firstSeen, encounter.lastSeen),
    recentEvents: rows.slice(-80).reverse()
  };
}

function getEncounterReport(db, seconds = 0, selectedId = '', sinceParam = null) {
  const candidateTargets = getEncounterTargetNames(db, seconds, sinceParam);
  const seedRows = getEncounterSeedRows(db, seconds, sinceParam);
  const rows = candidateTargets.size
    ? seedRows.filter((row) => candidateTargets.has(row.target))
    : seedRows;
  const encounters = buildEncounterSegments(rows).slice(0, 60);
  const decoded = decodeEncounterId(selectedId);
  const selected = (decoded
    ? encounters.find((row) => row.target === decoded.target && row.firstSeen === decoded.firstSeen && row.lastSeen === decoded.lastSeen)
    : null) || encounters[0];
  return {
    generatedAt: new Date().toISOString(),
    windowSeconds: Number(seconds) || null,
    rows: encounters,
    selected: getEncounterDetail(db, selected || null)
  };
}

function getAbilityRegistry(db, limit = 500) {
  return db.prepare(`
    SELECT ability_name abilityName, class_name className, category, pet_family petFamily,
           damage_type damageType,
           confidence, first_seen firstSeen, last_seen lastSeen, seen_count seenCount
    FROM ability_registry
    ORDER BY last_seen DESC, ability_name
    LIMIT ?
  `).all(Math.max(1, Math.min(2000, Number(limit) || 500))).map((row) => ({
    ...row,
    confidence: Number(row.confidence || 0),
    seenCount: Number(row.seenCount || 0)
  }));
}

function getUnresolvedActors(db, seconds = 0, sinceParam = null) {
  const since = resolveSince(Number(seconds), sinceParam);
  const where = since ? 'AND ge.observed_at >= ?' : '';
  const params = since ? [since] : [];
  return db.prepare(`
    SELECT substr(ge.source, 15) entityId,
           COUNT(*) events,
           SUM(CASE WHEN ge.event_type = 'damage_estimate' THEN ge.amount ELSE 0 END) damage,
           MIN(ge.observed_at) firstSeen,
           MAX(ge.observed_at) lastSeen,
           GROUP_CONCAT(DISTINCT ge.ability) abilities,
           GROUP_CONCAT(DISTINCT ge.target) targets
    FROM game_events ge
    LEFT JOIN actor_names an ON an.entity_id = substr(ge.source, 15)
    WHERE ge.source LIKE 'Unknown actor %'
      AND an.entity_id IS NULL
      AND ge.event_type IN ('damage_estimate', 'mitigation_estimate')
      AND ${parserEventFilter('ge')}
      ${where}
    GROUP BY substr(ge.source, 15)
    ORDER BY lastSeen DESC, damage DESC
    LIMIT 50
  `).all(...params).map((row) => ({
    ...row,
    events: Number(row.events || 0),
    damage: Number(row.damage || 0),
    abilities: row.abilities ? row.abilities.split(',').slice(0, 12) : [],
    targets: row.targets ? row.targets.split(',').slice(0, 12) : []
  }));
}

function getActorNames(db, limit = 100) {
  return db.prepare(`
    SELECT entity_id entityId, name, raw_name rawName, is_local isLocal,
           first_seen firstSeen, last_seen lastSeen
    FROM actor_names
    ORDER BY last_seen DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(500, Number(limit) || 100))).map((row) => ({
    ...row,
    isLocal: Boolean(row.isLocal)
  }));
}

function latestClientPositionEntityExpression() {
  return `(
    SELECT pu.damage_type
    FROM game_events pu
    WHERE pu.event_type = 'position_update'
      AND pu.damage_type IS NOT NULL
    ORDER BY pu.observed_at DESC, pu.id DESC
    LIMIT 1
  )`;
}

function latestClientPositionNameExpression() {
  return `(
    SELECT NULLIF(pu.source, 'Player')
    FROM game_events pu
    WHERE pu.event_type = 'position_update'
      AND pu.source IS NOT NULL
    ORDER BY pu.observed_at DESC, pu.id DESC
    LIMIT 1
  )`;
}

function latestLocalPlayerPositionEntityExpression() {
  const localName = latestAuthoritativeLocalNameExpression();
  return `COALESCE((
    SELECT pp.damage_type
    FROM game_events pp
    WHERE pp.event_type = 'player_position'
      AND pp.source = COALESCE(${localName}, pp.source)
      AND pp.source IS NOT NULL
      AND pp.damage_type IS NOT NULL
    ORDER BY pp.observed_at DESC, pp.id DESC
    LIMIT 1
  ), ${latestClientPositionEntityExpression()})`;
}

function latestLocalPlayerPositionNameExpression() {
  return `COALESCE(${latestAuthoritativeLocalNameExpression()}, ${latestClientPositionNameExpression()}, 'Player')`;
}

function normalizeConfiguredLocalPlayerName(value) {
  const name = String(value || '').trim();
  return name && name !== 'Player' ? name : null;
}

function getAuthoritativeLocalPositionIdentity(db, options = {}) {
  const configuredName = normalizeConfiguredLocalPlayerName(options.localPlayerName);
  const inferredLocalName = db.prepare(`
    SELECT source FROM (
      SELECT source, observed_at, id, 0 priority
      FROM game_events
      WHERE event_type = 'local_player'
        AND source IS NOT NULL
      UNION ALL
      SELECT source, observed_at, id, 1 priority
      FROM game_events
      WHERE event_type IN ('damage_estimate', 'mitigation_estimate', 'healing')
        AND source IS NOT NULL
        AND source != 'Player'
        AND raw_text LIKE '%Outgoing/%/Self%'
    )
    ORDER BY priority ASC, observed_at DESC, id DESC
    LIMIT 1
  `).get()?.source || null;
  const localName = configuredName || inferredLocalName;
  const clientRow = db.prepare(`
    SELECT source name, damage_type entityId, observed_at observedAt
    FROM game_events
    WHERE event_type = 'position_update'
      AND damage_type IS NOT NULL
    ORDER BY observed_at DESC, id DESC
    LIMIT 1
  `).get();
  const namedRow = localName
    ? db.prepare(`
      SELECT source name, damage_type entityId, observed_at observedAt
      FROM game_events
      WHERE event_type = 'player_position'
        AND source = ?
        AND damage_type IS NOT NULL
      ORDER BY observed_at DESC, id DESC
      LIMIT 1
    `).get(localName)
    : null;
  const clientRowCanRepresentLocal = clientRow
    && (!clientRow.name || clientRow.name === 'Player' || String(clientRow.name).toLowerCase() === String(localName || '').toLowerCase());
  const row = localName && namedRow && clientRowCanRepresentLocal
    ? Date.parse(clientRow.observedAt || 0) > Date.parse(namedRow.observedAt || 0)
      ? clientRow
      : namedRow
    : localName
      ? namedRow || clientRow
      : clientRow;
  if (!row && localName) return { name: localName, entityId: null, observedAt: null };
  if (!row) return null;
  return {
    name: localName || normalizeConfiguredLocalPlayerName(row.name) || null,
    entityId: row.entityId || null,
    observedAt: row.observedAt || null
  };
}

function normalizeLocalPositionRows(db, rows = [], options = {}) {
  const identity = getAuthoritativeLocalPositionIdentity(db, options);
  if (!identity?.name) return rows;
  return rows.map((row) => {
    if (!identity.entityId || row.entityId !== identity.entityId) return row;
    return {
      ...row,
      source: identity.name,
      target: identity.name
    };
  });
}

function mapPositionRow(row) {
  return {
    ...row,
    x: Number(row.x),
    y: Number(row.y),
    z: Number(row.z),
    heading: row.heading === null || row.heading === undefined ? null : Number(row.heading),
    headingRaw: row.headingRaw === null || row.headingRaw === undefined ? null : Number(row.headingRaw)
  };
}

function getLatestLocalPlayerPositionRow(db, identity = null, options = {}) {
  const localIdentity = identity || getAuthoritativeLocalPositionIdentity(db, options);
  if (!localIdentity?.name && !localIdentity?.entityId) return null;
  const row = db.prepare(`
    SELECT id, observed_at observedAt,
           COALESCE(?, source) source,
           COALESCE(?, target) target,
           damage_type entityId,
           x, y, z, heading, heading_raw headingRaw, raw_text rawText
    FROM game_events
    WHERE event_type = 'player_position'
      AND damage_type IS NOT NULL
      AND (
        (? IS NOT NULL AND damage_type = ?)
        OR (? IS NOT NULL AND source = ?)
      )
    ORDER BY observed_at DESC, id DESC
    LIMIT 1
  `).get(
    localIdentity.name || null,
    localIdentity.name || null,
    localIdentity.entityId || null,
    localIdentity.entityId || null,
    localIdentity.name || null,
    localIdentity.name || null
  );
  return row ? mapPositionRow(row) : null;
}

function getPositionRows(db, limit = 80, since = null) {
  const where = since ? 'WHERE event_type = ? AND observed_at >= ?' : 'WHERE event_type = ?';
  const params = since ? ['position_update', since] : ['position_update'];
  const localEntity = latestLocalPlayerPositionEntityExpression();
  const localName = latestLocalPlayerPositionNameExpression();
  return db.prepare(`
    SELECT id, observed_at observedAt,
           CASE
             WHEN damage_type = ${localEntity} THEN ${localName}
             ELSE source
           END source,
           CASE
             WHEN damage_type = ${localEntity} THEN ${localName}
             ELSE target
           END target,
           damage_type entityId,
           x, y, z, heading, heading_raw headingRaw, raw_text rawText
    FROM game_events
    ${where}
    ORDER BY observed_at DESC, id DESC
    LIMIT ?
  `).all(...params, Math.max(1, Math.min(500, Number(limit) || 80))).map(mapPositionRow);
}

function getLatestPositions(db, limit = 20, since = null) {
  const rows = getPositionRows(db, 500, since);
  const identity = getAuthoritativeLocalPositionIdentity(db);
  const seen = new Set();
  const latest = [];
  for (const row of rows) {
    const key = row.entityId || row.source || row.target || 'unknown';
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(row);
    if (latest.length >= Math.max(1, Math.min(100, Number(limit) || 20))) break;
  }
  if (identity?.entityId) {
    const localPositionRow = getLatestLocalPlayerPositionRow(db, identity);
    if (localPositionRow && !latest.some((row) => row.entityId === identity.entityId)) {
      latest.unshift(localPositionRow);
    }
    latest.sort((left, right) => {
      if (left.entityId === identity.entityId && right.entityId !== identity.entityId) return -1;
      if (right.entityId === identity.entityId && left.entityId !== identity.entityId) return 1;
      return Date.parse(right.observedAt) - Date.parse(left.observedAt);
    });
  }
  return latest;
}

function inferLocalPlayerLevel(rows, conRows) {
  const levelById = new Map();
  const levelByName = new Map();
  for (const row of rows) {
    const level = Number(row.level);
    if (!Number.isFinite(level) || level <= 0) continue;
    if (row.entityId && !levelById.has(row.entityId)) levelById.set(row.entityId, level);
    const nameKey = String(row.target || '').toLowerCase();
    if (nameKey && !levelByName.has(nameKey)) levelByName.set(nameKey, level);
  }

  const candidateCounts = new Map();
  const addCandidate = (level) => {
    if (!Number.isFinite(level) || level <= 0) return;
    const key = Math.round(level);
    candidateCounts.set(key, (candidateCounts.get(key) || 0) + 1);
  };

  for (const row of conRows) {
    const difficulty = String(row.ability || '').toLowerCase();
    const level = row.entityId
      ? levelById.get(row.entityId)
      : levelByName.get(String(row.target || '').toLowerCase());
    if (!Number.isFinite(level) || level <= 0) continue;
    if (difficulty.includes('even greater challenge')) addCandidate(level - 2);
    else if (difficulty.includes('great challenge')) addCandidate(level - 1);
    else if (difficulty.includes('evenly matched')) {
      addCandidate(level);
      addCandidate(level + 1);
    }
  }

  return [...candidateCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0])[0]?.[0] || null;
}

function inferredDifficultyForDelta(delta) {
  if (!Number.isFinite(delta)) return null;
  if (delta <= -10) return 'a trivial fight';
  if (delta <= -4) return 'a relatively safe fight';
  if (delta <= -2) return 'opponent is formidable, but you should have the upper hand';
  if (delta <= 0) return 'an evenly matched fight';
  if (delta === 1) return 'opponent would pose a great challenge to you';
  if (delta === 2) return 'opponent would pose an even greater challenge to you';
  if (delta === 3) return 'opponent is incredibly dangerous';
  return 'madness - do you have a death wish';
}

function inferredHostileDisposition(name, faction) {
  const value = `${name || ''} ${faction || ''}`.toLowerCase();
  if (/\bgadai\b/.test(value)) return 'prepared to attack';
  if (/\blost orc(s)?\b/.test(value)) return 'prepared to attack';
  if (/\bferaling\b/.test(value)) return 'prepared to attack';
  if (/\bjadeclaw raptor\b/.test(value)) return 'prepared to attack';
  if (/\bbrineclaw\b/.test(value)) return 'prepared to attack';
  if (/ratkin/i.test(value)) return 'prepared to attack';
  if (/\bcelis creeper(s)?\b/.test(value)) return 'prepared to attack';
  if (/\bjungle goblin\b/.test(value)) return 'prepared to attack';
  if (/\bspindle[- ]leg stalker(s)?\b/.test(value)) return 'prepared to attack';
  if (/\bshady outdoorsman(s)?\b/.test(value)) return 'prepared to attack';
  if (/\bwayward trapper(s)?\b/.test(value)) return 'prepared to attack';
  return null;
}

function looksLikeBossName(name) {
  const clean = String(name || '').trim();
  if (!clean || clean.toLowerCase().startsWith('unknown')) return false;
  return /\bthe\b/i.test(clean) || /\b(?:boss|lord|king|queen|prince|princess|dreadheart|deadheart)\b/i.test(clean);
}

function inferredPriorityCandidate(name, disposition, difficulty, kind, level) {
  if (kind !== 'mob' && kind !== 'npc') return false;
  if (!looksLikeBossName(name)) return false;
  if (String(disposition || '').toLowerCase() !== 'prepared to attack') return false;
  const text = `${difficulty || ''}`.toLowerCase();
  if (/\b(great challenge|even greater challenge|incredibly dangerous|madness|death wish|formidable)\b/.test(text)) return true;
  return Number.isFinite(Number(level)) && Number(level) >= 10;
}

const NPC_EXACT_NAMES = new Set([
  'winter'
]);

const NPC_ROLE_PATTERN = /\b(?:alchemist|armou?rsmith|avenger|banker|bag merchant|captain|carpenter|cleric|courier|crier|dire lord|enchanter|fletcher|food merchant|general goods|guard|innkeeper|jewelcrafter|leatherworker|merchant|militia|outrider|paladin|ranger|rogue|scrolls?|sentinel|sentry|shaman|tailor|trainer|trading company|villager|weapon merchant|wizard)\b/i;
const HUMANOID_ASSET_PATTERN = /^(?:HUM|MHM|MHF|HALF|ELF|DWF|OGR|SKA|GNM|ARC|DARK|NPC_|XT_)/i;
const HOSTILE_NAME_PATTERN = /\b(?:gadai|lost orc|shady outdoorsman|wayward trapper|spindle[- ]leg|thicket stalker|outlaw|poacher|bandit|brigand|cutthroat|marauder)\b/i;
const HOSTILE_HUMANOID_ASSET_PATTERN = /\b(?:thug|bandit|brigand|outlaw)\b/i;

function looksLikePersonalName(name) {
  const clean = String(name || '').replace(/\([^)]*\)/g, '').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 3) return false;
  return words.every((word) => /^[A-Z][A-Za-z'`-]{1,}$/.test(word));
}

function inferredNpcEntity(name, asset, level, faction) {
  const rawName = String(name || '').trim();
  const rawAsset = String(asset || '').trim();
  const value = `${rawName} ${rawAsset} ${faction || ''}`;
  if (!rawName || rawName.toLowerCase().startsWith('unknown entity')) return false;
  if (inferredHostileDisposition(rawName, faction)) return false;
  if (HOSTILE_NAME_PATTERN.test(rawName) || HOSTILE_HUMANOID_ASSET_PATTERN.test(rawAsset)) return false;
  if (NPC_EXACT_NAMES.has(rawName.toLowerCase())) return true;
  if (NPC_ROLE_PATTERN.test(value)) return true;
  if (HUMANOID_ASSET_PATTERN.test(rawAsset) && looksLikePersonalName(rawName)) return true;
  if (looksLikePersonalName(rawName) && Number.isFinite(Number(level)) && Number(level) >= 15 && Number(level) <= 50) {
    return true;
  }
  return false;
}

function inferredQuestItemEntity(name, asset, rawText) {
  const rawName = String(name || '').trim();
  const rawAsset = String(asset || '').trim();
  const value = `${rawName} ${rawAsset} ${rawText || ''}`.trim();
  if (!value) return false;
  if (/gusler'?s enchanted toenail/i.test(value)) return true;
  if (/\bdusty satchel\b/i.test(value)) return true;
  if (/\bcorroded key\b/i.test(value)) return true;
  if (/\bstone fragment\b/i.test(value)) return true;
  if (/(?:fragment|relic|shard|sigil|seal|tablet|idol|token|medallion|artifact|glyph|totem)\b/i.test(value)) return true;
  if (/LooseLoot|ScrapMetal|Quest|Treasure/i.test(rawAsset)) {
    return /(?:fragment|relic|shard|sigil|seal|tablet|idol|token|medallion|artifact|glyph|totem)\b/i.test(value);
  }
  return false;
}

function scannerMetadataFromRawText(rawText) {
  const text = String(rawText || '');
  if (!text.startsWith('[EntityScanner] ')) return null;
  const jsonStart = text.indexOf('{');
  if (jsonStart < 0) return null;
  try {
    const record = JSON.parse(text.slice(jsonStart));
    return {
      title: String(record.Title || '').trim() || null,
      className: String(record.Class || '').trim() || null,
      race: String(record.Race || '').trim() || null,
      profession: String(record.Profession || '').trim() || null,
      scannerKind: String(record.Kind || '').trim() || null,
      distanceFromLocal: Number.isFinite(Number(record.DistanceFromLocal)) ? Number(record.DistanceFromLocal) : null,
      healthPercent: Number.isFinite(Number(record.HealthPercent)) ? Number(record.HealthPercent) : null,
      sourceCharacterName: String(record.sourceCharacterName || record.SourceCharacterName || '').trim() || null,
      sourceCharacterId: Number.isFinite(Number(record.sourceCharacterId || record.SourceCharacterId)) ? Number(record.sourceCharacterId || record.SourceCharacterId) : null
    };
  } catch {
    return null;
  }
}

function getMapEntityRows(db, limit = 250, since = null) {
  const nowMs = Date.now();
  const combatSince = new Date(nowMs - ENTITY_COMBAT_TTL_MS).toISOString();
  const conSince = new Date(nowMs - TARGET_CON_TTL_MS).toISOString();
  const outputLimit = Math.max(1, Math.min(700, Number(limit) || 250));
  const scanLimit = Math.max(3000, Math.min(12000, outputLimit * 8));
  const where = since
    ? "WHERE ge.observed_at >= ? AND ge.event_type IN ('world_entity', 'harvest_node', 'player_position')"
    : "WHERE ge.event_type IN ('world_entity', 'harvest_node', 'player_position')";
  const params = since ? [since] : [];
  const rows = db.prepare(`
    SELECT ge.id, ge.observed_at observedAt, ge.event_type eventType,
           ge.target, ge.ability, ge.amount level, ge.damage_type entityId, ge.x, ge.y, ge.z,
           pn.name petName, pn.owner_name petOwnerName, pn.raw_title petRawTitle,
           ge.raw_text rawText, NULL payloadHex
    FROM game_events ge
    LEFT JOIN pet_names pn ON pn.entity_id = ge.damage_type
    ${where}
    ORDER BY ge.observed_at DESC, ge.id DESC
    LIMIT ?
  `).all(...params, scanLimit);

  const healthRows = db.prepare(`
    SELECT ge.damage_type entityId, ge.observed_at observedAt, ge.amount current, ge.ability maxHealth
    FROM game_events ge
    WHERE ge.event_type = 'health_update'
      AND ge.damage_type IS NOT NULL
    ORDER BY ge.observed_at DESC, ge.id DESC
    LIMIT 1500
  `).all();
  const latestHealthById = new Map();
  for (const row of healthRows) {
    if (!row.entityId || latestHealthById.has(row.entityId)) continue;
    latestHealthById.set(row.entityId, {
      observedAt: row.observedAt,
      current: Number(row.current),
      max: Number(row.maxHealth)
    });
  }

  const removedRows = db.prepare(`
    SELECT ge.damage_type entityId, ge.observed_at observedAt
    FROM game_events ge
    WHERE ge.event_type = 'entity_removed'
      AND ge.damage_type IS NOT NULL
    ORDER BY ge.observed_at DESC, ge.id DESC
    LIMIT 1500
  `).all();
  const latestRemovedById = new Map();
  for (const row of removedRows) {
    if (!row.entityId || latestRemovedById.has(row.entityId)) continue;
    latestRemovedById.set(row.entityId, row.observedAt);
  }

  const combatRows = db.prepare(`
    SELECT ge.observed_at observedAt, ge.event_type eventType, ge.source, ge.target,
           ge.damage_type entityId
    FROM game_events ge
    WHERE ge.observed_at >= ?
      AND ge.event_type IN ('damage_estimate', 'mitigation_estimate', 'health_update')
      AND ge.raw_text NOT LIKE '[EntityScanner]%'
    ORDER BY ge.observed_at DESC, ge.id DESC
    LIMIT 1500
  `).all(combatSince);
  const latestCombatById = new Map();
  const latestCombatByName = new Map();
  const rememberCombat = (key, combat) => {
    if (!key) return;
    if (!latestCombatById.has(key) && /^[0-9a-f]{8}$/i.test(key)) latestCombatById.set(key, combat);
    const nameKey = String(key).toLowerCase();
    if (!latestCombatByName.has(nameKey)) latestCombatByName.set(nameKey, combat);
  };
  for (const row of combatRows) {
    const combat = {
      observedAt: row.observedAt,
      state: 'combat',
      role: row.eventType === 'health_update' ? 'taking_damage' : 'involved'
    };
    if (row.eventType === 'health_update') {
      rememberCombat(row.entityId, combat);
      rememberCombat(row.target, combat);
      continue;
    }
    if (/^[0-9a-f]{8}$/i.test(String(row.entityId || ''))) {
      rememberCombat(row.entityId, { ...combat, role: 'taking_damage' });
    }
    rememberCombat(row.target, { ...combat, role: 'taking_damage' });
    rememberCombat(row.source, { ...combat, role: 'dealing_damage' });
  }

  const conRows = db.prepare(`
    SELECT ge.observed_at observedAt, ge.target, ge.ability, ge.damage_type entityId, ge.raw_text rawText
    FROM game_events ge
    WHERE ge.observed_at >= ?
      AND ge.event_type = 'target_con'
      AND ge.target IS NOT NULL
    ORDER BY ge.observed_at DESC, ge.id DESC
    LIMIT 500
  `).all(conSince);
  const latestConById = new Map();
  const latestConByName = new Map();
  for (const row of conRows) {
    const parts = String(row.ability || '').split('|').map((part) => part.trim()).filter(Boolean);
    const con = {
      observedAt: row.observedAt,
      disposition: parts[0] || null,
      difficulty: parts[1] || null,
      faction: parts[2] || null,
      rawText: row.rawText
    };
    if (/^[0-9a-f]{8}$/i.test(String(row.entityId || '')) && !latestConById.has(row.entityId)) {
      latestConById.set(row.entityId, con);
    }
    const key = String(row.target || '').toLowerCase();
    if (!key || latestConByName.has(key)) continue;
    latestConByName.set(key, con);
  }
  const targetRows = db.prepare(`
    SELECT ge.observed_at observedAt, ge.target, ge.ability role, ge.damage_type entityId, ge.raw_text rawText
    FROM game_events ge
    WHERE ge.observed_at >= ?
      AND ge.event_type = 'target_selection'
    ORDER BY ge.observed_at DESC, ge.id DESC
    LIMIT 100
  `).all(conSince);
  const latestTargetById = new Map();
  const latestTargetByName = new Map();
  for (const row of targetRows) {
    const target = {
      observedAt: row.observedAt,
      role: row.role || null,
      rawText: row.rawText
    };
    if (row.entityId && !latestTargetById.has(row.entityId)) latestTargetById.set(row.entityId, target);
    const key = String(row.target || '').toLowerCase();
    if (key && !latestTargetByName.has(key)) latestTargetByName.set(key, target);
  }
  const inferredLocalPlayerLevel = inferLocalPlayerLevel(rows, conRows);
  const localPlayerRow = db.prepare(`
    SELECT ability
    FROM game_events
    WHERE event_type = 'local_player'
      AND ability LIKE 'Level %'
    ORDER BY observed_at DESC, id DESC
    LIMIT 1
  `).get();
  const observedLocalPlayerLevel = localPlayerRow
    ? Number(String(localPlayerRow.ability || '').match(/\d+/)?.[0])
    : null;
  const localPlayerLevelOverride = Number(globalThis?.process?.env?.PANTHEON_PLAYER_LEVEL_OVERRIDE || 0);
  const localPlayerLevel = Number.isFinite(localPlayerLevelOverride) && localPlayerLevelOverride > 0
    ? Math.round(localPlayerLevelOverride)
    : Number.isFinite(observedLocalPlayerLevel) && observedLocalPlayerLevel > 0
      ? Math.round(observedLocalPlayerLevel)
      : inferredLocalPlayerLevel;

  const seen = new Set();
  const entities = [];
  const entityKindById = new Map();
  const entityAssetById = new Map();
  const findNamedByAlias = db.prepare(`
    SELECT nm.shalazam_id shalazamId, nm.name, nm.location, nm.zone, nm.level_min levelMin,
           nm.level_max levelMax, nm.difficulty, nm.source_url sourceUrl
    FROM named_mob_aliases a
    JOIN named_mobs nm ON nm.shalazam_id = a.shalazam_id
    WHERE a.normalized_alias = ?
    ORDER BY a.confidence DESC
    LIMIT 1
  `);
  const findNearestNamedSpawn = db.prepare(`
    SELECT nm.shalazam_id shalazamId, nm.name, nm.location, nm.zone, nm.source_url sourceUrl,
           sp.x, sp.y, sp.z, sp.radius,
           ((sp.x - ?) * (sp.x - ?)) + ((sp.y - ?) * (sp.y - ?)) + (((sp.z - ?) * 0.25) * ((sp.z - ?) * 0.25)) distanceSq
    FROM named_spawn_points sp
    JOIN named_mobs nm ON nm.shalazam_id = sp.shalazam_id
    WHERE ABS(sp.x - ?) <= sp.radius
      AND ABS(sp.y - ?) <= sp.radius
      AND ABS(sp.z - ?) <= MAX(sp.radius, 80)
    ORDER BY distanceSq ASC
    LIMIT 1
  `);
  for (const row of rows) {
    const rowEntityId = row.entityId || null;
    if (!rowEntityId) continue;
    const rowAbility = String(row.ability || '');
    if (rowAbility && !rowAbility.startsWith('entityKind:') && !entityAssetById.has(rowEntityId)) {
      entityAssetById.set(rowEntityId, row.ability);
    }
    if (entityKindById.has(rowEntityId)) continue;
    const directKind = rowAbility.startsWith('entityKind:')
      ? rowAbility.slice('entityKind:'.length)
      : null;
    if (directKind) {
      entityKindById.set(rowEntityId, directKind);
      continue;
    }
    if (!row.payloadHex) continue;
    const spawn = extractSpawnRecords(row.payloadHex).find((record) => record.entityId === rowEntityId);
    if (spawn?.entityKind) entityKindById.set(rowEntityId, spawn.entityKind);
  }
  for (const row of rows) {
    let x = row.x === null || row.x === undefined ? null : Number(row.x);
    let y = row.y === null || row.y === undefined ? null : Number(row.y);
    let z = row.z === null || row.z === undefined ? null : Number(row.z);
    let level = Number.isFinite(Number(row.level)) && Number(row.level) > 0 ? Number(row.level) : null;
    let entityKind = String(row.ability || '').startsWith('entityKind:')
      ? String(row.ability).slice('entityKind:'.length)
      : null;
    let entityId = row.entityId || null;
    if (!entityKind && entityId) entityKind = entityKindById.get(entityId) || null;
    if ((![x, y, z].every(Number.isFinite) || level === null || !entityKind) && row.payloadHex) {
      const spawns = extractSpawnRecords(row.payloadHex);
      const spawn = entityId
        ? spawns.find((record) => record.entityId === entityId)
        : spawns.find((record) => row.eventType === 'harvest_node' ? record.spawnType === 'resource' : record.spawnType === 'entity') || spawns[0];
      if (spawn) {
        entityId = entityId || spawn.entityId;
        x = Number.isFinite(x) ? x : spawn.x;
        y = Number.isFinite(y) ? y : spawn.y;
        z = Number.isFinite(z) ? z : spawn.z;
        level = level ?? spawn.level ?? null;
        entityKind = entityKind || spawn.entityKind || null;
      }
    }
    if (![x, y, z].every(Number.isFinite)) continue;
    const key = entityId || `${row.eventType}|${row.target}|${row.ability}|${x.toFixed(1)}|${z.toFixed(1)}`;
    if (seen.has(key)) continue;
    const removedAt = entityId ? latestRemovedById.get(entityId) : null;
    if (removedAt && Date.parse(removedAt) >= Date.parse(row.observedAt)) continue;
    const health = entityId ? latestHealthById.get(entityId) : null;
    const activeHealth = health && Date.parse(health.observedAt) >= Date.parse(row.observedAt) ? health : null;
    seen.add(key);
    const rowAbility = String(row.ability || '');
    const explicitAsset = rowAbility && !rowAbility.startsWith('entityKind:') ? row.ability : null;
    const asset = explicitAsset || (entityId ? entityAssetById.get(entityId) || null : null);
    const petName = row.petName || null;
    const petOwnerName = row.petOwnerName || null;
    const petDisplayName = row.petRawTitle
      ? String(row.petRawTitle).trim().replace(/^<|>$/g, '').trim()
      : petOwnerName
        ? `${petOwnerName}'s Minion`
        : petName;
    const namedCon = latestConByName.get(String(row.target || row.source || '').toLowerCase()) || null;
    const idCon = entityId ? latestConById.get(entityId) || null : null;
    const con = idCon || namedCon;
    const selectedTarget = (entityId ? latestTargetById.get(entityId) : null)
      || latestTargetByName.get(String(row.target || row.source || '').toLowerCase())
      || null;
    const scannerMetadata = scannerMetadataFromRawText(row.rawText);
    const baseName = row.target || row.source || petDisplayName;
    const displayName = petDisplayName && entityId && String(petOwnerName || '').length
      ? petDisplayName
      : baseName;
    const petAlias = displayName !== baseName ? baseName : null;
    const petLabel = petDisplayName && String(petDisplayName).toLowerCase() !== String(displayName || '').toLowerCase()
      ? petDisplayName
      : null;
    const questItem = inferredQuestItemEntity(displayName, asset, row.rawText);
    const isInferredNpc = !petLabel && inferredNpcEntity(displayName, asset, level, con?.faction);
    const kind = questItem
      ? 'quest'
      : row.eventType === 'harvest_node'
        ? 'resource'
      : petDisplayName
        ? 'pet'
      : row.eventType === 'player_position'
        ? 'player'
        : entityKind === 'chest'
          ? 'chest'
        : entityKind === 'npc' || isInferredNpc || (!entityKind && level >= 50)
          ? 'npc'
          : entityKind || 'mob';
    const observedAtMs = Date.parse(row.observedAt);
    if (kind === 'player' && Number.isFinite(observedAtMs) && nowMs - observedAtMs > PLAYER_MARKER_TTL_MS) continue;
    const healthObservedAtMs = activeHealth ? Date.parse(activeHealth.observedAt) : NaN;
    const isDead = Boolean(activeHealth && activeHealth.current <= 0.01);
    const combat = entityId && latestCombatById.get(entityId)
      ? latestCombatById.get(entityId)
      : latestCombatByName.get(String(row.target || row.source || '').toLowerCase());
    const combatObservedAtMs = combat ? Date.parse(combat.observedAt) : NaN;
    const levelDelta = kind === 'mob' && Number.isFinite(level) && Number.isFinite(localPlayerLevel)
      ? Math.round(level - localPlayerLevel)
      : null;
    const inferredDifficulty = !con?.difficulty && Number.isFinite(levelDelta)
      ? inferredDifficultyForDelta(levelDelta)
      : null;
    const inferredDisposition = !con?.disposition && !['resource', 'player', 'quest', 'chest'].includes(kind)
      ? inferredHostileDisposition([row.target, asset, row.rawText].filter(Boolean).join(' '), con?.faction)
      : null;
    const priorityCandidate = inferredPriorityCandidate(displayName, con?.disposition || inferredDisposition, con?.difficulty || inferredDifficulty, kind, level);
    const isCombatActive = !isDead
      && kind !== 'resource'
      && kind !== 'player'
      && Number.isFinite(combatObservedAtMs)
      && nowMs - combatObservedAtMs <= ENTITY_COMBAT_TTL_MS;
    if (kind === 'npc') {
      const freshnessMs = isDead && Number.isFinite(healthObservedAtMs)
        ? nowMs - healthObservedAtMs
        : nowMs - observedAtMs;
      const ttlMs = isDead ? DEAD_NPC_MARKER_TTL_MS : NPC_MARKER_TTL_MS;
      if (Number.isFinite(freshnessMs) && freshnessMs > ttlMs) continue;
    }
    const normalizedDisplayName = normalizeMobName(displayName);
    const namedMob = normalizedDisplayName ? findNamedByAlias.get(normalizedDisplayName) || null : null;
    const namedSpawn = (kind === 'mob' || kind === 'npc') && [x, y, z].every(Number.isFinite)
      ? findNearestNamedSpawn.get(x, x, z, z, y, y, x, z, y) || null
      : null;
    entities.push({
      id: row.id,
      observedAt: row.observedAt,
      eventType: row.eventType,
      kind,
      entityId,
      name: displayName,
      petLabel,
      petAlias,
      asset,
      petOwnerName,
      questItem,
      level,
      x,
      y,
      z,
      health: activeHealth,
      title: scannerMetadata?.title || null,
      className: scannerMetadata?.className || null,
      race: scannerMetadata?.race || null,
      profession: scannerMetadata?.profession || null,
      scannerKind: scannerMetadata?.scannerKind || null,
      distanceFromLocal: scannerMetadata?.distanceFromLocal ?? null,
      healthPercent: scannerMetadata?.healthPercent ?? null,
      targetRole: selectedTarget?.role || null,
      targetObservedAt: selectedTarget?.observedAt || null,
      isDead,
      combatState: isCombatActive ? combat.state : null,
      combatRole: isCombatActive ? combat.role : null,
      lastCombatAt: isCombatActive ? combat.observedAt : null,
      disposition: con?.disposition || inferredDisposition,
      difficulty: con?.difficulty || inferredDifficulty,
      faction: con?.faction || null,
      conObservedAt: con?.observedAt || null,
      localPlayerLevel,
      localPlayerLevelSource: Number.isFinite(localPlayerLevelOverride) && localPlayerLevelOverride > 0
        ? 'override'
        : Number.isFinite(observedLocalPlayerLevel) && observedLocalPlayerLevel > 0
          ? 'local_player'
        : inferredLocalPlayerLevel
          ? 'inferred'
          : null,
      levelDelta,
      challengeSource: con?.difficulty ? 'con' : inferredDifficulty ? 'level' : null,
      ageSeconds: Number.isFinite(observedAtMs) ? Math.max(0, Math.round((nowMs - observedAtMs) / 1000)) : null,
      rawText: row.rawText,
      priorityCandidate,
      namedMob,
      namedSpawn: namedSpawn
        ? {
          ...namedSpawn,
          distance: Number(Math.sqrt(Number(namedSpawn.distanceSq || 0)).toFixed(1))
        }
        : null
    });
  }
  return entities.slice(0, outputLimit);
}

function createServer(store, options = {}) {
  const db = store.db;
  const identityOptions = {
    localPlayerName: options.localPlayerName || null
  };
  const communityItemStatus = () => (
    typeof options.communityItemStatus === 'function'
      ? options.communityItemStatus()
      : options.communityItemStatus || null
  );
  return http.createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/restart' && req.method === 'POST') {
        sendJson(res, 202, {
          ok: true,
          restarting: true,
          requestedAt: new Date().toISOString()
        });
        if (typeof options.onRestart === 'function') {
          setTimeout(() => {
            try {
              options.onRestart();
            } catch (error) {
              console.error(`Restart failed: ${error.message}`);
            }
          }, 150);
        }
        return;
      }
      if (url.pathname === '/api/status') {
        const since = url.searchParams.get('since') || null;
        sendJson(res, 200, {
          app: {
            startedAt: options.startedAt
          },
          memory: options.memoryStatus || null,
          addonLog: options.addonLogStatus || null,
          entityScanner: options.entityScannerStatus || null,
          lootLog: options.lootLogStatus || null,
          communityItems: communityItemStatus(),
          communityMobs: typeof options.communityMobStatus === 'function' ? options.communityMobStatus() : null,
          summary: getSummary(db, since)
        });
        return;
      }
      if (url.pathname === '/api/community-items/config' && req.method === 'POST') {
        readJsonBody(req)
          .then((body) => {
            if (typeof options.onCommunityItemsConfig !== 'function') throw new Error('Community item sync is not configurable.');
            sendJson(res, 200, {
              ok: true,
              status: options.onCommunityItemsConfig(body)
            });
          })
          .catch((error) => {
            sendJson(res, 400, { error: error.message });
          });
        return;
      }
      if (url.pathname === '/api/community-items/upload' && req.method === 'POST') {
        if (typeof options.onCommunityItemsUpload !== 'function') {
          sendJson(res, 400, { error: 'Community item upload is not available.' });
          return;
        }
        readJsonBody(req)
          .then((body) => options.onCommunityItemsUpload({ full: Boolean(body.full) }))
          .then((result) => sendJson(res, 200, { ok: true, ...result }))
          .catch((error) => sendJson(res, 500, { error: error.message }));
        return;
      }
      if (url.pathname === '/api/community-items/download' && req.method === 'POST') {
        if (typeof options.onCommunityItemsDownload !== 'function') {
          sendJson(res, 400, { error: 'Community item download is not available.' });
          return;
        }
        options.onCommunityItemsDownload()
          .then((result) => sendJson(res, 200, { ok: true, ...result }))
          .catch((error) => sendJson(res, 500, { error: error.message }));
        return;
      }
      if (url.pathname === '/api/community-mobs/upload' && req.method === 'POST') {
        if (typeof options.onCommunityMobsUpload !== 'function') {
          sendJson(res, 400, { error: 'Community mob upload is not available.' });
          return;
        }
        readJsonBody(req)
          .then((body) => options.onCommunityMobsUpload({ full: Boolean(body.full) }))
          .then((result) => sendJson(res, 200, { ok: true, ...result }))
          .catch((error) => sendJson(res, 500, { error: error.message }));
        return;
      }
      if (url.pathname === '/api/community-mobs/download' && req.method === 'POST') {
        if (typeof options.onCommunityMobsDownload !== 'function') {
          sendJson(res, 400, { error: 'Community mob download is not available.' });
          return;
        }
        options.onCommunityMobsDownload()
          .then((result) => sendJson(res, 200, { ok: true, ...result }))
          .catch((error) => sendJson(res, 500, { error: error.message }));
        return;
      }
      if (url.pathname === '/api/recent') {
        sendJson(res, 200, getRecentRows(db, url.searchParams.get('since') || null));
        return;
      }
      if (url.pathname === '/api/memory') {
        sendJson(res, 200, {
          generatedAt: new Date().toISOString(),
          rows: getRecentMemoryObservations(db, Number(url.searchParams.get('limit') || 100))
        });
        return;
      }
      if (url.pathname === '/api/actors') {
        sendJson(res, 200, {
          generatedAt: new Date().toISOString(),
          rows: getActorNames(db, Number(url.searchParams.get('limit') || 100))
        });
        return;
      }
      if (url.pathname === '/api/actors/unresolved') {
        sendJson(res, 200, {
          generatedAt: new Date().toISOString(),
          rows: getUnresolvedActors(db, Number(url.searchParams.get('window') || 0), url.searchParams.get('since') || null)
        });
        return;
      }
      if (url.pathname === '/api/positions') {
        const since = url.searchParams.get('since') || null;
        const actorLimit = Number(url.searchParams.get('actors') || 20);
        const trailLimit = Number(url.searchParams.get('limit') || 120);
        const livePositions = typeof options.getLivePositions === 'function'
          ? options.getLivePositions({
            limit: trailLimit,
            actors: actorLimit,
            since
          })
          : null;
        const localIdentity = getAuthoritativeLocalPositionIdentity(db, identityOptions);
        const dbLatest = getLatestPositions(db, actorLimit, since);
        let latest = livePositions?.latest?.length
          ? normalizeLocalPositionRows(db, livePositions.latest, identityOptions)
          : normalizeLocalPositionRows(db, dbLatest, identityOptions);
        if (localIdentity?.entityId && !latest.some((row) => row.entityId === localIdentity.entityId)) {
          const localFallback = dbLatest.find((row) => row.entityId === localIdentity.entityId);
          if (localFallback) latest = [localFallback, ...latest];
        }
        if (localIdentity?.entityId) {
          latest.sort((left, right) => {
            if (left.entityId === localIdentity.entityId && right.entityId !== localIdentity.entityId) return -1;
            if (right.entityId === localIdentity.entityId && left.entityId !== localIdentity.entityId) return 1;
            return Date.parse(right.observedAt) - Date.parse(left.observedAt);
          });
          latest = latest.slice(0, Math.max(1, Math.min(100, actorLimit || 20)));
        }
        const trail = livePositions?.trail?.length
          ? normalizeLocalPositionRows(db, livePositions.trail, identityOptions)
          : normalizeLocalPositionRows(db, getPositionRows(db, trailLimit, since), identityOptions);
        sendJson(res, 200, {
          generatedAt: new Date().toISOString(),
          latest,
          trail
        });
        return;
      }
      if (url.pathname === '/api/map/entities') {
        sendJson(res, 200, {
          generatedAt: new Date().toISOString(),
          rows: getMapEntityRows(db, Number(url.searchParams.get('limit') || 500), url.searchParams.get('since') || null)
        });
        return;
      }
      if (url.pathname === '/api/map/calibration' && req.method === 'GET') {
        sendJson(res, 200, getMapCalibrationSummary(db, {
          mapKey: url.searchParams.get('mapKey') || '',
          limit: Number(url.searchParams.get('limit') || 2000)
        }));
        return;
      }
      if (url.pathname === '/api/map/calibration' && req.method === 'POST') {
        readJsonBody(req)
          .then((body) => {
            const sample = insertMapCalibrationSample(db, body);
            sendJson(res, 201, { ok: true, sample });
          })
          .catch((error) => {
            sendJson(res, /required|Known|Finite|Invalid|large/i.test(error.message) ? 400 : 500, { error: error.message });
          });
        return;
      }
      if (url.pathname === '/api/respawns/deaths') {
        sendJson(res, 200, getRespawnDeathRows(
          db,
          Number(url.searchParams.get('window') || 6 * 60 * 60),
          url.searchParams.get('since') || null,
          Number(url.searchParams.get('limit') || 300)
        ));
        return;
      }
      if (url.pathname === '/api/named-mobs') {
        sendJson(res, 200, getNamedMobSummary(db, {
          search: url.searchParams.get('search') || '',
          location: url.searchParams.get('location') || '',
          limit: Number(url.searchParams.get('limit') || 100)
        }));
        return;
      }
      if (url.pathname === '/api/map/state') {
        sendJson(res, 200, {
          generatedAt: new Date().toISOString(),
          ...getLatestMapState(db)
        });
        return;
      }
      if (url.pathname === '/api/map/config') {
        sendJson(res, 200, {
          defaultMapId: 'kingsreach',
          maps: Object.values(MAPS).map(publicMapConfig)
        });
        return;
      }
      const tileMatch = url.pathname.match(/^\/api\/map\/tile\/([a-z0-9_]+)\/([a-z0-9_]+)\/(\d+)\/(\d+)\/(\d+)\.webp$/);
      if (tileMatch) {
        sendMapTile(res, tileMatch[1], tileMatch[2], tileMatch[3], tileMatch[4], tileMatch[5]).catch((error) => {
          sendJson(res, 502, { error: error.message });
        });
        return;
      }
      const legacyTileMatch = url.pathname.match(/^\/api\/map\/tile\/(\d+)\/(\d+)\/(\d+)\.webp$/);
      if (legacyTileMatch) {
        sendMapTile(res, 'kingsreach', 'base', legacyTileMatch[1], legacyTileMatch[2], legacyTileMatch[3]).catch((error) => {
          sendJson(res, 502, { error: error.message });
        });
        return;
      }
      if (url.pathname === '/api/item-art') {
        sendRemoteImage(res, url.searchParams.get('url')).catch((error) => {
          sendJson(res, 502, { error: error.message });
        });
        return;
      }
      if (url.pathname === '/api/parser/summary') {
        sendJson(res, 200, getParserSummary(db, Number(url.searchParams.get('window') || 300), url.searchParams.get('since') || null));
        return;
      }
      if (url.pathname === '/api/healing/summary') {
        sendJson(res, 200, getHealingSummary(db, Number(url.searchParams.get('window') || 300), url.searchParams.get('since') || null));
        return;
      }
      if (url.pathname === '/api/xp/summary') {
        sendJson(res, 200, getXpSummary(db, Number(url.searchParams.get('window') || 0), url.searchParams.get('since') || null));
        return;
      }
      if (url.pathname === '/api/loot/summary') {
        sendJson(res, 200, getLootSummary(db, {
          search: url.searchParams.get('search') || '',
          rarity: url.searchParams.get('rarity') || '',
          type: url.searchParams.get('type') || '',
          className: url.searchParams.get('class') || '',
          slot: url.searchParams.get('slot') || '',
          maxLevel: url.searchParams.get('maxLevel') || '',
          sort: url.searchParams.get('sort') || '',
          limit: Number(url.searchParams.get('limit') || 120)
        }));
        return;
      }
      if (url.pathname === '/api/loot/item') {
        const item = getLootItemDetail(db, url.searchParams.get('itemId') || '');
        if (!item) {
          sendJson(res, 404, { error: 'Item not found' });
          return;
        }
        sendJson(res, 200, item);
        return;
      }
      if (url.pathname === '/api/mobs/summary') {
        sendJson(res, 200, getMobSummary(db, {
          search: url.searchParams.get('search') || '',
          location: url.searchParams.get('location') || '',
          named: url.searchParams.get('named') || '',
          minLevel: url.searchParams.get('minLevel') || '',
          maxLevel: url.searchParams.get('maxLevel') || '',
          limit: Number(url.searchParams.get('limit') || 160)
        }));
        return;
      }
      if (url.pathname === '/api/mobs/detail') {
        const mob = getMobDetail(db, url.searchParams.get('name') || '');
        if (!mob) {
          sendJson(res, 404, { error: 'Mob not found' });
          return;
        }
        sendJson(res, 200, mob);
        return;
      }
      if (url.pathname === '/api/encounters') {
        sendJson(res, 200, getEncounterReport(
          db,
          Number(url.searchParams.get('window') || 300),
          url.searchParams.get('id') || '',
          url.searchParams.get('since') || null
        ));
        return;
      }
      if (url.pathname === '/api/parser/breakdown') {
        const source = url.searchParams.get('source') || '';
        if (!source) {
          sendJson(res, 400, { error: 'Missing source' });
          return;
        }
        sendJson(res, 200, {
          source,
          rows: getParserBreakdown(db, Number(url.searchParams.get('window') || 300), source, url.searchParams.get('since') || null)
        });
        return;
      }
      if (url.pathname === '/api/parser/ability-events') {
        sendJson(res, 200, {
          rows: getParserAbilityEvents(
            db,
            Number(url.searchParams.get('window') || 300),
            url.searchParams.get('source') || '',
            url.searchParams.get('ability') || '',
            url.searchParams.get('target') || '',
            Number(url.searchParams.get('limit') || 20),
            url.searchParams.get('since') || null
          )
        });
        return;
      }
      if (url.pathname === '/api/abilities') {
        sendJson(res, 200, {
          generatedAt: new Date().toISOString(),
          rows: getAbilityRegistry(db, Number(url.searchParams.get('limit') || 500))
        });
        return;
      }
      if (url.pathname === '/api/reset') {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Use POST' });
          return;
        }
        sendJson(res, 200, { ok: true, deletedPackets: 0, resetAt: new Date().toISOString(), scope: 'display-only' });
        return;
      }

      const relativePath = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      const filePath = path.resolve(PUBLIC_DIR, relativePath);
      if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }
      sendFile(res, filePath);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  });
}

function startDashboard(store, options = {}) {
  const server = createServer(store, options);
  const port = Number(options.port ?? 3117);
  server.listen(port, () => {
    const address = server.address();
    const actualPort = address && typeof address === 'object' ? address.port : port;
    console.log(`Pantheon Atlas dashboard listening at http://localhost:${actualPort}`);
  });
  return server;
}

module.exports = {
  createServer,
  getRecentRows,
  getAbilityRegistry,
  getEncounterReport,
  getHealingSummary,
  getXpSummary,
  getLootItemDetail,
  getLootSummary,
  getMobDetail,
  getMobSummary,
  getParserAbilityEvents,
  getParserSummary,
  getRespawnDeathRows,
  getNamedMobSummary,
  getSummary,
  getLatestPositions,
  getLatestMapState,
  getMapCalibrationSamples,
  getMapCalibrationSummary,
  getMapEntityRows,
  getUnresolvedActors,
  goblinLayerForY,
  inferMapFromCalibration,
  insertMapCalibrationSample,
  getPositionRows,
  inferLocalPlayerLevel,
  mapCalibrationLayerKeyForLabel,
  mapKeyForCoordinates,
  mapKeyForCoordinatesWithCalibration,
  mapKeyForZoneName,
  startDashboard
};
