const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { abilityRegistryRecordFromEvent } = require('./abilityRegistry');
const { seedKnownNamedMobs } = require('./namedMobs');

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function mergeLootTemplateJson(incomingJson, existingJson) {
  const incoming = parseJsonObject(incomingJson);
  const existing = parseJsonObject(existingJson);
  const preservedKeys = ['artUrl', 'artSource', 'iconUrl', 'communitySources'];
  for (const key of preservedKeys) {
    if ((incoming[key] === undefined || incoming[key] === null || incoming[key] === '') && existing[key] !== undefined && existing[key] !== null && existing[key] !== '') {
      incoming[key] = existing[key];
    }
  }
  return JSON.stringify(incoming);
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS raw_packets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      captured_at TEXT NOT NULL,
      protocol TEXT,
      src_addr TEXT,
      src_port INTEGER,
      dst_addr TEXT,
      dst_port INTEGER,
      byte_length INTEGER NOT NULL DEFAULT 0,
      payload_hex TEXT,
      payload_text TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_raw_packets_captured_at
      ON raw_packets(captured_at);

    CREATE TABLE IF NOT EXISTS decoded_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      packet_id INTEGER,
      observed_at TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'unknown',
      confidence REAL NOT NULL DEFAULT 0,
      text TEXT NOT NULL,
      FOREIGN KEY(packet_id) REFERENCES raw_packets(id)
    );

    CREATE INDEX IF NOT EXISTS idx_decoded_messages_observed_at
      ON decoded_messages(observed_at);

    CREATE TABLE IF NOT EXISTS game_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER,
      observed_at TEXT NOT NULL,
      event_type TEXT NOT NULL,
      source TEXT,
      target TEXT,
      ability TEXT,
      amount REAL,
      damage_type TEXT,
      x REAL,
      y REAL,
      z REAL,
      heading REAL,
      heading_raw INTEGER,
      event_key TEXT,
      raw_text TEXT NOT NULL,
      FOREIGN KEY(message_id) REFERENCES decoded_messages(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_game_events_event_key
      ON game_events(event_key)
      WHERE event_key IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_game_events_type_time
      ON game_events(event_type, observed_at);

    CREATE INDEX IF NOT EXISTS idx_game_events_type_time_id
      ON game_events(event_type, observed_at DESC, id DESC);

    CREATE INDEX IF NOT EXISTS idx_game_events_time_id
      ON game_events(observed_at DESC, id DESC);

    CREATE INDEX IF NOT EXISTS idx_game_events_type_damage_time
      ON game_events(event_type, damage_type, observed_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS actor_names (
      entity_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      raw_name TEXT,
      is_local INTEGER NOT NULL DEFAULT 0,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_actor_names_name
      ON actor_names(name);

    CREATE TABLE IF NOT EXISTS pet_names (
      entity_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_name TEXT,
      raw_title TEXT,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pet_names_owner
      ON pet_names(owner_name);

    CREATE TABLE IF NOT EXISTS ability_registry (
      ability_name TEXT PRIMARY KEY,
      class_name TEXT NOT NULL DEFAULT 'Unknown',
      category TEXT NOT NULL DEFAULT 'unknown',
      pet_family TEXT,
      damage_type TEXT,
      confidence REAL NOT NULL DEFAULT 0,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      seen_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_ability_registry_class_name
      ON ability_registry(class_name, ability_name);

    CREATE TABLE IF NOT EXISTS memory_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      observed_at TEXT NOT NULL,
      pid INTEGER NOT NULL,
      process_name TEXT,
      source TEXT,
      text TEXT NOT NULL,
      region_base TEXT,
      region_size INTEGER,
      confidence REAL NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_memory_observations_observed_at
      ON memory_observations(observed_at DESC, id DESC);

    CREATE INDEX IF NOT EXISTS idx_memory_observations_pid_time
      ON memory_observations(pid, observed_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS loot_items (
      item_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rarity TEXT,
      item_type TEXT,
      armor_type_name TEXT,
      weapon_type TEXT,
      required_level INTEGER,
      item_level INTEGER,
      max_damage REAL,
      delay REAL,
      coin_value INTEGER,
      weight REAL,
      flags_json TEXT,
      stats_json TEXT,
      template_json TEXT NOT NULL,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      seen_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_loot_items_seen
      ON loot_items(last_seen DESC, name);

    CREATE INDEX IF NOT EXISTS idx_loot_items_rarity
      ON loot_items(rarity, item_type, name);

    CREATE TABLE IF NOT EXISTS loot_instances (
      instance_id TEXT PRIMARY KEY,
      item_id TEXT,
      character TEXT,
      character_id INTEGER,
      slot_type TEXT,
      slot_index INTEGER,
      stack_size INTEGER,
      corpse_id TEXT,
      parent_guid TEXT,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      last_event_type TEXT,
      raw_json TEXT NOT NULL,
      FOREIGN KEY(item_id) REFERENCES loot_items(item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_loot_instances_character
      ON loot_instances(character, slot_type, last_seen DESC);

    CREATE TABLE IF NOT EXISTS loot_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      observed_at TEXT NOT NULL,
      event_type TEXT NOT NULL,
      character TEXT,
      character_id INTEGER,
      item_instance_id TEXT,
      item_id TEXT,
      item_name TEXT,
      source TEXT,
      quantity INTEGER,
      raw_json TEXT NOT NULL,
      event_key TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_loot_events_event_key
      ON loot_events(event_key)
      WHERE event_key IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_loot_events_observed
      ON loot_events(observed_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS named_mobs (
      shalazam_id INTEGER PRIMARY KEY,
      slug TEXT,
      name TEXT NOT NULL,
      location TEXT,
      zone TEXT,
      level_min INTEGER,
      level_max INTEGER,
      difficulty TEXT,
      spawn TEXT,
      faction TEXT,
      source_url TEXT NOT NULL,
      source_updated_label TEXT,
      imported_at TEXT NOT NULL,
      last_seen_source_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_named_mobs_name
      ON named_mobs(name);

    CREATE INDEX IF NOT EXISTS idx_named_mobs_location
      ON named_mobs(location, name);

    CREATE TABLE IF NOT EXISTS named_mob_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shalazam_id INTEGER NOT NULL,
      alias TEXT NOT NULL,
      normalized_alias TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'named',
      confidence REAL NOT NULL DEFAULT 1,
      source TEXT NOT NULL DEFAULT 'shalazam',
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      UNIQUE(shalazam_id, normalized_alias, role),
      FOREIGN KEY(shalazam_id) REFERENCES named_mobs(shalazam_id)
    );

    CREATE INDEX IF NOT EXISTS idx_named_mob_aliases_normalized
      ON named_mob_aliases(normalized_alias);

    CREATE TABLE IF NOT EXISTS named_spawn_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shalazam_id INTEGER NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      z REAL NOT NULL,
      radius REAL NOT NULL DEFAULT 35,
      map_id TEXT,
      source TEXT NOT NULL DEFAULT 'shalazam',
      confidence REAL NOT NULL DEFAULT 0.8,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      UNIQUE(shalazam_id, source, x, y, z),
      FOREIGN KEY(shalazam_id) REFERENCES named_mobs(shalazam_id)
    );

    CREATE INDEX IF NOT EXISTS idx_named_spawn_points_position
      ON named_spawn_points(x, y, z);

    CREATE TABLE IF NOT EXISTS map_calibration_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      observed_at TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      session_name TEXT,
      label TEXT NOT NULL,
      map_key TEXT NOT NULL,
      layer_key TEXT,
      source TEXT,
      entity_id TEXT,
      x REAL NOT NULL,
      y REAL NOT NULL,
      z REAL NOT NULL,
      heading REAL,
      raw_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_map_calibration_samples_lookup
      ON map_calibration_samples(map_key, label, observed_at DESC);

    CREATE INDEX IF NOT EXISTS idx_map_calibration_samples_position
      ON map_calibration_samples(map_key, x, y, z);

    CREATE TABLE IF NOT EXISTS named_camp_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shalazam_id INTEGER,
      event_type TEXT NOT NULL,
      mob_name TEXT,
      entity_id TEXT,
      observed_at TEXT NOT NULL,
      x REAL,
      y REAL,
      z REAL,
      source TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      raw_text TEXT,
      event_key TEXT,
      FOREIGN KEY(shalazam_id) REFERENCES named_mobs(shalazam_id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_named_camp_events_event_key
      ON named_camp_events(event_key)
      WHERE event_key IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_named_camp_events_time
      ON named_camp_events(observed_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS community_mobs (
      key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      source_install_id TEXT,
      first_seen TEXT,
      last_seen TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_community_mobs_name
      ON community_mobs(normalized_name);

    CREATE INDEX IF NOT EXISTS idx_community_mobs_seen
      ON community_mobs(last_seen DESC, name);
  `);

  const columns = new Set(db.prepare('PRAGMA table_info(game_events)').all().map((column) => column.name));
  if (!columns.has('heading')) db.exec('ALTER TABLE game_events ADD COLUMN heading REAL');
  if (!columns.has('heading_raw')) db.exec('ALTER TABLE game_events ADD COLUMN heading_raw INTEGER');

  const abilityColumns = new Set(db.prepare('PRAGMA table_info(ability_registry)').all().map((column) => column.name));
  if (!abilityColumns.has('pet_family')) db.exec('ALTER TABLE ability_registry ADD COLUMN pet_family TEXT');
}

function openStore(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA busy_timeout = 3000');
  db.exec('PRAGMA journal_mode = WAL');
  ensureSchema(db);
  seedKnownNamedMobs(db);

  const insertPacket = db.prepare(`
    INSERT INTO raw_packets (
      captured_at, protocol, src_addr, src_port, dst_addr, dst_port,
      byte_length, payload_hex, payload_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMessage = db.prepare(`
    INSERT INTO decoded_messages (
      packet_id, observed_at, message_type, confidence, text
    ) VALUES (?, ?, ?, ?, ?)
  `);
  const insertEvent = db.prepare(`
    INSERT INTO game_events (
      message_id, observed_at, event_type, source, target, ability, amount,
      damage_type, x, y, z, heading, heading_raw, event_key, raw_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_key) WHERE event_key IS NOT NULL DO NOTHING
  `);
  const upsertAbility = db.prepare(`
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
  const upsertActorName = db.prepare(`
    INSERT INTO actor_names (
      entity_id, name, raw_name, is_local, first_seen, last_seen
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(entity_id) DO UPDATE SET
      name = excluded.name,
      raw_name = COALESCE(excluded.raw_name, actor_names.raw_name),
      is_local = CASE WHEN excluded.is_local = 1 THEN 1 ELSE actor_names.is_local END,
      last_seen = excluded.last_seen
  `);
  const upsertPetName = db.prepare(`
    INSERT INTO pet_names (
      entity_id, name, owner_name, raw_title, first_seen, last_seen
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(entity_id) DO UPDATE SET
      name = excluded.name,
      owner_name = COALESCE(excluded.owner_name, pet_names.owner_name),
      raw_title = COALESCE(excluded.raw_title, pet_names.raw_title),
      last_seen = excluded.last_seen
  `);
  const getActorNames = db.prepare(`
    SELECT entity_id AS entityId, name, raw_name AS rawName, is_local AS isLocal,
           first_seen AS firstSeen, last_seen AS lastSeen
    FROM actor_names
    ORDER BY last_seen DESC
  `);
  const getPetNames = db.prepare(`
    SELECT entity_id AS entityId, name, owner_name AS ownerName, raw_title AS rawTitle,
           first_seen AS firstSeen, last_seen AS lastSeen
    FROM pet_names
    ORDER BY last_seen DESC
  `);
  const insertMemoryObservation = db.prepare(`
    INSERT INTO memory_observations (
      observed_at, pid, process_name, source, text, region_base, region_size, confidence
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const getMemoryObservations = db.prepare(`
    SELECT id, observed_at AS observedAt, pid, process_name AS processName, source, text,
           region_base AS regionBase, region_size AS regionSize, confidence
    FROM memory_observations
    ORDER BY observed_at DESC, id DESC
    LIMIT ?
  `);
  const getAbilityRegistry = db.prepare(`
    SELECT ability_name AS abilityName, class_name AS className, category, pet_family AS petFamily,
           damage_type AS damageType,
           confidence, first_seen AS firstSeen, last_seen AS lastSeen, seen_count AS seenCount
    FROM ability_registry
    ORDER BY last_seen DESC, ability_name
    LIMIT ?
  `);
  const getLootItemTemplate = db.prepare(`
    SELECT template_json AS templateJson
    FROM loot_items
    WHERE item_id = ?
  `);
  const upsertLootItem = db.prepare(`
    INSERT INTO loot_items (
      item_id, name, rarity, item_type, armor_type_name, weapon_type,
      required_level, item_level, max_damage, delay, coin_value, weight,
      flags_json, stats_json, template_json, first_seen, last_seen, seen_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(item_id) DO UPDATE SET
      name = excluded.name,
      rarity = COALESCE(excluded.rarity, loot_items.rarity),
      item_type = COALESCE(excluded.item_type, loot_items.item_type),
      armor_type_name = COALESCE(excluded.armor_type_name, loot_items.armor_type_name),
      weapon_type = COALESCE(excluded.weapon_type, loot_items.weapon_type),
      required_level = COALESCE(excluded.required_level, loot_items.required_level),
      item_level = COALESCE(excluded.item_level, loot_items.item_level),
      max_damage = COALESCE(excluded.max_damage, loot_items.max_damage),
      delay = COALESCE(excluded.delay, loot_items.delay),
      coin_value = COALESCE(excluded.coin_value, loot_items.coin_value),
      weight = COALESCE(excluded.weight, loot_items.weight),
      flags_json = COALESCE(excluded.flags_json, loot_items.flags_json),
      stats_json = COALESCE(excluded.stats_json, loot_items.stats_json),
      template_json = excluded.template_json,
      last_seen = excluded.last_seen,
      seen_count = loot_items.seen_count + 1
  `);
  const upsertLootInstance = db.prepare(`
    INSERT INTO loot_instances (
      instance_id, item_id, character, character_id, slot_type, slot_index,
      stack_size, corpse_id, parent_guid, first_seen, last_seen, last_event_type, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(instance_id) DO UPDATE SET
      item_id = COALESCE(excluded.item_id, loot_instances.item_id),
      character = COALESCE(excluded.character, loot_instances.character),
      character_id = COALESCE(excluded.character_id, loot_instances.character_id),
      slot_type = COALESCE(excluded.slot_type, loot_instances.slot_type),
      slot_index = COALESCE(excluded.slot_index, loot_instances.slot_index),
      stack_size = COALESCE(excluded.stack_size, loot_instances.stack_size),
      corpse_id = COALESCE(excluded.corpse_id, loot_instances.corpse_id),
      parent_guid = COALESCE(excluded.parent_guid, loot_instances.parent_guid),
      last_seen = excluded.last_seen,
      last_event_type = excluded.last_event_type,
      raw_json = excluded.raw_json
  `);
  const insertLootEvent = db.prepare(`
    INSERT INTO loot_events (
      observed_at, event_type, character, character_id, item_instance_id,
      item_id, item_name, source, quantity, raw_json, event_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_key) WHERE event_key IS NOT NULL DO NOTHING
  `);

  return {
    db,
    insertPacket(packet) {
      const result = insertPacket.run(
        packet.capturedAt,
        packet.protocol || null,
        packet.srcAddr || null,
        packet.srcPort || null,
        packet.dstAddr || null,
        packet.dstPort || null,
        packet.byteLength || 0,
        packet.payloadHex || null,
        packet.payloadText || null
      );
      return Number(result.lastInsertRowid);
    },
    insertMessage(message) {
      const result = insertMessage.run(
        message.packetId || null,
        message.observedAt,
        message.messageType || 'unknown',
        Number(message.confidence || 0),
        message.text
      );
      return Number(result.lastInsertRowid);
    },
    insertEvent(event) {
      const result = insertEvent.run(
        event.messageId || null,
        event.observedAt,
        event.eventType,
        event.source || null,
        event.target || null,
        event.ability || null,
        event.amount ?? null,
        event.damageType || null,
        event.x ?? null,
        event.y ?? null,
        event.z ?? null,
        event.heading ?? null,
        event.headingRaw ?? null,
        event.eventKey || null,
        event.rawText
      );
      const inserted = Number(result.changes || 0) > 0;
      if (inserted) {
        const abilityRecord = abilityRegistryRecordFromEvent(event);
        if (abilityRecord) {
          upsertAbility.run(
            abilityRecord.abilityName,
            abilityRecord.className,
            abilityRecord.category,
            abilityRecord.petFamily,
            abilityRecord.damageType,
            abilityRecord.confidence,
            abilityRecord.observedAt,
            abilityRecord.observedAt
          );
        }
      }
      return inserted;
    },
    upsertActorName(record) {
      if (!record?.entityId || !record?.name) return false;
      const observedAt = record.observedAt || new Date().toISOString();
      const result = upsertActorName.run(
        record.entityId,
        record.name,
        record.rawName || null,
        record.isLocal ? 1 : 0,
        observedAt,
        observedAt
      );
      return Number(result.changes || 0) > 0;
    },
    upsertPetName(record) {
      if (!record?.entityId || !record?.name) return false;
      const observedAt = record.observedAt || new Date().toISOString();
      const result = upsertPetName.run(
        record.entityId,
        record.name,
        record.ownerName || null,
        record.rawTitle || null,
        observedAt,
        observedAt
      );
      return Number(result.changes || 0) > 0;
    },
    getActorNames() {
      return getActorNames.all().map((row) => ({
        ...row,
        isLocal: Boolean(row.isLocal)
      }));
    },
    getPetNames() {
      return getPetNames.all();
    },
    insertMemoryObservation(observation) {
      if (!observation?.text || !Number.isFinite(Number(observation.pid))) return false;
      const observedAt = observation.observedAt || new Date().toISOString();
      const result = insertMemoryObservation.run(
        observedAt,
        Number(observation.pid),
        observation.processName || null,
        observation.source || null,
        observation.text,
        observation.regionBase || null,
        observation.regionSize ?? null,
        Number.isFinite(Number(observation.confidence)) ? Number(observation.confidence) : 0
      );
      return Number(result.changes || 0) > 0;
    },
    getMemoryObservations(limit = 100) {
      return getMemoryObservations.all(Math.max(1, Math.min(500, Number(limit) || 100)));
    },
    getAbilityRegistry(limit = 500) {
      return getAbilityRegistry.all(Math.max(1, Math.min(2000, Number(limit) || 500)));
    },
    upsertLootItem(record) {
      if (!record?.itemId || !record?.name || !record?.templateJson) return false;
      const observedAt = record.observedAt || new Date().toISOString();
      const existing = getLootItemTemplate.get(String(record.itemId));
      const templateJson = mergeLootTemplateJson(record.templateJson, existing?.templateJson);
      const result = upsertLootItem.run(
        String(record.itemId),
        record.name,
        record.rarity || null,
        record.itemType || null,
        record.armorTypeName || null,
        record.weaponType || null,
        record.requiredLevel ?? null,
        record.itemLevel ?? null,
        record.maxDamage ?? null,
        record.delay ?? null,
        record.coinValue ?? null,
        record.weight ?? null,
        record.flagsJson || null,
        record.statsJson || null,
        templateJson,
        observedAt,
        observedAt
      );
      return Number(result.changes || 0) > 0;
    },
    upsertLootInstance(record) {
      if (!record?.instanceId || !record?.rawJson) return false;
      const observedAt = record.observedAt || new Date().toISOString();
      const result = upsertLootInstance.run(
        record.instanceId,
        record.itemId ? String(record.itemId) : null,
        record.character || null,
        record.characterId ?? null,
        record.slotType || null,
        record.slotIndex ?? null,
        record.stackSize ?? null,
        record.corpseId ?? null,
        record.parentGuid || null,
        observedAt,
        observedAt,
        record.eventType || null,
        record.rawJson
      );
      return Number(result.changes || 0) > 0;
    },
    insertLootEvent(record) {
      if (!record?.observedAt || !record?.eventType || !record?.rawJson) return false;
      const result = insertLootEvent.run(
        record.observedAt,
        record.eventType,
        record.character || null,
        record.characterId ?? null,
        record.itemInstanceId || null,
        record.itemId ? String(record.itemId) : null,
        record.itemName || null,
        record.source || null,
        record.quantity ?? null,
        record.rawJson,
        record.eventKey || null
      );
      return Number(result.changes || 0) > 0;
    },
    reset() {
      const packets = db.prepare('DELETE FROM raw_packets').run();
      db.prepare('DELETE FROM decoded_messages').run();
      db.prepare('DELETE FROM game_events').run();
      db.prepare('DELETE FROM memory_observations').run();
      db.prepare('DELETE FROM loot_events').run();
      db.prepare('DELETE FROM loot_instances').run();
      db.prepare('DELETE FROM loot_items').run();
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      return Number(packets.changes || 0);
    },
    prune({ keepMinutes = 60, checkpoint = true } = {}) {
      const minutes = Number.isFinite(Number(keepMinutes)) && Number(keepMinutes) > 0 ? Number(keepMinutes) : 60;
      const cutoff = new Date(Date.now() - minutes * 60_000).toISOString();
      const deleted = {};
      db.exec('BEGIN IMMEDIATE');
      try {
        deleted.gameEvents = Number(db.prepare('DELETE FROM game_events WHERE observed_at < ?').run(cutoff).changes || 0);
        deleted.decodedMessages = Number(db.prepare('DELETE FROM decoded_messages WHERE observed_at < ?').run(cutoff).changes || 0);
        deleted.memoryObservations = Number(db.prepare('DELETE FROM memory_observations WHERE observed_at < ?').run(cutoff).changes || 0);
        deleted.rawPackets = Number(db.prepare('DELETE FROM raw_packets WHERE captured_at < ?').run(cutoff).changes || 0);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      if (checkpoint) db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      return { cutoff, keepMinutes: minutes, deleted };
    },
    close() {
      db.close();
    }
  };
}

module.exports = {
  ensureSchema,
  openStore
};
