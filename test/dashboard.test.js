const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getAbilityRegistry, getEncounterReport, getHealingSummary, getLatestMapState, getLatestPositions, getMapCalibrationSamples, getMapCalibrationSummary, getMapEntityRows, getMobDetail, getMobSummary, getParserAbilityEvents, getParserSummary, getPositionRows, getRespawnDeathRows, getXpSummary, goblinLayerForY, inferLocalPlayerLevel, insertMapCalibrationSample, mapCalibrationLayerKeyForLabel, mapKeyForCoordinates, mapKeyForCoordinatesWithCalibration, mapKeyForZoneName } = require('../src/dashboard');
const { openStore } = require('../src/store');

assert.equal(mapKeyForZoneName("Wild's End"), 'kingsreach');
assert.equal(mapKeyForZoneName('Wilds End'), 'kingsreach');
assert.equal(mapKeyForZoneName('Eastern Plains'), 'kingsreach');
assert.equal(mapKeyForCoordinates(1643.4836, -319.8511, 611.70544), 'kingsreach');
assert.equal(mapKeyForCoordinates(1173.3392, -568.4042, 557.0091), 'kingsreach');
assert.equal(mapKeyForCoordinates(-196.531, -749.797, 692.234), 'kingsreach');
assert.equal(mapKeyForCoordinates(39.923, -246.19, 39.044), 'halnir_cave');
assert.equal(mapKeyForCoordinates(3153.199, 2583.487, 563.087), 'kingsreach');
assert.equal(mapKeyForCoordinates(3537.2983, 3299.7876, 509.21155), 'goblin_cave');
assert.equal(mapCalibrationLayerKeyForLabel('Surface road'), 'base');
assert.equal(mapCalibrationLayerKeyForLabel('Lower 2 Dungeon'), 'lower2');
assert.equal(goblinLayerForY(474), 'lower2');
assert.equal(goblinLayerForY(489), 'lower1');
assert.equal(goblinLayerForY(506), 'mid');
assert.equal(goblinLayerForY(522), 'upper');

assert.equal(inferLocalPlayerLevel([
  { entityId: 'mob10000', target: 'wildleaf poppywig', level: 1 },
  { entityId: 'mob20000', target: 'small jade daggertail', level: 1 }
], [
  { target: 'wildleaf poppywig', ability: 'indifferent | an evenly matched fight' },
  { target: 'small jade daggertail', ability: 'prepared to attack | an evenly matched fight' }
]), 1);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pantheon-dashboard-test-'));
const store = openStore(path.join(tempDir, 'test.sqlite'));
const calibrationSample = insertMapCalibrationSample(store.db, {
  observedAt: '2026-01-01T00:00:00.000Z',
  label: 'Upper dungeon',
  mapKey: 'goblin_cave',
  source: 'Nexee',
  x: 3537.2983,
  y: 509.21155,
  z: 3299.7876
});
assert.equal(calibrationSample.layerKey, 'upper');
assert.equal(getMapCalibrationSamples(store.db, { mapKey: 'goblin_cave' })[0].label, 'Upper dungeon');
assert.equal(getMapCalibrationSummary(store.db, { mapKey: 'goblin_cave' }).groups[0].count, 1);
insertMapCalibrationSample(store.db, {
  observedAt: '2026-01-01T00:00:01.000Z',
  label: 'surface-hills',
  mapKey: 'kingsreach',
  layerKey: 'base',
  x: 3537.2983,
  y: 535.21155,
  z: 3299.7876
});
insertMapCalibrationSample(store.db, {
  observedAt: '2026-01-01T00:00:02.000Z',
  label: 'mid',
  mapKey: 'goblin_cave',
  layerKey: 'mid',
  x: 3537.2983,
  y: 506.21155,
  z: 3299.7876
});
assert.equal(mapKeyForCoordinates(3537.2983, 3299.7876, 535.21155), 'goblin_cave');
assert.equal(mapKeyForCoordinatesWithCalibration(store.db, 3537.2983, 3299.7876, 535.21155), 'kingsreach');
assert.equal(mapKeyForCoordinatesWithCalibration(store.db, 3537.2983, 3299.7876, 506.21155), 'goblin_cave');
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Polona',
  target: 'vineweaver spider',
  ability: 'Sparking Bolt (estimated)',
  amount: 9,
  damageType: 'mob10000',
  rawText: 'vineweaver spider hp 22 -> 13 after Sparking Bolt (estimated)',
  eventKey: 'health-delta-damage-test'
});
const summary = getParserSummary(store.db, 300);
assert.equal(summary.totals.damage, 0);
assert.equal(summary.combatants.length, 0);
assert.equal(summary.recentEvents[0].ability, 'Health delta (estimated)');
assert.equal(summary.recentEvents[0].rawText, 'vineweaver spider took 9.0 observed damage');

store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'healing',
  source: 'Bastion',
  target: 'Katja',
  ability: 'Renewal',
  amount: 18,
  damageType: 'Healing',
  rawText: 'Bastion healed Katja for 18 with Renewal.',
  eventKey: 'healing-meter-test-1'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'healing',
  source: 'Bastion',
  target: 'Tina',
  ability: 'Renewal',
  amount: 12,
  damageType: 'Healing',
  rawText: 'Bastion healed Tina for 12 with Renewal.',
  eventKey: 'healing-meter-test-2'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'healing',
  source: 'Polona',
  target: 'Jessa',
  ability: 'Minor Mend',
  amount: 8,
  damageType: 'Healing',
  rawText: 'Polona healed Jessa for 8 with Minor Mend.',
  eventKey: 'healing-meter-test-3'
});
const healingSummary = getHealingSummary(store.db, 300);
assert.equal(healingSummary.totals.healing, 38);
assert.equal(healingSummary.combatants[0].source, 'Bastion');
assert.equal(healingSummary.combatants[0].healing, 30);
assert.ok(healingSummary.combatants[0].abilities.includes('Renewal'));

const respawnBase = Date.now() - 45_000;
store.insertEvent({
  observedAt: new Date(respawnBase).toISOString(),
  eventType: 'kill',
  target: 'Larcs the Weaponsmith',
  rawText: 'You have slain Larcs the Weaponsmith.',
  eventKey: 'respawn-kill-larcs-test'
});
store.insertEvent({
  observedAt: new Date(respawnBase + 1000).toISOString(),
  eventType: 'health_update',
  target: 'Larcs the Weaponsmith',
  amount: 0,
  ability: '1530',
  damageType: 'larcs0000',
  rawText: 'Larcs the Weaponsmith health 0/1530',
  eventKey: 'respawn-health-larcs-test'
});
const respawnDeaths = getRespawnDeathRows(store.db, 300);
assert.equal(respawnDeaths.rows[0].target, 'Larcs the Weaponsmith');
assert.ok(respawnDeaths.rows.some((row) => row.eventType === 'kill'));

const goblinStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pantheon-goblin-map-state-test-'));
const goblinStateStore = openStore(path.join(goblinStateDir, 'test.sqlite'));
goblinStateStore.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'position_update',
  source: 'Nexee',
  target: 'Nexee',
  damageType: 'scanner:character:7396',
  x: 3537.2983,
  y: 509.21155,
  z: 3299.7876,
  heading: 214.41077,
  rawText: '[EntityScanner] Nexee local position 3537.2983 509.21155 3299.7876',
  eventKey: 'goblin-cave-position-state-test'
});
goblinStateStore.insertEvent({
  observedAt: new Date(Date.now() + 1000).toISOString(),
  eventType: 'health_update',
  source: null,
  target: 'rockbone tunneler',
  ability: '1530',
  amount: 1530,
  damageType: 'scanner:network:8138',
  rawText: '[EntityScanner] rockbone tunneler health 1530/1530',
  eventKey: 'goblin-cave-health-state-test'
});
const goblinState = getLatestMapState(goblinStateStore.db);
assert.equal(goblinState.mapKey, 'goblin_cave');
assert.equal(goblinState.zoneName, 'Goblin Cave');
goblinStateStore.close();

