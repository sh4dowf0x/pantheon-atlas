const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { getMobSummary } = require('../src/dashboard');
const { CommunityMobSync, getNormalizedMobs } = require('../src/mobSync');
const { openStore } = require('../src/store');

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

const r2Uploads = [];
const workerUploads = [];
const workerServer = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    const body = req.headers['content-encoding'] === 'gzip'
      ? JSON.parse(zlib.gunzipSync(raw).toString('utf8'))
      : raw.length ? JSON.parse(raw.toString('utf8')) : null;
    workerUploads.push({
      method: req.method,
      url: req.url,
      contentType: req.headers['content-type'],
      contentEncoding: req.headers['content-encoding'],
      authorization: req.headers.authorization,
      body
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ key: 'mob-contributions/local-install/mobs-worker.json.gz' }));
  });
});
const r2Server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/pantheon-item-database/mobs-manifest.json') {
    res.writeHead(404, { 'Content-Type': 'application/xml' });
    res.end('<Error><Code>NoSuchKey</Code></Error>');
    return;
  }
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    let body = null;
    if (req.headers['content-encoding'] === 'gzip') body = JSON.parse(zlib.gunzipSync(raw).toString('utf8'));
    else if (raw.length) body = JSON.parse(raw.toString('utf8'));
    r2Uploads.push({
      method: req.method,
      url: req.url,
      contentType: req.headers['content-type'],
      contentEncoding: req.headers['content-encoding'],
      authorization: req.headers.authorization,
      body
    });
    res.writeHead(200);
    res.end();
  });
});

let publicPort = null;
const publicServer = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/mobs-manifest.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      format: 'pantheon-atlas-mobs-manifest-v1',
      objects: [{ key: 'mob-contributions/community/mobs.json.gz', sha256: 'community-mob-sha' }]
    }));
    return;
  }
  if (req.method === 'GET' && req.url === '/mob-contributions/community/mobs.json.gz') {
    const body = zlib.gzipSync(Buffer.from(JSON.stringify({
      format: 'pantheon-atlas-mobs-v1',
      generatedAt: '2026-06-18T01:00:00.000Z',
      installId: 'community-install',
      mobs: [{
        key: 'community named',
        name: 'Community Named',
        named: true,
        location: 'Remote Camp',
        zoneName: 'Remote Zone',
        levelMin: 20,
        levelMax: 22,
        firstSeen: '2026-06-18T00:00:00.000Z',
        lastSeen: '2026-06-18T01:00:00.000Z',
        seenCount: 3,
        abilities: [{ ability: 'Remote Bite', count: 2, totalDamage: 44, lastSeen: '2026-06-18T01:00:00.000Z' }],
        drops: [{ itemId: 'remote-drop-1', name: 'Remote Fang', rarity: 'Rare', count: 1, lastSeen: '2026-06-18T01:00:00.000Z' }]
      }]
    }), 'utf8'));
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip'
    });
    res.end(body);
    return;
  }
  res.writeHead(404);
  res.end();
});

