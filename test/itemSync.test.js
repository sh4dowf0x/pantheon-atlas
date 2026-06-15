const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { CommunityItemSync, getNormalizedItems, signedS3PutRequest } = require('../src/itemSync');
const { parseLootLogLine } = require('../src/lootLog');
const { openStore } = require('../src/store');

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

const uploads = [];
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/items-manifest.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      format: 'pantheon-atlas-items-manifest-v1',
      objects: [{ key: 'contributions/community/items.json.gz', sha256: 'community-sha' }]
    }));
    return;
  }
  if (req.method === 'GET' && req.url === '/contributions/community/items.json.gz') {
    const body = zlib.gzipSync(Buffer.from(JSON.stringify({
      format: 'pantheon-atlas-items-v1',
      generatedAt: '2026-06-15T01:00:00.000Z',
      items: [{
        itemId: 'community-1',
        name: 'Community Helm',
        rarity: 'Rare',
        itemType: 'Armor',
        armorTypeName: 'Plate',
        equipSlotName: 'Head',
        classRequirementNames: ['Dire Lord'],
        requiredProficiency: 'Plate',
        requiredLevel: 8,
        stats: { Armor: 22, Stamina: 2 },
        flags: ['Magic']
      }]
    }), 'utf8'));
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip'
    });
    res.end(body);
    return;
  }
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    const body = req.headers['content-encoding'] === 'gzip' ? zlib.gunzipSync(raw) : raw;
    uploads.push({
      headers: req.headers,
      body: JSON.parse(body.toString('utf8'))
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ key: 'contributions/test/items.json.gz' }));
  });
});
const r2Uploads = [];
const r2Server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    r2Uploads.push({
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization,
      contentEncoding: req.headers['content-encoding'],
      body: JSON.parse(zlib.gunzipSync(Buffer.concat(chunks)).toString('utf8'))
    });
    res.writeHead(200);
    res.end();
  });
});

