const fs = require('node:fs');
const crypto = require('node:crypto');

function eventKey(parts) {
  return crypto.createHash('sha1').update(parts.filter((part) => part !== undefined && part !== null).join('|')).digest('hex');
}

function normalizeTimestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function scannerEntityId(record) {
  const networkId = asNumber(record.NetworkId);
  if (networkId !== null && networkId >= 0) return `scanner:network:${Math.trunc(networkId)}`;
  const characterId = asNumber(record.CharacterId);
  if (characterId !== null && characterId >= 0) return `scanner:character:${Math.trunc(characterId)}`;
  return null;
}

function localCharacterEntityId(record) {
  const characterId = asNumber(record.CharacterId);
  return characterId !== null && characterId >= 0 ? `scanner:character:${Math.trunc(characterId)}` : scannerEntityId(record);
}

function normalizeEntityKind(record) {
  const entityType = String(record.EntityType || '').toLowerCase();
  const kind = String(record.Kind || '').toLowerCase();
  const role = String(record.Role || '').toLowerCase();
  const title = String(record.Title || '').toLowerCase();
  const tier = String(record.Tier || '').toLowerCase();
  const runtimeType = String(record.RuntimeType || '').toLowerCase();
  const metadata = `${entityType} ${kind} ${role} ${title} ${tier} ${runtimeType}`;
  if (entityType === 'player') return 'player';
  if (entityType === 'npc') {
    if (kind === 'humanoid' && Number(record.Level) >= 45) return 'npc';
    return 'mob';
  }
  if (metadata.includes('resource') || metadata.includes('harvest')) return 'resource';
  if (entityType === 'groundspawn' || runtimeType.includes('networkworlditem')) {
    if (/\b(chest|lootcratelockbox|lootcrate_lockbox|lockbox|lock_box)\b/.test(metadata)) return 'chest';
    if (/\b(quest|treasure)\b/.test(metadata)) return 'quest';
  }
  return 'mob';
}

function localPlayerEvent(record, observedAt) {
  if (!record.Name) return null;
  return {
    observedAt,
    eventType: 'local_player',
    source: String(record.Name).trim(),
    target: [record.Race, record.Class].filter(Boolean).join(' ') || null,
    ability: Number.isFinite(Number(record.Level)) ? `Level ${Number(record.Level)}` : null,
    damageType: localCharacterEntityId(record),
    rawText: `[EntityScanner] ${JSON.stringify(record)}`,
    eventKey: eventKey([observedAt, 'entity_scanner_local_player', record.CharacterId, record.Name])
  };
}

function targetSelectionEvent(record, observedAt, target, role) {
  if (!target || typeof target !== 'object') return null;
  const networkId = asNumber(target.NetworkId);
  const characterId = asNumber(target.CharacterId);
  const entityId = networkId !== null && networkId >= 0
    ? `scanner:network:${Math.trunc(networkId)}`
    : characterId !== null && characterId >= 0
      ? `scanner:character:${Math.trunc(characterId)}`
      : null;
  const name = String(target.Name || '').trim();
  if (!entityId && !name) return null;
  return {
    observedAt,
    eventType: 'target_selection',
    source: String(record.Name || '').trim() || null,
    target: name || null,
    ability: role,
    damageType: entityId,
    rawText: `[EntityScanner] ${role} target ${JSON.stringify(target)}`,
    eventKey: eventKey([observedAt, 'entity_scanner_target_selection', role, entityId, name])
  };
}

function positionEvent(record, observedAt, entityId) {
  const x = asNumber(record.X);
  const y = asNumber(record.Y);
  const z = asNumber(record.Z);
  if (![x, y, z].every((value) => value !== null)) return null;
  const name = String(record.Name || 'Player').trim() || 'Player';
  return {
    observedAt,
    eventType: 'position_update',
    source: name,
    target: name,
    damageType: entityId,
    heading: asNumber(record.HeadingY),
    x,
    y,
    z,
    rawText: `[EntityScanner] ${name} local position ${x} ${y} ${z}`,
    eventKey: eventKey([observedAt, 'entity_scanner_position_update', entityId, x, y, z, record.HeadingY])
  };
}

function playerPositionEvent(record, observedAt, entityId) {
  const x = asNumber(record.X);
  const y = asNumber(record.Y);
  const z = asNumber(record.Z);
  if (![x, y, z].every((value) => value !== null)) return null;
  const name = String(record.Name || '').trim();
  if (!name) return null;
  return {
    observedAt,
    eventType: 'player_position',
    source: name,
    target: name,
    amount: asNumber(record.Level),
    damageType: entityId,
    heading: asNumber(record.HeadingY),
    x,
    y,
    z,
    rawText: `[EntityScanner] ${name} player position ${x} ${y} ${z}`,
    eventKey: eventKey([observedAt, 'entity_scanner_player_position', entityId, x, y, z, record.HeadingY])
  };
}

function entityPositionEvent(record, observedAt, entityId) {
  const x = asNumber(record.X);
  const y = asNumber(record.Y);
  const z = asNumber(record.Z);
  if (![x, y, z].every((value) => value !== null)) return null;
  const kind = normalizeEntityKind(record);
  return {
    observedAt,
    eventType: kind === 'resource' ? 'harvest_node' : 'world_entity',
    target: String(record.Name || '').trim() || `Unknown entity ${entityId}`,
    ability: `entityKind:${kind}`,
    amount: asNumber(record.Level),
    damageType: entityId,
    heading: asNumber(record.HeadingY),
    x,
    y,
    z,
    rawText: `[EntityScanner] ${JSON.stringify(record)}`,
    eventKey: eventKey([observedAt, 'entity_scanner_entity', entityId, x, y, z, record.HealthCurrent, record.EventType])
  };
}

