const assert = require('node:assert/strict');
const { extractClientActionCandidate, extractClientAbilityCastRecords, extractClientPositionRecord, extractHealthRecords, extractNamedEntityRecords, extractServerAbilityEffectRecords, extractServerActorPositionRecords, extractServerDamageRecords, extractSpawnEntityIds, extractSpawnRecords, inferredAbilityFromDamagePattern, normalizeCharacterNameToken, parseCombatText, parseMessage, parsePacketMessages, parseSystemText, parseTelemetryText } = require('../src/parser');

const damage = parseCombatText('Nexie dealt 7 Physical damage to vinecoil snake with Auto Attack.', '2026-01-01T00:00:00.000Z')[0];
assert.equal(damage.eventType, 'damage');
assert.equal(damage.source, 'Nexie');
assert.equal(damage.target, 'vinecoil snake');
assert.equal(damage.amount, 7);
assert.equal(damage.damageType, 'Physical');
assert.equal(damage.ability, 'Auto Attack');
const mitigatedLog = parseCombatText('[15:30:29] Dinanx dealt 8 Nature damage to brineclaw net-weaver with Stinging Swarm I. (1 mitigated)', '2026-01-01T00:00:00.000Z');
assert.equal(mitigatedLog[0].source, 'Dinanx');
assert.equal(mitigatedLog[0].target, 'brineclaw net-weaver');
assert.equal(mitigatedLog[0].ability, 'Stinging Swarm I');
assert.equal(mitigatedLog[0].amount, 8);
assert.equal(mitigatedLog[1].eventType, 'mitigation');
assert.equal(mitigatedLog[1].amount, 1);
const incomingLog = parseCombatText('brineclaw net-weaver dealt 9 Poison damage to Stormblessed with Bane of Venom.', '2026-01-01T00:00:00.000Z')[0];
assert.equal(incomingLog.source, 'brineclaw net-weaver');
assert.equal(incomingLog.target, 'Stormblessed');
assert.equal(incomingLog.ability, 'Bane of Venom');
const selfDamageLog = parseCombatText('Draeken took 1 Essence damage from Blood Debt.', '2026-01-01T00:00:00.000Z')[0];
assert.equal(selfDamageLog.source, 'Blood Debt');
assert.equal(selfDamageLog.target, 'Draeken');
assert.equal(selfDamageLog.ability, 'Blood Debt');
const resistLog = parseCombatText("Kaladin's Brightfire Blast I was fully resisted by brineclaw net-weaver.", '2026-01-01T00:00:00.000Z')[0];
assert.equal(resistLog.eventType, 'ability_resist');
assert.equal(resistLog.source, 'Kaladin');
assert.equal(resistLog.ability, 'Brightfire Blast I');
const strangeMagicLog = parseCombatText('[04:53:33] Polona dealt 14 Magic damage to feraling soul-mender with Strange Magic. (3 mitigated)', '2026-01-01T00:00:00.000Z')[0];
assert.equal(strangeMagicLog.eventType, 'damage');
assert.equal(strangeMagicLog.source, 'Polona');
assert.equal(strangeMagicLog.ability, 'Strange Magic');
const jessaIgniteLog = parseCombatText('[07:55:42] Jessa dealt 6 Nature damage to jungle goblin thrasher with Ignite II. (1 mitigated)', '2026-01-01T00:00:00.000Z')[0];
assert.equal(jessaIgniteLog.source, 'Jessa');
assert.equal(jessaIgniteLog.ability, 'Ignite II');
const jessaConjureBoltLog = parseCombatText('[07:55:43] Jessa dealt 23 Nature damage to jungle goblin thrasher with Conjure Bolt I. (4 mitigated)', '2026-01-01T00:00:00.000Z')[0];
assert.equal(jessaConjureBoltLog.source, 'Jessa');
assert.equal(jessaConjureBoltLog.ability, 'Conjure Bolt I');
const jessaStingingSwarmLog = parseCombatText('[07:55:48] Jessa dealt 9 Nature damage to jungle goblin thrasher with Stinging Swarm I. (1 mitigated)', '2026-01-01T00:00:00.000Z')[0];
assert.equal(jessaStingingSwarmLog.source, 'Jessa');
assert.equal(jessaStingingSwarmLog.ability, 'Stinging Swarm I');
const katjaMockingBlowLog = parseCombatText('[08:04:22] Katja dealt 7 Physical damage to jungle goblin thrasher with Mocking Blow II. (2 mitigated)', '2026-01-01T00:00:00.000Z')[0];
assert.equal(katjaMockingBlowLog.source, 'Katja');
assert.equal(katjaMockingBlowLog.ability, 'Mocking Blow II');
const katjaAssaultLog = parseCombatText('[08:04:32] Katja dealt 11 Physical damage to jungle goblin thrasher with Assault I. (3 mitigated)', '2026-01-01T00:00:00.000Z')[0];
assert.equal(katjaAssaultLog.source, 'Katja');
assert.equal(katjaAssaultLog.ability, 'Assault I');
const katjaCommandingStrikeLog = parseCombatText('[08:04:35] Katja dealt 14 Physical damage to jungle goblin thrasher with Commanding Strike II. (4 mitigated)', '2026-01-01T00:00:00.000Z')[0];
assert.equal(katjaCommandingStrikeLog.source, 'Katja');
assert.equal(katjaCommandingStrikeLog.ability, 'Commanding Strike II');
const katjaStormLog = parseCombatText('[08:11:01] Katja dealt 7 Physical damage to jungle goblin shaman with Storm I. (2 mitigated)', '2026-01-01T00:00:00.000Z')[0];
assert.equal(katjaStormLog.source, 'Katja');
assert.equal(katjaStormLog.ability, 'Storm I');
assert.equal(inferredAbilityFromDamagePattern({ amount: 7, mitigated: 2, damageType: 'Physical' }, 'Katja'), 'Storm I (estimated)');
assert.equal(inferredAbilityFromDamagePattern({ amount: 8, mitigated: 2, damageType: 'Physical' }, 'Katja'), 'Mocking Blow II (estimated)');
assert.equal(inferredAbilityFromDamagePattern({ amount: 11, mitigated: 3, damageType: 'Physical' }, 'Katja'), 'Assault I (estimated)');
assert.equal(inferredAbilityFromDamagePattern({ amount: 14, mitigated: 4, damageType: 'Physical' }, 'Katja'), 'Commanding Strike II (estimated)');
assert.equal(inferredAbilityFromDamagePattern({ amount: 4, mitigated: 1, damageType: 'Physical' }, 'Katja'), 'Auto Attack (estimated)');
const tinaSerpentineLog = parseCombatText('[08:16:01] Tina dealt 12 Physical damage to jungle goblin thrasher with Serpentine Strike I. (3 mitigated)', '2026-01-01T00:00:00.000Z')[0];
assert.equal(tinaSerpentineLog.source, 'Tina');
assert.equal(tinaSerpentineLog.ability, 'Serpentine Strike I');
assert.equal(inferredAbilityFromDamagePattern({ amount: 12, mitigated: 3, damageType: 'Physical' }, 'Tina'), 'Serpentine Strike I (estimated)');
assert.equal(inferredAbilityFromDamagePattern({ amount: 4, mitigated: null, damageType: 'Fire' }, 'Tormentilia'), 'Corrupt Blood I (estimated)');
assert.equal(inferredAbilityFromDamagePattern({ amount: 8, mitigated: 2, damageType: 'Physical' }, 'Tormentilia'), 'Fleshcarver (estimated)');
assert.equal(inferredAbilityFromDamagePattern({ amount: 3, mitigated: 1, damageType: 'Physical' }, 'Tormentilia'), 'Auto Attack (estimated)');
const missLog = parseCombatText("Draeken's Thresh I missed brineclaw net-weaver.", '2026-01-01T00:00:00.000Z')[0];
assert.equal(missLog.eventType, 'ability_miss');
assert.equal(missLog.ability, 'Thresh I');
const failedCastLog = parseCombatText('[15:51:03] Failed ability cast: Global Cooldown.', '2026-01-01T00:00:00.000Z')[0];
assert.equal(failedCastLog.eventType, 'ability_failed');
assert.equal(failedCastLog.ability, 'Global Cooldown');
const nexendiaLog = parseCombatText('[15:51:05] Nexendia dealt 16 Magic damage to brineclaw mudskimmer with Frail Mana Bomb. (5 mitigated)', '2026-01-01T00:00:00.000Z');
assert.equal(nexendiaLog[0].source, 'Nexendia');
assert.equal(nexendiaLog[0].ability, 'Frail Mana Bomb');
assert.equal(nexendiaLog[0].damageType, 'Magic');
assert.equal(nexendiaLog[1].amount, 5);
const blastCreationLog = parseCombatText('[20:38:45] Nexendia dealt 15 Magic damage to wildleaf poppywig with Blast Creation II. (4 mitigated)', '2026-01-01T00:00:00.000Z');
assert.equal(blastCreationLog[0].source, 'Nexendia');
assert.equal(blastCreationLog[0].ability, 'Blast Creation II');
assert.equal(blastCreationLog[1].amount, 4);
const nexendiaBlastCreationDamage = parsePacketMessages([], '2026-01-01T00:00:04.780Z', {
  payloadHex: '1c00000062000000e90f00007e670000fb00002842fb00002842fb0000204100',
  context: {
    actorNameById: new Map([['e90f0000', 'Nexendia']]),
    entityNameById: new Map([['7e670000', 'wildleaf poppywig']]),
    lastHealthById: new Map()
  }
});
assert.equal(nexendiaBlastCreationDamage[0].source, 'Nexendia');
assert.equal(nexendiaBlastCreationDamage[0].target, 'wildleaf poppywig');
assert.equal(nexendiaBlastCreationDamage[0].amount, 42);
assert.equal(nexendiaBlastCreationDamage[0].ability, 'Blast Creation II (estimated)');
const nexendiaBlastCreationHighDamage = parsePacketMessages([], '2026-01-01T00:00:04.880Z', {
  payloadHex: '1c00000062000000e90f00007e670000fb00003042fb00003042fb0000304100',
  context: {
    actorNameById: new Map([['e90f0000', 'Nexendia']]),
    entityNameById: new Map([['7e670000', 'ashveil wasp']]),
    lastHealthById: new Map()
  }
});
assert.equal(nexendiaBlastCreationHighDamage[0].amount, 44);
assert.equal(nexendiaBlastCreationHighDamage[0].rawText, 'ashveil wasp took 44 (11 mitigated) from Blast Creation II (estimated)');
assert.equal(nexendiaBlastCreationHighDamage[0].ability, 'Blast Creation II (estimated)');
const nexendiaAutoAttackDamage = parsePacketMessages([], '2026-01-01T00:00:05.000Z', {
  payloadHex: '1c00000062000000e90f00007e670000fb0000e841fb0000e841fb0000e04000',
  context: {
    actorNameById: new Map([['e90f0000', 'Nexendia']]),
    entityNameById: new Map([['7e670000', 'wildleaf poppywig']]),
    lastHealthById: new Map()
  }
});
assert.equal(nexendiaAutoAttackDamage[0].amount, 29);
assert.equal(nexendiaAutoAttackDamage[0].ability, 'Auto Attack (estimated)');
const aetherShardsLog = parseCombatText('[21:09:10] Nexendia dealt 14 Magic damage to nylem hatchling with Aether Shards. (3 mitigated)', '2026-01-01T00:00:00.000Z');
assert.equal(aetherShardsLog[0].source, 'Nexendia');
assert.equal(aetherShardsLog[0].ability, 'Aether Shards');
assert.equal(aetherShardsLog[1].amount, 3);
const aetherShardsDamage = parsePacketMessages([], '2026-01-01T00:00:05.250Z', {
  payloadHex: '1c00000062000000e90f00007e670000fb00006041fb00006041fb0000404000',
  context: {
    actorNameById: new Map([['e90f0000', 'Nexendia']]),
    entityNameById: new Map([['7e670000', 'wildleaf poppywig']]),
    lastHealthById: new Map()
  }
});
assert.equal(aetherShardsDamage[0].amount, 14);
assert.equal(aetherShardsDamage[0].ability, 'Aether Shards (estimated)');
const clashChargeLog = parseCombatText('[21:11:10] Nexendia dealt 26 Magic damage to nylem hatchling with Clash Charge. (6 mitigated)', '2026-01-01T00:00:00.000Z');
assert.equal(clashChargeLog[0].source, 'Nexendia');
assert.equal(clashChargeLog[0].ability, 'Clash Charge');
assert.equal(clashChargeLog[1].amount, 6);
const clashChargeDamage = parsePacketMessages([], '2026-01-01T00:00:05.500Z', {
  payloadHex: '1c00000062000000e90f00007e670000fb0000d041fb0000d041fb0000c04000',
  context: {
    actorNameById: new Map([['e90f0000', 'Nexendia']]),
    entityNameById: new Map([['7e670000', 'wildleaf poppywig']]),
    lastHealthById: new Map()
  }
});
assert.equal(clashChargeDamage[0].amount, 26);
assert.equal(clashChargeDamage[0].ability, 'Clash Charge (estimated)');
const frailManaBombDamage = parsePacketMessages([], '2026-01-01T00:00:06.000Z', {
  payloadHex: '1c00000062000000e90f00007e670000fb0000b041fb0000b041fb0000a04000',
  context: {
    actorNameById: new Map([['e90f0000', 'Nexendia']]),
    entityNameById: new Map([['7e670000', 'nylem hatchling']]),
    lastHealthById: new Map()
  }
});
assert.equal(frailManaBombDamage[0].amount, 22);
assert.equal(frailManaBombDamage[0].ability, 'Frail Mana Bomb (estimated)');

