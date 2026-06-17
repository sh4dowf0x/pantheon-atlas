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

function asInteger(value) {
  const number = asNumber(value);
  return number === null ? null : Math.trunc(number);
}

function boolString(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return null;
}

function normalizeFlags(value) {
  return String(value || '')
    .split(',')
    .map((flag) => flag.trim())
    .filter((flag) => flag && flag !== 'None');
}

function meaningfulArray(value) {
  return Array.isArray(value) && value.length ? value : null;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function normalizeStatModifier(modifier = {}) {
  if (!modifier || typeof modifier !== 'object') return null;
  const stat = firstDefined(
    modifier.stat,
    modifier.Stat,
    modifier.name,
    modifier.Name,
    modifier.statName,
    modifier.StatName,
    modifier.displayName,
    modifier.DisplayName,
    modifier.type,
    modifier.Type,
    modifier.Item1
  );
  const value = firstDefined(
    modifier.modifierValue,
    modifier.ModifierValue,
    modifier.value,
    modifier.Value,
    modifier.amount,
    modifier.Amount,
    modifier.modifier,
    modifier.Modifier,
    modifier.Item2
  );
  if (!stat || value === undefined) return null;
  const output = {
    stat: String(stat),
    value: asNumber(value) ?? value
  };
  const source = firstDefined(modifier.source, modifier.Source);
  if (source) output.source = String(source);
  const type = firstDefined(modifier.type, modifier.Type);
  if (type) output.type = String(type);
  return output;
}

function normalizeModifierArray(value) {
  return (meaningfulArray(value) || [])
    .map((modifier) => normalizeStatModifier(modifier))
    .filter(Boolean);
}

function compactStats(item = {}, template = {}) {
  const stats = {};
  const statModifiers = [
    ...normalizeModifierArray(item.StatModifiers),
    ...normalizeModifierArray(item.statModifiers),
    ...normalizeModifierArray(template.statModifiers)
  ];
  const instanceStatModifiers = [
    ...normalizeModifierArray(item.InstanceStatModifiers),
    ...normalizeModifierArray(item.instanceStatModifiers)
  ];
  const multiplierModifiers = [
    ...normalizeModifierArray(item.MultiplierModifiers),
    ...normalizeModifierArray(item.multiplierModifiers),
    ...normalizeModifierArray(template.multiplierModifiers)
  ];
  const requirementOverrides = meaningfulArray(item.RequirementOverrides) || meaningfulArray(item.requirementOverrides) || meaningfulArray(template.requirementOverrides);
  if (statModifiers.length || instanceStatModifiers.length) {
    stats.statModifiers = [...statModifiers, ...instanceStatModifiers];
  }
  if (instanceStatModifiers.length) stats.instanceStatModifiers = instanceStatModifiers;
  if (multiplierModifiers.length) stats.multiplierModifiers = multiplierModifiers;
  if (requirementOverrides) stats.requirementOverrides = requirementOverrides;
  for (const key of ['primaryBonus', 'secondaryBonus']) {
    if (template[key] !== null && template[key] !== undefined && template[key] !== '') stats[key] = template[key];
  }
  for (const key of ['armorModifier', 'damageModifier', 'delayModifier', 'durabilityModifier', 'effectivenessMod', 'blockMod', 'blockValueMod']) {
    const value = asNumber(template[key]);
    if (value !== null && value !== 0) stats[key] = value;
  }
  return Object.keys(stats).length ? stats : null;
}

function lootItemRecord(record, observedAt) {
  const item = record.item || {};
  const template = item.Template || {};
  const itemId = item.ItemId ?? template.itemId ?? record.itemId;
  const name = item.Name || template.itemName || record.itemName;
  if (itemId === undefined || itemId === null || !name) return null;
  const stats = compactStats(item, template);
  return {
    observedAt,
    itemId: String(itemId),
    name: String(name),
    rarity: template.rarity || null,
    itemType: template.itemType || null,
    armorTypeName: template.armorTypeName || null,
    weaponType: template.weaponType || null,
    requiredLevel: asInteger(template.requiredLevel),
    itemLevel: asInteger(template.itemLevel),
    maxDamage: asNumber(template.maxDamage),
    delay: asNumber(template.delay),
    coinValue: asInteger(template.coinValue),
    weight: asNumber(template.itemWeight),
    flagsJson: JSON.stringify(normalizeFlags(template.itemFlags)),
    statsJson: stats ? JSON.stringify(stats) : null,
    templateJson: JSON.stringify(template)
  };
}

function lootInstanceRecord(record, observedAt) {
  const item = record.item || {};
  const instanceId = item.InstanceId || record.itemInstanceId;
  if (!instanceId) return null;
  return {
    observedAt,
    eventType: record.eventType || null,
    instanceId: String(instanceId),
    itemId: item.ItemId ?? item.Template?.itemId ?? record.itemId ?? null,
    character: record.character || null,
    characterId: asInteger(record.characterId || item.CharacterId),
    slotType: item.SlotType || record.slotType || null,
    slotIndex: asInteger(item.SlotIndex ?? record.slotIndex),
    stackSize: asInteger(item.StackSize ?? record.quantity),
    corpseId: item.CorpseId === undefined || item.CorpseId === null ? null : String(item.CorpseId),
    parentGuid: item.ParentGuid || null,
    rawJson: JSON.stringify(item)
  };
}

function lootEventRecord(record, observedAt) {
  const item = record.item || {};
  const template = item.Template || {};
  const itemId = item.ItemId ?? template.itemId ?? record.itemId ?? null;
  const itemName = item.Name || template.itemName || record.itemName || null;
  const itemInstanceId = item.InstanceId || record.itemInstanceId || null;
  const parsed = record.parsed && typeof record.parsed === 'object' ? record.parsed : {};
  const acquisition = record.acquisition && typeof record.acquisition === 'object' ? record.acquisition : {};
  const acquisitionSource = acquisition.source && typeof acquisition.source === 'object'
    ? acquisition.source.name
    : acquisition.source;
  return {
    observedAt,
    eventType: String(record.eventType || 'loot_event'),
    character: record.character || null,
    characterId: asInteger(record.characterId || item.CharacterId),
    itemInstanceId: itemInstanceId ? String(itemInstanceId) : null,
    itemId: itemId === null || itemId === undefined ? null : String(itemId),
    itemName,
    source: acquisitionSource || parsed.source || parsed.corpse || record.source || record.corpse || null,
    quantity: asInteger(record.quantity || item.StackSize),
    rawJson: JSON.stringify(record),
    eventKey: eventKey([
      observedAt,
      record.eventType,
      record.character,
      itemInstanceId,
      itemId,
      itemName,
      record.message,
      JSON.stringify(parsed)
    ])
  };
}

function parseLootLogRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const observedAt = normalizeTimestamp(record.timestamp || record.TimestampUtc);
  return {
    item: lootItemRecord(record, observedAt),
    instance: lootInstanceRecord(record, observedAt),
    event: lootEventRecord(record, observedAt)
  };
}