const xpBase = Date.now() - 120_000;
store.insertEvent({
  observedAt: new Date(xpBase - 12_000).toISOString(),
  eventType: 'local_player',
  source: 'Nexee',
  target: 'Human Wizard',
  ability: 'Level 14',
  damageType: 'addon:7396',
  rawText: 'Local: Nexee L14 Human Wizard CharacterId=7396',
  eventKey: 'xp-local-player-test'
});
store.insertEvent({
  observedAt: new Date(xpBase - 10_000).toISOString(),
  eventType: 'world_entity',
  source: 'Nexee',
  target: 'timber wolf',
  ability: 'entityKind:mob',
  amount: 8,
  damageType: 'wolf10000',
  rawText: 'timber wolf position 12.0 3.0 -8.0',
  eventKey: 'xp-world-entity-test'
});
store.insertEvent({
  observedAt: new Date(xpBase - 5000).toISOString(),
  eventType: 'damage_estimate',
  source: 'Nexee',
  target: 'timber wolf',
  ability: 'Sparking Bolt',
  amount: 44,
  damageType: 'Shock',
  rawText: 'Nexee dealt 44 Shock damage to timber wolf with Sparking Bolt.',
  eventKey: 'xp-damage-context-test'
});
store.insertEvent({
  observedAt: new Date(xpBase).toISOString(),
  eventType: 'experience',
  source: 'Nexee',
  ability: 'Progress 64.93%',
  amount: 603,
  damageType: '25528/39317',
  x: 25528,
  y: 39317,
  z: 0.64928657,
  heading: 24925,
  rawText: 'XP current=25528 delta=603 toNext=39317 percent=0.6493 deltaPercent=0.0153',
  eventKey: 'xp-summary-test'
});
const xpSummary = getXpSummary(store.db, 300);
assert.equal(xpSummary.totals.xp, 603);
assert.equal(xpSummary.latest.currentXp, 25528);
assert.equal(xpSummary.latest.remainingXp, 13789);
assert.equal(xpSummary.latest.progressPercent, 64.93);
assert.equal(xpSummary.rows[0].target, 'timber wolf');
assert.equal(xpSummary.rows[0].targetLevel, 8);
assert.equal(xpSummary.rows[0].playerLevel, 14);
assert.equal(xpSummary.targets[0].target, 'timber wolf');
assert.equal(xpSummary.targets[0].xp, 603);

const encounterBase = Date.now() - 60_000;
store.insertEvent({
  observedAt: new Date(encounterBase - 1000).toISOString(),
  eventType: 'world_entity',
  source: 'Nexerin',
  target: 'woodland spider',
  ability: 'entityKind:mob',
  amount: 4,
  damageType: 'scanner:network:spider',
  rawText: 'woodland spider position 12.0 3.0 -8.0',
  eventKey: 'encounter-world-entity-1'
});
store.insertEvent({
  observedAt: new Date(encounterBase).toISOString(),
  eventType: 'damage_estimate',
  source: 'Nexerin',
  target: 'woodland spider',
  ability: 'Sparking Bolt',
  amount: 42,
  damageType: 'Fire',
  rawText: 'Nexerin dealt 42 Fire damage to woodland spider with Sparking Bolt.',
  eventKey: 'encounter-damage-1'
});
store.insertEvent({
  observedAt: new Date(encounterBase + 4000).toISOString(),
  eventType: 'damage_estimate',
  source: 'Arcaeus',
  target: 'woodland spider',
  ability: 'Slash',
  amount: 18,
  damageType: 'Physical',
  rawText: 'Arcaeus dealt 18 Physical damage to woodland spider with Slash.',
  eventKey: 'encounter-damage-2'
});
store.insertEvent({
  observedAt: new Date(encounterBase + 5000).toISOString(),
  eventType: 'ability_resist',
  source: 'Nexerin',
  target: 'woodland spider',
  ability: 'Blast of Cold',
  rawText: "Nexerin's Blast of Cold was fully resisted by woodland spider.",
  eventKey: 'encounter-resist-1'
});
store.insertEvent({
  observedAt: new Date(encounterBase + 7000).toISOString(),
  eventType: 'damage_estimate',
  source: 'woodland spider',
  target: 'Arcaeus',
  ability: 'Hidden Fang',
  amount: 11,
  damageType: 'Poison',
  rawText: 'woodland spider dealt 11 Poison damage to Arcaeus with Hidden Fang.',
  eventKey: 'encounter-enemy-damage-1'
});
store.insertEvent({
  observedAt: new Date(encounterBase + 9000).toISOString(),
  eventType: 'healing',
  source: 'Bastion',
  target: 'Arcaeus',
  ability: 'Renewal',
  amount: 16,
  damageType: 'Healing',
  rawText: 'Bastion healed Arcaeus for 16 with Renewal.',
  eventKey: 'encounter-healing-1'
});
const encounterReport = getEncounterReport(store.db, 300);
assert.equal(encounterReport.selected.target, 'woodland spider');
assert.equal(encounterReport.selected.totals.damage, 60);
assert.equal(encounterReport.selected.damageBySource.find((row) => row.source === 'Nexerin').total, 42);
assert.equal(encounterReport.selected.enemyDamageByAbility[0].ability, 'Hidden Fang');
assert.equal(encounterReport.selected.healingBySource.find((row) => row.source === 'Bastion').total, 16);
assert.equal(encounterReport.selected.resistedAbilities[0].ability, 'Blast of Cold');

const duplicateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pantheon-dashboard-duplicate-test-'));
const duplicateStore = openStore(path.join(duplicateDir, 'test.sqlite'));
const duplicateObservedAt = new Date().toISOString();
duplicateStore.insertEvent({
  observedAt: duplicateObservedAt,
  eventType: 'damage_estimate',
  source: 'Nexerin',
  target: 'thicketshade fox',
  ability: 'Combustion',
  amount: 54,
  damageType: 'Fire',
  rawText: '[CombatDamageOutgoing] Combat Damage: [Outgoing/Damage/Self] Nexerin dealt 54 Fire damage to thicketshade fox with Combustion. (13 mitigated)',
  eventKey: 'addon-combat-dedupe-damage'
});
duplicateStore.insertEvent({
  observedAt: duplicateObservedAt,
  eventType: 'damage_estimate',
  source: 'Player',
  target: 'Unknown entity 546c0200',
  ability: 'Unknown ability (estimated)',
  amount: 54,
  damageType: 'Fire',
  rawText: 'Unknown entity 546c0200 took 54 (13 mitigated) from Unknown ability (estimated)',
  eventKey: 'packet-combat-dedupe-damage'
});
duplicateStore.insertEvent({
  observedAt: duplicateObservedAt,
  eventType: 'mitigation_estimate',
  source: 'Nexerin',
  target: 'thicketshade fox',
  ability: 'Combustion',
  amount: 13,
  damageType: 'Fire',
  rawText: '[CombatDamageOutgoing] Combat Damage: [Outgoing/Damage/Self] Nexerin dealt 54 Fire damage to thicketshade fox with Combustion. (13 mitigated)',
  eventKey: 'addon-combat-dedupe-mitigation'
});
duplicateStore.insertEvent({
  observedAt: duplicateObservedAt,
  eventType: 'mitigation_estimate',
  source: 'Player',
  target: 'Unknown entity 546c0200',
  ability: 'Unknown ability (estimated)',
  amount: 13,
  damageType: 'Fire',
  rawText: 'Unknown entity 546c0200 mitigated 13 from Unknown ability (estimated)',
  eventKey: 'packet-combat-dedupe-mitigation'
});
const duplicateSummary = getParserSummary(duplicateStore.db, 300);
assert.equal(duplicateSummary.totals.damage, 54);
assert.equal(duplicateSummary.combatants.length, 1);
assert.equal(duplicateSummary.combatants[0].source, 'Nexerin');
assert.equal(duplicateSummary.combatants[0].damage, 54);
assert.equal(duplicateSummary.combatants[0].mitigated, 13);
assert.equal(duplicateSummary.combatants[0].className, 'Wizard');
assert.equal(duplicateSummary.recentEvents.some((event) => event.source === 'Player' && event.eventType === 'damage_estimate'), false);
const learnedAbilities = getAbilityRegistry(duplicateStore.db, 20);
const combustion = learnedAbilities.find((row) => row.abilityName === 'Combustion');
assert.equal(combustion.className, 'Wizard');
assert.equal(combustion.category, 'direct');
assert.equal(combustion.damageType, 'Fire');
assert.equal(combustion.seenCount, 1);
duplicateStore.close();
fs.rmSync(duplicateDir, { recursive: true, force: true });

const localAliasDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pantheon-dashboard-local-alias-test-'));
const localAliasStore = openStore(path.join(localAliasDir, 'test.sqlite'));
localAliasStore.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'local_player',
  source: 'Nexerin',
  target: 'Human Wizard',
  ability: 'Level 20',
  damageType: 'addon:3950',
  rawText: 'Local: Nexerin L20 Human Wizard CharacterId=3950',
  eventKey: 'local-alias-player'
});
localAliasStore.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Player',
  target: 'training dummy',
  ability: 'Unknown ability (estimated)',
  amount: 12,
  damageType: 'Fire',
  rawText: 'training dummy took 12 from Unknown ability (estimated)',
  eventKey: 'local-alias-packet-damage'
});
const localAliasSummary = getParserSummary(localAliasStore.db, 300);
assert.equal(localAliasSummary.combatants.length, 1);
assert.equal(localAliasSummary.combatants[0].source, 'Nexerin');
localAliasStore.close();
fs.rmSync(localAliasDir, { recursive: true, force: true });

const localPositionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pantheon-dashboard-local-position-test-'));
const localPositionStore = openStore(path.join(localPositionDir, 'test.sqlite'));
localPositionStore.insertEvent({
  observedAt: new Date(Date.now() - 4000).toISOString(),
  eventType: 'local_player',
  source: 'Nexerin',
  target: 'Human Wizard',
  ability: 'Level 20',
  damageType: 'addon:3950',
  rawText: 'Local: Nexerin L20 Human Wizard CharacterId=3950',
  eventKey: 'local-position-current-player'
});
localPositionStore.insertEvent({
  observedAt: new Date(Date.now() - 3000).toISOString(),
  eventType: 'position_update',
  source: 'Danzig',
  target: 'Danzig',
  damageType: '1e940000',
  x: 40.824,
  y: 39.044,
  z: -244.374,
  rawText: 'Danzig position 40.824 39.044 -244.374',
  eventKey: 'local-position-danzig'
});
localPositionStore.insertEvent({
  observedAt: new Date(Date.now() - 2000).toISOString(),
  eventType: 'player_position',
  source: 'Nexerin',
  target: 'Nexerin',
  damageType: '1e940000',
  x: 40.824,
  y: 39.044,
  z: -244.374,
  rawText: 'Nexerin player position 40.824 39.044 -244.374',
  eventKey: 'local-position-nexerin'
});
localPositionStore.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'player_position',
  source: 'Sowplz',
  target: 'Sowplz',
  damageType: '22940000',
  x: 42.475,
  y: 39.044,
  z: -245.383,
  rawText: 'Sowplz player position 42.475 39.044 -245.383',
  eventKey: 'local-position-other-player'
});
localPositionStore.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'position_update',
  source: 'Sowplz',
  target: 'Sowplz',
  damageType: '22940000',
  x: 42.475,
  y: 39.044,
  z: -245.383,
  rawText: 'Sowplz position 42.475 39.044 -245.383',
  eventKey: 'local-position-other-player-position'
});
const localPositionRows = getPositionRows(localPositionStore.db, 10);
const correctedLocalPosition = localPositionRows.find((row) => row.entityId === '1e940000');
assert.equal(correctedLocalPosition.source, 'Nexerin');
assert.equal(correctedLocalPosition.target, 'Nexerin');
const latestLocalPositions = getLatestPositions(localPositionStore.db, 10);
assert.equal(latestLocalPositions[0].source, 'Nexerin');
assert.equal(latestLocalPositions[0].entityId, '1e940000');
localPositionStore.close();
fs.rmSync(localPositionDir, { recursive: true, force: true });

const selfCombatPositionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pantheon-dashboard-self-combat-position-test-'));
const selfCombatPositionStore = openStore(path.join(selfCombatPositionDir, 'test.sqlite'));
selfCombatPositionStore.insertEvent({
  observedAt: new Date(Date.now() - 4000).toISOString(),
  eventType: 'damage_estimate',
  source: 'Nexerin',
  target: 'Drawn Ravager',
  ability: 'Combustion',
  amount: 54,
  damageType: 'Fire',
  rawText: '[CombatDamageOutgoing] Combat Damage: [Outgoing/Damage/Self] Nexerin dealt 54 Fire damage to Drawn Ravager with Combustion',
  eventKey: 'self-combat-position-local-damage'
});
selfCombatPositionStore.insertEvent({
  observedAt: new Date(Date.now() - 3000).toISOString(),
  eventType: 'position_update',
  source: 'Danzig',
  target: 'Danzig',
  damageType: '1e940000',
  x: 40.824,
  y: 39.044,
  z: -244.374,
  rawText: 'Danzig position 40.824 39.044 -244.374',
  eventKey: 'self-combat-position-danzig'
});
selfCombatPositionStore.insertEvent({
  observedAt: new Date(Date.now() - 2000).toISOString(),
  eventType: 'player_position',
  source: 'Nexerin',
  target: 'Nexerin',
  damageType: '1e940000',
  x: 40.824,
  y: 39.044,
  z: -244.374,
  rawText: 'Nexerin player position 40.824 39.044 -244.374',
  eventKey: 'self-combat-position-nexerin'
});
selfCombatPositionStore.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'position_update',
  source: 'Sowplz',
  target: 'Sowplz',
  damageType: '22940000',
  x: 42.475,
  y: 39.044,
  z: -245.383,
  rawText: 'Sowplz position 42.475 39.044 -245.383',
  eventKey: 'self-combat-position-other-player-position'
});
const selfCombatLocalRows = getPositionRows(selfCombatPositionStore.db, 10);
const selfCombatCorrectedLocal = selfCombatLocalRows.find((row) => row.entityId === '1e940000');
assert.equal(selfCombatCorrectedLocal.source, 'Nexerin');
assert.equal(selfCombatCorrectedLocal.target, 'Nexerin');
const selfCombatLatestPositions = getLatestPositions(selfCombatPositionStore.db, 10);
assert.equal(selfCombatLatestPositions[0].source, 'Nexerin');
assert.equal(selfCombatLatestPositions[0].entityId, '1e940000');
selfCombatPositionStore.close();
fs.rmSync(selfCombatPositionDir, { recursive: true, force: true });

const anonymousClientPositionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pantheon-dashboard-anonymous-client-position-test-'));
const anonymousClientPositionStore = openStore(path.join(anonymousClientPositionDir, 'test.sqlite'));
anonymousClientPositionStore.insertEvent({
  observedAt: new Date(Date.now() - 1000).toISOString(),
  eventType: 'position_update',
  source: 'Player',
  target: 'Player',
  damageType: 'fa2b0000',
  x: 3244.742,
  y: 534.643,
  z: 1756.223,
  rawText: 'Player position 3244.742 534.643 1756.223 heading 125.06 raw 22767',
  eventKey: 'anonymous-client-local-position'
});
anonymousClientPositionStore.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'player_position',
  source: 'Enchantingtricky',
  target: 'Enchantingtricky',
  damageType: 'b5200000',
  x: 3270.004,
  y: 576.871,
  z: 2001.157,
  rawText: 'Enchantingtricky player position 3270.004 576.871 2001.157',
  eventKey: 'anonymous-client-other-player-position'
});
const anonymousClientLatest = getLatestPositions(anonymousClientPositionStore.db, 10);
assert.equal(anonymousClientLatest[0].entityId, 'fa2b0000');
assert.equal(anonymousClientLatest[0].source, 'Player');
anonymousClientPositionStore.close();
fs.rmSync(anonymousClientPositionDir, { recursive: true, force: true });

const freshScannerLocalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pantheon-dashboard-fresh-scanner-local-test-'));
const freshScannerLocalStore = openStore(path.join(freshScannerLocalDir, 'test.sqlite'));
freshScannerLocalStore.insertEvent({
  observedAt: new Date(Date.now() - 120_000).toISOString(),
  eventType: 'player_position',
  source: 'Nexee',
  target: 'Nexee',
  damageType: 'scanner:network:3171',
  x: 3544.0623,
  y: 514.0068,
  z: 3308.9514,
  rawText: '[EntityScanner] Nexee player position 3544.0623 514.0068 3308.9514',
  eventKey: 'fresh-scanner-local-old-player-position'
});
freshScannerLocalStore.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'position_update',
  source: 'Nexee',
  target: 'Nexee',
  damageType: 'scanner:character:7396',
  x: 3380.5613,
  y: 473.7861,
  z: 3116.2363,
  rawText: '[EntityScanner] Nexee local position 3380.5613 473.7861 3116.2363',
  eventKey: 'fresh-scanner-local-current-position'
});
const freshScannerLatest = getLatestPositions(freshScannerLocalStore.db, 10);
assert.equal(freshScannerLatest[0].source, 'Nexee');
assert.equal(freshScannerLatest[0].entityId, 'scanner:character:7396');
freshScannerLocalStore.close();
fs.rmSync(freshScannerLocalDir, { recursive: true, force: true });

const classTruthDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pantheon-dashboard-class-truth-test-'));
const classTruthStore = openStore(path.join(classTruthDir, 'test.sqlite'));
const classTruthObservedAt = new Date().toISOString();
for (const [index, event] of [
  { source: 'Maggie', target: 'Drawn Cabalist', ability: 'Strange Magic', amount: 14, damageType: 'Magic' },
  { source: 'Mezzalina', target: 'Zthir the Foul', ability: 'Mind Vice II', amount: 22, damageType: 'Magic' },
  { source: 'Yipes', target: 'Drawn Stalker', ability: 'Veiled Strike II', amount: 18, damageType: 'Physical' },
  { source: 'Anitadagger', target: 'Drawn Stalker', ability: 'Lucky Strike', amount: 12, damageType: 'Physical' },
  { source: 'Voraner', target: 'Drawn Cabalist', ability: 'Wind Blade II', amount: 14, damageType: 'Physical' },
  { source: 'Voraner', target: 'Drawn Cabalist', ability: 'Tempest I', amount: 11, damageType: 'Physical' },
  { source: 'Voraner', target: 'Drawn Cabalist', ability: 'Galestrike I', amount: 13, damageType: 'Physical' },
  { source: 'Zotik', target: 'Drawn Cabalist', ability: 'Mana Spike', amount: 22, damageType: 'Magic' },
  { source: 'Zotik', target: 'Drawn Cabalist', ability: 'Blast of Magic', amount: 9, damageType: 'Magic' },
  { source: 'Zotik', target: 'Drawn Cabalist', ability: 'Mana Burst', amount: 18, damageType: 'Magic' },
  { source: 'Drawn Cabalist', target: 'Maggie', ability: 'Auto Attack', amount: 4, damageType: 'Physical' },
  { source: 'Zthir the Foul', target: 'Mezzalina', ability: 'Auto Attack', amount: 6, damageType: 'Physical' },
  { source: 'Celis Creeper', target: 'Maggie', ability: 'Auto Attack', amount: 5, damageType: 'Physical' },
  { source: 'Celis Creeper Matriarch', target: 'Maggie', ability: 'Mind Vice II', amount: 22, damageType: 'Magic' },
  { source: 'Psyrachnid Weaver', target: 'Maggie', ability: 'Veiled Strike II', amount: 18, damageType: 'Physical' },
  { source: 'Nexerin', target: 'grimling', ability: 'Sparking Bolt', amount: 44, damageType: 'Shock' },
  { source: 'Nexerin', target: 'grimling', ability: 'Blast of Cold', amount: 42, damageType: 'Cold' },
  { source: 'Nexerin', target: 'grimling', ability: 'Radiate Heat', amount: 40, damageType: 'Fire' }
].entries()) {
  classTruthStore.insertEvent({
    observedAt: classTruthObservedAt,
    eventType: 'damage_estimate',
    rawText: `${event.source} dealt ${event.amount} ${event.damageType} damage to ${event.target} with ${event.ability}.`,
    eventKey: `class-truth-${index}`,
    ...event
  });
}
const classTruthSummary = getParserSummary(classTruthStore.db, 300);
assert.equal(classTruthSummary.combatants.find((row) => row.source === 'Maggie').className, 'Enchanter');
assert.equal(classTruthSummary.combatants.find((row) => row.source === 'Mezzalina').className, 'Enchanter');
assert.equal(classTruthSummary.combatants.find((row) => row.source === 'Yipes').className, 'Rogue');
assert.equal(classTruthSummary.combatants.find((row) => row.source === 'Anitadagger').className, 'Rogue');
assert.equal(classTruthSummary.combatants.find((row) => row.source === 'Voraner').className, 'Summoner Pet');
assert.equal(classTruthSummary.combatants.find((row) => row.source === 'Zotik').className, 'Summoner Pet');
assert.equal(classTruthSummary.combatants.find((row) => row.source === 'Drawn Cabalist').className, 'Mob');
assert.equal(classTruthSummary.combatants.find((row) => row.source === 'Zthir the Foul').className, 'Mob');
assert.equal(classTruthSummary.combatants.find((row) => row.source === 'Celis Creeper').className, 'Mob');
assert.equal(classTruthSummary.combatants.find((row) => row.source === 'Celis Creeper Matriarch').className, 'Mob');
assert.equal(classTruthSummary.combatants.find((row) => row.source === 'Psyrachnid Weaver').className, 'Mob');
assert.equal(classTruthSummary.combatants.find((row) => row.source === 'Nexerin').className, 'Wizard');
const classTruthAbilities = getAbilityRegistry(classTruthStore.db, 20);
assert.equal(classTruthAbilities.find((row) => row.abilityName === 'Sparking Bolt').className, 'Wizard');
assert.equal(classTruthAbilities.find((row) => row.abilityName === 'Blast of Cold').className, 'Wizard');
assert.equal(classTruthAbilities.find((row) => row.abilityName === 'Radiate Heat').className, 'Wizard');
const sparkingHistory = getParserAbilityEvents(classTruthStore.db, 300, 'Nexerin', 'Sparking Bolt', '', 10);
assert.equal(sparkingHistory.length, 1);
assert.equal(sparkingHistory[0].rawText, 'Nexerin dealt 44 Shock damage to grimling with Sparking Bolt.');
assert.equal(classTruthAbilities.find((row) => row.abilityName === 'Wind Blade II').className, 'Summoner Pet');
assert.equal(classTruthAbilities.find((row) => row.abilityName === 'Tempest I').className, 'Summoner Pet');
assert.equal(classTruthAbilities.find((row) => row.abilityName === 'Galestrike I').petFamily, 'Air Arcamental');
assert.equal(classTruthAbilities.find((row) => row.abilityName === 'Wind Blade II').petFamily, 'Air Arcamental');
assert.equal(classTruthAbilities.find((row) => row.abilityName === 'Tempest I').petFamily, 'Air Arcamental');
assert.equal(classTruthAbilities.find((row) => row.abilityName === 'Mana Spike').className, 'Summoner Pet');
assert.equal(classTruthAbilities.find((row) => row.abilityName === 'Mana Spike').petFamily, 'Fury Arcament');
assert.equal(classTruthAbilities.find((row) => row.abilityName === 'Blast of Magic').petFamily, 'Fury Arcament');
assert.equal(classTruthAbilities.find((row) => row.abilityName === 'Mana Burst').petFamily, 'Fury Arcament');
assert.equal(classTruthAbilities.find((row) => row.abilityName === 'Lucky Strike').className, 'Rogue');
classTruthStore.close();
fs.rmSync(classTruthDir, { recursive: true, force: true });

