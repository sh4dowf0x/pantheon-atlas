const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { applyCharacterSelection, chooseCharacter, discoverCharacterLogChoices, parseArgs, sanitizeCharacterName } = require('../src/app');

const args = parseArgs(['node', 'src/app.js', '--character', 'Arcaeus', '--port', '4000']);
assert.equal(args.character, 'Arcaeus');
assert.equal(args.port, 4000);

assert.equal(sanitizeCharacterName(' Nexerin '), 'Nexerin');
assert.equal(sanitizeCharacterName('Bad<Name>'), 'BadName');

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

async function runAsyncTests() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pantheon-app-test-'));
  const combatDir = path.join(tempDir, 'combat');
  const entityDir = path.join(tempDir, 'entities');
  fs.mkdirSync(combatDir, { recursive: true });
  fs.mkdirSync(entityDir, { recursive: true });
  fs.writeFileSync(path.join(combatDir, 'combat-live-Nexerin.jsonl'), '{}\n');
  fs.writeFileSync(path.join(combatDir, 'combat-live-Shadowfox.jsonl'), '{}\n');
  fs.writeFileSync(path.join(combatDir, 'combat-live-current.jsonl'), '{}\n');
  fs.writeFileSync(path.join(combatDir, 'combat-live-Nexerin.jsonl.previous'), '{}\n');
  fs.writeFileSync(path.join(entityDir, 'entities-live-Shadowfox.jsonl'), '{}\n');
  const discoveryConfig = {
    pantheon: { localPlayerName: 'Nexerin' },
    addonLogs: { liveFile: path.join(combatDir, 'combat-live-{character}.jsonl') },
    entityScannerLogs: { liveFile: path.join(entityDir, 'entities-live-{character}.jsonl') }
  };
  const choices = discoverCharacterLogChoices(discoveryConfig);
  assert.deepEqual(new Set(choices.map((choice) => choice.name)), new Set(['Nexerin', 'Shadowfox']));
  assert.equal(choices.find((choice) => choice.name === 'Shadowfox').combat.path, path.join(combatDir, 'combat-live-Shadowfox.jsonl'));
  assert.equal(choices.find((choice) => choice.name === 'Shadowfox').entity.path, path.join(entityDir, 'entities-live-Shadowfox.jsonl'));
  const nonInteractiveInput = { isTTY: false };
  assert.equal(await chooseCharacter(discoveryConfig, { input: nonInteractiveInput }), 'Nexerin');
  assert.equal(await chooseCharacter(discoveryConfig, { character: 'Sowplz', input: nonInteractiveInput }), 'Sowplz');
  fs.rmSync(tempDir, { recursive: true, force: true });
}

runAsyncTests().then(() => {
  console.log('app tests passed');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
