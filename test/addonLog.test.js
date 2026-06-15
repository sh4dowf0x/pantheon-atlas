const assert = require('node:assert/strict');
const { parseAddonLogLine } = require('../src/addonLog');

const damageLine = JSON.stringify({
  timestamp: '2026-06-08T19:08:53.0387027-07:00',
  category: 'Chat',
  raw: '[CombatDamageOutgoing] Combat Damage: [Outgoing/Damage/Self] Nexerin dealt 170 Fire damage to ashveil wasp with Evoke Embers. (42 mitigated)',
  chatChannel: 'CombatDamageOutgoing',
  sender: 'Combat Damage',
  combatFilter: 'Outgoing/Damage/Self',
  eventType: 'damage',
  source: 'Nexerin',
  target: 'ashveil wasp',
  amount: 170,
  damageType: 'Fire',
  ability: 'Evoke Embers',
  mitigated: 42,
  critical: false,
  absorbed: false,
  immune: false
});

const damageEvents = parseAddonLogLine(damageLine);
assert.equal(damageEvents.length, 2);
assert.equal(damageEvents[0].eventType, 'damage_estimate');
assert.equal(damageEvents[0].source, 'Nexerin');
assert.equal(damageEvents[0].target, 'ashveil wasp');
assert.equal(damageEvents[0].amount, 170);
assert.equal(damageEvents[0].damageType, 'Fire');
assert.equal(damageEvents[0].ability, 'Evoke Embers');
assert.equal(damageEvents[1].eventType, 'mitigation_estimate');
assert.equal(damageEvents[1].amount, 42);
assert.ok(damageEvents[0].eventKey);

const combatDataLine = JSON.stringify({
  timestamp: '2026-06-10T03:33:47.9984795-07:00',
  category: 'CombatMessage',
  chatChannel: 'CombatDamageOutgoing',
  sender: 'Combat Damage',
  raw: '[Outgoing/Damage/Self] Nexerin dealt 60 Fire damage to young black bear with Combustion. (10 mitigated)',
  direction: 'Outgoing',
  combatFilter: 'Damage',
  playerFilter: 'Self',
  eventType: 'damage',
  source: 'Nexerin',
  target: 'young black bear',
  amount: 60,
  damageType: 'Fire',
  ability: 'Combustion',
  mitigated: 10,
  critical: false,
  absorbed: false,
  immune: false
});
const combatDataEvents = parseAddonLogLine(combatDataLine);
assert.equal(combatDataEvents.length, 2);
assert.equal(combatDataEvents[0].eventType, 'damage_estimate');
assert.equal(combatDataEvents[0].source, 'Nexerin');
assert.equal(combatDataEvents[0].target, 'young black bear');
assert.equal(combatDataEvents[0].ability, 'Combustion');
assert.equal(combatDataEvents[0].amount, 60);
assert.equal(combatDataEvents[1].eventType, 'mitigation_estimate');
assert.equal(combatDataEvents[1].amount, 10);

const localLine = JSON.stringify({
  timestamp: '2026-06-08T19:08:10.0162203-07:00',
  category: 'LocalPlayer',
  raw: 'Local: Nexerin L20 Human Wizard CharacterId=3950'
});
const localEvents = parseAddonLogLine(localLine);
assert.equal(localEvents.length, 1);
assert.equal(localEvents[0].eventType, 'local_player');
assert.equal(localEvents[0].source, 'Nexerin');
assert.equal(localEvents[0].target, 'Human Wizard');
assert.equal(localEvents[0].ability, 'Level 20');
assert.equal(localEvents[0].damageType, 'addon:3950');

const killLine = JSON.stringify({
  timestamp: '2026-06-08T19:08:53.0328705-07:00',
  category: 'Chat',
  raw: '[Experience] Nexerin: You have slain ashveil wasp.',
  chatChannel: 'Experience',
  sender: 'Nexerin'
});
const killEvents = parseAddonLogLine(killLine);
assert.equal(killEvents.length, 1);
assert.equal(killEvents[0].eventType, 'kill');
assert.equal(killEvents[0].target, 'ashveil wasp');

const experienceLine = JSON.stringify({
  timestamp: '2026-06-12T21:21:52.2541282-07:00',
  category: 'ExperienceChanged',
  eventType: 'experience',
  raw: 'XP current=24925 delta=469 toNext=39317 percent=0.6339 deltaPercent=0.0119',
  current: 24925,
  toNextLevel: 39317,
  experiencePercentage: 0.6339497,
  previousCurrent: 24456,
  previousToNextLevel: 39317,
  previousExperiencePercentage: 0.622021,
  deltaCurrent: 469,
  deltaToNextLevel: 0,
  deltaExperiencePercentage: 0.011928678,
  sourceCharacterName: 'Nexee',
  sourceCharacterId: 7396
});
const experienceEvents = parseAddonLogLine(experienceLine);
assert.equal(experienceEvents.length, 1);
assert.equal(experienceEvents[0].eventType, 'experience');
assert.equal(experienceEvents[0].source, 'Nexee');
assert.equal(experienceEvents[0].amount, 469);
assert.equal(experienceEvents[0].damageType, '24925/39317');
assert.equal(experienceEvents[0].x, 24925);
assert.equal(experienceEvents[0].y, 39317);
assert.equal(experienceEvents[0].z, 0.6339497);
assert.equal(experienceEvents[0].heading, 24456);

assert.deepEqual(parseAddonLogLine('{not json'), []);

console.log('addon log tests passed');