const heal = parseCombatText('Cleric healed Nexie for 42 with Flash Heal.', '2026-01-01T00:00:00.000Z')[0];
assert.equal(heal.eventType, 'healing');
assert.equal(heal.source, 'Cleric');
assert.equal(heal.target, 'Nexie');
assert.equal(heal.amount, 42);
const bareHeal = parseCombatText('Cleric healed Nexie for 19.', '2026-01-01T00:00:00.000Z')[0];
assert.equal(bareHeal.eventType, 'healing');
assert.equal(bareHeal.source, 'Cleric');
assert.equal(bareHeal.target, 'Nexie');
assert.equal(bareHeal.amount, 19);
assert.equal(bareHeal.ability, 'Healing');

const xp = parseTelemetryText('XP gained: 125', '2026-01-01T00:00:00.000Z')[0];
assert.equal(xp.eventType, 'experience');
assert.equal(xp.amount, 125);

const pos = parseTelemetryText('position x=12.5 y=-4 z=99', '2026-01-01T00:00:00.000Z')[0];
assert.equal(pos.eventType, 'position');
assert.equal(pos.x, 12.5);
assert.equal(pos.y, -4);
assert.equal(pos.z, 99);
assert.equal(parseTelemetryText('LOCATION: http://10.0.0.5:7678/nservice/').length, 0);

assert.equal(parseMessage('nothing useful').length, 0);
const killEvents = parseSystemText('You have slain grass snake and you have gained some experience (+some rested).', '2026-01-01T00:00:00.000Z');
assert.equal(killEvents.length, 2);
assert.equal(killEvents[0].eventType, 'kill');
assert.equal(killEvents[0].target, 'grass snake');
assert.equal(killEvents[1].eventType, 'experience_gain');
const simpleKillEvents = parseSystemText('You have slain emerald leaf spider.', '2026-01-01T00:00:00.000Z');
assert.equal(simpleKillEvents.length, 1);
assert.equal(simpleKillEvents[0].eventType, 'kill');
assert.equal(simpleKillEvents[0].target, 'emerald leaf spider');
const indifferentConEvents = parseSystemText('fire beetle hatchling is indifferent to your presence. This would be a trivial fight.', '2026-01-01T00:00:00.000Z');
assert.equal(indifferentConEvents[0].eventType, 'target_con');
assert.equal(indifferentConEvents[0].target, 'fire beetle hatchling');
assert.equal(indifferentConEvents[0].ability, 'indifferent | a trivial fight');
const indifferentMadnessConEvents = parseSystemText('vorcheirus grazer is indifferent to your presence. This fight would be madness - do you have a death wish?"', '2026-01-01T00:00:00.000Z');
assert.equal(indifferentMadnessConEvents[0].eventType, 'target_con');
assert.equal(indifferentMadnessConEvents[0].target, 'vorcheirus grazer');
assert.equal(indifferentMadnessConEvents[0].ability, 'indifferent | madness - do you have a death wish');
const hostileConEvents = parseSystemText('Gadai recruit is prepared to attack you. This would be a trivial fight. (Gadai Bandits)', '2026-01-01T00:00:00.000Z');
assert.equal(hostileConEvents[0].eventType, 'target_con');
assert.equal(hostileConEvents[0].target, 'Gadai recruit');
assert.equal(hostileConEvents[0].ability, 'prepared to attack | a trivial fight | Gadai Bandits');
const hatredConEvents = parseSystemText('timber wolf seethes with hatred, eager to slay you. This would be an evenly matched fight.', '2026-01-01T00:00:00.000Z');
assert.equal(hatredConEvents[0].eventType, 'target_con');
assert.equal(hatredConEvents[0].target, 'timber wolf');
assert.equal(hatredConEvents[0].ability, 'prepared to attack | an evenly matched fight');
const friendlyConEvents = parseSystemText('gas bat nestling is glad to see you. This would be a trivial fight.', '2026-01-01T00:00:00.000Z');
assert.equal(friendlyConEvents[0].eventType, 'target_con');
assert.equal(friendlyConEvents[0].target, 'gas bat nestling');
assert.equal(friendlyConEvents[0].ability, 'glad | a trivial fight');
const friendlyMadnessConEvents = parseSystemText('thornscale prowler is glad to see you. This fight would be madness - do you have a death wish?"', '2026-01-01T00:00:00.000Z');
assert.equal(friendlyMadnessConEvents[0].eventType, 'target_con');
assert.equal(friendlyMadnessConEvents[0].target, 'thornscale prowler');
assert.equal(friendlyMadnessConEvents[0].ability, 'glad | madness - do you have a death wish');
const madnessConEvents = parseSystemText('Ogre Infiltrator is prepared to attack you. This fight would be madness - do you have a death wish? (Dhaun Hunters)"', '2026-01-01T00:00:00.000Z');
assert.equal(madnessConEvents[0].eventType, 'target_con');
assert.equal(madnessConEvents[0].ability, 'prepared to attack | madness - do you have a death wish | Dhaun Hunters');

