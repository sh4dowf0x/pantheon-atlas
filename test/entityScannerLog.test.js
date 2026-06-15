const assert = require('node:assert/strict');
const { parseEntityScannerLine } = require('../src/entityScannerLog');

const localLine = JSON.stringify({
  TimestampUtc: '2026-06-10T10:16:21.7491741Z',
  EventType: 'localPlayer',
  EntityType: 'LocalPlayer',
  CharacterId: 3950,
  Name: 'Nexerin',
  Race: 'Human',
  Class: 'Wizard',
  Level: 20,
  X: 3244.5837,
  Y: 555.4221,
  Z: 1807.8583,
  HeadingY: 91.72944,
  OffensiveTarget: { Name: 'grimling', CharacterId: -1, NetworkId: 11742 },
  DefensiveTarget: null
});

const localEvents = parseEntityScannerLine(localLine);
assert.equal(localEvents.length, 3);
assert.equal(localEvents[0].eventType, 'local_player');
assert.equal(localEvents[0].source, 'Nexerin');
assert.equal(localEvents[0].target, 'Human Wizard');
assert.equal(localEvents[0].ability, 'Level 20');
assert.equal(localEvents[0].damageType, 'scanner:character:3950');
assert.equal(localEvents[1].eventType, 'position_update');
assert.equal(localEvents[1].source, 'Nexerin');
assert.equal(localEvents[1].damageType, 'scanner:character:3950');
assert.equal(localEvents[1].x, 3244.5837);
assert.equal(localEvents[1].heading, 91.72944);
assert.equal(localEvents[2].eventType, 'target_selection');
assert.equal(localEvents[2].target, 'grimling');
assert.equal(localEvents[2].ability, 'offensive');
assert.equal(localEvents[2].damageType, 'scanner:network:11742');

const npcLine = JSON.stringify({
  TimestampUtc: '2026-06-10T10:16:18.7241368Z',
  EventType: 'updated',
  EntityType: 'NPC',
  RuntimeType: 'Il2Cpp.EntityNpcGameObject',
  NetworkId: 11506,
  CharacterId: -1,
  Name: 'slog beetle',
  Kind: 'Insect',
  Race: 'Human',
  Class: 'Rogue',
  Level: 4,
  X: 3286.5981,
  Y: 550.5532,
  Z: 1863.9783,
  HeadingY: 133.34311,
  HealthCurrent: 580,
  HealthMax: 580,
  HealthPercent: 100,
  DistanceFromLocal: 70.27354,
  IsLocalPlayer: false
});

const npcEvents = parseEntityScannerLine(npcLine);
assert.equal(npcEvents.length, 2);
assert.equal(npcEvents[0].eventType, 'world_entity');
assert.equal(npcEvents[0].target, 'slog beetle');
assert.equal(npcEvents[0].ability, 'entityKind:mob');
assert.equal(npcEvents[0].amount, 4);
assert.equal(npcEvents[0].damageType, 'scanner:network:11506');
assert.equal(npcEvents[1].eventType, 'health_update');
assert.equal(npcEvents[1].amount, 580);
assert.equal(npcEvents[1].ability, '580');

const removedLine = JSON.stringify({
  TimestampUtc: '2026-06-10T10:10:44.0758411Z',
  EventType: 'removed',
  EntityType: 'NPC',
  NetworkId: 1326,
  Name: 'A Dark Agent',
  Kind: 'Humanoid',
  Level: 20,
  X: 3208.5857,
  Y: 543.71466,
  Z: 1769.7025
});
const removedEvents = parseEntityScannerLine(removedLine);
assert.equal(removedEvents.length, 1);
assert.equal(removedEvents[0].eventType, 'entity_removed');
assert.equal(removedEvents[0].damageType, 'scanner:network:1326');

const groundSpawnChestLine = JSON.stringify({
  TimestampUtc: '2026-06-14T06:24:04.041374Z',
  EventType: 'seen',
  EntityType: 'GroundSpawn',
  RuntimeType: 'Il2Cpp.NetworkWorldItem',
  NetworkId: 1889,
  CharacterId: -1,
  Name: "Ringleader's Lock Box",
  Title: 'relevant',
  Kind: 'Chest',
  Tier: 'RightClick, HasModel, Collidable, DefaultScale, IsLocked',
  Role: 'LootCrate_LockBox',
  Level: 0,
  X: 3626.1404,
  Y: 473.04205,
  Z: 4164.962,
  HeadingY: 111.66415,
  HealthCurrent: 0,
  HealthMax: 0,
  HealthPercent: 0,
  IsLocalPlayer: false
});

const groundSpawnChestEvents = parseEntityScannerLine(groundSpawnChestLine);
assert.equal(groundSpawnChestEvents.length, 1);
assert.equal(groundSpawnChestEvents[0].eventType, 'world_entity');
assert.equal(groundSpawnChestEvents[0].target, "Ringleader's Lock Box");
assert.equal(groundSpawnChestEvents[0].ability, 'entityKind:chest');
assert.equal(groundSpawnChestEvents[0].damageType, 'scanner:network:1889');
assert.equal(groundSpawnChestEvents[0].x, 3626.1404);

const groundSpawnResourceLine = JSON.stringify({
  TimestampUtc: '2026-06-14T06:24:04.041374Z',
  EventType: 'seen',
  EntityType: 'GroundSpawn',
  RuntimeType: 'Il2Cpp.NetworkWorldItem',
  NetworkId: 1890,
  Name: 'Jute Plant',
  Kind: 'Harvestable',
  Role: 'HarvestNode_Plant',
  X: 10,
  Y: 20,
  Z: 30,
  IsLocalPlayer: false
});

const groundSpawnResourceEvents = parseEntityScannerLine(groundSpawnResourceLine);
assert.equal(groundSpawnResourceEvents.length, 1);
assert.equal(groundSpawnResourceEvents[0].eventType, 'harvest_node');
assert.equal(groundSpawnResourceEvents[0].ability, 'entityKind:resource');

assert.deepEqual(parseEntityScannerLine('{not json'), []);

console.log('entity scanner log tests passed');
