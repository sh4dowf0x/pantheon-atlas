const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { applyCharacterSelection, chooseCharacter, discoverCharacterLogChoices, parseArgs, sanitizeCharacterName } = require('../src/app');
const { EntityScannerLogIngestor, parseEntityScannerRecord } = require('../src/entityScannerLog');
const { REQUIRED_MOD_ASSETS, copyExtractedGameFolder, expandZip, requiredAssetsFromRelease } = require('../src/modDeploy');
const { openStore } = require('../src/store');

const args = parseArgs(['node', 'src/app.js', '--character', 'Arcaeus', '--port', '4000']);
assert.equal(args.character, 'Arcaeus');
assert.equal(args.port, 4000);

assert.equal(sanitizeCharacterName(' Nexerin '), 'Nexerin');
assert.equal(sanitizeCharacterName('Bad<Name>'), 'BadName');
assert.deepEqual(REQUIRED_MOD_ASSETS, [
  'PantheonCombatDataMod.zip',
  'PantheonEntityScannerMod.zip',
  'PantheonLootDataMod.zip'
]);
assert.deepEqual(requiredAssetsFromRelease({
  assets: REQUIRED_MOD_ASSETS.map((name) => ({ name, browser_download_url: `https://example.test/${name}`, size: 10 }))
}).map((asset) => asset.name), REQUIRED_MOD_ASSETS);
assert.throws(() => requiredAssetsFromRelease({ assets: [] }), /missing PantheonCombatDataMod\.zip/);

const scannerRecord = {
  TimestampUtc: '2026-06-30T12:00:00.000Z',
  EventType: 'Updated',
  EntityType: 'NPC',
  NetworkId: 42,
  Name: 'A Jacked Rabbit',
  Level: 4,
  X: 100,
  Y: 10,
  Z: 200,
  HealthCurrent: 50,
  HealthMax: 50,
  VeryLargeIgnoredField: 'x'.repeat(1000)
};
const scannerEvents = parseEntityScannerRecord(scannerRecord);
assert.equal(scannerEvents.some((event) => event.eventType === 'world_entity'), true);
assert.equal(scannerEvents.some((event) => event.eventType === 'health_update'), true);
assert.equal(scannerEvents.find((event) => event.eventType === 'world_entity').rawText.includes('VeryLargeIgnoredField'), false);

const insertedScannerEvents = [];
const scannerIngestor = new EntityScannerLogIngestor(
  { enabled: true, entityRepeatMs: 60000, entityMoveDistance: 4, healthRepeatMs: 15000 },
  { insertEvent: (event) => { insertedScannerEvents.push(event); return true; } }
);
scannerIngestor.ingestText(`${JSON.stringify(scannerRecord)}\n${JSON.stringify({
  ...scannerRecord,
  TimestampUtc: '2026-06-30T12:00:05.000Z'
})}\n${JSON.stringify({
  ...scannerRecord,
  TimestampUtc: '2026-06-30T12:00:10.000Z',
  X: 110
})}\n`);
assert.equal(insertedScannerEvents.filter((event) => event.eventType === 'world_entity').length, 2);
assert.equal(insertedScannerEvents.filter((event) => event.eventType === 'health_update').length, 1);

const config = {
  pantheon: { localPlayerName: 'Nexerin' },
  addonLogs: {
    liveFile: path.join('C:\\ProgramData', 'PantheonCombatData', 'combat-live-Nexerin.jsonl')
  },
  entityScannerLogs: {
    liveFile: path.join('C:\\ProgramData', 'PantheonEntityScanner', 'entities-live-Nexerin.jsonl')
  },
  lootLogs: {
    liveFile: path.join('C:\\ProgramData', 'PantheonLootData', 'loot-events-current.jsonl')
  }
};

applyCharacterSelection(config, 'Arcaeus');
assert.equal(config.pantheon.localPlayerName, 'Arcaeus');
assert.equal(config.addonLogs.liveFile, path.join('C:\\ProgramData', 'PantheonCombatData', 'combat-live-Arcaeus.jsonl'));
assert.equal(config.entityScannerLogs.liveFile, path.join('C:\\ProgramData', 'PantheonEntityScanner', 'entities-live-Arcaeus.jsonl'));
assert.equal(config.lootLogs.liveFile, path.join('C:\\ProgramData', 'PantheonLootData', 'loot-events-current.jsonl'));

const templated = {
  pantheon: {},
  addonLogs: { liveFile: 'C:\\logs\\combat-live-{character}.jsonl' },
  entityScannerLogs: { liveFile: 'C:\\logs\\entities-live-{character}.jsonl' },
  lootLogs: { liveFile: 'C:\\logs\\loot-events-{character}.jsonl' }
};
applyCharacterSelection(templated, 'Sowplz');
assert.equal(templated.addonLogs.liveFile, 'C:\\logs\\combat-live-Sowplz.jsonl');
assert.equal(templated.entityScannerLogs.liveFile, 'C:\\logs\\entities-live-Sowplz.jsonl');
assert.equal(templated.lootLogs.liveFile, 'C:\\logs\\loot-events-Sowplz.jsonl');