const packetEvents = parsePacketMessages([
  { id: 1, text: 'Blackberry Bush' },
  { id: 2, text: 'Harvest_Blackberry_01a' },
  { id: 3, text: 'grass snake' },
  { id: 4, text: 'CommonSnake_Emerald' }
], '2026-01-01T00:00:00.000Z');
assert.equal(packetEvents[0].eventType, 'harvest_node');
assert.equal(packetEvents[0].target, 'Blackberry Bush');
assert.equal(packetEvents[1].eventType, 'world_entity');
assert.equal(packetEvents[1].target, 'grass snake');
const combatLogPacketEvents = parsePacketMessages([
  { id: 1, text: '[15:30:32] Polona dealt 14 Magic damage to brineclaw net-weaver with Mind Vice I. (2 mitigated)' },
  { id: 2, text: "[15:30:36] Draeken's Thresh I missed brineclaw net-weaver." }
], '2026-01-01T00:00:00.000Z');
assert.equal(combatLogPacketEvents[0].eventType, 'damage_estimate');
assert.equal(combatLogPacketEvents[0].source, 'Polona');
assert.equal(combatLogPacketEvents[0].target, 'brineclaw net-weaver');
assert.equal(combatLogPacketEvents[0].ability, 'Mind Vice I');
assert.equal(combatLogPacketEvents[1].eventType, 'mitigation_estimate');
assert.equal(combatLogPacketEvents[1].amount, 2);
assert.equal(combatLogPacketEvents[2].eventType, 'ability_miss');
assert.equal(combatLogPacketEvents[2].ability, 'Thresh I');
const rheaIgniteHintPacket = parsePacketMessages([
  { id: 1, text: '[07:39:24] Rhea dealt 3 Nature damage to ashveil wasp with Ignite I. (1 mitigated)' }
], '2026-01-01T00:00:04.800Z', {
  payloadHex: '1cd1330062000000711b00006e1b0000fb0000b841fbcdc95142fb505953410a',
  context: {
    actorNameById: new Map([['711b0000', 'Rhea']]),
    entityNameById: new Map([['6e1b0000', 'Drawn Stalker']]),
    lastHealthById: new Map()
  }
});
assert.equal(rheaIgniteHintPacket[0].source, 'Rhea');
assert.equal(rheaIgniteHintPacket[0].ability, 'Ignite I');
const rheaIgnitePacketOnly = parsePacketMessages([], '2026-01-01T00:00:04.800Z', {
  payloadHex: '1cd1330062000000711b00006e1b0000fb0000b841fbcdc95142fb505953410a',
  context: {
    actorNameById: new Map([['711b0000', 'Rhea']]),
    entityNameById: new Map([['6e1b0000', 'Drawn Stalker']]),
    lastHealthById: new Map()
  }
});
assert.equal(rheaIgnitePacketOnly[0].source, 'Rhea');
assert.equal(rheaIgnitePacketOnly[0].ability, 'Ignite I (estimated)');
const polonaStrangeMagicPacket = parsePacketMessages([], '2026-01-01T00:00:04.000Z', {
  payloadHex: '1c00000062000000711b00007e670000fb0000a041fb0000a041fb0000a04000',
  context: {
    actorNameById: new Map([['711b0000', 'Polona']]),
    entityNameById: new Map([['7e670000', 'twilight prowler']]),
    lastHealthById: new Map()
  }
});
assert.equal(polonaStrangeMagicPacket[0].source, 'Polona');
assert.equal(polonaStrangeMagicPacket[0].ability, 'Strange Magic II (estimated)');
const polonaMindVicePacket = parsePacketMessages([], '2026-01-01T00:00:04.200Z', {
  payloadHex: '1c00000062000000711b00007e670000fb0000d041fb0000d041fb0000c04000',
  context: {
    actorNameById: new Map([['711b0000', 'Polona']]),
    entityNameById: new Map([['7e670000', 'twilight prowler']]),
    lastHealthById: new Map()
  }
});
assert.equal(polonaMindVicePacket[0].source, 'Polona');
assert.equal(polonaMindVicePacket[0].ability, 'Mind Vice II (estimated)');
const miningPacketEvents = parsePacketMessages([
  { id: 1, text: 'Caspilrite Ore Deposit' },
  { id: 2, text: 'Mining_Caspilrite_Normalfff?' }
], '2026-01-01T00:00:00.000Z');
assert.equal(miningPacketEvents[0].eventType, 'harvest_node');
assert.equal(miningPacketEvents[0].target, 'Caspilrite Ore Deposit');
assert.equal(miningPacketEvents[0].ability, 'Mining_Caspilrite_Normalfff?');
const noisyJutePacketEvents = parsePacketMessages([
  { id: 1, text: 'z EO' },
  { id: 2, text: 'Harvest_HempPlant_01a' }
], '2026-01-01T00:00:00.000Z');
assert.equal(noisyJutePacketEvents[0].eventType, 'harvest_node');
assert.equal(noisyJutePacketEvents[0].target, 'Jute Plant');
assert.equal(noisyJutePacketEvents[0].ability, 'Harvest_HempPlant_01a');
const spawnPacketEvents = parsePacketMessages([
  { id: 1, text: 'Mazz Truesteel (Armorsmith)' },
  { id: 2, text: 'MHM_Worker_003' }
], '2026-01-01T00:00:00.000Z', {
  payloadHex: '1c244500020000009e0500000300000036045b45105c0f443528fc44'
});
assert.equal(spawnPacketEvents[0].eventType, 'world_entity');
assert.equal(spawnPacketEvents[0].damageType, '9e050000');
assert.equal(spawnPacketEvents[0].x, 3504.263);
assert.equal(spawnPacketEvents[0].z, 2017.256);
const skeletonSpawnEvents = parsePacketMessages([
  { id: 1, text: 'brittle bonecaster' },
  { id: 2, text: 'Skeleton.Normal.GreenGlow' }
], '2026-01-01T00:00:00.000Z', {
  payloadHex: '1c24450002000000aa0106000300000036045b45105c0f443528fc44'
});
assert.equal(skeletonSpawnEvents[0].eventType, 'world_entity');
assert.equal(skeletonSpawnEvents[0].target, 'brittle bonecaster');
assert.equal(skeletonSpawnEvents[0].ability, 'Skeleton.Normal.GreenGlow');
assert.equal(skeletonSpawnEvents[0].damageType, 'aa010600');
const equippedSkeletonSpawnEvents = parsePacketMessages([
  { id: 1, text: 'skeleton' },
  { id: 2, text: 'F_WEP_STL_SWRD_01' },
  { id: 3, text: 'Skeleton.Normal.NoGlow' }
], '2026-01-01T00:00:00.000Z', {
  payloadHex: '1c24450002000000ab0106000300000036045b45105c0f443528fc44'
});
assert.equal(equippedSkeletonSpawnEvents[0].eventType, 'world_entity');
assert.equal(equippedSkeletonSpawnEvents[0].target, 'skeleton');
assert.equal(equippedSkeletonSpawnEvents[0].ability, 'Skeleton.Normal.NoGlow');
assert.equal(equippedSkeletonSpawnEvents[0].damageType, 'ab010600');
const rockboneSpawnEvents = parsePacketMessages([
  { id: 1, text: 'rockbone dreg' },
  { id: 2, text: 'Goblin_Rock' }
], '2026-01-01T00:00:00.000Z', {
  payloadHex: '1c24450002000000ac0106000300000036045b45105c0f443528fc44'
});
assert.equal(rockboneSpawnEvents[0].eventType, 'world_entity');
assert.equal(rockboneSpawnEvents[0].target, 'rockbone dreg');
assert.equal(rockboneSpawnEvents[0].ability, 'Goblin_Rock');
assert.equal(rockboneSpawnEvents[0].damageType, 'ac010600');
const deerSpawnEvents = parsePacketMessages([
  { id: 1, text: 'mottled deer' },
  { id: 2, text: 'DeerFemale' }
], '2026-01-01T00:00:00.000Z', {
  payloadHex: '1c24450002000000ae0106000300000036045b45105c0f443528fc44'
});
assert.equal(deerSpawnEvents[0].eventType, 'world_entity');
assert.equal(deerSpawnEvents[0].target, 'mottled deer');
assert.equal(deerSpawnEvents[0].ability, 'DeerFemale');
assert.equal(deerSpawnEvents[0].damageType, 'ae010600');
const buckSpawnEvents = parsePacketMessages([
  { id: 1, text: 'young buck' },
  { id: 2, text: 'DeerMale_New' }
], '2026-01-01T00:00:00.000Z', {
  payloadHex: '1c24450002000000af0106000300000036045b45105c0f443528fc44'
});
assert.equal(buckSpawnEvents[0].eventType, 'world_entity');
assert.equal(buckSpawnEvents[0].target, 'young buck');
assert.equal(buckSpawnEvents[0].ability, 'DeerMale_New');
assert.equal(buckSpawnEvents[0].damageType, 'af010600');
const elkSpawnEvents = parsePacketMessages([
  { id: 1, text: 'Wander Guardian' },
  { id: 2, text: 'Elk_GreenGlow' }
], '2026-01-01T00:00:00.000Z', {
  payloadHex: '1915001cb627008c000000e20f0100055c60b5420000c84249011cb7270002000000470b0000030000006ed12445884c07443d060d450000000071ee0f3f00000000edb4533f0000000015010000e3f60700262d00000001100057616e64657220477561726469616e0100000000'
});
assert.equal(elkSpawnEvents[0].eventType, 'world_entity');
assert.equal(elkSpawnEvents[0].target, 'Wander Guardian');
assert.equal(elkSpawnEvents[0].ability, 'Elk_GreenGlow');
assert.equal(elkSpawnEvents[0].damageType, '470b0000');
assert.equal(elkSpawnEvents[0].x, 2637.089);
assert.equal(elkSpawnEvents[0].z, 2256.39);
const gasBatSpawnEvents = parsePacketMessages([
  { id: 1, text: 'gas bat nestling' },
  { id: 2, text: 'GasBat' }
], '2026-01-01T00:00:00.000Z', {
  payloadHex: '1c24450002000000b00106000300000036045b45105c0f443528fc44'
});
assert.equal(gasBatSpawnEvents[0].eventType, 'world_entity');
assert.equal(gasBatSpawnEvents[0].target, 'gas bat nestling');
assert.equal(gasBatSpawnEvents[0].ability, 'GasBat');
assert.equal(gasBatSpawnEvents[0].damageType, 'b0010600');
const thornscaleSpawnEvents = parsePacketMessages([
  { id: 1, text: 'thornscale prowler' },
  { id: 2, text: 'FantasyBeast_Green' }
], '2026-01-01T00:00:00.000Z', {
  payloadHex: '1c24450002000000b10106000300000036045b45105c0f443528fc44'
});
assert.equal(thornscaleSpawnEvents[0].eventType, 'world_entity');
assert.equal(thornscaleSpawnEvents[0].target, 'thornscale prowler');
assert.equal(thornscaleSpawnEvents[0].ability, 'FantasyBeast_Green');
assert.equal(thornscaleSpawnEvents[0].damageType, 'b1010600');
const junkBatNameEvents = parsePacketMessages([
  { id: 1, text: 'LEg)' },
  { id: 2, text: 'CommonBat_Dusk' }
], '2026-01-01T00:00:00.000Z');
assert.equal(junkBatNameEvents.length, 0);
const thicketStalkerSpawnEvents = parsePacketMessages([
  { id: 1, text: 'thicket stalker' },
  { id: 2, text: 'FantasyTiger_Panther' }
], '2026-01-01T00:00:00.000Z', {
  payloadHex: '1937011c4d030002000000a70b01000300000097ff334583480844e141114500000000d7895f3f000000003888f93e0000000003010000e3f60700262d000000011000746869636b6574207374616b65720100020000fb0000c03ffb0000803f00040100000000000000000001'
});
assert.equal(thicketStalkerSpawnEvents[0].eventType, 'world_entity');
assert.equal(thicketStalkerSpawnEvents[0].target, 'thicket stalker');
assert.equal(thicketStalkerSpawnEvents[0].ability, 'FantasyTiger_Panther');
assert.equal(thicketStalkerSpawnEvents[0].damageType, 'a70b0100');
assert.equal(thicketStalkerSpawnEvents[0].x, 2879.974);
assert.equal(thicketStalkerSpawnEvents[0].z, 2324.117);
const vorcheirusSpawnEvents = parsePacketMessages([
  { id: 1, text: 'young vorcheirus grazer' },
  { id: 2, text: 'Deinocheirus_Green' }
], '2026-01-01T00:00:00.000Z', {
  payloadHex: '1c24450002000000b20106000300000036045b45105c0f443528fc44'
});
assert.equal(vorcheirusSpawnEvents[0].eventType, 'world_entity');
assert.equal(vorcheirusSpawnEvents[0].target, 'young vorcheirus grazer');
assert.equal(vorcheirusSpawnEvents[0].ability, 'Deinocheirus_Green');
assert.equal(vorcheirusSpawnEvents[0].damageType, 'b2010600');
const equippedNpcSpawnEvents = parsePacketMessages([
  { id: 1, text: 'Thronefast Regular' },
  { id: 2, text: 'F_WEP_STL_SWRD_06' },
  { id: 3, text: 'F_WEP_STL_SHLD_01' },
  { id: 4, text: 'MHF_PolishedPlate_Full_002' }
], '2026-01-01T00:00:00.000Z', {
  payloadHex: '1c24450002000000ad0106000300000036045b45105c0f443528fc44'
});
assert.equal(equippedNpcSpawnEvents[0].eventType, 'world_entity');
assert.equal(equippedNpcSpawnEvents[0].target, 'Thronefast Regular');
assert.equal(equippedNpcSpawnEvents[0].ability, 'MHF_PolishedPlate_Full_002');
assert.equal(equippedNpcSpawnEvents[0].damageType, 'ad010600');
const movedEntityContext = {
  entityNameById: new Map([['9e050000', 'Mazz Truesteel (Armorsmith)']]),
  actorNameById: new Map(),
  lastHealthById: new Map()
};
const movedEntityEvents = parsePacketMessages([], '2026-01-01T00:00:02.000Z', {
  payloadHex: '1c244500020000009e0500000300000036045b45105c0f443528fc44',
  context: movedEntityContext
});
assert.equal(movedEntityEvents[0].eventType, 'world_entity');
assert.equal(movedEntityEvents[0].target, 'Mazz Truesteel (Armorsmith)');
assert.equal(movedEntityEvents[0].x, 3504.263);
assert.deepEqual(extractSpawnEntityIds('1c140e00020000006f10060003000000'), ['6f100600']);
assert.deepEqual(
  extractSpawnRecords('1c244500020000009e0500000300000036045b45105c0f443528fc44')[0],
  { entityId: '9e050000', spawnType: 'entity', x: 3504.263, y: 573.438, z: 2017.256 }
);
assert.deepEqual(
  extractSpawnRecords('1c16040002000000f1080100030000000d224945c6160d4478d91345000000001e3e7c3f0000000056cc2e3e00000000fe000000e3f607002629000000010c00677261737320736e616b650100020000fb0000003ffb9a99593f00040100000000000000000001000000020b00000000')[0],
  { entityId: 'f1080100', spawnType: 'entity', x: 3218.128, y: 564.356, z: 2365.592, dispositionCode: '02', entityKind: 'mob', level: 1 }
);
assert.deepEqual(
  extractSpawnRecords('1cf4110002000000ac060000030000005e6a6c4501f00544e551524500000000a9baa73e0000000096df71bf000000004f010000e3f60700263a000000011d00486173746572202843726f7373726f61647320537570706c696572290100030000fb0000003ffb0000004000020100000001000000000001000000500b00000000')[0],
  { entityId: 'ac060000', spawnType: 'entity', x: 3782.648, y: 535.75, z: 3365.118, dispositionCode: '03', entityKind: 'npc', level: 40 }
);
assert.equal(
  extractSpawnRecords('1c5c030002000000a801000003000000e0ebb344f2f11244c050cf43000000004aeb483f000000008ba41e3f000000002e010000e3f607002629000000010c0074696d62657220776f6c660100020000fb0000c03ffb0000c03f00040100000000000000000001000000200b00000000fb0000803ffb0000803f18000000020000fb00004d45fb00004d4501fb00005e43fb00005e431100000080000000000000000000000000100000003600000002000000a1689704274f074f8d0f1e274f003720f9ea842201000100017db5b95794e2b445b134f62135c06dd0f90e85240100010001240000000001000000f30ea8010000a8010000f6c00102010000ff3a1c02ec486a3a4000000000')[0].level,
  16
);
assert.equal(
  extractSpawnRecords('1c5d020002000000050000000300000018e5be44c4d81244845de943000000006add4ebf00000000bbce163f000000002d010000e3f607002629000000010c0074696d62657220776f6c660100020000fb0000c03ffb0000c03f00040100000000000000000001000000240b00000000fb0000803ffb0000803f18000000020000fb00e07145fb00e0714501fb00006e43fb00006e431100000080000000000000000000000000100000003600000002000000d949ae82d9ebe341802540659ee3be58f9ea84220100010001fdef9e9a3a5463479594d1156a6ef000f90e85240100010001230000000001000000050500000005000000f6c00102010000ff837703160a7439400000000000')[0].level,
  18
);
const targetConContext = {
  entityNameById: new Map(),
  actorNameById: new Map(),
  lastHealthById: new Map()
};
parsePacketMessages([], '2026-06-03T04:53:24.175Z', {
  payloadHex: '1910001c1c00007a000000e20f0100a801000011001c1d00007f000000e20f0100a80100000023001afc000000e20f01000000012587fb9463b444fb61431344fbb1efde43000000000000',
  packet: { dstPort: 7102 },
  context: targetConContext
});
const targetConEvents = parsePacketMessages([{ text: 'timber wolf is glad to see you. This would be an evenly matched fight.' }], '2026-06-03T04:53:24.666Z', {
  payloadHex: '1c7603001a010000e20f01000700536f77706c7a470074696d62657220776f6c6620697320676c616420746f2073656520796f752e205468697320776f756c6420626520616e206576656e6c79206d6174636865642066696768742e1c000000e20f0100',
  packet: { srcPort: 7102 },
  context: targetConContext
});
assert.equal(targetConEvents.find((event) => event.eventType === 'target_con').damageType, 'a8010000');
const renameConContext = {
  entityNameById: new Map([['a8010000', 'Unknown entity a8010000']]),
  actorNameById: new Map(),
  lastHealthById: new Map()
};
parsePacketMessages([], '2026-06-03T04:53:24.175Z', {
  payloadHex: '1910001c1c00007a000000e20f0100a801000011001c1d00007f000000e20f0100a80100000023001afc000000e20f01000000012587fb9463b444fb61431344fbb1efde43000000000000',
  packet: { dstPort: 7102 },
  context: renameConContext
});
parsePacketMessages([{ text: 'Krex is indifferent to your presence. This would be a trivial fight.' }], '2026-06-03T04:53:24.666Z', {
  payloadHex: '1c7603001a010000e20f01000700536f77706c7a47004b72657820697320696e646966666572656e7420746f20796f75722070726573656e63652e205468697320776f756c642062652061207472697669616c2066696768742e1c000000e20f0100',
  packet: { srcPort: 7102 },
  context: renameConContext
});
assert.equal(renameConContext.entityNameById.get('a8010000'), 'Krex');
assert.deepEqual(
  extractHealthRecords('1c120f008c0000006f100600000000e8420000fa42')[0],
  { entityId: '6f100600', current: 116, max: 125 }
);
assert.equal(normalizeCharacterNameToken('NexarionY'), 'Nexarion');
assert.equal(normalizeCharacterNameToken('Ash Tree'), null);
assert.equal(normalizeCharacterNameToken('Campfire'), null);
assert.deepEqual(
  extractNamedEntityRecords('1a010000df0f060009004e65786172696f6e5900')[0],
  { entityId: 'df0f0600', name: 'Nexarion', rawName: 'NexarionY' }
);
assert.deepEqual(
  extractNamedEntityRecords('1a01000002fb00000700536f77706c7a5400')[0],
  { entityId: '02fb0000', name: 'Sowplz', rawName: 'SowplzT' }
);
assert.deepEqual(
  extractNamedEntityRecords('1c4b2800020000002af6000002000000831f4c45bb7b0d446cfb184500000000c536fa3d000000000b157ebf0000000000030000e3f6410032300000000108004b616c6164696e0e003c4461726b204d61737465723e')[0],
  { entityId: '2af60000', name: 'Kaladin', rawName: 'Kaladin' }
);
assert.deepEqual(
  extractNamedEntityRecords('1c0d0000020000004e1b000002000000ba2030429b531b42c68e52c300000000f487053e0000000068d07d3f0000000075030000e3f6410032220000000107005468796574680100080000')[0],
  { entityId: '4e1b0000', name: 'Thyeth', rawName: 'Thyeth' }
);
assert.deepEqual(
  extractNamedEntityRecords('1c051c0002000000521b000002000000444b4a42b7e61d42734a33c300000000d95d753f00000000d60792be00000000da030000e3f64100322c00000001080041726368696f730a003c4d696e204d61783e')[0],
  { entityId: '521b0000', name: 'Archios', rawName: 'Archios' }
);
assert.deepEqual(
  extractNamedEntityRecords('010a00536f77666f72796f750b00006a1c0000010b004167726f6d616e6365720700006c1c0000010a004b6f6b6272656174680801006e1c0000').map((record) => ({
    entityId: record.entityId,
    name: record.name
  })),
  [
    { entityId: '6a1c0000', name: 'Sowforyou' },
    { entityId: '6c1c0000', name: 'Agromancer' },
    { entityId: '6e1c0000', name: 'Kokbreath' }
  ]
);
assert.deepEqual(
  extractNamedEntityRecords('1931001c9f2d001a010000661b000009004d6368616d6d61721200796f752077616e6e6120726570206d653f05000000691b000015001ca02d008c000000691b0000090000db430000fa44'),
  [{ entityId: '691b0000', name: 'Mchammar', rawName: 'Mchammar' }]
);
assert.deepEqual(
  extractNamedEntityRecords('1c1935001a010000661b0000080041726368696f7335007765206861766520726f6f6d20696620796f752077616e7420746f206a6f696e2c206f6e65206973206c656176696e67206e6f7705000000701b0000'),
  [{ entityId: '701b0000', name: 'Archios', rawName: 'Archios' }]
);
assert.deepEqual(
  extractServerDamageRecords('1c7a290062000000df0f0600ad140600fb00006842')[0],
  { sourceId: 'df0f0600', targetId: 'ad140600', amount: 58, mitigated: null, damageType: null, ability: null }
);
assert.deepEqual(
  extractServerDamageRecords('1a620000001d1b0000d40c0000fb0000e040fb5cf01a41fbf8e6f73f00000f030100f910490101210035343430')[0],
  { sourceId: '1d1b0000', targetId: 'd40c0000', amount: 7, mitigated: 1, damageType: null, ability: null }
);
assert.deepEqual(
  extractServerDamageRecords('0e000000df0f06004c001ca8290062000000df0f0600ad140600fb0000ae42')[0],
  { sourceId: 'df0f0600', targetId: 'ad140600', amount: 87, mitigated: 14, damageType: null, ability: null }
);
assert.deepEqual(
  extractServerDamageRecords('1cd1330062000000df0f0600a8130600fb00009c42fbcdc95142fb5059534103')[0],
  { sourceId: 'df0f0600', targetId: 'a8130600', amount: 78, mitigated: 13, damageType: 'Cold', ability: null }
);
assert.deepEqual(
  extractServerDamageRecords('1c00340062000000df0f0600a8130600fb0000aa42fb8a47a842fb003aab4106')[0],
  { sourceId: 'df0f0600', targetId: 'a8130600', amount: 85, mitigated: 21, damageType: 'Shock', ability: null }
);
assert.deepEqual(
  extractServerDamageRecords('1c4f440062000000df0f0600d7190600fb00005841fbc0801341fb10161640060000002100f9fe2f01012100')[0],
  { sourceId: 'df0f0600', targetId: 'd7190600', amount: 13, mitigated: 2, damageType: 'Shock', ability: 'Jolt I' }
);
assert.deepEqual(
  extractServerDamageRecords('1c83440062000000df0f0600d7190600fb0000ac42fbec96aa42fbbc93ad41060000000100f9063e01012100')[0],
  { sourceId: 'df0f0600', targetId: 'd7190600', amount: 86, mitigated: 21, damageType: 'Shock', ability: null }
);
assert.deepEqual(
  extractServerDamageRecords('1c9304006200000002fb00004ace0000fb00003442fb435c2842fb8c2e37410a0000000100f9044801012100')[0],
  { sourceId: '02fb0000', targetId: '4ace0000', amount: 45, mitigated: 11, damageType: 'Nature', ability: 'Ignite III' }
);
assert.deepEqual(
  extractServerDamageRecords('1ca704006200000002fb00004ace0000fb00002041fb00001041fb48ad1c400a010000010001f9142200')[0],
  { sourceId: '02fb0000', targetId: '4ace0000', amount: 10, mitigated: 2, damageType: 'Nature', ability: 'Ignite III' }
);
assert.deepEqual(
  extractServerDamageRecords('1c2215006200000002fb0000e3fb0000fb00006041fb00005041fba44f62400a010000010001f9202200')[0],
  { sourceId: '02fb0000', targetId: 'e3fb0000', amount: 14, mitigated: 3, damageType: 'Nature', ability: 'Stinging Swarm II' }
);
assert.deepEqual(
  extractServerDamageRecords('1c2a420062000000711b0000c01a0000fb00000040fb00004040fbc0f5283f00010000010001f9f81500')[0],
  { sourceId: '711b0000', targetId: 'c01a0000', amount: 2, mitigated: 0, damageType: 'Physical', ability: 'Shrapnel I' }
);
assert.deepEqual(
  extractServerDamageRecords('1c4d1e0062000000711b0000891b0000fb0000a841fbce62d441fb3c4abc400a0000000100f9ae3a01012100')[0],
  { sourceId: '711b0000', targetId: '891b0000', amount: 21, mitigated: 5, damageType: 'Nature', ability: 'Brightfire Blast I' }
);
assert.deepEqual(
  extractServerDamageRecords('1c3e420062000000791b0000c01a0000fb00000442fbecaf2e42fb983c1541060000000100f95e4a01012100')[0],
  { sourceId: '791b0000', targetId: 'c01a0000', amount: 33, mitigated: 9, damageType: 'Shock', ability: 'Jolt II' }
);
assert.deepEqual(
  extractServerDamageRecords('1c79420062000000711b0000c01a0000fb0000b841fbec80e741fb183dcd400a0000000100f9ae3a01012100')[0],
  { sourceId: '711b0000', targetId: 'c01a0000', amount: 23, mitigated: 6, damageType: 'Nature', ability: 'Brightfire Blast I' }
);
assert.deepEqual(
  extractServerDamageRecords('1c21420062000000731b0000c01a0000fb0000a841fbe234ea41fb50c2bc40080000000100f9a84601012100')[0],
  { sourceId: '731b0000', targetId: 'c01a0000', amount: 21, mitigated: 5, damageType: 'Divine', ability: 'Dawnfire I' }
);
assert.deepEqual(
  extractServerDamageRecords('1c91420062000000731b0000c01a0000fb0000803ffb00000040fbd052ce3e0a010000010001f92c2200')[0],
  { sourceId: '731b0000', targetId: 'c01a0000', amount: 1, mitigated: 0, damageType: 'Nature', ability: 'Thorncoat' }
);
assert.deepEqual(
  extractServerDamageRecords('1cc5420062000000701b0000c01a0000fb00008841fb1679ba41fbc0499640020000000100f9e84401012100')[0],
  { sourceId: '701b0000', targetId: 'c01a0000', amount: 17, mitigated: 4, damageType: 'Fire', ability: 'Corrupt Blood II' }
);
assert.deepEqual(
  extractServerDamageRecords('1ce7420062000000701b0000c01a0000fb0000e040fbe2971e41fbd0bffd3f00010000010001f96a1f00')[0],
  { sourceId: '701b0000', targetId: 'c01a0000', amount: 7, mitigated: 1, damageType: 'Physical', ability: 'Bleeding Essence' }
);
assert.deepEqual(
  extractServerDamageRecords('1cb62900620000002af600002cf60000fb00009242fbb1a38742fb947d9241000017020100f9ce4a01012100')[0],
  { sourceId: '2af60000', targetId: '2cf60000', amount: 73, mitigated: 18, damageType: 'Physical', ability: 'Swift Shot II' }
);
assert.deepEqual(
  extractServerDamageRecords('1cc52900620000002af600002cf60000fb0000e841fb9bc8d541fbe4e2e640000017020100f92a2401012100')[0],
  { sourceId: '2af60000', targetId: '2cf60000', amount: 29, mitigated: 7, damageType: 'Physical', ability: 'Auto Attack Impact' }
);
assert.deepEqual(
  extractServerDamageRecords('1cdd2900620000002af600002cf60000fb0000da42fb4c19c642fbc439da41000017020100f9964a01001900')[0],
  { sourceId: '2af60000', targetId: '2cf60000', amount: 109, mitigated: 27, damageType: 'Physical', ability: 'Volley of Arrows I' }
);
assert.equal(
  extractServerDamageRecords('1c4a390062000000df0f06004e180600fb776f5b42fb21d85b42fbcc7a5d41030000004000').length,
  0
);
assert.deepEqual(
  extractClientActionCandidate('54554badf71b29b3a2400000', { dstPort: 7106 }),
  { opcode: '54', ability: 'Client action 0x54', signature: '54554badf71b29b3a2400000', byteLength: 12 }
);
assert.equal(extractClientActionCandidate('5d611effffffffffffffff00', { dstPort: 7106 }), null);
assert.equal(extractClientActionCandidate('1c5e0100c2000000df0f0600', { dstPort: 7106 }), null);
assert.deepEqual(
  extractClientAbilityCastRecords('1c4c01004901000002fb00002a240000', { dstPort: 7102 })[0],
  { sourceId: '02fb0000', ability: 'Spirit of the Wolf', state: null, token: '2a24', signature: '1c4c01004901000002fb00002a240000', byteLength: 16 }
);
assert.deepEqual(
  extractClientAbilityCastRecords('1c5601004901000002fb0000e8230000', { dstPort: 7102 })[0],
  { sourceId: '02fb0000', ability: 'Cloak of Leaves', state: 'Invisibility', token: 'e823', signature: '1c5601004901000002fb0000e8230000', byteLength: 16 }
);
assert.deepEqual(
  extractClientAbilityCastRecords('1910001c5c01004901000002fb00000824000023001afc00000002fb000000000151e8fb2e134545fb8ac50c44fbcc772145000000000000', { dstPort: 7102 })[0],
  { sourceId: '02fb0000', ability: 'Nature Shroud', state: 'Spell Power +5, Resistances +2, Health Regen +1', token: '0824', signature: '1c5c01004901000002fb000008240000', byteLength: 56 }
);
assert.deepEqual(
  extractClientPositionRecord('1afc00000002fb00000000013fedfb2e134545fb8ac50c44fbcc772145000000000000', { dstPort: 7102 }),
  { entityId: '02fb0000', heading: 333.63, headingRaw: -4801, x: 3153.199, y: 563.087, z: 2583.487 }
);
assert.deepEqual(
  extractClientPositionRecord('1910001c5c01004901000002fb00000824000023001afc00000002fb000000000151e8fb2e134545fb8ac50c44fbcc772145000000000000', { dstPort: 7102 }),
  { entityId: '02fb0000', heading: 326.69, headingRaw: -6063, x: 3153.199, y: 563.087, z: 2583.487 }
);
assert.deepEqual(
  extractClientPositionRecord('1afc000000311c00000000015003fb42b11f42fb6f2d1c42fbaf3076c3000000000000', { dstPort: 7108 }),
  { entityId: '311c0000', heading: 4.66, headingRaw: 848, x: 39.923, y: 39.044, z: -246.19 }
);
assert.deepEqual(
  extractClientPositionRecord('1afc000000e3190000000001ef4efbe78744c3fbfa0e2d44fb04733bc4000000000000', { dstPort: 7105 }),
  { entityId: 'e3190000', heading: 111, headingRaw: 20207, x: -196.531, y: 692.234, z: -749.797 }
);
assert.deepEqual(
  extractClientPositionRecord('1afc000000e90f0000010909e322fbab7e7245fba7c60044fb272b40c5704500002eb6', { dstPort: 7107 }),
  { entityId: 'e90f0000', heading: 49.06, headingRaw: 8931, x: 3879.917, y: 515.104, z: -3074.697 }
);
assert.deepEqual(
  extractClientPositionRecord('1afc000000e90f0000010909e322fbab7e7245fba7c60044fb272b40c5704500002eb6', { dstPort: 7110 }),
  { entityId: 'e90f0000', heading: 49.06, headingRaw: 8931, x: 3879.917, y: 515.104, z: -3074.697 }
);
assert.deepEqual(
  extractServerActorPositionRecords('2c001a02010000721c0000c5d67de1e46d20410000014a00fb40885842fbb36a0442fbed9018c300000000000002', { srcPort: 7108 })[0],
  { entityId: '721c0000', x: 54.133, y: 33.104, z: -152.566 }
);
assert.deepEqual(
  extractServerActorPositionRecords('192c001a02010000e90f0000544843d79f8aaf400101017926fb1d6b7245fba7c60044fbe73040c56a440000644200', { srcPort: 7107 })[0],
  { entityId: 'e90f0000', x: 3878.695, y: 515.104, z: -3075.056 }
);
const unknownNearbyEvents = parsePacketMessages([], '2026-01-01T00:00:00.000Z', {
  payloadHex: '2c001a02010000721c0000c5d67de1e46d20410000014a00fb40885842fbb36a0442fbed9018c300000000000002',
  packet: { srcPort: 7108 },
  context: {
    localActorId: 'local000',
    lastPositionById: new Map([['local000', { observedAt: '2026-01-01T00:00:00.000Z', x: 54, y: 33, z: -153 }]])
  }
});
assert.equal(unknownNearbyEvents[0].eventType, 'world_entity');
assert.equal(unknownNearbyEvents[0].target, 'Unknown entity 721c0000');
assert.equal(unknownNearbyEvents[0].ability, 'entityKind:mob');
const fartherUnknownNearbyEvents = parsePacketMessages([], '2026-01-01T00:00:00.000Z', {
  payloadHex: '2c001a02010000721c0000c5d67de1e46d20410000014a00fb40885842fbb36a0442fbed9018c300000000000002',
  packet: { srcPort: 7108 },
  context: {
    localActorId: 'local000',
    lastPositionById: new Map([['local000', { observedAt: '2026-01-01T00:00:00.000Z', x: 20, y: 20, z: -50 }]])
  }
});
assert.equal(fartherUnknownNearbyEvents[0].eventType, 'world_entity');
const playerPositionEvents = parsePacketMessages([], '2026-01-01T00:00:00.000Z', {
  payloadHex: '2c001a02010000721c0000c5d67de1e46d20410000014a00fb40885842fbb36a0442fbed9018c300000000000002',
  packet: { srcPort: 7108 },
  context: { actorNameById: new Map([['721c0000', 'Trueshot']]) }
});
assert.equal(playerPositionEvents[0].eventType, 'player_position');
assert.equal(playerPositionEvents[0].source, 'Trueshot');
const localServerPositionEvents = parsePacketMessages([], '2026-01-01T00:00:00.000Z', {
  payloadHex: '2c001a02010000721c0000c5d67de1e46d20410000014a00fb40885842fbb36a0442fbed9018c300000000000002',
  packet: { srcPort: 7108 },
  context: {
    actorNameById: new Map([['721c0000', 'Trueshot']]),
    localActorId: '721c0000',
    localActorName: 'Trueshot'
  }
});
assert.equal(localServerPositionEvents[0].eventType, 'position_update');
assert.equal(localServerPositionEvents[0].source, 'Trueshot');
assert.equal(localServerPositionEvents[0].x, 54.133);
const renamedClientPositionEvents = parsePacketMessages([], '2026-01-01T00:00:00.000Z', {
  payloadHex: '1afc000000e90f0000010909e322fbab7e7245fba7c60044fb272b40c5704500002eb6',
  packet: { dstPort: 7110 },
  context: {
    actorNameById: new Map([['e90f0000', 'Nexendia']]),
    localActorNameById: new Map(),
    lastPositionById: new Map()
  }
});
assert.equal(renamedClientPositionEvents[0].eventType, 'position_update');
assert.equal(renamedClientPositionEvents[0].source, 'Nexendia');
const staleClientPositionContext = {
  actorNameById: new Map([['02fb0000', 'Sowplz']]),
  entityNameById: new Map(),
  lastHealthById: new Map(),
  localActorId: '02fb0000',
  localActorName: 'Sowplz',
  lastClientPositionById: new Map([['02fb0000', { observedAt: '2026-01-01T00:00:00.000Z', x: 3153.199, y: 563.087, z: 2583.487, heading: 333.63 }]]),
  lastPositionById: new Map([['02fb0000', { observedAt: '2026-01-01T00:00:01.000Z', x: 3157.199, y: 563.087, z: 2583.487, sourceType: 'server_actor_position' }]])
};
assert.equal(parsePacketMessages([], '2026-01-01T00:00:02.000Z', {
  payloadHex: '1afc00000002fb00000000013fedfb2e134545fb8ac50c44fbcc772145000000000000',
  packet: { dstPort: 7102 },
  context: staleClientPositionContext
}).length, 0);
assert.equal(staleClientPositionContext.lastPositionById.get('02fb0000').x, 3157.199);
assert.deepEqual(
  extractServerAbilityEffectRecords('193c001ca235005701000002fb000083a7ebb4d13f1f41e82300004e134545a2c50c44cc7721459759a343', { srcPort: 7102 })[0],
  { targetId: '02fb0000', ability: 'Cloak of Leaves', state: 'Invisibility', token: 'e823', signature: '5701000002fb000083a7ebb4d13f1f41e8230000', byteLength: 43 }
);
assert.deepEqual(
  extractServerAbilityEffectRecords('193c001c6738005701000002fb0000e78bbd9f64441f41082400002e1345458ac50c44cc7721459759a343', { srcPort: 7102 })[0],
  { targetId: '02fb0000', ability: 'Nature Shroud', state: 'Spell Power +5, Resistances +2, Health Regen +1', token: '0824', signature: '5701000002fb0000e78bbd9f64441f4108240000', byteLength: 43 }
);