store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Katja',
  target: 'jungle goblin thrasher',
  ability: 'Storm I (estimated)',
  amount: 7,
  damageType: 'Physical',
  rawText: 'jungle goblin thrasher took 7 (2 mitigated) from Storm I (estimated)',
  eventKey: 'katja-storm-class-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Katja',
  target: 'jungle goblin thrasher',
  ability: 'Mocking Blow II (estimated)',
  amount: 7,
  damageType: 'Physical',
  rawText: 'jungle goblin thrasher took 7 (2 mitigated) from Mocking Blow II (estimated)',
  eventKey: 'katja-mocking-blow-class-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Katja',
  target: 'jungle goblin thrasher',
  ability: 'Assault I (estimated)',
  amount: 11,
  damageType: 'Physical',
  rawText: 'jungle goblin thrasher took 11 (3 mitigated) from Assault I (estimated)',
  eventKey: 'katja-assault-class-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Katja',
  target: 'jungle goblin thrasher',
  ability: 'Commanding Strike II (estimated)',
  amount: 14,
  damageType: 'Physical',
  rawText: 'jungle goblin thrasher took 14 (4 mitigated) from Commanding Strike II (estimated)',
  eventKey: 'katja-commanding-strike-class-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Rhea',
  target: 'ashveil wasp',
  ability: 'Unknown ability (estimated)',
  amount: 23,
  damageType: 'Nature',
  rawText: 'ashveil wasp took 23 (13 mitigated) from Unknown ability (estimated)',
  eventKey: 'rhea-ignite-i-class-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Rhea',
  target: 'ashveil wasp',
  ability: 'Unknown ability (estimated)',
  amount: 4,
  damageType: 'Physical',
  rawText: 'ashveil wasp took 4 (1 mitigated) from Unknown ability (estimated)',
  eventKey: 'rhea-auto-attack-class-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Jessa',
  target: 'jungle goblin thrasher',
  ability: 'Conjure Bolt I (estimated)',
  amount: 23,
  damageType: 'Nature',
  rawText: 'jungle goblin thrasher took 23 (4 mitigated) from Conjure Bolt I (estimated)',
  eventKey: 'jessa-conjure-bolt-class-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Jessa',
  target: 'jungle goblin thrasher',
  ability: 'Ignite II (estimated)',
  amount: 6,
  damageType: 'Nature',
  rawText: 'jungle goblin thrasher took 6 (1 mitigated) from Ignite II (estimated)',
  eventKey: 'jessa-ignite-ii-class-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Jessa',
  target: 'jungle goblin thrasher',
  ability: 'Stinging Swarm I (estimated)',
  amount: 9,
  damageType: 'Nature',
  rawText: 'jungle goblin thrasher took 9 (1 mitigated) from Stinging Swarm I (estimated)',
  eventKey: 'jessa-stinging-swarm-class-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Polona',
  target: 'twilight prowler',
  ability: 'Unknown ability (estimated)',
  amount: 20,
  damageType: 'mob15000',
  rawText: 'twilight prowler took 20 (5 mitigated) from Unknown ability (estimated)',
  eventKey: 'polona-strange-magic-ii-class-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Polona',
  target: 'twilight prowler',
  ability: 'Unknown ability (estimated)',
  amount: 26,
  damageType: 'mob15001',
  rawText: 'twilight prowler took 26 (6 mitigated) from Unknown ability (estimated)',
  eventKey: 'polona-mind-vice-ii-class-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Polona',
  target: 'feraling soul-mender',
  ability: 'Mind Vice I (estimated)',
  amount: 21,
  damageType: 'feraling20000',
  rawText: 'feraling soul-mender took 21 (5 mitigated) from Mind Vice I (estimated)',
  eventKey: 'enchanter-class-test-mind-vice-i'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Polona',
  target: 'feraling soul-mender',
  ability: 'Mind Vice II (estimated)',
  amount: 21,
  damageType: 'feraling20001',
  rawText: 'feraling soul-mender took 21 (5 mitigated) from Mind Vice II (estimated)',
  eventKey: 'enchanter-class-test-mind-vice-ii'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Polona',
  target: 'feraling soul-mender',
  ability: 'Strange Magic II (estimated)',
  amount: 14,
  damageType: 'feraling20002',
  rawText: 'feraling soul-mender took 14 (3 mitigated) from Strange Magic II (estimated)',
  eventKey: 'enchanter-class-test-strange-magic'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Polona',
  target: 'feraling soul-mender',
  ability: 'Strange Magic (estimated)',
  amount: 14,
  damageType: 'feraling20003',
  rawText: 'feraling soul-mender took 14 (3 mitigated) from Strange Magic (estimated)',
  eventKey: 'enchanter-class-test-strange-magic-raw'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Nexendia',
  target: 'wildleaf poppywig',
  ability: 'Blast Creation II (estimated)',
  amount: 15,
  damageType: 'mob20000',
  rawText: 'wildleaf poppywig took 15 (4 mitigated) from Blast Creation II (estimated)',
  eventKey: 'blast-creation-class-test-ii'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Nexendia',
  target: 'ashveil wasp',
  ability: 'Unknown ability (estimated)',
  amount: 44,
  damageType: 'mob25000',
  rawText: 'ashveil wasp took 44 (11 mitigated) from Unknown ability (estimated)',
  eventKey: 'blast-creation-class-test-ii-high'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Nexendia',
  target: 'wildleaf poppywig',
  ability: 'Blast Creation X (estimated)',
  amount: 18,
  damageType: 'mob30000',
  rawText: 'wildleaf poppywig took 18 (4 mitigated) from Blast Creation X (estimated)',
  eventKey: 'blast-creation-class-test-x'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Nexendia',
  target: 'nylem hatchling',
  ability: 'Aether Shards (estimated)',
  amount: 14,
  damageType: 'mob35000',
  rawText: 'nylem hatchling took 14 (3 mitigated) from Aether Shards (estimated)',
  eventKey: 'aether-shards-class-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Nexendia',
  target: 'nylem hatchling',
  ability: 'Clash Charge (estimated)',
  amount: 26,
  damageType: 'mob40000',
  rawText: 'nylem hatchling took 26 (6 mitigated) from Clash Charge (estimated)',
  eventKey: 'clash-charge-class-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Nexendia',
  target: 'nylem hatchling',
  ability: 'Frail Mana Bomb (estimated)',
  amount: 16,
  damageType: 'mob50000',
  rawText: 'nylem hatchling took 16 (5 mitigated) from Frail Mana Bomb (estimated)',
  eventKey: 'frail-mana-bomb-class-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Zotik',
  target: 'ashveil wasp',
  ability: 'Unknown ability (estimated)',
  amount: 9,
  damageType: 'mob60000',
  rawText: 'ashveil wasp took 9 from Unknown ability (estimated)',
  eventKey: 'pet-blast-of-magic-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Zotik',
  target: 'ashveil wasp',
  ability: 'Unknown ability (estimated)',
  amount: 22,
  damageType: 'mob70000',
  rawText: 'ashveil wasp took 22 from Unknown ability (estimated)',
  eventKey: 'pet-mana-spike-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Zotik',
  target: 'nylem hatchling',
  ability: 'Unknown ability (estimated)',
  amount: 17,
  damageType: 'mob80000',
  rawText: 'nylem hatchling took 17 from Unknown ability (estimated)',
  eventKey: 'pet-mana-flame-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Elora',
  target: 'wildleaf poppywig',
  ability: 'Auto Attack Impact (estimated)',
  amount: 29,
  damageType: 'goblin90000',
  rawText: 'wildleaf poppywig took 29 (7 mitigated) from Auto Attack Impact (estimated)',
  eventKey: 'ranger-class-test-aa'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Elora',
  target: 'wildleaf poppywig',
  ability: 'Volley of Arrows I (estimated)',
  amount: 109,
  damageType: 'goblin90001',
  rawText: 'wildleaf poppywig took 109 (27 mitigated) from Volley of Arrows I (estimated)',
  eventKey: 'ranger-class-test-volley'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Elora',
  target: 'wildleaf poppywig',
  ability: 'Swift Shot II (estimated)',
  amount: 73,
  damageType: 'goblin90002',
  rawText: 'wildleaf poppywig took 73 (18 mitigated) from Swift Shot II (estimated)',
  eventKey: 'ranger-class-test-swift'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Elora',
  target: 'wildleaf poppywig',
  ability: "Predator's Fury I (estimated)",
  amount: 163,
  damageType: 'goblin90003',
  rawText: 'wildleaf poppywig took 163 from Predator\'s Fury I (estimated)',
  eventKey: 'ranger-class-test-predator'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Elora',
  target: 'wildleaf poppywig',
  ability: 'Howling Arrow II (estimated)',
  amount: 18,
  damageType: 'goblin90004',
  rawText: 'wildleaf poppywig took 18 from Howling Arrow II (estimated)',
  eventKey: 'ranger-class-test-howling'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Elora',
  target: 'wildleaf poppywig',
  ability: 'Brightfire Blast I (estimated)',
  amount: 16,
  damageType: 'goblin90005',
  rawText: 'wildleaf poppywig took 16 from Brightfire Blast I (estimated)',
  eventKey: 'ranger-class-test-brightfire'
});
const summonerSummary = getParserSummary(store.db, 300);
const polona = summonerSummary.combatants.find((row) => row.source === 'Polona');
assert.equal(polona.className, 'Enchanter');
assert.equal(polona.classConfidence, 100);
assert.equal(polona.classColor, '#8175c7');
assert.ok(polona.abilities.includes('Strange Magic II (estimated)'));
assert.ok(polona.abilities.includes('Mind Vice II (estimated)'));
assert.ok(polona.abilities.includes('Mind Vice I (estimated)'));
assert.ok(polona.abilities.includes('Mind Vice II (estimated)'));
assert.ok(polona.abilities.includes('Strange Magic II (estimated)'));
assert.ok(polona.abilities.includes('Strange Magic (estimated)'));
const rhea = summonerSummary.combatants.find((row) => row.source === 'Rhea');
assert.ok(rhea.abilities.includes('Ignite I (estimated)'));
const katja = summonerSummary.combatants.find((row) => row.source === 'Katja');
assert.equal(katja.className, 'Warrior');
assert.equal(katja.classColor, '#c28a4a');
assert.ok(katja.abilities.includes('Mocking Blow II (estimated)'));
assert.ok(katja.abilities.includes('Assault I (estimated)'));
assert.ok(katja.abilities.includes('Commanding Strike II (estimated)'));

