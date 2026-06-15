const ABILITY_CLASS_HINTS = [
  {
    className: 'Wizard',
    confidence: 95,
    abilities: [
      'Blast of Cold',
      'Combustion',
      'Evoke Embers',
      'Flat Spell Damage (Fire)',
      'Radiate Heat',
      'Sparking Bolt'
    ]
  },
  {
    className: 'Summoner',
    confidence: 95,
    abilities: [
      'Aether Darts',
      'Aether Shards',
      'Blast Creation II',
      'Blast Creation X',
      'Clash Charge',
      'Frail Mana Bomb'
    ]
  },
  {
    className: 'Druid',
    confidence: 95,
    abilities: [
      'Conjure Bolt I',
      'Ignite II',
      'Preserver\'s Wildfire',
      'Stinging Swarm I',
      'Stinging Swarm II',
      'Verdanfire Seed'
    ]
  },
  {
    className: 'Enchanter',
    confidence: 95,
    abilities: [
      'Mind Vice I',
      'Mind Vice II',
      'Strange Magic',
      'Strange Magic II'
    ]
  },
  {
    className: 'Warrior',
    confidence: 95,
    abilities: [
      'Assault I',
      'Assault II',
      'Commanding Strike II',
      'Mocking Blow II',
      'Storm I'
    ]
  },
  {
    className: 'Shaman',
    confidence: 95,
    abilities: [
      'Bane of Venom I',
      'Fang of Harune I',
      'Serpentine Strike I'
    ]
  },
  {
    className: 'Dire Lord',
    confidence: 95,
    abilities: [
      'Corrupt Blood I',
      'Corrupt Blood II',
      'Fleshcarver'
    ]
  },
  {
    className: 'Ranger',
    confidence: 95,
    abilities: [
      'Brightfire Blast I',
      'Howling Arrow II',
      "Predator's Fury I",
      'Swift Shot II',
      'Volley of Arrows I'
    ]
  },
  {
    className: 'Rogue',
    confidence: 90,
    abilities: [
      'Backstab',
      'Backstab I',
      'Bleeding Wound',
      'Bloodletter II',
      'Lucky Strike',
      'Lucky Strike I',
      'Twin Fangs I',
      'Veiled Strike II'
    ]
  },
  {
    className: 'Summoner Pet',
    confidence: 100,
    abilities: [
      'Blast of Magic',
      'Mana Burst',
      'Mana Burst I',
      'Mana Spike',
      'Tempest',
      'Tempest I',
      'Tempest II',
      'Galestrike',
      'Galestrike I',
      'Galestrike II',
      'Wind Blade',
      'Wind Blade I',
      'Wind Blade II'
    ]
  },
  {
    className: 'Monk',
    confidence: 90,
    abilities: [
      'Blackjack Kick II'
    ]
  },
  {
    className: 'Shaman',
    confidence: 85,
    abilities: [
      'Talisman of Regrowth II'
    ]
  }
];

const PET_FAMILY_BY_ABILITY = new Map([
  ['Blast of Magic', 'Fury Arcament'],
  ['Mana Burst', 'Fury Arcament'],
  ['Mana Burst I', 'Fury Arcament'],
  ['Mana Spike', 'Fury Arcament'],
  ['Galestrike', 'Air Arcamental'],
  ['Galestrike I', 'Air Arcamental'],
  ['Galestrike II', 'Air Arcamental'],
  ['Tempest', 'Air Arcamental'],
  ['Tempest I', 'Air Arcamental'],
  ['Tempest II', 'Air Arcamental'],
  ['Wind Blade', 'Air Arcamental'],
  ['Wind Blade I', 'Air Arcamental'],
  ['Wind Blade II', 'Air Arcamental']
]);

function normalizeAbilityName(ability) {
  const name = String(ability || '').replace(/\s+\(estimated\)$/i, '').trim();
  if (!name || /^Unknown ability\b/i.test(name)) return null;
  if (/^Client action 0x/i.test(name)) return null;
  return name;
}

function inferAbilityClass(ability) {
  const name = normalizeAbilityName(ability);
  if (!name) return { className: 'Unknown', confidence: 0 };
  for (const hint of ABILITY_CLASS_HINTS) {
    if (hint.abilities.includes(name)) {
      return { className: hint.className, confidence: hint.confidence };
    }
  }
  return { className: 'Unknown', confidence: 25 };
}

function inferAbilityCategory(event = {}) {
  const ability = normalizeAbilityName(event.ability) || '';
  const eventType = String(event.eventType || '');
  if (eventType === 'healing') return 'heal';
  if (/auto attack/i.test(ability)) return 'auto';
  if (/flat spell damage/i.test(ability)) return 'proc';
  if (/shroud|cloak|spirit of the wolf/i.test(ability)) return 'buff';
  if (eventType === 'damage_estimate' || eventType === 'damage') return 'direct';
  return 'unknown';
}

function inferPetFamily(ability) {
  const name = normalizeAbilityName(ability);
  return name ? PET_FAMILY_BY_ABILITY.get(name) || null : null;
}

function abilityRegistryRecordFromEvent(event = {}) {
  const abilityName = normalizeAbilityName(event.ability);
  if (!abilityName) return null;
  if (!['damage', 'damage_estimate', 'healing'].includes(String(event.eventType || ''))) return null;
  const inferred = inferAbilityClass(abilityName);
  return {
    abilityName,
    className: inferred.className,
    category: inferAbilityCategory({ ...event, ability: abilityName }),
    petFamily: inferPetFamily(abilityName),
    damageType: event.damageType || null,
    confidence: inferred.confidence,
    observedAt: event.observedAt || new Date().toISOString()
  };
}

module.exports = {
  ABILITY_CLASS_HINTS,
  abilityRegistryRecordFromEvent,
  inferAbilityCategory,
  inferAbilityClass,
  inferPetFamily,
  normalizeAbilityName
};
