const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseLootLogLine } = require('../src/lootLog');
const { getLootItemDetail, getLootSummary } = require('../src/dashboard');
const { openStore } = require('../src/store');

const lootLine = JSON.stringify({
  timestamp: '2026-06-10T05:14:49.2136718-07:00',
  eventType: 'inventory_snapshot',
  character: 'Nexerin',
  characterId: 3950,
  itemInstanceId: '39754b60-7e02-4878-84b8-0c3009b9875c',
  itemName: 'Shadesilk Mask',
  item: {
    InstanceId: '39754b60-7e02-4878-84b8-0c3009b9875c',
    ItemId: 700,
    Name: 'Shadesilk Mask',
    StackSize: 1,
    SlotType: 'Equipped',
    SlotIndex: 0,
    CharacterId: 3950,
    CorpseId: 0,
    ParentGuid: '00000000-0000-0000-0000-000000000000',
    Template: {
      itemId: '700',
      itemName: 'Shadesilk Mask',
      itemDescription: '',
      itemType: 'Armor',
      itemFlags: 'CanNotBeTraded, Unique, Magic',
      itemWeight: '1.4',
      itemLevel: '0',
      requiredLevel: '19',
      armorTypeName: 'Cloth',
      maxDamage: '0',
      delay: '0',
      coinValue: '975',
      rarity: 'Rare',
      weaponType: 'None',
      equipSlotName: 'Head',
      classRequirementNames: 'Rogue, Ranger, Bard',
      requiredProficiency: 'Cloth',
      statModifiers: [{ stat: 'Stamina', value: 2 }]
    }
  }
});

const parsed = parseLootLogLine(lootLine);
assert.equal(parsed.item.itemId, '700');
assert.equal(parsed.item.name, 'Shadesilk Mask');
assert.equal(parsed.item.rarity, 'Rare');
assert.equal(parsed.item.requiredLevel, 19);
assert.equal(JSON.parse(parsed.item.flagsJson).includes('Magic'), true);
assert.equal(parsed.instance.slotType, 'Equipped');
assert.equal(parsed.event.itemName, 'Shadesilk Mask');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pantheon-loot-test-'));
const store = openStore(path.join(tempDir, 'test.sqlite'));
assert.equal(store.upsertLootItem(parsed.item), true);
assert.equal(store.upsertLootInstance(parsed.instance), true);
assert.equal(store.insertLootEvent(parsed.event), true);

const summary = getLootSummary(store.db);
assert.equal(summary.totals.items, 1);
assert.equal(summary.totals.instances, 1);
assert.equal(summary.totals.events, 1);
assert.equal(summary.totals.rareItems, 1);
assert.equal(summary.rows[0].name, 'Shadesilk Mask');
assert.deepEqual(summary.rows[0].stats.statModifiers, [{ stat: 'Stamina', value: 2 }]);

const detail = getLootItemDetail(store.db, '700');
assert.equal(detail.name, 'Shadesilk Mask');
assert.equal(detail.displaySubtype, 'Cloth');
assert.equal(detail.equipSlotName, 'Head');
assert.equal(detail.classRequirementNames, 'Rogue, Ranger, Bard');
assert.equal(detail.requiredProficiency, 'Cloth');
assert.equal(detail.instances[0].character, 'Nexerin');
assert.equal(detail.events[0].eventType, 'inventory_snapshot');