const currentSelection = {
  pantheon: {},
  addonLogs: { liveFile: 'C:\\logs\\combat-live-{character}.jsonl' },
  entityScannerLogs: { liveFile: 'C:\\logs\\entities-live-{character}.jsonl' }
};
applyCharacterSelection(currentSelection, 'Current');
assert.equal(currentSelection.pantheon.localPlayerName, 'Current');
assert.equal(currentSelection.addonLogs.liveFile, 'C:\\logs\\combat-live-current.jsonl');
assert.equal(currentSelection.entityScannerLogs.liveFile, 'C:\\logs\\entities-live-current.jsonl');

async function runAsyncTests() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pantheon-app-test-'));
  const zipDir = path.join(tempDir, 'zip-source');
  const zipExtractDir = path.join(tempDir, 'zip-extract');
  const fakePantheonDir = path.join(tempDir, 'fake-pantheon');
  fs.mkdirSync(path.join(zipDir, 'GameFolder', 'Mods', 'PantheonAddons'), { recursive: true });
  fs.writeFileSync(path.join(zipDir, 'GameFolder', 'Mods', 'PantheonAddons', 'CombatData.dll'), 'test');
  const zipPath = path.join(tempDir, 'Combat Data Test.zip');
  await new Promise((resolve, reject) => {
    const { execFile } = require('node:child_process');
    execFile('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Compress-Archive -LiteralPath ${JSON.stringify(path.join(zipDir, 'GameFolder'))} -DestinationPath ${JSON.stringify(zipPath)} -Force`
    ], { windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject(new Error(String(stderr || stdout || error.message).trim()));
      else resolve();
    });
  });
  await expandZip(zipPath, zipExtractDir);
  copyExtractedGameFolder(zipExtractDir, fakePantheonDir);
  assert.equal(fs.readFileSync(path.join(fakePantheonDir, 'Mods', 'PantheonAddons', 'CombatData.dll'), 'utf8'), 'test');

  const store = openStore(path.join(tempDir, 'retention.sqlite'));
  store.insertEvent({
    observedAt: '2026-06-30T10:00:00.000Z',
    eventType: 'world_entity',
    target: 'Old Mob',
    damageType: 'scanner:network:1',
    rawText: 'old',
    eventKey: 'old-world-entity'
  });
  const pruneResult = store.prune({ keepMinutes: 1, compact: true });
  assert.equal(pruneResult.deleted.gameEvents, 1);
  assert.equal(pruneResult.compacted, true);
  store.close();

  const combatDir = path.join(tempDir, 'combat');
  const entityDir = path.join(tempDir, 'entities');
  fs.mkdirSync(combatDir, { recursive: true });
  fs.mkdirSync(entityDir, { recursive: true });
  fs.writeFileSync(path.join(combatDir, 'combat-live-Nexerin.jsonl'), '{}\n');
  fs.writeFileSync(path.join(combatDir, 'combat-live-Shadowfox.jsonl'), '{}\n');
  fs.writeFileSync(path.join(combatDir, 'combat-live-current.jsonl'), '{}\n');
  fs.writeFileSync(path.join(combatDir, 'combat-live-Nexerin.jsonl.previous'), '{}\n');
  fs.writeFileSync(path.join(entityDir, 'entities-live-current.jsonl'), '{}\n');
  fs.writeFileSync(path.join(entityDir, 'entities-live-Shadowfox.jsonl'), '{}\n');
  const discoveryConfig = {
    pantheon: { localPlayerName: 'Nexerin' },
    addonLogs: { liveFile: path.join(combatDir, 'combat-live-{character}.jsonl') },
    entityScannerLogs: { liveFile: path.join(entityDir, 'entities-live-{character}.jsonl') }
  };
  const choices = discoverCharacterLogChoices(discoveryConfig);
  assert.deepEqual(new Set(choices.map((choice) => choice.name)), new Set(['Current', 'Nexerin', 'Shadowfox']));
  assert.equal(choices.find((choice) => choice.name === 'Current').combat.path, path.join(combatDir, 'combat-live-current.jsonl'));
  assert.equal(choices.find((choice) => choice.name === 'Current').entity.path, path.join(entityDir, 'entities-live-current.jsonl'));
  assert.equal(choices.find((choice) => choice.name === 'Shadowfox').combat.path, path.join(combatDir, 'combat-live-Shadowfox.jsonl'));
  assert.equal(choices.find((choice) => choice.name === 'Shadowfox').entity.path, path.join(entityDir, 'entities-live-Shadowfox.jsonl'));
  const nonInteractiveInput = { isTTY: false };
  assert.equal(await chooseCharacter(discoveryConfig, { input: nonInteractiveInput }), 'Nexerin');
  assert.equal(await chooseCharacter(discoveryConfig, { character: 'current', input: nonInteractiveInput }), 'Current');
  assert.equal(await chooseCharacter(discoveryConfig, { character: 'Sowplz', input: nonInteractiveInput }), 'Sowplz');
  fs.rmSync(tempDir, { recursive: true, force: true });
}

runAsyncTests().then(() => {
  console.log('app tests passed');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