const context = { entityNameById: new Map(), lastHealthById: new Map() };
parsePacketMessages([{ id: 1, text: 'yellowback hornet' }, { id: 2, text: 'Hornet_Yellow' }], '2026-01-01T00:00:00.000Z', {
  payloadHex: '1c140e00020000006f10060003000000',
  context
});
const hpEvents = parsePacketMessages([], '2026-01-01T00:00:01.000Z', {
  payloadHex: '1c120f008c0000006f100600000000e8420000fa42',
  context
});
assert.equal(hpEvents[0].eventType, 'health_update');
assert.equal(hpEvents[0].target, 'yellowback hornet');
const damageEstimateEvents = parsePacketMessages([], '2026-01-01T00:00:02.000Z', {
  payloadHex: '1c120f008c0000006f100600000000d8420000fa42',
  context
});
const observedDamage = damageEstimateEvents.find((event) => event.eventType === 'damage_estimate');
assert.equal(observedDamage.source, 'Unattributed damage');
assert.equal(observedDamage.ability, 'Health delta (estimated)');
assert.equal(observedDamage.amount, 8);

const spellContext = { entityNameById: new Map(), lastHealthById: new Map() };
const actionEvents = parsePacketMessages([], '2026-01-01T00:00:01.000Z', {
  payloadHex: '54554badf71b29b3a2400000',
  packet: { dstPort: 7106 },
  context: spellContext
});
assert.equal(actionEvents[0].eventType, 'client_action_candidate');
assert.equal(actionEvents[0].ability, 'Client action 0x54 (candidate)');
const killEstimateEvents = parsePacketMessages([{ id: 20, text: 'You have slain grass beetle hatchling and you have gained some experience (+some rested).' }], '2026-01-01T00:00:02.000Z', {
  payloadHex: '1ca11e008c0000003911060000000000000000fa42',
  context: spellContext
});
assert.equal(killEstimateEvents.some((event) => event.eventType === 'kill'), true);
const spellDamage = killEstimateEvents.find((event) => event.eventType === 'damage_estimate');
assert.equal(spellDamage, undefined);