const weaponLine = JSON.stringify({
  timestamp: '2026-06-10T05:14:49.2184526-07:00',
  eventType: 'inventory_snapshot',
  character: 'Nexerin',
  characterId: 3950,
  itemInstanceId: 'c0348ff4-fe96-497c-aa03-521a7edd9b48',
  itemName: "Gnossa's Walking Stick",
  item: {
    InstanceId: 'c0348ff4-fe96-497c-aa03-521a7edd9b48',
    ItemId: 14025,
    Name: "Gnossa's Walking Stick",
    StackSize: 1,
    SlotType: 'Storage',
    SlotIndex: 0,
    CharacterId: 3950,
    Template: {
      itemId: '14025',
      itemName: "Gnossa's Walking Stick",
      itemDescription: 'A well-worn walking staff.',
      itemType: 'Weapon',
      itemFlags: 'Unique, Magic, BindOnEquip',
      itemWeight: '5',
      itemLevel: '0',
      requiredLevel: '4',
      armorTypeName: 'HeavyPlate',
      maxDamage: '20',
      delay: '3.3',
      coinValue: '135',
      rarity: 'Uncommon',
      weaponType: 'LongStaff',
      primarySkill: 'MartialStaves',
      equipSlotName: 'Primary Hand',
      classRequirementNames: 'Warrior, Cleric, Wizard',
      requiredProficiency: 'Martial Staves',
      statModifiers: null
    },
    StatModifiers: [
      { StatName: 'Curse Resistance', Value: 4 },
      { StatName: 'Health', Value: 6 },
      { StatName: 'Mana', Value: 6 }
    ],
    MultiplierModifiers: [],
    RequirementOverrides: [
      { Requirement: 'Class', Value: 'Warrior, Cleric, Wizard' }
    ]
  }
});
const parsedWeapon = parseLootLogLine(weaponLine);
store.upsertLootItem(parsedWeapon.item);
store.upsertLootInstance(parsedWeapon.instance);
store.insertLootEvent(parsedWeapon.event);
const weapon = getLootItemDetail(store.db, '14025');
assert.equal(weapon.displaySubtype, 'LongStaff');
assert.equal(weapon.primarySkill, 'MartialStaves');
assert.equal(weapon.equipSlotName, 'Primary Hand');
assert.equal(weapon.classRequirementNames, 'Warrior, Cleric, Wizard');
assert.equal(weapon.requiredProficiency, 'Martial Staves');
assert.equal(weapon.armorTypeName, 'HeavyPlate');
assert.deepEqual(weapon.stats.statModifiers, [
  { stat: 'Curse Resistance', value: 4 },
  { stat: 'Health', value: 6 },
  { stat: 'Mana', value: 6 }
]);
assert.deepEqual(weapon.stats.requirementOverrides, [
  { Requirement: 'Class', Value: 'Warrior, Cleric, Wizard' }
]);

const direLordHeadItems = getLootSummary(store.db, {
  className: 'Rogue',
  slot: 'Head',
  maxLevel: 20,
  sort: 'armor'
});
assert.equal(direLordHeadItems.rows.length, 1);
assert.equal(direLordHeadItems.rows[0].name, 'Shadesilk Mask');
assert.equal(direLordHeadItems.rows[0].equipSlotName, 'Head');
assert.equal(direLordHeadItems.rows[0].classRequirementNames, 'Rogue, Ranger, Bard');

const weaponDpsItems = getLootSummary(store.db, {
  className: 'Warrior',
  slot: 'Primary Hand',
  sort: 'dps'
});
assert.equal(weaponDpsItems.rows[0].name, "Gnossa's Walking Stick");
assert.equal(weaponDpsItems.rows[0].weaponDps, 6.06);