async function run() {
  const r2Port = await listen(r2Server);
  const workerPort = await listen(workerServer);
  publicPort = await listen(publicServer);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pantheon-mob-sync-test-'));
  const store = openStore(path.join(tempDir, 'test.sqlite'));
  store.insertEvent({
    observedAt: '2026-06-18T00:00:00.000Z',
    eventType: 'world_entity',
    source: 'EntityScanner',
    target: 'Local Test Mob',
    ability: 'entityKind:mob',
    amount: 9,
    damageType: 'localmob1000',
    x: 100,
    y: 200,
    z: 300,
    rawText: '[EntityScanner] Local Test Mob',
    eventKey: 'local-test-mob-world'
  });
  store.insertEvent({
    observedAt: '2026-06-18T00:01:00.000Z',
    eventType: 'damage_estimate',
    source: 'Local Test Mob',
    target: 'Nexerin',
    ability: 'Scratch',
    amount: 12,
    damageType: 'Physical',
    rawText: 'Local Test Mob dealt 12 damage to Nexerin with Scratch.',
    eventKey: 'local-test-mob-damage'
  });

  const localMobs = getNormalizedMobs(store.db, 50);
  const localMob = localMobs.find((mob) => mob.name === 'Local Test Mob');
  assert.equal(localMob.levelMin, 9);
  assert.equal(localMob.abilities[0].ability, 'Scratch');
  assert.equal(localMob.lastLocation.x, 100);
  assert.equal(localMob.locationHistory.length, 1);
  assert.equal(localMob.locationHistory[0].y, 200);

  const sync = new CommunityMobSync({
    enabled: true,
    downloadEnabled: true,
    uploadEnabled: true,
    uploadMode: 'r2',
    statePath: path.join(tempDir, 'mob-sync-state.json'),
    publicBaseUrl: `http://127.0.0.1:${publicPort}`,
    manifestUrl: `http://127.0.0.1:${publicPort}/mobs-manifest.json`,
    installId: 'local-install',
    r2: {
      endpoint: `http://127.0.0.1:${r2Port}`,
      bucket: 'pantheon-item-database',
      accessKeyId: 'AKIA_TEST',
      secretAccessKey: 'SECRET_TEST',
      objectPrefix: 'mob-contributions',
      manifestKey: 'mobs-manifest.json'
    }
  }, store, { atlasVersion: 'test' });

  assert.deepEqual(await sync.uploadChangedMobs(), { uploaded: localMobs.length, changed: localMobs.length });
  assert.equal(r2Uploads.length, 2);
  assert.match(r2Uploads[0].url, /^\/pantheon-item-database\/mob-contributions\/local-install\/mobs-/);
  assert.equal(r2Uploads[0].contentEncoding, 'gzip');
  const uploadedLocalMob = r2Uploads[0].body.mobs.find((mob) => mob.name === 'Local Test Mob');
  assert.ok(uploadedLocalMob);
  assert.equal(uploadedLocalMob.lastLocation.x, 100);
  assert.equal(uploadedLocalMob.locationHistory[0].z, 300);
  assert.equal(r2Uploads[1].url, '/pantheon-item-database/mobs-manifest.json');
  assert.equal(r2Uploads[1].body.objects[0].key, r2Uploads[0].url.replace(/^\/pantheon-item-database\//, ''));

  const workerSync = new CommunityMobSync({
    enabled: true,
    downloadEnabled: false,
    uploadEnabled: true,
    uploadMode: 'worker',
    uploadEndpoint: `http://127.0.0.1:${workerPort}/mobs`,
    statePath: path.join(tempDir, 'mob-worker-sync-state.json'),
    installId: 'worker-local-install',
    batchSize: 100
  }, store, { atlasVersion: 'test' });
  assert.deepEqual(await workerSync.uploadChangedMobs(), { uploaded: localMobs.length, changed: localMobs.length });
  assert.equal(workerUploads.length, 1);
  assert.equal(workerUploads[0].url, '/mobs');
  assert.equal(workerUploads[0].contentEncoding, 'gzip');
  assert.equal(workerUploads[0].body.format, 'pantheon-atlas-mobs-v1');
  assert.ok(workerUploads[0].body.mobs.some((mob) => mob.name === 'Local Test Mob'));

  assert.deepEqual(await sync.downloadCommunityMobs(), { downloaded: 1, imported: 1 });
  const summary = getMobSummary(store.db, { search: 'Community Named', force: true });
  const communityNamed = summary.rows.find((mob) => mob.name === 'Community Named');
  assert.equal(communityNamed.name, 'Community Named');
  assert.equal(communityNamed.named, true);
  assert.equal(communityNamed.location, 'Remote Camp');
  const namedOnly = getMobSummary(store.db, { named: 'named', location: 'Remote Camp', force: true });
  assert.ok(namedOnly.rows.some((mob) => mob.name === 'Community Named'));

  store.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
  await close(r2Server);
  await close(workerServer);
  await close(publicServer);
}

run().then(() => {
  console.log('mob sync tests passed');
}).catch(async (error) => {
  console.error(error);
  await close(r2Server).catch(() => {});
  await close(workerServer).catch(() => {});
  await close(publicServer).catch(() => {});
  process.exitCode = 1;
});