async function run() {
  const port = await listen(server);
  const r2Port = await listen(r2Server);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pantheon-item-sync-test-'));
  const store = openStore(path.join(tempDir, 'test.sqlite'));
  const statePath = path.join(tempDir, 'sync-state.json');
  const uploadEndpoint = `http://127.0.0.1:${port}/items`;

  const itemLine = JSON.stringify({
    timestamp: '2026-06-15T00:00:00.000Z',
    eventType: 'inventory_snapshot',
    character: 'Nexerin',
    itemInstanceId: 'item-instance-1',
    itemName: 'Test Helm',
    item: {
      InstanceId: 'item-instance-1',
      ItemId: 1,
      Name: 'Test Helm',
      StackSize: 1,
      SlotType: 'Equipped',
      SlotIndex: 0,
      Template: {
        itemId: '1',
        itemName: 'Test Helm',
        itemType: 'Armor',
        rarity: 'Uncommon',
        equipSlotName: 'Head',
        classRequirementNames: 'Dire Lord, Warrior',
        requiredProficiency: 'Leather',
        requiredLevel: '4',
        itemFlags: 'Magic',
        coinValue: '10'
      },
      InstanceStatModifiers: [
        { stat: 'Armor', modifierValue: '12' }
      ]
    }
  });
  const parsed = parseLootLogLine(itemLine);
  store.upsertLootItem(parsed.item);
  store.upsertLootInstance(parsed.instance);
  store.insertLootEvent(parsed.event);

  const items = getNormalizedItems(store.db);
  assert.equal(items.length, 1);
  assert.equal(items[0].equipSlotName, 'Head');
  assert.deepEqual(items[0].classRequirementNames, ['Dire Lord', 'Warrior']);
  assert.equal(items[0].stats.Armor, 12);

  const sync = new CommunityItemSync({
    enabled: true,
    uploadEnabled: true,
    uploadEndpoint,
    statePath,
    batchSize: 10
  }, store, { atlasVersion: 'test' });

  assert.deepEqual(await sync.uploadChangedItems(), { uploaded: 1, changed: 1 });
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].body.items[0].name, 'Test Helm');
  assert.match(uploads[0].headers['x-atlas-install-id'], /^[0-9a-f-]{36}$/);
  assert.equal(uploads[0].headers['x-atlas-format'], 'pantheon-atlas-items-v1');
  assert.match(uploads[0].headers['x-atlas-payload-sha256'], /^[0-9a-f]{64}$/);
  assert.equal(JSON.parse(fs.readFileSync(statePath, 'utf8')).lastUploadedKey, 'contributions/test/items.json.gz');

  assert.deepEqual(await sync.uploadChangedItems(), { uploaded: 0, changed: 0 });
  assert.equal(uploads.length, 1);

  const downloadSync = new CommunityItemSync({
    enabled: true,
    downloadEnabled: true,
    uploadEnabled: true,
    uploadEndpoint,
    manifestUrl: `http://127.0.0.1:${port}/items-manifest.json`,
    publicBaseUrl: `http://127.0.0.1:${port}`,
    statePath,
    batchSize: 10
  }, store, { atlasVersion: 'test' });
  assert.deepEqual(await downloadSync.downloadCommunityItems(), { downloaded: 1, imported: 1 });
  const communityItems = getNormalizedItems(store.db, 10);
  const communityHelm = communityItems.find((item) => item.itemId === 'community-1');
  assert.equal(communityHelm.name, 'Community Helm');
  assert.equal(communityHelm.equipSlotName, 'Head');
  assert.deepEqual(communityHelm.classRequirementNames, ['Dire Lord']);
  assert.equal(communityHelm.stats.Armor, 22);
  assert.deepEqual(await downloadSync.uploadChangedItems(), { uploaded: 0, changed: 0 });
  assert.equal(uploads.length, 1);

  const changedLine = itemLine.replace('"modifierValue":"12"', '"modifierValue":"14"');
  const changed = parseLootLogLine(changedLine);
  store.upsertLootItem(changed.item);
  assert.deepEqual(await sync.uploadChangedItems(), { uploaded: 1, changed: 1 });
  assert.equal(uploads.length, 2);
  assert.equal(uploads[1].body.items[0].stats.Armor, 14);
  assert.equal(uploads[1].headers['x-atlas-install-id'], uploads[0].headers['x-atlas-install-id']);

  const signed = signedS3PutRequest({
    endpoint: 'https://example.r2.cloudflarestorage.com',
    bucket: 'pantheon-item-database',
    key: 'contributions/test/items.json.gz',
    accessKeyId: 'AKIA_TEST',
    secretAccessKey: 'SECRET_TEST',
    body: Buffer.from('hello'),
    now: new Date('2026-06-15T00:00:00.000Z')
  });
  assert.equal(signed.url, 'https://example.r2.cloudflarestorage.com/pantheon-item-database/contributions/test/items.json.gz');
  assert.match(signed.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKIA_TEST\/20260615\/auto\/s3\/aws4_request/);

  const r2StatePath = path.join(tempDir, 'r2-sync-state.json');
  const r2Sync = new CommunityItemSync({
    enabled: true,
    uploadEnabled: true,
    uploadMode: 'r2',
    statePath: r2StatePath,
    batchSize: 10,
    installId: 'test-install',
    r2: {
      endpoint: `http://127.0.0.1:${r2Port}`,
      bucket: 'pantheon-item-database',
      accessKeyId: 'AKIA_TEST',
      secretAccessKey: 'SECRET_TEST',
      objectPrefix: 'contributions'
    }
  }, store, { atlasVersion: 'test' });
  assert.deepEqual(await r2Sync.uploadChangedItems(), { uploaded: 2, changed: 2 });
  assert.equal(r2Uploads.length, 1);
  assert.equal(r2Uploads[0].method, 'PUT');
  assert.match(r2Uploads[0].url, /^\/pantheon-item-database\/contributions\/test-install\/items-/);
  assert.match(r2Uploads[0].authorization, /^AWS4-HMAC-SHA256 /);
  assert.equal(r2Uploads[0].contentEncoding, 'gzip');
  assert.ok(r2Uploads[0].body.items.some((item) => item.name === 'Test Helm'));

  store.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
  await close(server);
  await close(r2Server);
}

run().then(() => {
  console.log('item sync tests passed');
}).catch(async (error) => {
  console.error(error);
  await close(server).catch(() => {});
  await close(r2Server).catch(() => {});
  process.exitCode = 1;
});
