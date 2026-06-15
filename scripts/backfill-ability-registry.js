const { readConfig } = require('../src/config');
const { openStore } = require('../src/store');
const { abilityRegistryRecordFromEvent } = require('../src/abilityRegistry');

const config = readConfig();
const store = openStore(config.database.path);
store.db.prepare('DELETE FROM ability_registry').run();
const upsertAbility = store.db.prepare(`
  INSERT INTO ability_registry (
    ability_name, class_name, category, pet_family, damage_type, confidence,
    first_seen, last_seen, seen_count
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  ON CONFLICT(ability_name) DO UPDATE SET
    class_name = CASE
      WHEN excluded.confidence >= ability_registry.confidence THEN excluded.class_name
      ELSE ability_registry.class_name
    END,
    category = CASE
      WHEN ability_registry.category = 'unknown' THEN excluded.category
      ELSE ability_registry.category
    END,
    pet_family = COALESCE(excluded.pet_family, ability_registry.pet_family),
    damage_type = COALESCE(ability_registry.damage_type, excluded.damage_type),
    confidence = MAX(ability_registry.confidence, excluded.confidence),
    last_seen = excluded.last_seen,
    seen_count = ability_registry.seen_count + 1
`);

const rows = store.db.prepare(`
  SELECT observed_at observedAt, event_type eventType, ability, damage_type damageType
  FROM game_events
  WHERE event_type IN ('damage_estimate', 'healing')
    AND ability IS NOT NULL
    AND ability NOT LIKE 'Unknown ability%'
    AND ability NOT LIKE '%(estimated)'
  ORDER BY observed_at ASC, id ASC
`).all();

let learned = 0;
for (const row of rows) {
  const record = abilityRegistryRecordFromEvent(row);
  if (!record) continue;
  upsertAbility.run(
    record.abilityName,
    record.className,
    record.category,
    record.petFamily,
    record.damageType,
    record.confidence,
    record.observedAt,
    record.observedAt
  );
  learned += 1;
}

store.close();
console.log(`Backfilled ${learned} ability observations from ${rows.length} combat rows.`);