const serverDamageContext = {
  entityNameById: new Map([['ad140600', 'jackrabbit']]),
  lastHealthById: new Map(),
  recentAbilityHints: [],
  localActorId: 'df0f0600',
  localActorName: 'Nexarion'
};
parsePacketMessages([{ id: 30, text: 'cOlD' }], '2026-01-01T00:00:03.000Z', {
  payloadHex: '',
  context: serverDamageContext
});
const serverDamageEvents = parsePacketMessages([], '2026-01-01T00:00:04.000Z', {
  payloadHex: '1a010000df0f060009004e65786172696f6e59001c7a290062000000df0f0600ad140600fb00006842',
  context: serverDamageContext
});
assert.equal(serverDamageEvents[0].eventType, 'damage_estimate');
assert.equal(serverDamageEvents[0].source, 'Nexarion');
assert.equal(serverDamageEvents[0].target, 'jackrabbit');
assert.equal(serverDamageEvents[0].ability, 'Blast of Cold (estimated)');
assert.equal(serverDamageEvents[0].amount, 58);
serverDamageContext.lastHealthById.set('ad140600', { entityId: 'ad140600', current: 100, max: 100 });
const delayedServerHealthEvents = parsePacketMessages([], '2026-01-01T00:00:04.750Z', {
  payloadHex: '1c120f008c000000ad140600000028420000c842',
  context: serverDamageContext
});
assert.equal(delayedServerHealthEvents.some((event) => event.eventType === 'damage_estimate'), false);

