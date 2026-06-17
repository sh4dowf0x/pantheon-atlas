const fs = require('node:fs');
const crypto = require('node:crypto');
const { parseSystemText } = require('./parser');

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

function rawWithoutChatPrefix(raw, chatChannel) {
  const text = String(raw || '').trim();
  const channel = String(chatChannel || '').trim();
  const withoutChannel = channel
    ? text.replace(new RegExp(`^\\[${channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\s*`, 'i'), '').trim()
    : text;
  return withoutChannel.replace(/^[A-Z][A-Za-z0-9_]{2,24}:\s+(?=You have|Camping|Teleporting)/, '').trim();
}

function parseLocalPlayer(record, observedAt) {
  const match = String(record.raw || '').match(/^Local:\s+(.+?)\s+L(\d+)\s+(.+?)\s+(.+?)\s+CharacterId=(\d+)/i);
  if (!match) return [];
  return [{
    observedAt,
    eventType: 'local_player',
    source: match[1].trim(),
    target: `${match[3].trim()} ${match[4].trim()}`,
    ability: `Level ${match[2]}`,
    damageType: `addon:${match[5]}`,
    rawText: record.raw,
    eventKey: eventKey([observedAt, 'addon_local_player', match[5], match[1]])
  }];
}

function parsePlayerSeen(record, observedAt) {
  const match = String(record.raw || '').match(/^Player seen:\s+(.+?)\s+L(\d+)\s+(.+?)\s+(.+?)\s+Local=(True|False)/i);
  if (!match) return [];
  return [{
    observedAt,
    eventType: match[5].toLowerCase() === 'true' ? 'local_player' : 'player_seen',
    source: match[1].trim(),
    target: `${match[3].trim()} ${match[4].trim()}`,
    ability: `Level ${match[2]}`,
    rawText: record.raw,
    eventKey: eventKey([observedAt, 'addon_player_seen', match[1], match[2], match[3], match[4], match[5]])
  }];
}

function parseTarget(record, observedAt) {
  const match = String(record.raw || '').match(/^Offensive target health\s+(\d+(?:\.\d+)?)%/i);
  if (!match) return [];
  return [{
    observedAt,
    eventType: 'target_health',
    amount: Number(match[1]),
    ability: 'Offensive target',
    rawText: record.raw,
    eventKey: eventKey([observedAt, 'addon_target_health', match[1], record.raw])
  }];
}

function parseStructuredCombat(record, observedAt) {
  const eventType = String(record.eventType || '').toLowerCase();
  if (eventType !== 'damage' && eventType !== 'healing') return null;

  const amount = asNumber(record.amount);
  if (amount === null) return null;

  return {
    observedAt,
    eventType: eventType === 'damage' ? 'damage_estimate' : 'healing',
    source: record.source || null,
    target: record.target || null,
    ability: record.ability || (eventType === 'healing' ? 'Healing' : null),
    amount,
    damageType: record.damageType || null,
    rawText: record.raw || JSON.stringify(record),
    eventKey: eventKey([
      observedAt,
      `addon_${eventType}`,
      record.source,
      record.target,
      record.ability,
      amount,
      record.damageType,
      record.raw
    ])
  };
}

function parseMitigation(record, observedAt) {
  const mitigated = asNumber(record.mitigated);
  if (!mitigated || String(record.eventType || '').toLowerCase() !== 'damage') return null;
  return {
    observedAt,
    eventType: 'mitigation_estimate',
    source: record.source || null,
    target: record.target || null,
    ability: record.ability || null,
    amount: mitigated,
    damageType: record.damageType || null,
    rawText: record.raw || JSON.stringify(record),
    eventKey: eventKey([
      observedAt,
      'addon_mitigation',
      record.source,
      record.target,
      record.ability,
      mitigated,
      record.damageType,
      record.raw
    ])
  };
}

function parseExperienceChanged(record, observedAt) {
  if (String(record.eventType || '').toLowerCase() !== 'experience' && String(record.category || '').toLowerCase() !== 'experiencechanged') return null;
  const current = asNumber(record.current);
  const toNext = asNumber(record.toNextLevel);
  const percent = asNumber(record.experiencePercentage);
  const delta = asNumber(record.deltaCurrent);
  if (current === null && delta === null && percent === null) return null;
  const previousCurrent = asNumber(record.previousCurrent);
  return {
    observedAt,
    eventType: 'experience',
    source: record.sourceCharacterName || record.character || null,
    ability: percent === null ? null : `Progress ${(percent * 100).toFixed(2)}%`,
    amount: delta,
    damageType: current !== null && toNext !== null ? `${current}/${toNext}` : null,
    x: current,
    y: toNext,
    z: percent,
    heading: previousCurrent,
    rawText: record.raw || JSON.stringify(record),
    eventKey: eventKey([
      observedAt,
      'addon_experience',
      record.sourceCharacterId,
      current,
      toNext,
      percent,
      delta,
      previousCurrent
    ])
  };
}

function parseChatSystem(record, observedAt) {
  const text = rawWithoutChatPrefix(record.raw, record.chatChannel);
  return parseSystemText(text, observedAt).map((event) => ({
    ...event,
    eventKey: eventKey(['addon', event.eventKey])
  }));
}

function parseAddonLogRecord(record) {
  if (!record || typeof record !== 'object') return [];
  const observedAt = normalizeTimestamp(record.timestamp);
  const category = String(record.category || '').toLowerCase();
  const events = [];

  const combat = parseStructuredCombat(record, observedAt);
  if (combat) events.push(combat);
  const mitigation = parseMitigation(record, observedAt);
  if (mitigation) events.push(mitigation);
  const experience = parseExperienceChanged(record, observedAt);
  if (experience) events.push(experience);

  if (category === 'localplayer') events.push(...parseLocalPlayer(record, observedAt));
  if (category === 'player') events.push(...parsePlayerSeen(record, observedAt));
  if (category === 'target') events.push(...parseTarget(record, observedAt));
  if (category === 'chat') events.push(...parseChatSystem(record, observedAt));

  return events;
}

function parseAddonLogLine(line) {
  const text = String(line || '').trim();
  if (!text) return [];
  try {
    return parseAddonLogRecord(JSON.parse(text));
  } catch {
    return [];
  }
}

class AddonLogIngestor {
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
      for (const event of parseAddonLogLine(line)) {
        if (this.store.insertEvent(event)) {
          this.status.eventsStored += 1;
          this.status.lastEventAt = event.observedAt;
        }
      }
    }
  }
}

module.exports = {
  AddonLogIngestor,
  parseAddonLogLine,
  parseAddonLogRecord
};