const katjaPacketStore = openStore(path.join(tempDir, 'katja-packet.sqlite'));
katjaPacketStore.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Katja',
  target: 'jungle goblin shaman',
  ability: 'Unknown ability (estimated)',
  amount: 7,
  damageType: 'Physical',
  rawText: 'jungle goblin shaman took 7 (2 mitigated) from Unknown ability (estimated)',
  eventKey: 'katja-packet-storm-test'
});
katjaPacketStore.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Katja',
  target: 'jungle goblin shaman',
  ability: 'Unknown ability (estimated)',
  amount: 8,
  damageType: 'Physical',
  rawText: 'jungle goblin shaman took 8 (2 mitigated) from Unknown ability (estimated)',
  eventKey: 'katja-packet-mocking-test'
});
katjaPacketStore.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Katja',
  target: 'jungle goblin shaman',
  ability: 'Unknown ability (estimated)',
  amount: 11,
  damageType: 'Physical',
  rawText: 'jungle goblin shaman took 11 (3 mitigated) from Unknown ability (estimated)',
  eventKey: 'katja-packet-assault-test'
});
katjaPacketStore.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Katja',
  target: 'jungle goblin shaman',
  ability: 'Unknown ability (estimated)',
  amount: 14,
  damageType: 'Physical',
  rawText: 'jungle goblin shaman took 14 (4 mitigated) from Unknown ability (estimated)',
  eventKey: 'katja-packet-commanding-test'
});
katjaPacketStore.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Katja',
  target: 'jungle goblin shaman',
  ability: 'Unknown ability (estimated)',
  amount: 5,
  damageType: 'Physical',
  rawText: 'jungle goblin shaman took 5 (1 mitigated) from Unknown ability (estimated)',
  eventKey: 'katja-packet-auto-test'
});
const katjaPacketSummary = getParserSummary(katjaPacketStore.db, 300);
const katjaPacketCombatant = katjaPacketSummary.combatants.find((row) => row.source === 'Katja');
assert.equal(katjaPacketCombatant.className, 'Warrior');
assert.ok(katjaPacketCombatant.abilities.includes('Storm I (estimated)'));
assert.ok(katjaPacketCombatant.abilities.includes('Mocking Blow II (estimated)'));
assert.ok(katjaPacketCombatant.abilities.includes('Assault I (estimated)'));
assert.ok(katjaPacketCombatant.abilities.includes('Commanding Strike II (estimated)'));
assert.ok(katjaPacketCombatant.abilities.includes('Auto Attack (estimated)'));
katjaPacketStore.close();
const tinaPacketStore = openStore(path.join(tempDir, 'tina-packet.sqlite'));
tinaPacketStore.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Tina',
  target: 'jungle goblin thrasher',
  ability: 'Unknown ability (estimated)',
  amount: 12,
  damageType: 'Physical',
  rawText: 'jungle goblin thrasher took 12 (3 mitigated) from Unknown ability (estimated)',
  eventKey: 'tina-packet-serpentine-test'
});
const tinaPacketSummary = getParserSummary(tinaPacketStore.db, 300);
const tinaPacketCombatant = tinaPacketSummary.combatants.find((row) => row.source === 'Tina');
assert.equal(tinaPacketCombatant.className, 'Shaman');
assert.ok(tinaPacketCombatant.abilities.includes('Serpentine Strike I (estimated)'));
tinaPacketStore.close();
const tormentiliaPacketStore = openStore(path.join(tempDir, 'tormentilia-packet.sqlite'));
tormentiliaPacketStore.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Tormentilia',
  target: 'jungle goblin thrasher',
  ability: 'Unknown ability (estimated)',
  amount: 4,
  damageType: 'Fire',
  rawText: 'jungle goblin thrasher took 4 Fire damage from Unknown ability (estimated)',
  eventKey: 'tormentilia-packet-corrupt-blood-test'
});
tormentiliaPacketStore.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Tormentilia',
  target: 'jungle goblin thrasher',
  ability: 'Unknown ability (estimated)',
  amount: 8,
  damageType: 'Physical',
  rawText: 'jungle goblin thrasher took 8 (2 mitigated) from Unknown ability (estimated)',
  eventKey: 'tormentilia-packet-fleshcarver-test'
});
tormentiliaPacketStore.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Tormentilia',
  target: 'jungle goblin thrasher',
  ability: 'Unknown ability (estimated)',
  amount: 3,
  damageType: 'Physical',
  rawText: 'jungle goblin thrasher took 3 (1 mitigated) from Unknown ability (estimated)',
  eventKey: 'tormentilia-packet-auto-test'
});
const tormentiliaPacketSummary = getParserSummary(tormentiliaPacketStore.db, 300);
const tormentiliaPacketCombatant = tormentiliaPacketSummary.combatants.find((row) => row.source === 'Tormentilia');
assert.equal(tormentiliaPacketCombatant.className, 'Dire Lord');
assert.ok(tormentiliaPacketCombatant.abilities.includes('Corrupt Blood I (estimated)'));
assert.ok(tormentiliaPacketCombatant.abilities.includes('Fleshcarver (estimated)'));
assert.ok(tormentiliaPacketCombatant.abilities.includes('Auto Attack (estimated)'));
tormentiliaPacketStore.close();
const jessa = summonerSummary.combatants.find((row) => row.source === 'Jessa');
assert.equal(jessa.className, 'Druid');
assert.equal(jessa.classColor, '#d97b00');
assert.ok(jessa.abilities.includes('Conjure Bolt I (estimated)'));
assert.ok(jessa.abilities.includes('Ignite II (estimated)'));
const nexendia = summonerSummary.combatants.find((row) => row.source === 'Nexendia');
assert.equal(nexendia.className, 'Summoner');
assert.equal(nexendia.classConfidence, 100);
assert.equal(nexendia.classColor, '#bc35dd');
assert.ok(nexendia.abilities.includes('Blast Creation II (estimated)'));
const elora = summonerSummary.combatants.find((row) => row.source === 'Elora');
assert.equal(elora.className, 'Ranger');
assert.equal(elora.classColor, '#93c95a');
assert.ok(elora.abilities.includes('Volley of Arrows I (estimated)'));
store.upsertPetName({
  entityId: '33700000',
  name: 'Zotik',
  ownerName: 'Nexendia',
  rawTitle: "<Nexendia's Minion>",
  observedAt: new Date().toISOString()
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'world_entity',
  source: 'Player',
  target: 'Ghaldassii Stone Fragment',
  ability: 'XT_LooseLoot_ScrapMetal',
  amount: 1,
  damageType: '84070000',
  x: 3036.316,
  y: 490.442,
  z: -3696.626,
  rawText: 'Ghaldassii Stone Fragment | XT_LooseLoot_ScrapMetal',
  eventKey: 'stone-fragment-quest-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'world_entity',
  source: 'Player',
  target: "Gusler's Enchanted Toenail",
  ability: 'XT_LooseLoot_ScrapMetal',
  amount: 1,
  damageType: '84080000',
  x: 3034.112,
  y: 490.442,
  z: -3694.221,
  rawText: "Gusler's Enchanted Toenail | XT_LooseLoot_ScrapMetal",
  eventKey: 'guslers-toenail-quest-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'world_entity',
  source: 'Player',
  target: 'Dusty Satchel',
  ability: 'XT_LooseLoot_ScrapMetal',
  amount: 1,
  damageType: '84080001',
  x: 3033.901,
  y: 490.442,
  z: -3693.801,
  rawText: 'Dusty Satchel | XT_LooseLoot_ScrapMetal',
  eventKey: 'dusty-satchel-quest-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'world_entity',
  source: 'Player',
  target: 'Corroded Key',
  ability: 'entityKind:mob',
  amount: 0,
  damageType: '84080002',
  x: 3032.901,
  y: 490.442,
  z: -3692.801,
  rawText: 'Corroded Key | GroundSpawn',
  eventKey: 'corroded-key-quest-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'world_entity',
  source: 'Player',
  target: 'Krex',
  ability: 'entityKind:mob',
  amount: 1,
  damageType: '33700000',
  x: 12.5,
  y: 3.25,
  z: -8.75,
  rawText: 'Krex position 12.5 3.25 -8.75',
  eventKey: 'pet-map-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'world_entity',
  source: 'Player',
  target: 'jungle goblin flickermage',
  ability: 'entityKind:mob',
  amount: 1,
  damageType: 'goblin10000',
  x: 3202.905,
  y: 515.551,
  z: -2766.866,
  rawText: 'jungle goblin flickermage position 3202.905 515.551 -2766.866',
  eventKey: 'jungle-goblin-hostile-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'world_entity',
  source: 'Player',
  target: 'feraling wraith-binder',
  ability: 'entityKind:mob',
  amount: 9,
  damageType: 'feraling10000',
  x: 4052.646,
  y: 466.562,
  z: -2238.157,
  rawText: 'feraling wraith-binder position 4052.646 466.562 -2238.157',
  eventKey: 'feraling-hostile-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'world_entity',
  source: 'Player',
  target: 'jadeclaw raptor',
  ability: 'entityKind:mob',
  amount: 10,
  damageType: 'raptor10000',
  x: 4054.112,
  y: 466.765,
  z: -2234.924,
  rawText: 'jadeclaw raptor position 4054.112 466.765 -2234.924',
  eventKey: 'jadeclaw-raptor-hostile-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'world_entity',
  source: 'Player',
  target: 'brineclaw net-weaver',
  ability: 'entityKind:mob',
  amount: 11,
  damageType: 'brineclaw10000',
  x: 4051.112,
  y: 466.765,
  z: -2234.924,
  rawText: 'brineclaw net-weaver position 4051.112 466.765 -2234.924',
  eventKey: 'brineclaw-hostile-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'world_entity',
  source: 'Player',
  target: 'Drawn Ravager',
  ability: 'Ratkin_Drawn_Male_02',
  amount: 17,
  damageType: '63120000',
  x: 59.66,
  y: 37.645,
  z: -192.706,
  rawText: 'Drawn Ravager position 59.66 37.645 -192.706',
  eventKey: 'drawn-ravager-hostile-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'world_entity',
  source: 'Player',
  target: 'Celis Creeper',
  ability: 'Spider_Grass_Crystal',
  amount: 16,
  damageType: '12010000',
  x: 28.75,
  y: 20.062,
  z: -101.585,
  rawText: 'Celis Creeper position 28.75 20.062 -101.585',
  eventKey: 'celis-creeper-hostile-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'world_entity',
  source: 'Player',
  target: 'Vaelris the Deadheart',
  ability: 'entityKind:mob',
  amount: 12,
  damageType: '76770000',
  x: 4052.646,
  y: 466.562,
  z: -2238.157,
  rawText: 'Vaelris the Deadheart | HALF_M_Feraling_02',
  eventKey: 'vaelris-world-entity-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'world_entity',
  source: null,
  target: "Ringleader's Lock Box",
  ability: 'entityKind:chest',
  amount: 0,
  damageType: 'scanner:network:1889',
  x: 3626.1404,
  y: 473.04205,
  z: 4164.962,
  rawText: '[EntityScanner] {"EntityType":"GroundSpawn","RuntimeType":"Il2Cpp.NetworkWorldItem","NetworkId":1889,"Name":"Ringleader\'s Lock Box","Kind":"Chest","Tier":"RightClick, HasModel, Collidable, DefaultScale, IsLocked","Role":"LootCrate_LockBox","X":3626.1404,"Y":473.04205,"Z":4164.962,"DistanceFromLocal":3.692476}',
  eventKey: 'ringleader-lock-box-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'target_con',
  source: 'Player',
  target: 'Vaelris the Dreadheart',
  ability: 'prepared to attack | opponent would pose a great challenge to you',
  amount: 12,
  damageType: '76770000',
  x: 4052.646,
  y: 466.562,
  z: -2238.157,
  rawText: 'Vaelris the Deadheart is prepared to attack you. This would be a great challenge.',
  eventKey: 'vaelris-priority-test'
});
store.insertEvent({
  observedAt: new Date().toISOString(),
  eventType: 'damage_estimate',
  source: 'Vaelris the Deadheart',
  target: 'Nexerin',
  ability: 'Grave Hex',
  amount: 18,
  damageType: 'Magic',
  rawText: 'Vaelris the Deadheart dealt 18 Magic damage to Nexerin with Grave Hex.',
  eventKey: 'vaelris-grave-hex-test'
});
store.insertLootEvent({
  observedAt: new Date().toISOString(),
  eventType: 'item_added',
  character: 'Nexerin',
  characterId: 3950,
  itemInstanceId: 'vaelris-drop-instance',
  itemId: '99901',
  itemName: 'Deadheart Charm',
  source: 'Vaelris the Deadheart',
  quantity: 1,
  rawJson: JSON.stringify({
    eventType: 'item_added',
    acquisition: {
      method: 'recent_offensive_target',
      confidence: 'medium',
      source: { name: 'Vaelris the Deadheart', level: 12, x: 4052.646, y: 466.562, z: -2238.157 }
    }
  }),
  eventKey: 'vaelris-drop-test'
});
const petMapRows = getMapEntityRows(store.db, 200);
const stoneFragmentRow = petMapRows.find((row) => row.name === 'Ghaldassii Stone Fragment');
assert.equal(stoneFragmentRow.kind, 'quest');
assert.equal(stoneFragmentRow.questItem, true);
const toenailRow = petMapRows.find((row) => row.name === "Gusler's Enchanted Toenail");
assert.equal(toenailRow.kind, 'quest');
assert.equal(toenailRow.questItem, true);
const satchelRow = petMapRows.find((row) => row.name === 'Dusty Satchel');
assert.equal(satchelRow.kind, 'quest');
assert.equal(satchelRow.questItem, true);
const corrodedKeyRow = petMapRows.find((row) => row.name === 'Corroded Key');
assert.equal(corrodedKeyRow.kind, 'quest');
assert.equal(corrodedKeyRow.questItem, true);
const lockBoxRow = petMapRows.find((row) => row.name === "Ringleader's Lock Box");
assert.equal(lockBoxRow.kind, 'chest');
assert.equal(lockBoxRow.questItem, false);
assert.equal(lockBoxRow.entityId, 'scanner:network:1889');
const zoticRow = petMapRows.find((row) => row.entityId === '33700000');
assert.equal(zoticRow.name, "Nexendia's Minion");
assert.equal(zoticRow.petAlias, 'Krex');
assert.equal(zoticRow.petLabel, null);
assert.equal(zoticRow.kind, 'pet');
assert.equal(zoticRow.petOwnerName, 'Nexendia');