function parseLootLogLine(line) {
  const text = String(line || '').trim();
  if (!text) return null;
  try {
    return parseLootLogRecord(JSON.parse(text));
  } catch {
    const objectStart = text.indexOf('{');
    if (objectStart > 0) {
      try {
        return parseLootLogRecord(JSON.parse(text.slice(objectStart)));
      } catch {
        return null;
      }
    }
    return null;
  }
}

class LootLogIngestor {
  constructor(config, store) {
    this.config = config || {};
    this.store = store;
    this.offset = 0;
    this.pending = '';
    this.timer = null;
    this.running = false;
    this.status = {
      enabled: Boolean(this.config.enabled),
      path: this.config.liveFile || null,
      linesRead: 0,
      itemsStored: 0,
      instancesStored: 0,
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
      const parsed = parseLootLogLine(line);
      if (!parsed) continue;
      this.status.linesRead += 1;
      if (parsed.item && this.store.upsertLootItem(parsed.item)) this.status.itemsStored += 1;
      if (parsed.instance && this.store.upsertLootInstance(parsed.instance)) this.status.instancesStored += 1;
      if (parsed.event && this.store.insertLootEvent(parsed.event)) {
        this.status.eventsStored += 1;
        this.status.lastEventAt = parsed.event.observedAt;
      }
    }
  }
}

module.exports = {
  LootLogIngestor,
  parseLootLogLine,
  parseLootLogRecord,
  normalizeFlags,
  boolString
};
