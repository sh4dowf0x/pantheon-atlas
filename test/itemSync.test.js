const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { CommunityItemSync, getNormalizedItems, signedS3PutRequest } = require('../src/itemSync');
const { getLootItemDetail } = require('../src/dashboard');
const { cacheLocalItemArtSync, writeItemArtIndex } = require('../src/itemArt');
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
        flags: ['Magic'],
        dropSources: [{ name: 'Community Goblin', count: 2, lastSeen: '2026-06-15T00:30:00.000Z', methods: ['lootdata'], confidences: ['high'] }],
        artUrl: 'https://shalazam.info/static/icons/SkollPantheonSprite/webp/3_Leather_head.webp'
      }]
    }), 'utf8'));
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip'
    });
    res.end(body);
    return;
  }
  if (req.method === 'POST' && req.url === '/icons') {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      uploads.push({
        headers: req.headers,
        url: req.url,
        body
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        key: 'item-icons/worker-icon.png',
        publicUrl: `http://127.0.0.1:${server.address().port}/item-icons/worker-icon.png`
      }));
    });
    return;
  }
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    const body = req.headers['content-encoding'] === 'gzip' ? zlib.gunzipSync(raw) : raw;
    uploads.push({
      headers: req.headers,
      url: req.url,
      body: JSON.parse(body.toString('utf8'))
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ key: 'contributions/test/items.json.gz' }));
  });
});
const r2Uploads = [];
const r2Server = http.createServer((req, res) => {
  const chunks = [];
  if (req.method === 'GET' && req.url === '/pantheon-item-database/items-manifest.json') {
    res.writeHead(404, { 'Content-Type': 'application/xml' });
    res.end('<Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>');
    return;
  }
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    let body = null;
    if (req.headers['content-encoding'] === 'gzip') {
      body = JSON.parse(zlib.gunzipSync(raw).toString('utf8'));
    } else if (raw.length && String(req.headers['content-type'] || '').includes('application/json')) {
      body = JSON.parse(raw.toString('utf8'));
    } else if (raw.length) {
      body = raw;
    }
    r2Uploads.push({
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization,
      contentType: req.headers['content-type'],
      contentEncoding: req.headers['content-encoding'],
      body
    });
    res.writeHead(200);
    res.end();
  });
});
const r2ErrorServer = http.createServer((req, res) => {
  req.resume();
  res.writeHead(403, { 'Content-Type': 'application/xml' });
  res.end('<Error><Code>SignatureDoesNotMatch</Code><Message>The request signature we calculated does not match.</Message><StringToSign>verbose signing internals</StringToSign></Error>');
});
const missingCommunityObjectServer = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/items-manifest.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      format: 'pantheon-atlas-items-manifest-v1',
      objects: [{ key: 'contributions/missing/items.json.gz', sha256: 'missing-sha' }]
    }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/html' });
  res.end('<!doctype html><html><head><title>Not Found</title></head><body><h1>Error 404</h1><h3>Object not found</h3><p>This object does not exist or is not publicly accessible at this URL.</p><svg><path d="verbose"></path></svg></body></html>');
});
const missingManifestServer = http.createServer((req, res) => {
  req.resume();
  res.writeHead(404, { 'Content-Type': 'text/html' });
  res.end('<!doctype html><html><head><title>Not Found</title></head><body><h1>Error 404</h1><p>This object does not exist or is not publicly accessible at this URL.</p></body></html>');
});