const goblinRow = petMapRows.find((row) => row.name === 'jungle goblin flickermage');
assert.equal(goblinRow.disposition, 'prepared to attack');
const feralingRow = petMapRows.find((row) => row.name === 'feraling wraith-binder');
assert.equal(feralingRow.disposition, 'prepared to attack');
const ratkinRow = petMapRows.find((row) => row.entityId === '63120000');
assert.equal(ratkinRow.disposition, 'prepared to attack');
const celisRow = petMapRows.find((row) => row.entityId === '12010000');
assert.equal(celisRow.disposition, 'prepared to attack');
const raptorRow = petMapRows.find((row) => row.name === 'jadeclaw raptor');
assert.equal(raptorRow.disposition, 'prepared to attack');
const brineclawRow = petMapRows.find((row) => row.name === 'brineclaw net-weaver');
assert.equal(brineclawRow.disposition, 'prepared to attack');
const vaelrisRow = petMapRows.find((row) => row.entityId === '76770000');
assert.equal(vaelrisRow.priorityCandidate, true);

const mobSummary = getMobSummary(store.db, { search: 'Vaelris' });
assert.equal(mobSummary.rows[0].name, 'Vaelris the Deadheart');
assert.equal(mobSummary.rows[0].abilityCount, 1);
assert.equal(mobSummary.rows[0].dropCount, 1);
const mobDetail = getMobDetail(store.db, 'Vaelris the Deadheart');
assert.equal(mobDetail.abilities[0].ability, 'Grave Hex');
assert.equal(mobDetail.drops[0].name, 'Deadheart Charm');
assert.equal(mobDetail.lastLocation.x, 4052.646);

const petSummary = getParserSummary(store.db, 300);
const zotik = petSummary.combatants.find((row) => row.source === "Nexendia's Minion");
assert.equal(zotik.className, 'Summoner Pet');
assert.ok(zotik.abilities.includes('Blast of Magic (estimated)'));
assert.ok(zotik.abilities.includes('Mana Spike (estimated)'));
assert.ok(zotik.abilities.includes('Mana Flame (estimated)'));

store.close();
fs.rmSync(tempDir, { recursive: true, force: true });

console.log('dashboard tests passed');