function healthEvent(record, observedAt, entityId) {
  const current = asNumber(record.HealthCurrent);
  const max = asNumber(record.HealthMax);
  if (current === null || max === null) return null;
  if (current <= 0 && max <= 0) return null;
  return {
    observedAt,
    eventType: 'health_update',
    target: String(record.Name || '').trim() || null,
    amount: current,
    ability: String(max),
    damageType: entityId,
    rawText: `[EntityScanner] ${String(record.Name || entityId)} health ${current}/${max}`,
    eventKey: eventKey([observedAt, 'entity_scanner_health', entityId, current, max])
  };
}

function removedEvent(record, observedAt, entityId) {
  return {
    observedAt,
    eventType: 'entity_removed',
    target: String(record.Name || '').trim() || null,
    ability: normalizeEntityKind(record),
    amount: asNumber(record.Level),
    damageType: entityId,
    x: asNumber(record.X),
    y: asNumber(record.Y),
    z: asNumber(record.Z),
    rawText: `[EntityScanner] ${JSON.stringify(record)}`,
    eventKey: eventKey([observedAt, 'entity_scanner_removed', entityId])
  };
}

function parseEntityScannerRecord(record) {
  if (!record || typeof record !== 'object') return [];
  const observedAt = normalizeTimestamp(record.TimestampUtc || record.timestamp);
  const eventType = String(record.EventType || '').toLowerCase();
  const entityType = String(record.EntityType || '').toLowerCase();
  const events = [];

  if (eventType === 'localplayer' || entityType === 'localplayer') {
    const entityId = localCharacterEntityId(record);
    const local = localPlayerEvent(record, observedAt);
    const position = positionEvent(record, observedAt, entityId);
    const offensiveTarget = targetSelectionEvent(record, observedAt, record.OffensiveTarget, 'offensive');
    const defensiveTarget = targetSelectionEvent(record, observedAt, record.DefensiveTarget, 'defensive');
    if (local) events.push(local);
    if (position) events.push(position);
    if (offensiveTarget) events.push(offensiveTarget);
    if (defensiveTarget) events.push(defensiveTarget);
    return events;
  }

  const entityId = record.IsLocalPlayer ? localCharacterEntityId(record) : scannerEntityId(record);
  if (!entityId) return events;

  if (eventType === 'removed') {
    events.push(removedEvent(record, observedAt, entityId));
    return events;
  }

  if (record.IsLocalPlayer) {
    const local = localPlayerEvent(record, observedAt);
    const position = positionEvent(record, observedAt, entityId);
    if (local) events.push(local);
    if (position) events.push(position);
  } else if (entityType === 'player') {
    const player = playerPositionEvent(record, observedAt, entityId);
    if (player) events.push(player);
  } else {
    const entity = entityPositionEvent(record, observedAt, entityId);
    if (entity) events.push(entity);
  }

  const health = healthEvent(record, observedAt, entityId);
  if (health) events.push(health);
  return events;
}

function parseEntityScannerLine(line) {
  const text = String(line || '').trim();
  if (!text) return [];
  try {
    return parseEntityScannerRecord(JSON.parse(text));
  } catch {
    return [];
  }
}

class EntityScannerLogIngestor {
  constructor(config, store, options = {}) {
    this.config = config || {};
    this.store = store;
    this.options = options || {};
    this.offset = 0;
    this.pending = '';
    this.timer = null;
    this.running = false;
    this.status = {
      enabled: Boolean(this.config.enabled),
      path: this.config.liveFile || null,
      linesRead: 0,
      eventsStored: 0,
      lastReadAt: null,
      lastEventAt: null,
      lastError: null
    };
  }

  start() {
    if (this.running || !this.config.enabled || !this.config.liveFile) return;
    this.running = true;
    if (this.config.readExistingOnStart !== true) this.seekToEnd();
    this.readAvailable();
    const everyMs = Math.max(250, Number(this.config.pollEveryMs || 1000));
    this.timer = setInterval(() => this.readAvailable(), everyMs);
  }

  seekToEnd() {
    try {
      const stat = fs.statSync(this.config.liveFile);
      this.offset = stat.size;
      this.pending = '';
      this.status.lastReadAt = new Date().toISOString();
      this.status.lastError = null;
    } catch (error) {
      if (error.code !== 'ENOENT') this.status.lastError = error.message;
    }
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  readAvailable() {
    const filePath = this.config.liveFile;
    try {
      const stat = fs.statSync(filePath);
      if (stat.size < this.offset) {
        this.offset = 0;
        this.pending = '';
      }
      if (stat.size === this.offset) return;
      const fd = fs.openSync(filePath, 'r');
      try {
        const length = stat.size - this.offset;
        const buffer = Buffer.alloc(length);
        fs.readSync(fd, buffer, 0, length, this.offset);
        this.offset = stat.size;
        this.ingestText(buffer.toString('utf8'));
      } finally {
        fs.closeSync(fd);
      }
      this.status.lastReadAt = new Date().toISOString();
      this.status.lastError = null;
    } catch (error) {
      if (error.code === 'ENOENT') return;
      this.status.lastError = error.message;
    }
  }

  ingestText(text) {
    const combined = this.pending + text;
    const lines = combined.split(/\r?\n/);
    this.pending = lines.pop() || '';
    for (const line of lines) {
      this.status.linesRead += 1;
      for (const event of parseEntityScannerLine(line)) {
        if (typeof this.options.onEvent === 'function') this.options.onEvent(event);
        if (this.store.insertEvent(event)) {
          this.status.eventsStored += 1;
          this.status.lastEventAt = event.observedAt;
        }
      }
    }
  }
}

module.exports = {
  EntityScannerLogIngestor,
  parseEntityScannerLine,
  parseEntityScannerRecord
};