const nexendiaHintContext = {
  entityNameById: new Map([['ad140600', 'brineclaw mudskimmer']]),
  actorNameById: new Map(),
  lastHealthById: new Map(),
  recentAbilityHints: [],
  localActorId: 'df0f0600',
  localActorName: 'Nexendia'
};
parsePacketMessages([{ id: 31, text: '[15:50:58] Nexendia dealt 7 Magic damage to brineclaw mudskimmer with Aether Darts. (2 mitigated)' }], '2026-01-01T00:00:03.500Z', {
  payloadHex: '',
  context: nexendiaHintContext
});
const nexendiaHintedDamage = parsePacketMessages([], '2026-01-01T00:00:04.000Z', {
  payloadHex: '1cb6290062000000df0f0600ad140600fb00006842',
  context: nexendiaHintContext
});
assert.equal(nexendiaHintedDamage[0].source, 'Nexendia');
assert.equal(nexendiaHintedDamage[0].target, 'brineclaw mudskimmer');
assert.equal(nexendiaHintedDamage[0].ability, 'Aether Darts (estimated)');

const discoveredActors = [];
parsePacketMessages([], '2026-01-01T00:00:04.500Z', {
  payloadHex: '1c4b2800020000002af6000002000000831f4c45bb7b0d446cfb184500000000c536fa3d000000000b157ebf0000000000030000e3f6410032300000000108004b616c6164696e0e003c4461726b204d61737465723e',
  context: { entityNameById: new Map(), lastHealthById: new Map() },
  onActorName: (record) => discoveredActors.push(record)
});
assert.deepEqual(discoveredActors, [{
  entityId: '2af60000',
  name: 'Kaladin',
  rawName: 'Kaladin',
  isLocal: false,
  observedAt: '2026-01-01T00:00:04.500Z'
}]);