async function run() {
  const port = await listen(server);
  const r2Port = await listen(r2Server);
  const r2ErrorPort = await listen(r2ErrorServer);
  const missingCommunityObjectPort = await listen(missingCommunityObjectServer);
  const missingManifestPort = await listen(missingManifestServer);
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
  store.insertLootEvent({
    observedAt: '2026-06-15T00:05:00.000Z',
    eventType: 'loot_received',
    character: 'Nexerin',
    itemInstanceId: 'item-instance-1',
    itemId: '1',
    itemName: 'Test Helm',
    source: 'Test Wolf',
    quantity: 1,
    rawJson: JSON.stringify({
      acquisition: {
        method: 'recent_offensive_target',
        confidence: 'high',
        source: { name: 'Test Wolf', entityType: 'mob', level: 4, x: 100, y: 200, z: 300 }
      }
    }),
    eventKey: 'test-helm-drop-source'
  });

  const items = getNormalizedItems(store.db);
  assert.equal(items.length, 1);
  assert.equal(items[0].equipSlotName, 'Head');
  assert.deepEqual(items[0].classRequirementNames, ['Dire Lord', 'Warrior']);
  assert.equal(items[0].stats.Armor, 12);
  assert.equal(items[0].dropSources[0].name, 'Test Wolf');
  assert.equal(items[0].dropSources[0].count, 1);
  assert.deepEqual(items[0].dropSources[0].methods, ['recent_offensive_target']);

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
  assert.equal(uploads[0].body.items[0].dropSources[0].name, 'Test Wolf');
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
  assert.equal(communityHelm.artUrl, 'https://shalazam.info/static/icons/SkollPantheonSprite/webp/3_Leather_head.webp');
  assert.equal(communityHelm.dropSources[0].name, 'Community Goblin');
  const communityHelmDetail = getLootItemDetail(store.db, 'community-1');
  assert.equal(communityHelmDetail.dropSources[0].name, 'Community Goblin');
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
  assert.equal(signed.headers['content-sha256'], undefined);
  assert.match(signed.headers.authorization, /SignedHeaders=content-encoding;content-type;host;x-amz-content-sha256;x-amz-date/);

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
  assert.equal(r2Uploads.length, 2);
  assert.equal(r2Uploads[0].method, 'PUT');
  assert.match(r2Uploads[0].url, /^\/pantheon-item-database\/contributions\/test-install\/items-/);
  assert.match(r2Uploads[0].authorization, /^AWS4-HMAC-SHA256 /);
  assert.equal(r2Uploads[0].contentEncoding, 'gzip');
  assert.ok(r2Uploads[0].body.items.some((item) => item.name === 'Test Helm'));
  assert.equal(r2Uploads[1].method, 'PUT');
  assert.equal(r2Uploads[1].url, '/pantheon-item-database/items-manifest.json');
  assert.equal(r2Uploads[1].contentType, 'application/json');
  assert.equal(r2Uploads[1].contentEncoding, undefined);
  assert.equal(r2Uploads[1].body.objects.length, 1);
  assert.equal(r2Uploads[1].body.objects[0].key, r2Uploads[0].url.replace(/^\/pantheon-item-database\//, ''));

  const r2BeforeFullUpload = r2Uploads.length;
  assert.deepEqual(await r2Sync.uploadChangedItems(), { uploaded: 0, changed: 0 });
  assert.equal(r2Uploads.length, r2BeforeFullUpload);
  assert.deepEqual(await r2Sync.uploadChangedItems({ full: true }), { uploaded: 2, changed: 2 });
  assert.equal(r2Uploads.length, r2BeforeFullUpload + 2);
  assert.ok(r2Uploads[r2BeforeFullUpload].body.items.some((item) => item.name === 'Test Helm'));

  const iconStore = openStore(path.join(tempDir, 'icon-sync.sqlite'));
  const iconBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03, 0x04]);
  const iconSourcePath = path.join(tempDir, 'Icon_Sync_Helm.png');
  fs.writeFileSync(iconSourcePath, iconBytes);
  const cachedIcon = cacheLocalItemArtSync(iconSourcePath, { iconKey: 'Icon_Sync_Helm', itemName: 'Icon Sync Helm' });
  iconStore.upsertLootItem({
    observedAt: '2026-06-15T04:00:00.000Z',
    itemId: 'icon-sync-1',
    name: 'Icon Sync Helm',
    rarity: 'Rare',
    itemType: 'Armor',
    armorTypeName: 'Plate',
    flagsJson: JSON.stringify(['Magic']),
    statsJson: JSON.stringify({ statModifiers: [{ stat: 'Armor', value: 28 }] }),
    templateJson: JSON.stringify({
      itemId: 'icon-sync-1',
      itemName: 'Icon Sync Helm',
      itemType: 'Armor',
      rarity: 'Rare',
      armorTypeName: 'Plate',
      equipSlotName: 'Head',
      iconKey: 'Icon_Sync_Helm',
      artUrl: cachedIcon.artUrl,
      artSource: 'lootdata'
    })
  });
  r2Uploads.length = 0;
  const r2IconSync = new CommunityItemSync({
    enabled: true,
    uploadEnabled: true,
    uploadMode: 'r2',
    statePath: path.join(tempDir, 'r2-icon-sync-state.json'),
    batchSize: 10,
    installId: 'icon-install',
    publicBaseUrl: 'https://pub-test.r2.dev',
    r2: {
      endpoint: `http://127.0.0.1:${r2Port}`,
      bucket: 'pantheon-item-database',
      accessKeyId: 'AKIA_TEST',
      secretAccessKey: 'SECRET_TEST',
      objectPrefix: 'contributions',
      iconPrefix: 'item-icons'
    }
  }, iconStore, { atlasVersion: 'test' });
  assert.deepEqual(await r2IconSync.uploadChangedItems(), { uploaded: 1, changed: 1 });
  assert.equal(r2Uploads.length, 3);
  const iconPut = r2Uploads.find((row) => row.contentType === 'image/png');
  assert.ok(iconPut);
  assert.match(iconPut.url, /^\/pantheon-item-database\/item-icons\/Icon_Sync_Helm_[0-9a-f]{16}\.png$/);
  assert.deepEqual(iconPut.body, iconBytes);
  const itemPut = r2Uploads.find((row) => row.contentEncoding === 'gzip');
  const uploadedIconItem = itemPut.body.items.find((item) => item.itemId === 'icon-sync-1');
  assert.match(uploadedIconItem.artUrl, /^https:\/\/pub-test\.r2\.dev\/item-icons\/Icon_Sync_Helm_[0-9a-f]{16}\.png$/);
  assert.equal(uploadedIconItem.artObjectKey, iconPut.url.replace(/^\/pantheon-item-database\//, ''));
  iconStore.close();

  const workerIconStore = openStore(path.join(tempDir, 'worker-icon-sync.sqlite'));
  const workerIconBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x09, 0x08, 0x07, 0x06]);
  const workerIconSourcePath = path.join(tempDir, 'Worker_Icon_Helm.png');
  fs.writeFileSync(workerIconSourcePath, workerIconBytes);
  const workerCachedIcon = cacheLocalItemArtSync(workerIconSourcePath, { iconKey: 'Worker_Icon_Helm', itemName: 'Worker Icon Helm' });
  workerIconStore.upsertLootItem({
    observedAt: '2026-06-15T05:00:00.000Z',
    itemId: 'worker-icon-1',
    name: 'Worker Icon Helm',
    rarity: 'Rare',
    itemType: 'Armor',
    armorTypeName: 'Plate',
    flagsJson: JSON.stringify(['Magic']),
    statsJson: JSON.stringify({ statModifiers: [{ stat: 'Armor', value: 30 }] }),
    templateJson: JSON.stringify({
      itemId: 'worker-icon-1',
      itemName: 'Worker Icon Helm',
      itemType: 'Armor',
      rarity: 'Rare',
      armorTypeName: 'Plate',
      equipSlotName: 'Head',
      iconKey: 'Worker_Icon_Helm',
      artUrl: workerCachedIcon.artUrl,
      artSource: 'lootdata'
    })
  });
  uploads.length = 0;
  const workerIconSync = new CommunityItemSync({
    enabled: true,
    uploadEnabled: true,
    uploadMode: 'worker',
    uploadEndpoint,
    statePath: path.join(tempDir, 'worker-icon-sync-state.json'),
    batchSize: 10,
    installId: 'worker-install'
  }, workerIconStore, { atlasVersion: 'test' });
  assert.deepEqual(await workerIconSync.uploadChangedItems(), { uploaded: 1, changed: 1 });
  assert.equal(uploads.length, 2);
  const workerIconPost = uploads.find((row) => row.url === '/icons');
  assert.ok(workerIconPost);
  assert.deepEqual(workerIconPost.body, workerIconBytes);
  const workerItemPost = uploads.find((row) => row.url === '/items');
  const workerUploadedItem = workerItemPost.body.items.find((item) => item.itemId === 'worker-icon-1');
  assert.equal(workerUploadedItem.artUrl, `http://127.0.0.1:${port}/item-icons/worker-icon.png`);
  assert.equal(workerUploadedItem.artObjectKey, 'item-icons/worker-icon.png');
  workerIconStore.close();

  const r2ErrorSync = new CommunityItemSync({
    enabled: true,
    uploadEnabled: true,
    uploadMode: 'r2',
    statePath: path.join(tempDir, 'r2-error-sync-state.json'),
    batchSize: 10,
    installId: 'test-install',
    r2: {
      endpoint: `http://127.0.0.1:${r2ErrorPort}`,
      bucket: 'pantheon-item-database',
      accessKeyId: 'AKIA_TEST',
      secretAccessKey: 'SECRET_TEST'
    }
  }, store, { atlasVersion: 'test' });
  await assert.rejects(
    () => r2ErrorSync.uploadChangedItems(),
    /R2 item upload failed: 403 SignatureDoesNotMatch: The request signature we calculated does not match\./
  );
  assert.doesNotMatch(r2ErrorSync.status.lastError, /StringToSign/);

  const missingObjectSync = new CommunityItemSync({
    enabled: true,
    downloadEnabled: true,
    uploadEnabled: false,
    manifestUrl: `http://127.0.0.1:${missingCommunityObjectPort}/items-manifest.json`,
    publicBaseUrl: `http://127.0.0.1:${missingCommunityObjectPort}`,
    statePath: path.join(tempDir, 'missing-object-sync-state.json')
  }, store, { atlasVersion: 'test' });
  assert.deepEqual(await missingObjectSync.downloadCommunityItems(), { downloaded: 0, imported: 0, skipped: 1 });
  assert.equal(missingObjectSync.status.lastError, 'Skipped 1 unavailable community item object.');
  assert.doesNotMatch(missingObjectSync.status.lastError, /doctype|svg|Object not found/);

  const missingManifestSync = new CommunityItemSync({
    enabled: true,
    downloadEnabled: true,
    uploadEnabled: false,
    manifestUrl: `http://127.0.0.1:${missingManifestPort}/items-manifest.json`,
    publicBaseUrl: `http://127.0.0.1:${missingManifestPort}`,
    statePath: path.join(tempDir, 'missing-manifest-sync-state.json')
  }, store, { atlasVersion: 'test' });
  assert.deepEqual(await missingManifestSync.downloadCommunityItems(), { downloaded: 0, imported: 0 });
  assert.equal(missingManifestSync.status.lastError, null);

  const preserveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pantheon-art-preserve-test-'));
  const preserveStore = openStore(path.join(preserveDir, 'test.sqlite'));
  preserveStore.upsertLootItem({
    observedAt: '2026-06-15T01:00:00.000Z',
    itemId: 'art-preserve-1',
    name: 'Art Preserve Helm',
    rarity: 'Rare',
    itemType: 'Armor',
    armorTypeName: 'Plate',
    requiredLevel: 8,
    flagsJson: JSON.stringify(['Magic']),
    statsJson: JSON.stringify({ statModifiers: [{ stat: 'Armor', value: 22 }] }),
    templateJson: JSON.stringify({
      itemId: 'art-preserve-1',
      itemName: 'Art Preserve Helm',
      itemType: 'Armor',
      rarity: 'Rare',
      armorTypeName: 'Plate',
      equipSlotName: 'Head',
      artUrl: 'https://shalazam.info/static/icons/SkollPantheonSprite/webp/3_Leather_head.webp',
      artSource: 'shalazam'
    })
  });
  preserveStore.upsertLootItem({
    observedAt: '2026-06-15T02:00:00.000Z',
    itemId: 'art-preserve-1',
    name: 'Art Preserve Helm',
    rarity: 'Rare',
    itemType: 'Armor',
    armorTypeName: 'Plate',
    requiredLevel: 8,
    flagsJson: JSON.stringify(['Magic']),
    statsJson: JSON.stringify({ statModifiers: [{ stat: 'Armor', value: 24 }] }),
    templateJson: JSON.stringify({
      itemId: 'art-preserve-1',
      itemName: 'Art Preserve Helm',
      itemType: 'Armor',
      rarity: 'Rare',
      armorTypeName: 'Plate',
      equipSlotName: 'Head'
    })
  });
  const preservedItem = getNormalizedItems(preserveStore.db, 10).find((item) => item.itemId === 'art-preserve-1');
  assert.equal(preservedItem.stats.Armor, 24);
  assert.equal(preservedItem.artUrl, 'https://shalazam.info/static/icons/SkollPantheonSprite/webp/3_Leather_head.webp');
  preserveStore.upsertLootItem({
    observedAt: '2026-06-15T03:00:00.000Z',
    itemId: 'art-index-1',
    name: 'Art Index Helm',
    rarity: 'Rare',
    itemType: 'Armor',
    armorTypeName: 'Plate',
    requiredLevel: 8,
    flagsJson: JSON.stringify(['Magic']),
    statsJson: JSON.stringify({ statModifiers: [{ stat: 'Armor', value: 18 }] }),
    templateJson: JSON.stringify({
      itemId: 'art-index-1',
      itemName: 'Art Index Helm',
      itemType: 'Armor',
      rarity: 'Rare',
      armorTypeName: 'Plate',
      equipSlotName: 'Head'
    })
  });
  writeItemArtIndex([{
    name: 'Art Index Helm',
    artUrl: 'https://shalazam.info/static/icons/SkollPantheonSprite/webp/Helm_38.webp',
    artSource: 'shalazam'
  }]);
  const indexedItem = getNormalizedItems(preserveStore.db, 10).find((item) => item.itemId === 'art-index-1');
  assert.equal(indexedItem.artUrl, 'https://shalazam.info/static/icons/SkollPantheonSprite/webp/Helm_38.webp');
  preserveStore.close();
  fs.rmSync(preserveDir, { recursive: true, force: true });

  store.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
  await close(server);
  await close(r2Server);
  await close(r2ErrorServer);
  await close(missingCommunityObjectServer);
  await close(missingManifestServer);
}

run().then(() => {
  console.log('item sync tests passed');
}).catch(async (error) => {
  console.error(error);
  await close(server).catch(() => {});
  await close(r2Server).catch(() => {});
  await close(r2ErrorServer).catch(() => {});
  await close(missingCommunityObjectServer).catch(() => {});
  await close(missingManifestServer).catch(() => {});
  process.exitCode = 1;
});