const computedStatsLine = `:${JSON.stringify({
  timestamp: '2026-06-15T04:10:00.8531648-07:00',
  eventType: 'inventory_snapshot',
  character: 'Nexee',
  characterId: 7396,
  itemInstanceId: '839dc8d7-ecd3-4b9b-add9-6b490bdcef0d',
  itemName: 'Vinebrute Mail Helm',
  item: {
    InstanceId: '839dc8d7-ecd3-4b9b-add9-6b490bdcef0d',
    ItemId: 19395,
    Name: 'Vinebrute Mail Helm',
    StackSize: 1,
    SlotType: 'Equipped',
    SlotIndex: 0,
    CharacterId: 7396,
    Template: {
      itemId: '19395',
      itemName: 'Vinebrute Mail Helm',
      itemType: 'Armor',
      itemFlags: 'BindOnEquip',
      requiredLevel: '15',
      armorTypeName: 'LightChain',
      equipSlotName: 'Head',
      classRequirementNames: 'Warrior, Cleric, Paladin, Dire Lord, Ranger, Shaman, Bard',
      requiredProficiency: 'Chain and Scale',
      coinValue: '375',
      rarity: 'Uncommon'
    },
    StatModifiers: [],
    InstanceStatModifiers: [
      { type: 'computedItemStat', stat: 'Strength', modifierValue: '1', source: 'Item.GetStatValue' },
      { type: 'computedItemStat', stat: 'Dexterity', modifierValue: '1', source: 'Item.GetStatValue' },
      { type: 'computedItemStat', stat: 'Armor', modifierValue: '12', source: 'Item.GetStatValue' }
    ]
  }
})}`;
const parsedComputedStats = parseLootLogLine(computedStatsLine);
assert.deepEqual(JSON.parse(parsedComputedStats.item.statsJson).statModifiers, [
  { stat: 'Strength', value: 1, source: 'Item.GetStatValue', type: 'computedItemStat' },
  { stat: 'Dexterity', value: 1, source: 'Item.GetStatValue', type: 'computedItemStat' },
  { stat: 'Armor', value: 12, source: 'Item.GetStatValue', type: 'computedItemStat' }
]);

const acquiredLine = JSON.stringify({
  timestamp: '2026-06-15T09:22:44.6713488-07:00',
  eventType: 'item_added',
  character: 'Nexee',
  characterId: 7396,
  itemInstanceId: '44052bf9-4543-41c1-8a32-b9724e373983',
  itemName: 'Wolf Fang',
  acquisition: {
    method: 'recent_offensive_target',
    confidence: 'low',
    corpseId: null,
    source: {
      name: 'black roan wolf (rabid)',
      characterId: -1,
      networkId: 526,
      entityType: 'GroundSpawn',
      x: 2753.6104,
      y: 529.67847,
      z: 2235.0076,
      healthPercent: 0
    },
    evidence: ['used offensive target seen within 30 seconds of item add']
  },
  item: {
    InstanceId: '44052bf9-4543-41c1-8a32-b9724e373983',
    ItemId: 14581,
    Name: 'Wolf Fang',
    StackSize: 1,
    SlotType: 'Storage',
    SlotIndex: 6,
    CharacterId: 7396,
    Template: {
      itemId: '14581',
      itemName: 'Wolf Fang',
      itemType: 'Reagent',
      rarity: 'Common',
      coinValue: '12'
    }
  }
});
const parsedAcquired = parseLootLogLine(acquiredLine);
assert.equal(parsedAcquired.event.source, 'black roan wolf (rabid)');
store.upsertLootItem(parsedAcquired.item);
store.upsertLootInstance(parsedAcquired.instance);
store.insertLootEvent(parsedAcquired.event);
const wolfFang = getLootItemDetail(store.db, '14581');
assert.equal(wolfFang.events[0].source, 'black roan wolf (rabid)');
assert.equal(wolfFang.events[0].acquisition.method, 'recent_offensive_target');
assert.equal(wolfFang.events[0].acquisition.confidence, 'low');
assert.equal(wolfFang.events[0].acquisition.source.name, 'black roan wolf (rabid)');
assert.equal(wolfFang.dropSources[0].name, 'black roan wolf (rabid)');
assert.equal(wolfFang.dropSources[0].count, 1);
assert.deepEqual(wolfFang.dropSources[0].methods, ['recent_offensive_target']);
assert.deepEqual(wolfFang.dropSources[0].confidences, ['low']);
assert.equal(wolfFang.dropSources[0].x, 2753.6104);
assert.equal(wolfFang.dropSources[0].z, 2235.0076);

store.close();
fs.rmSync(tempDir, { recursive: true, force: true });

assert.equal(parseLootLogLine('{not json'), null);

console.log('loot log tests passed');