const unknownActorEvents = parsePacketMessages([], '2026-01-01T00:00:04.750Z', {
  payloadHex: '1cb62900620000002af600002cf60000fb00009242fbb1a38742fb947d9241000017020100f9ce4a01012100',
  context: { entityNameById: new Map([['2cf60000', 'brown rat']]), lastHealthById: new Map() }
});
assert.equal(unknownActorEvents[0].source, 'Unknown actor 2af60000');
assert.equal(unknownActorEvents[0].ability, 'Swift Shot II (estimated)');

const entitySourceDamageEvents = parsePacketMessages([], '2026-01-01T00:00:04.775Z', {
  payloadHex: '1c00000062000000f81f000042360000fb00008040',
  context: {
    entityNameById: new Map([
      ['f81f0000', 'bogbellied hopper'],
      ['42360000', 'brineclaw shore-stalker']
    ]),
    lastHealthById: new Map()
  }
});
assert.equal(entitySourceDamageEvents[0].source, 'bogbellied hopper');
assert.equal(entitySourceDamageEvents[0].target, 'brineclaw shore-stalker');
assert.equal(entitySourceDamageEvents[0].amount, 4);

const shadowfoxSerpentineEvents = parsePacketMessages([], '2026-01-01T00:00:04.780Z', {
  payloadHex: '1c00000062000000075f00007e670000fb00004041fb00004041fb0000404000',
  context: {
    actorNameById: new Map([['075f0000', 'Shadowfox']]),
    entityNameById: new Map([['7e670000', 'wildleaf poppywig']]),
    lastHealthById: new Map()
  }
});
assert.equal(shadowfoxSerpentineEvents[0].source, 'Shadowfox');
assert.equal(shadowfoxSerpentineEvents[0].target, 'wildleaf poppywig');
assert.equal(shadowfoxSerpentineEvents[0].amount, 12);
assert.equal(shadowfoxSerpentineEvents[0].mitigated, undefined);
assert.equal(shadowfoxSerpentineEvents[0].ability, 'Serpentine Strike I (estimated)');

const shadowfoxSerpentineHighEvents = parsePacketMessages([], '2026-01-01T00:00:04.780Z', {
  payloadHex: '1c00000062000000075f00007e670000fb00006041fb00006041fb0000404000',
  context: {
    actorNameById: new Map([['075f0000', 'Shadowfox']]),
    entityNameById: new Map([['7e670000', 'wildleaf poppywig']]),
    lastHealthById: new Map()
  }
});
assert.equal(shadowfoxSerpentineHighEvents[0].amount, 14);
assert.equal(shadowfoxSerpentineHighEvents[0].ability, 'Serpentine Strike I (estimated)');

const shadowfoxBaneEvents = parsePacketMessages([], '2026-01-01T00:00:04.780Z', {
  payloadHex: '1c00000062000000075f00007e670000fb00008040fb00008040fb0000803f00',
  context: {
    actorNameById: new Map([['075f0000', 'Shadowfox']]),
    entityNameById: new Map([['7e670000', 'wildleaf poppywig']]),
    lastHealthById: new Map()
  }
});
assert.equal(shadowfoxBaneEvents[0].amount, 4);
assert.equal(shadowfoxBaneEvents[0].ability, 'Bane of Venom I (estimated)');

const shadowfoxFangEvents = parsePacketMessages([], '2026-01-01T00:00:04.780Z', {
  payloadHex: '1c00000062000000075f00007e670000fb0000a041fb0000a041fb0000804000',
  context: {
    actorNameById: new Map([['075f0000', 'Shadowfox']]),
    entityNameById: new Map([['7e670000', 'wildleaf poppywig']]),
    lastHealthById: new Map()
  }
});
assert.equal(shadowfoxFangEvents[0].amount, 20);
assert.equal(shadowfoxFangEvents[0].ability, 'Fang of Harune I (estimated)');

const shadowfoxAutoAttackEvents = parsePacketMessages([], '2026-01-01T00:00:04.781Z', {
  payloadHex: '1c00000062000000075f00007e670000fb0000a040fb0000a040fb0000803f00',
  context: {
    actorNameById: new Map([['075f0000', 'Shadowfox']]),
    entityNameById: new Map([['7e670000', 'wildleaf poppywig']]),
    lastHealthById: new Map()
  }
});
assert.equal(shadowfoxAutoAttackEvents[0].source, 'Shadowfox');
assert.equal(shadowfoxAutoAttackEvents[0].amount, 5);
assert.equal(shadowfoxAutoAttackEvents[0].ability, 'Auto Attack (estimated)');

const mobDamageToActorEvents = parsePacketMessages([], '2026-01-01T00:00:04.782Z', {
  payloadHex: '1c00000062000000eb630000075f0000fb0000803f',
  context: {
    actorNameById: new Map([['075f0000', 'Shadowfox']]),
    entityNameById: new Map(),
    lastHealthById: new Map()
  }
});
assert.equal(mobDamageToActorEvents[0].source, 'Unknown actor eb630000');
assert.equal(mobDamageToActorEvents[0].target, 'Shadowfox');

const petNameRecords = [];
const petNameContext = {
  actorNameById: new Map([['e90f0000', 'Nexendia']]),
  petNameById: new Map(),
  entityNameById: new Map([['42360000', 'brineclaw shore-stalker']]),
  lastHealthById: new Map()
};
const petNameEvents = parsePacketMessages([
  { id: 41, text: 'Yaser' },
  { id: 42, text: "<Nexendia's Minion>" }
], '2026-01-01T00:00:04.785Z', {
  payloadHex: '1c00000002000000f81f000003000000',
  context: petNameContext,
  onPetName: (record) => petNameRecords.push(record)
});
assert.deepEqual(petNameRecords, [{
  entityId: 'f81f0000',
  name: 'Yaser',
  ownerName: 'Nexendia',
  rawTitle: "<Nexendia's Minion>",
  observedAt: '2026-01-01T00:00:04.785Z'
}]);
assert.equal(petNameEvents.find((event) => event.eventType === 'pet_name').target, 'Yaser');
const petDamageEvents = parsePacketMessages([], '2026-01-01T00:00:04.790Z', {
  payloadHex: '1c00000062000000f81f000042360000fb00008040',
  context: petNameContext
});
assert.equal(petDamageEvents[0].source, "Nexendia's Minion");
const jotikContext = {
  actorNameById: new Map([['e90f0000', 'Nexendia']]),
  petNameById: new Map([['33700000', 'Zotik']]),
  entityNameById: new Map([['a46f0000', 'ashveil wasp']]),
  lastHealthById: new Map()
};
parsePacketMessages([
  { id: 50, text: '[21:59:55] Zotik dealt 22 Magic damage to ashveil wasp with Mana Spike. (5 mitigated)' }
], '2026-01-01T00:00:04.850Z', {
  payloadHex: '',
  context: jotikContext
});
const jotikBlastOfMagic = parsePacketMessages([], '2026-01-01T00:00:04.900Z', {
  payloadHex: '1c0000006200000033700000a46f0000fb00001041fb00001041fb00000040',
  context: jotikContext
});
assert.equal(jotikBlastOfMagic[0].source, 'Zotik');
assert.equal(jotikBlastOfMagic[0].ability, 'Blast of Magic (estimated)');
const jotikManaSpike = parsePacketMessages([], '2026-01-01T00:00:05.000Z', {
  payloadHex: '1c0000006200000033700000a46f0000fb0000b041fb0000b041fb0000a040',
  context: jotikContext
});
assert.equal(jotikManaSpike[0].source, 'Zotik');
assert.equal(jotikManaSpike[0].ability, 'Mana Spike (estimated)');
const jotikManaFlameLog = parsePacketMessages([
  { id: 51, text: '[22:05:59] Zotik dealt 17 Magic damage to nylem hatchling with Mana Flame. (4 mitigated)' }
], '2026-01-01T00:00:05.100Z', {
  payloadHex: '',
  context: jotikContext
});
assert.equal(jotikManaFlameLog[0].source, 'Zotik');
assert.equal(jotikManaFlameLog[0].ability, 'Mana Flame');
const jotikManaFlame = parsePacketMessages([], '2026-01-01T00:00:05.200Z', {
  payloadHex: '1c0000006200000033700000a46f0000fb00008841fb00008841fb00008040',
  context: jotikContext
});
assert.equal(jotikManaFlame[0].source, 'Zotik');
assert.equal(jotikManaFlame[0].ability, 'Mana Flame (estimated)');

const nonLocalSchoolOnlyEvents = parsePacketMessages([], '2026-01-01T00:00:04.800Z', {
  payloadHex: '1cd1330062000000711b00006e1b0000fb0000b841fbcdc95142fb505953410a',
  context: {
    actorNameById: new Map([['711b0000', 'Thyeth']]),
    entityNameById: new Map([['6e1b0000', 'Drawn Stalker']]),
    lastHealthById: new Map()
  }
});
assert.equal(nonLocalSchoolOnlyEvents[0].source, 'Thyeth');
assert.equal(nonLocalSchoolOnlyEvents[0].damageType, 'Nature');
assert.equal(nonLocalSchoolOnlyEvents[0].ability, 'Unknown ability (estimated)');

const learnedPatternContext = {
  actorNameById: new Map([['711b0000', 'Polona']]),
  entityNameById: new Map([['891b0000', 'ashveil wasp']]),
  lastHealthById: new Map(),
  recentAbilityHints: [],
  learnedDamagePatterns: new Map()
};
const learnedPatternLog = parsePacketMessages([
  { id: 60, text: '[21:45:00] Polona dealt 21 Fire damage to ashveil wasp with Ember Bolt. (5 mitigated)' }
], '2026-01-01T00:00:00.000Z', {
  payloadHex: '',
  context: learnedPatternContext
});
assert.equal(learnedPatternLog[0].source, 'Polona');
assert.equal(learnedPatternLog[0].ability, 'Ember Bolt');
const learnedPatternPacket = parsePacketMessages([], '2026-01-01T00:00:04.000Z', {
  payloadHex: '1c4d1e0062000000711b0000891b0000fb0000a841fbce62d441fb3c4abc4002',
  context: learnedPatternContext
});
assert.equal(learnedPatternPacket[0].source, 'Polona');
assert.equal(learnedPatternPacket[0].target, 'ashveil wasp');
assert.equal(learnedPatternPacket[0].ability, 'Ember Bolt (estimated)');

const buffCastEvents = parsePacketMessages([], '2026-01-01T00:00:04.875Z', {
  payloadHex: '1c4c01004901000002fb00002a240000',
  packet: { dstPort: 7102 },
  context: {
    actorNameById: new Map([['02fb0000', 'Sowplz']]),
    entityNameById: new Map(),
    lastHealthById: new Map(),
    localActorId: '02fb0000',
    localActorName: 'Sowplz'
  }
});
assert.equal(buffCastEvents[0].eventType, 'ability_cast_candidate');
assert.equal(buffCastEvents[0].source, 'Sowplz');
assert.equal(buffCastEvents[0].target, 'Sowplz');
assert.equal(buffCastEvents[0].ability, 'Spirit of the Wolf (candidate)');

const cloakEvents = parsePacketMessages([], '2026-01-01T00:00:04.950Z', {
  payloadHex: '1c5601004901000002fb0000e8230000',
  packet: { dstPort: 7102 },
  context: {
    actorNameById: new Map([['02fb0000', 'Sowplz']]),
    entityNameById: new Map(),
    lastHealthById: new Map(),
    localActorId: '02fb0000',
    localActorName: 'Sowplz'
  }
});
assert.equal(cloakEvents[0].eventType, 'ability_cast_candidate');
assert.equal(cloakEvents[0].source, 'Sowplz');
assert.equal(cloakEvents[0].ability, 'Cloak of Leaves (candidate)');
const cloakEffectEvents = parsePacketMessages([], '2026-01-01T00:00:05.000Z', {
  payloadHex: '193c001ca235005701000002fb000083a7ebb4d13f1f41e82300004e134545a2c50c44cc7721459759a343',
  packet: { srcPort: 7102 },
  context: {
    actorNameById: new Map([['02fb0000', 'Sowplz']]),
    entityNameById: new Map(),
    lastHealthById: new Map(),
    localActorId: '02fb0000',
    localActorName: 'Sowplz'
  }
});
assert.equal(cloakEffectEvents[0].eventType, 'ability_effect_candidate');
assert.equal(cloakEffectEvents[0].target, 'Sowplz');
assert.equal(cloakEffectEvents[0].ability, 'Cloak of Leaves (effect candidate)');
assert.equal(cloakEffectEvents[0].damageType, 'Invisibility');

const natureShroudEvents = parsePacketMessages([], '2026-01-01T00:00:05.100Z', {
  payloadHex: '1910001c5c01004901000002fb00000824000023001afc00000002fb000000000151e8fb2e134545fb8ac50c44fbcc772145000000000000',
  packet: { dstPort: 7102 },
  context: {
    actorNameById: new Map([['02fb0000', 'Sowplz']]),
    entityNameById: new Map(),
    lastHealthById: new Map(),
    localActorId: '02fb0000',
    localActorName: 'Sowplz'
  }
});
const natureShroudCast = natureShroudEvents.find((event) => event.eventType === 'ability_cast_candidate');
assert.equal(natureShroudCast.source, 'Sowplz');
assert.equal(natureShroudCast.ability, 'Nature Shroud (candidate)');
const natureShroudPosition = natureShroudEvents.find((event) => event.eventType === 'position_update');
assert.equal(natureShroudPosition.source, 'Sowplz');
assert.equal(natureShroudPosition.x, 3153.199);
const natureShroudEffectEvents = parsePacketMessages([], '2026-01-01T00:00:05.200Z', {
  payloadHex: '193c001c6738005701000002fb0000e78bbd9f64441f41082400002e1345458ac50c44cc7721459759a343',
  packet: { srcPort: 7102 },
  context: {
    actorNameById: new Map([['02fb0000', 'Sowplz']]),
    entityNameById: new Map(),
    lastHealthById: new Map(),
    localActorId: '02fb0000',
    localActorName: 'Sowplz'
  }
});
assert.equal(natureShroudEffectEvents[0].eventType, 'ability_effect_candidate');
assert.equal(natureShroudEffectEvents[0].target, 'Sowplz');
assert.equal(natureShroudEffectEvents[0].ability, 'Nature Shroud (effect candidate)');
assert.equal(natureShroudEffectEvents[0].damageType, 'Spell Power +5, Resistances +2, Health Regen +1');

const positionContext = {
  actorNameById: new Map([['02fb0000', 'Sowplz']]),
  entityNameById: new Map(),
  lastHealthById: new Map(),
  localActorId: '02fb0000',
  localActorName: 'Sowplz'
};
const positionEvents = parsePacketMessages([], '2026-01-01T00:00:05.300Z', {
  payloadHex: '1afc00000002fb00000000013fedfb2e134545fb8ac50c44fbcc772145000000000000',
  packet: { dstPort: 7102 },
  context: positionContext
});
assert.equal(positionEvents[0].eventType, 'position_update');
assert.equal(positionEvents[0].source, 'Sowplz');
assert.equal(positionEvents[0].x, 3153.199);
assert.equal(positionEvents[0].y, 563.087);
assert.equal(positionEvents[0].z, 2583.487);
assert.equal(parsePacketMessages([], '2026-01-01T00:00:05.800Z', {
  payloadHex: '1afc00000002fb00000000013fedfb2e134545fb8ac50c44fbcc772145000000000000',
  packet: { dstPort: 7102 },
  context: positionContext
}).length, 0);

const watcherContext = {
  actorNameById: new Map([['02fb0000', 'Sowplz']]),
  entityNameById: new Map([['6d1b0000', 'Drawn Cabalist']]),
  lastHealthById: new Map([['6d1b0000', { entityId: '6d1b0000', current: 690, max: 690 }]]),
  localActorId: '02fb0000',
  localActorName: 'Sowplz'
};
const watcherEvents = parsePacketMessages([], '2026-01-01T00:00:06.200Z', {
  payloadHex: '1c120f008c0000006d1b0000000000804200002c44',
  context: watcherContext
});
assert.equal(watcherEvents.some((event) => event.eventType === 'damage_estimate' && event.source === 'Sowplz'), false);
const watcherDamage = watcherEvents.find((event) => event.eventType === 'damage_estimate');
assert.equal(watcherDamage.source, 'Unattributed damage');
assert.equal(watcherDamage.ability, 'Health delta (estimated)');

const npcMovementEvents = parsePacketMessages([], '2026-01-01T00:00:06.300Z', {
  payloadHex: '2c001a020100008a1900004cc862ae566d2041150000bcbffb3955ac42fbfe25be41fb7f37e0c200be9ea3e2a0002',
  packet: { srcPort: 7108 },
  context: {
    entityNameById: new Map([['8a190000', 'Drawn Scavenger']]),
    lastHealthById: new Map()
  }
});
assert.equal(npcMovementEvents[0].eventType, 'world_entity');
assert.equal(npcMovementEvents[0].target, 'Drawn Scavenger');
assert.equal(npcMovementEvents[0].amount, null);
assert.equal(npcMovementEvents[0].x, 86.166);

const pendingDamageContext = {
  entityNameById: new Map(),
  lastHealthById: new Map(),
  recentAbilityHints: []
};
parsePacketMessages([{ id: 31, text: 'cOlD' }], '2026-01-01T00:00:05.000Z', {
  payloadHex: '',
  context: pendingDamageContext
});
const immediateUnknownDamage = parsePacketMessages([], '2026-01-01T00:00:06.000Z', {
  payloadHex: '1c7a290062000000df0f0600ad140600fb00006842',
  context: pendingDamageContext
}).find((event) => event.eventType === 'damage_estimate');
assert.equal(immediateUnknownDamage.observedAt, '2026-01-01T00:00:06.000Z');
assert.equal(immediateUnknownDamage.target, 'Unknown entity ad140600');
assert.equal(immediateUnknownDamage.amount, 58);
const flushedDamage = parsePacketMessages([{ id: 32, text: 'You have slain jackrabbit and you have gained some experience (+some rested).' }], '2026-01-01T00:00:07.000Z', {
  payloadHex: '1c9c29008c000000ad14060000000000000000fa42',
  context: pendingDamageContext
}).find((event) => event.eventType === 'damage_estimate');
assert.equal(flushedDamage, undefined);

console.log('parser tests passed');
