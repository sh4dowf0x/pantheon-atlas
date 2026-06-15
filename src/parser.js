const crypto = require('node:crypto');

function eventKey(parts) {
  return crypto.createHash('sha1').update(parts.filter((part) => part !== undefined && part !== null).join('|')).digest('hex');
}

function readFloat32LEHex(hex) {
  const buffer = Buffer.from(hex, 'hex');
  if (buffer.length !== 4) return null;
  const value = buffer.readFloatLE(0);
  return Number.isFinite(value) ? value : null;
}

function readUInt32LEHex(hex) {
  const buffer = Buffer.from(hex, 'hex');
  if (buffer.length !== 4) return null;
  return buffer.readUInt32LE(0);
}

function readInt16LEHex(hex) {
  const buffer = Buffer.from(hex, 'hex');
  if (buffer.length !== 2) return null;
  return buffer.readInt16LE(0);
}

function headingDegreesFromRaw(rawHeading) {
  if (!Number.isFinite(rawHeading)) return null;
  const degrees = rawHeading * 360 / 65536;
  const normalized = ((degrees % 360) + 360) % 360;
  return Number(normalized.toFixed(2));
}

function isClientGameServerPort(port) {
  const value = Number(port || 0);
  return Number.isInteger(value) && value >= 7100 && value <= 7120;
}

function isServerGameServerPort(port) {
  const value = Number(port || 0);
  return Number.isInteger(value) && value >= 7100 && value <= 7120;
}

function combatLogNumber(value) {
  return Number.isInteger(value) ? value : Math.floor(value);
}

const UNKNOWN_WORLD_POSITION_RADIUS = 150;

function extractSpawnEntityIds(payloadHex) {
  return extractSpawnRecords(payloadHex).map((record) => record.entityId);
}

function extractSpawnRecords(payloadHex) {
  const records = [];
  const clean = String(payloadHex || '').toLowerCase();
  const pattern = /1c[0-9a-f]{6}02000000([0-9a-f]{8})(0[34]000000)([0-9a-f]{24})?/g;
  let match;
  while ((match = pattern.exec(clean))) {
    const nextSpawnIndex = clean.slice(pattern.lastIndex).search(/1c[0-9a-f]{6}02000000[0-9a-f]{8}0[34]000000/);
    const segmentEnd = nextSpawnIndex >= 0 ? pattern.lastIndex + nextSpawnIndex : Math.min(clean.length, match.index + 900);
    const segment = clean.slice(match.index, segmentEnd);
    const dispositionMatch = segment.match(/e3f6070026[0-9a-f]{2}00000001[0-9a-f]{2}00(?:[0-9a-f]{2}){4,96}?0100([0-9a-f]{2})0000/);
    const dispositionCode = dispositionMatch ? dispositionMatch[1] : null;
    const levelMatch = segment.match(/01000000([0-9a-f]{2})0b00000000/);
    const levelByte = levelMatch ? Number.parseInt(levelMatch[1], 16) : null;
    const coords = match[3] || '';
    const x = coords ? readFloat32LEHex(coords.slice(0, 8)) : null;
    const y = coords ? readFloat32LEHex(coords.slice(8, 16)) : null;
    const z = coords ? readFloat32LEHex(coords.slice(16, 24)) : null;
    const record = {
      entityId: match[1],
      spawnType: match[2].startsWith('04') ? 'resource' : 'entity'
    };
    if (dispositionCode) {
      record.dispositionCode = dispositionCode;
      if (dispositionCode === '02') record.entityKind = 'mob';
      else if (dispositionCode === '03') record.entityKind = 'npc';
    }
    if (Number.isFinite(levelByte) && levelByte > 0 && levelByte <= 200) {
      record.level = Number((levelByte / 2).toFixed(1));
    }
    if (x !== null && y !== null && z !== null && [x, y, z].every((value) => Math.abs(value) <= 100000)) {
      record.x = Number(x.toFixed(3));
      record.y = Number(y.toFixed(3));
      record.z = Number(z.toFixed(3));
    }
    records.push(record);
  }
  return records;
}

function extractHealthRecords(payloadHex) {
  const records = [];
  const clean = String(payloadHex || '').toLowerCase();
  const pattern = /1c[0-9a-f]{6}8c000000([0-9a-f]{8})[0-9a-f]{2}([0-9a-f]{8})([0-9a-f]{8})/g;
  let match;
  while ((match = pattern.exec(clean))) {
    const current = readFloat32LEHex(match[2]);
    const max = readFloat32LEHex(match[3]);
    if (current === null || max === null) continue;
    if (max <= 0 || max > 100000 || current < 0 || current > max + 0.01) continue;
    records.push({
      entityId: match[1],
      current: Number(current.toFixed(3)),
      max: Number(max.toFixed(3))
    });
  }
  return records;
}

function normalizeCharacterNameToken(text) {
  const value = String(text || '').trim();
  if (/\s/.test(value)) return null;
  if (!/^[A-Z][A-Za-z0-9_]{3,24}$/.test(value)) return null;
  if (/^(Harvest|Common|Hornet|Rabbit|Rat|Spider|Toad|Wolf|Loadout|Campfire)$/i.test(value)) return null;

  const markerMatch = value.match(/^([A-Z][A-Za-z]{3,20})[A-Z0-9_]$/);
  if (markerMatch && /[a-z]/.test(markerMatch[1])) return markerMatch[1];

  return value;
}

function extractNamedEntityRecords(payloadHex) {
  const records = [];
  const clean = String(payloadHex || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  const pattern = /([0-9a-f]{8})(?:0700|0900)((?:[2-7][0-9a-f]){4,48})00/g;
  let match;
  while ((match = pattern.exec(clean))) {
    const prefix = clean.slice(Math.max(0, match.index - 8), match.index);
    if (/1d010000$/.test(prefix)) continue;
    const rawName = Buffer.from(match[2], 'hex').toString('utf8');
    const name = normalizeCharacterNameToken(rawName);
    if (!name) continue;
    records.push({
      entityId: match[1],
      name,
      rawName
    });
  }

  const chatNamePattern = /1[ad]010000[0-9a-f]{8}([0-9a-f]{2})00((?:[2-7][0-9a-f]){4,48})[0-9a-f]{2}00[0-9a-f]{0,240}?05000000([0-9a-f]{8})/g;
  while ((match = chatNamePattern.exec(clean))) {
    const nameByteLength = Number.parseInt(match[1], 16);
    if (!Number.isFinite(nameByteLength) || nameByteLength < 4 || nameByteLength > 48) continue;
    const nameHex = match[2].slice(0, Math.max(0, nameByteLength - 1) * 2);
    if (nameHex.length < 8) continue;
    const rawName = Buffer.from(nameHex, 'hex').toString('utf8');
    const name = normalizeCharacterNameToken(rawName);
    if (!name) continue;
    if (records.some((record) => record.entityId === match[3] && record.name === name)) continue;
    records.push({
      entityId: match[3],
      name,
      rawName
    });
  }

  const playerPattern = /02000000([0-9a-f]{8})02000000[0-9a-f]{0,1600}?010800((?:[2-7][0-9a-f]){4,48})0e00/g;
  while ((match = playerPattern.exec(clean))) {
    const rawName = Buffer.from(match[2], 'hex').toString('utf8');
    const name = normalizeCharacterNameToken(rawName);
    if (!name) continue;
    if (records.some((record) => record.entityId === match[1] && record.name === name)) continue;
    records.push({
      entityId: match[1],
      name,
      rawName
    });
  }

  const richPlayerPattern = /02000000([0-9a-f]{8})02000000[0-9a-f]{0,1800}?e3f6410032[0-9a-f]{8}01([0-9a-f]{2})00((?:[2-7][0-9a-f]){4,48})/g;
  while ((match = richPlayerPattern.exec(clean))) {
    const nameByteLength = Number.parseInt(match[2], 16);
    if (!Number.isFinite(nameByteLength) || nameByteLength < 4 || nameByteLength > 48) continue;
    const nameHex = match[3].slice(0, Math.max(0, nameByteLength - 1) * 2);
    if (nameHex.length < 8) continue;
    const rawName = Buffer.from(nameHex, 'hex').toString('utf8');
    const name = normalizeCharacterNameToken(rawName);
    if (!name) continue;
    if (records.some((record) => record.entityId === match[1] && record.name === name)) continue;
    records.push({
      entityId: match[1],
      name,
      rawName
    });
  }

  const rosterNamePattern = /01([0-9a-f]{2})00((?:[2-7][0-9a-f]){4,48})[0-9a-f]{6}([0-9a-f]{8})/g;
  while ((match = rosterNamePattern.exec(clean))) {
    const nameByteLength = Number.parseInt(match[1], 16);
    if (!Number.isFinite(nameByteLength) || nameByteLength < 4 || nameByteLength > 48) continue;
    if (!/(?:0000|0100|0600)$/.test(match[3])) continue;
    const nameHex = match[2].slice(0, nameByteLength * 2);
    if (nameHex.length < 8) continue;
    const rawName = Buffer.from(nameHex, 'hex').toString('utf8');
    const name = normalizeCharacterNameToken(rawName);
    if (!name) continue;
    if (records.some((record) => record.entityId === match[3] && record.name === name)) continue;
    records.push({
      entityId: match[3],
      name,
      rawName
    });
  }

  return records;
}

function extractClientActionCandidate(payloadHex, packet = {}) {
  const clean = String(payloadHex || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  if (clean.length !== 24) return null;
  if (clean.startsWith('5d')) return null;

  const isGameServer = isClientGameServerPort(packet.dstPort);
  if (!isGameServer) return null;

  const opcode = clean.slice(0, 2);
  if (!['13', '54'].includes(opcode)) return null;

  return {
    opcode,
    ability: `Client action 0x${opcode}`,
    signature: clean,
    byteLength: clean.length / 2
  };
}

function extractClientTargetEntityIds(payloadHex, packet = {}) {
  const clean = String(payloadHex || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  const isGameServer = isClientGameServerPort(packet.dstPort);
  if (!isGameServer) return [];

  const ids = [];
  const pattern = /1c[0-9a-f]{6}(?:7a|7f)000000e20f0100([0-9a-f]{8})/g;
  let match;
  while ((match = pattern.exec(clean))) {
    if (!ids.includes(match[1])) ids.push(match[1]);
  }
  return ids;
}

const abilityByCastToken = {
  '2a24': { ability: 'Spirit of the Wolf' },
  e823: { ability: 'Cloak of Leaves', state: 'Invisibility' },
  '0824': { ability: 'Nature Shroud', state: 'Spell Power +5, Resistances +2, Health Regen +1' }
};

function extractClientAbilityCastRecords(payloadHex, packet = {}) {
  const clean = String(payloadHex || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  const isGameServer = isClientGameServerPort(packet.dstPort);
  if (!isGameServer) return [];

  const records = [];
  const pattern = /1c[0-9a-f]{6}49010000([0-9a-f]{8})([0-9a-f]{4})0000/g;
  let match;
  while ((match = pattern.exec(clean))) {
    const mappedAbility = abilityByCastToken[match[2]];
    if (!mappedAbility) continue;
    records.push({
      sourceId: match[1],
      ability: mappedAbility.ability,
      state: mappedAbility.state || null,
      token: match[2],
      signature: match[0],
      byteLength: clean.length / 2
    });
  }
  return records;
}

function extractClientPositionRecord(payloadHex, packet = {}) {
  const clean = String(payloadHex || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  const isGameServer = isClientGameServerPort(packet.dstPort);
  if (!isGameServer) return null;

  const records = [];
  const pattern = /1afc000000[0-9a-f]{60}/g;
  let match;
  while ((match = pattern.exec(clean))) {
    const recordHex = match[0];
    const entityId = recordHex.slice(10, 18);
    const headingRaw = readInt16LEHex(recordHex.slice(24, 28));
    const heading = headingDegreesFromRaw(headingRaw);
    const x = readFloat32LEHex(recordHex.slice(30, 38));
    const y = readFloat32LEHex(recordHex.slice(40, 48));
    const z = readFloat32LEHex(recordHex.slice(50, 58));
    if (x === null || y === null || z === null) continue;
    if ([x, y, z].some((value) => Math.abs(value) > 100000)) continue;

    records.push({
      entityId,
      heading,
      headingRaw,
      x: Number(x.toFixed(3)),
      y: Number(y.toFixed(3)),
      z: Number(z.toFixed(3))
    });
  }

  return records.at(-1) || null;
}

function extractServerActorPositionRecords(payloadHex, packet = {}) {
  const clean = String(payloadHex || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  const isGameServer = isServerGameServerPort(packet.srcPort);
  if (!isGameServer) return [];

  const records = [];
  const pattern = /2c001a02010000([0-9a-f]{8})[0-9a-f]{26}fb([0-9a-f]{8})fb([0-9a-f]{8})fb([0-9a-f]{8})/g;
  let match;
  while ((match = pattern.exec(clean))) {
    const x = readFloat32LEHex(match[2]);
    const y = readFloat32LEHex(match[3]);
    const z = readFloat32LEHex(match[4]);
    if (x === null || y === null || z === null) continue;
    if ([x, y, z].some((value) => Math.abs(value) > 100000)) continue;
    records.push({
      entityId: match[1],
      x: Number(x.toFixed(3)),
      y: Number(y.toFixed(3)),
      z: Number(z.toFixed(3))
    });
  }
  return records;
}

function extractServerAbilityEffectRecords(payloadHex, packet = {}) {
  const clean = String(payloadHex || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  const isGameServer = isServerGameServerPort(packet.srcPort);
  if (!isGameServer) return [];

  const records = [];
  const pattern = /57010000([0-9a-f]{8})[0-9a-f]{16}([0-9a-f]{4})0000/g;
  let match;
  while ((match = pattern.exec(clean))) {
    const mappedAbility = abilityByCastToken[match[2]];
    if (!mappedAbility) continue;
    records.push({
      targetId: match[1],
      ability: mappedAbility.ability,
      state: mappedAbility.state || null,
      token: match[2],
      signature: match[0],
      byteLength: clean.length / 2
    });
  }
  return records;
}

function extractServerDamageRecords(payloadHex) {
  const records = [];
  const clean = String(payloadHex || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  const pattern = /(?:1c[0-9a-f]{6}|1a)62000000([0-9a-f]{8})([0-9a-f]{8})fb([0-9a-f]{8})(?:fb([0-9a-f]{8})fb([0-9a-f]{8})([0-9a-f]{2}))?/g;
  const schoolByCode = {
    '02': { damageType: 'Fire', defaultAbility: null },
    '03': { damageType: 'Cold', defaultAbility: 'Blast of Cold' },
    '06': { damageType: 'Shock', defaultAbility: 'Sparking Bolt' },
    '08': { damageType: 'Divine', defaultAbility: null },
    '0a': { damageType: 'Nature', defaultAbility: 'Ignite III' }
  };
  const abilityByToken = {
    f9aa0c: { ability: 'Sting of the Hornet', damageType: 'Poison' },
    f92c22: { ability: 'Thorncoat', damageType: 'Nature' },
    f9f23d: { damageType: 'Cold' },
    f9063e: { damageType: 'Shock' },
    f9fe2f: { ability: 'Jolt I' },
    f90448: { ability: 'Ignite III' },
    f91422: { ability: 'Ignite III' },
    f92022: { ability: 'Stinging Swarm II' },
    f9f815: { ability: 'Shrapnel I', damageType: 'Physical' },
    f9ae3a: { ability: 'Brightfire Blast I' },
    f9a846: { ability: 'Dawnfire I', damageType: 'Divine' },
    f9b04a: { ability: "Predator's Fury I", damageType: 'Physical' },
    f9ce4a: { ability: 'Swift Shot II', damageType: 'Physical' },
    f9d04a: { ability: 'Howling Arrow II', damageType: 'Physical' },
    f95e4a: { ability: 'Jolt II', damageType: 'Shock' },
    f92a24: { ability: 'Auto Attack Impact', damageType: 'Physical' },
    f96a1f: { ability: 'Bleeding Essence', damageType: 'Physical' },
    f9e844: { ability: 'Corrupt Blood II', damageType: 'Fire' },
    f97a39: { ability: 'Claw', damageType: 'Physical' },
    f9964a: { ability: 'Volley of Arrows I', damageType: 'Physical' }
  };
  let match;
  while ((match = pattern.exec(clean))) {
    const amount = readFloat32LEHex(match[3]);
    if (amount === null || amount <= 0 || amount > 100000) continue;

    const resultFlags = clean.slice(pattern.lastIndex, pattern.lastIndex + 10);
    if (match[6] && resultFlags.startsWith('0000004000')) continue;
    const abilityTail = clean.slice(pattern.lastIndex, pattern.lastIndex + 48);

    const school = schoolByCode[match[6]] || null;
    if (!school && abilityTail.startsWith('000a011000')) continue;

    let mitigated = null;
    if (match[5]) {
      const mitigationFloat = readFloat32LEHex(match[5]);
      if (mitigationFloat !== null && mitigationFloat > 0 && mitigationFloat < amount * 2) {
        mitigated = combatLogNumber(mitigationFloat);
      }
    }

    const prefix = clean.slice(Math.max(0, match.index - 80), match.index);
    const mitigation = prefix.match(/([0-9a-f]{8})[0-9a-f]{8}4c00$/);
    if (mitigated === null && mitigation) {
      const value = readUInt32LEHex(mitigation[1]);
      if (value !== null && value > 0 && value < amount * 2) mitigated = value;
    }

    const abilityToken = Object.keys(abilityByToken).find((token) => abilityTail.includes(token));
    const mappedAbility = abilityByToken[abilityToken] || null;
    const ability = mappedAbility?.ability || null;
    records.push({
      sourceId: match[1],
      targetId: match[2],
      amount: combatLogNumber(amount),
      mitigated,
      damageType: mappedAbility?.damageType || (school ? school.damageType : null),
      ability
    });
  }
  return records;
}

function rememberAbilityHint(context, text, observedAt) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (/shield of spinning spikes/i.test(clean)) return;
  const localName = context.localActorName || null;
  let ability = null;
  const parsed = parseCombatText(clean, observedAt)
    .find((event) => event.ability
      && ['damage', 'ability_resist', 'ability_miss'].includes(event.eventType)
      && (!event.source
        || event.source === localName
        || (normalizeCharacterNameToken(event.source) && !/^(Unknown|Player)$/i.test(event.source))));
  if (parsed) ability = parsed.ability;
  if (!ability && /blast creation\s+ii\b/i.test(clean)) ability = 'Blast Creation II';
  if (!ability && /blast creation\s+x\b/i.test(clean)) ability = 'Blast Creation X';
  if (!ability && /aether shards\b/i.test(clean)) ability = 'Aether Shards';
  if (!ability && /clash charge\b/i.test(clean)) ability = 'Clash Charge';
  if (!ability && /frail mana bomb\b/i.test(clean)) ability = 'Frail Mana Bomb';
  if (!ability && /conjure bolt\s+i\b/i.test(clean)) ability = 'Conjure Bolt I';
  if (!ability && /stinging swarm\s+i\b/i.test(clean)) ability = 'Stinging Swarm I';
  if (!ability && /ignite\s+ii\b/i.test(clean)) ability = 'Ignite II';
  if (!ability && /storm\s+i\b/i.test(clean)) ability = 'Storm I';
  if (!ability && /strange magic(?:\s+[ivx]+)?\b/i.test(clean)) ability = /strange magic\s+ii\b/i.test(clean) ? 'Strange Magic II' : 'Strange Magic';
  if (!ability && /ignite\s+i\b/i.test(clean)) ability = 'Ignite I';
  if (!ability && /blast of magic\b/i.test(clean)) ability = 'Blast of Magic';
  if (!ability && /mana spike\b/i.test(clean)) ability = 'Mana Spike';
  if (!ability && /mana flame\b/i.test(clean)) ability = 'Mana Flame';
  if (!ability && /corrupt blood\b/i.test(clean)) ability = /corrupt blood\s+ii\b/i.test(clean) ? 'Corrupt Blood II' : 'Corrupt Blood I';
  if (!ability && /fleshcarver\b/i.test(clean)) ability = 'Fleshcarver';
  if (!ability && /cold/i.test(clean)) ability = 'Blast of Cold';
  if (!ability && /sparking|bolt/i.test(clean)) ability = 'Sparking Bolt';
  if (!ability) return;
  context.recentAbilityHints.push({ observedAt, ability, rawText: clean, source: parsed?.source || null });
  if (context.recentAbilityHints.length > 20) context.recentAbilityHints.shift();
}

function damagePatternKey(sourceName, damageType, mitigated, amountBucket) {
  return [
    String(sourceName || '').toLowerCase().trim() || 'unknown',
    String(damageType || '').toLowerCase().trim() || 'unknown',
    Number.isFinite(mitigated) ? `m:${mitigated}` : 'm:?'
  ].concat(Number.isFinite(amountBucket) ? [`a:${amountBucket}`] : ['a:?']).join('|');
}

function damageAmountBucket(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  return Math.round(value / 2) * 2;
}

function learnDamagePattern(context, sourceName, damageType, amount, mitigated, ability, confidence = 1) {
  if (!ability) return;
  if (!context.learnedDamagePatterns) context.learnedDamagePatterns = new Map();
  const key = damagePatternKey(sourceName, damageType, mitigated, damageAmountBucket(amount));
  const existing = context.learnedDamagePatterns.get(key);
  if (existing && existing.ability === ability) {
    existing.count += 1;
    existing.confidence = Math.max(existing.confidence, confidence);
    existing.lastSeen = new Date().toISOString();
    return;
  }
  context.learnedDamagePatterns.set(key, {
    ability,
    sourceName: sourceName || null,
    damageType: damageType || null,
    mitigated: Number.isFinite(mitigated) ? mitigated : null,
    amountBucket: damageAmountBucket(amount),
    count: existing ? existing.count + 1 : 1,
    confidence,
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString()
  });
}

function learnedAbilityFromPattern(context, sourceName, record) {
  const patterns = context.learnedDamagePatterns;
  if (!patterns || !patterns.size) return null;

  const amount = Number(record.amount);
  const amountBucket = damageAmountBucket(amount);
  const mitigated = Number.isFinite(record.mitigated) ? record.mitigated : null;
  const damageType = String(record.damageType || '').trim() || null;
  const candidates = [];

  for (const [key, pattern] of patterns.entries()) {
    if (sourceName && pattern.sourceName && pattern.sourceName !== sourceName) continue;
    if (damageType && pattern.damageType && pattern.damageType !== damageType) continue;
    let score = 0;
    if (pattern.sourceName && pattern.sourceName === sourceName) score += 4;
    if (pattern.damageType && pattern.damageType === damageType) score += 3;
    if (pattern.mitigated === mitigated) score += 3;
    else if (Number.isFinite(pattern.mitigated) && Number.isFinite(mitigated) && Math.abs(pattern.mitigated - mitigated) <= 1) score += 1;
    if (Number.isFinite(pattern.amountBucket) && Number.isFinite(amountBucket)) {
      const distance = Math.abs(pattern.amountBucket - amountBucket);
      if (distance === 0) score += 4;
      else if (distance <= 2) score += 3;
      else if (distance <= 4) score += 2;
      else if (distance <= 6) score += 1;
      else continue;
    }
    score += Math.min(2, Math.max(0, pattern.count - 1));
    score += Math.min(1, pattern.confidence || 0);
    candidates.push({ key, pattern, score });
  }

  candidates.sort((left, right) => right.score - left.score);
  const best = candidates[0];
  if (!best || best.score < 6) return null;
  return `${best.pattern.ability} (estimated)`;
}

function recentClientAction(context, observedAt, maxAgeMs = 5000) {
  const actions = context.recentClientActions || [];
  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(observedMs)) return actions.at(-1) || null;

  for (let i = actions.length - 1; i >= 0; i--) {
    const actionMs = Date.parse(actions[i].observedAt);
    if (!Number.isFinite(actionMs)) continue;
    if (observedMs - actionMs >= 0 && observedMs - actionMs <= maxAgeMs) return actions[i];
  }
  return null;
}

function recentAbilityHint(context, observedAt, maxAgeMs = 2500) {
  const hints = context.recentAbilityHints || [];
  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(observedMs)) return hints.at(-1) || null;

  for (let i = hints.length - 1; i >= 0; i--) {
    const hintMs = Date.parse(hints[i].observedAt);
    if (!Number.isFinite(hintMs)) continue;
    if (observedMs - hintMs >= 0 && observedMs - hintMs <= maxAgeMs) return hints[i];
  }
  return null;
}

function estimatedAbility(context, observedAt, sourceName = null) {
  const hint = recentAbilityHint(context, observedAt);
  if (hint && (!sourceName || !hint.source || hint.source === sourceName)) return `${hint.ability} (estimated)`;
  return null;
}

function inferredAbilityFromDamagePattern(record, sourceName) {
  if (sourceName === 'Katja') {
    if (record.damageType === 'Physical' && record.amount === 7 && record.mitigated === 2) return 'Storm I (estimated)';
    if (record.damageType === 'Physical' && [7, 8].includes(record.amount) && record.mitigated === 2) return 'Mocking Blow II (estimated)';
    if (record.damageType === 'Physical' && [11, 12].includes(record.amount) && record.mitigated === 3) return 'Assault I (estimated)';
    if (record.damageType === 'Physical' && record.amount === 14 && [3, 4].includes(record.mitigated)) return 'Commanding Strike II (estimated)';
    if (record.damageType === 'Physical' && [4, 5].includes(record.amount) && record.mitigated === 1) return 'Auto Attack (estimated)';
  }
  if (sourceName === 'Polona') {
    if ([17, 20].includes(record.amount) && [4, 5].includes(record.mitigated)) return 'Strange Magic II (estimated)';
    if ([26, 27].includes(record.amount) && record.mitigated === 6) return 'Mind Vice II (estimated)';
  }
  if (sourceName === 'Rhea') {
    if (record.damageType === 'Nature' && [3, 4, 7, 8, 23].includes(record.amount) && [0, 1, 13].includes(record.mitigated)) return 'Ignite I (estimated)';
    if (record.damageType === 'Physical' && [3, 4].includes(record.amount) && [0, 1].includes(record.mitigated)) return 'Auto Attack (estimated)';
  }
  if (sourceName === 'Jessa') {
    if (record.damageType === 'Nature' && record.amount === 23 && record.mitigated === 4) return 'Conjure Bolt I (estimated)';
    if (record.damageType === 'Nature' && [6, 9].includes(record.amount) && record.mitigated === 1) return 'Ignite II (estimated)';
    if (record.damageType === 'Physical' && [6, 7].includes(record.amount) && [1, 2].includes(record.mitigated)) return 'Auto Attack (estimated)';
  }
  if (sourceName === 'Nexendia') {
    if ([26, 27].includes(record.amount) && record.mitigated === 6) return 'Clash Charge (estimated)';
    if (record.amount === 22 && record.mitigated === 5) return 'Frail Mana Bomb (estimated)';
    if ([34, 35, 36].includes(record.amount) && [8, 9].includes(record.mitigated)) return 'Blast Creation II (estimated)';
    if ([42, 43, 44, 45, 46, 47, 48].includes(record.amount) && [10, 11, 12].includes(record.mitigated)) return 'Blast Creation II (estimated)';
    if (record.amount === 29 && record.mitigated === 7) return 'Auto Attack (estimated)';
    if ([13, 14].includes(record.amount) && record.mitigated === 3) return 'Aether Shards (estimated)';
    return null;
  }
  if (['Jotik', 'Zotik', "Nexendia's Minion"].includes(sourceName)) {
    if (record.amount === 7 && (record.mitigated === 1 || record.mitigated === null)) return 'Blast of Magic (estimated)';
    if ([22, 23].includes(record.amount) && (record.mitigated === 5 || record.mitigated === null)) return 'Mana Spike (estimated)';
    if (record.amount === 17 && (record.mitigated === 4 || record.mitigated === null)) return 'Mana Flame (estimated)';
    if (record.amount === 9 && (record.mitigated === 2 || record.mitigated === null)) return 'Blast of Magic (estimated)';
    return null;
  }
  if (sourceName === 'Tina') {
    if ([19, 20].includes(record.amount) && record.mitigated === 4) return 'Fang of Harune I (estimated)';
    if (record.amount === 4 && record.mitigated === 1) return 'Bane of Venom I (estimated)';
    if ([12, 13, 14].includes(record.amount) && record.mitigated === 3) return 'Serpentine Strike I (estimated)';
    if ([5, 6].includes(record.amount) && record.mitigated === 1) return 'Auto Attack (estimated)';
    return null;
  }
  if (sourceName === 'Tormentilia') {
    if (record.damageType === 'Fire' && record.amount === 4 && [0, 1].includes(record.mitigated ?? 0)) return 'Corrupt Blood I (estimated)';
    if (record.damageType === 'Fire' && record.amount === 4 && record.mitigated === null) return 'Corrupt Blood I (estimated)';
    if (record.damageType === 'Physical' && record.amount === 8 && record.mitigated === 2) return 'Fleshcarver (estimated)';
    if (record.damageType === 'Physical' && [1, 3, 5, 6].includes(record.amount) && [0, 1, 2].includes(record.mitigated ?? 0)) return 'Auto Attack (estimated)';
    return null;
  }
  if (sourceName !== 'Shadowfox') return null;
  if ([19, 20].includes(record.amount) && record.mitigated === 4) return 'Fang of Harune I (estimated)';
  if (record.amount === 4 && record.mitigated === 1) return 'Bane of Venom I (estimated)';
  if ([12, 13, 14].includes(record.amount) && record.mitigated === 3) return 'Serpentine Strike I (estimated)';
  if ([5, 6].includes(record.amount) && record.mitigated === 1) return 'Auto Attack (estimated)';
  return null;
}

function defaultAbilityForDamageType(damageType) {
  const defaults = {
    Cold: 'Blast of Cold',
    Shock: 'Sparking Bolt',
    Nature: 'Ignite III'
  };
  return defaults[damageType] || null;
}

function sourceDisplayName(record) {
  return record.sourceName || (record.sourceId ? `Unknown actor ${record.sourceId}` : 'Player');
}

function combatActorName(context, entityId) {
  if (!entityId) return null;
  return context.actorNameById.get(entityId)
    || context.petDisplayNameById?.get(entityId)
    || context.petNameById?.get(entityId)
    || (entityId === context.localActorId ? localActorName(context) : null)
    || context.entityNameById?.get(entityId)
    || null;
}

function buildServerDamageEvent(record, target, ability) {
  return {
    observedAt: record.observedAt,
    eventType: 'damage_estimate',
    source: sourceDisplayName(record),
    target,
    ability,
    amount: record.amount,
    damageType: record.damageType || record.targetId,
    rawText: `${target} took ${record.amount}${record.mitigated ? ` (${record.mitigated} mitigated)` : ''} from ${ability}`,
    eventKey: eventKey([record.observedAt, 'server_damage', record.sourceId, record.targetId, record.amount, record.mitigated, ability])
  };
}

function rememberActorName(context, entityId, name, isLocalActor = false) {
  context.actorNameById.set(entityId, name);
  if (!isLocalActor) return;
  if (!context.localActorNameById) context.localActorNameById = new Map();
  context.localActorNameById.set(entityId, name);
  context.localActorId = entityId;
  context.localActorName = name;
}

function localActorName(context) {
  return context.localActorName || 'Player';
}

function minionTitleOwner(text) {
  const match = String(text || '').trim().match(/^<(.+)'s Minion>$/i);
  return match ? match[1].trim() : null;
}

function minionDisplayName(ownerName, rawTitle, fallbackName = null) {
  const title = String(rawTitle || '').trim().replace(/^<|>$/g, '').trim();
  if (title) return title;
  if (ownerName) return `${ownerName}'s Minion`;
  return fallbackName || null;
}

function isPlaceholderEntityName(name) {
  return /^(Unknown (?:entity|actor) [0-9a-f]{8}|Unknown(?: entity| actor)?|Player)$/i.test(String(name || '').trim());
}

function shouldEmitPosition(context, record, observedAt) {
  const previous = context.lastPositionById.get(record.entityId);
  const observedMs = Date.parse(observedAt);
  if (!previous) return true;
  const previousMs = Date.parse(previous.observedAt);
  const elapsedMs = Number.isFinite(observedMs) && Number.isFinite(previousMs) ? observedMs - previousMs : Infinity;
  const distance = Math.hypot(record.x - previous.x, record.y - previous.y, record.z - previous.z);
  const headingDelta = Number.isFinite(record.heading) && Number.isFinite(previous.heading)
    ? Math.abs((((record.heading - previous.heading) + 540) % 360) - 180)
    : 0;
  const isLocal = record.entityId === context.localActorId;
  const minIntervalMs = isLocal ? 250 : 1500;
  const maxIntervalMs = isLocal ? 1000 : 5000;
  const minDistance = isLocal ? 0.5 : 5;
  const minHeadingDelta = isLocal ? 4 : 20;
  if (elapsedMs < minIntervalMs) return false;
  return elapsedMs >= maxIntervalMs || distance >= minDistance || headingDelta >= minHeadingDelta;
}

function positionDistance(left, right) {
  if (!left || !right) return Infinity;
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function shouldIgnoreRepeatedClientPosition(context, record) {
  if (!context.lastClientPositionById) context.lastClientPositionById = new Map();
  const previousClient = context.lastClientPositionById.get(record.entityId);
  const current = context.lastPositionById.get(record.entityId);
  if (!previousClient || current?.sourceType !== 'server_actor_position') return false;
  return positionDistance(record, previousClient) < 0.01 && positionDistance(record, current) >= 1;
}

function localPosition(context) {
  if (!context.localActorId) return null;
  return context.lastPositionById.get(context.localActorId) || null;
}

function rememberUnknownPosition(context, record, observedAt) {
  const local = localPosition(context);
  const distance = local ? Math.hypot(record.x - local.x, record.y - local.y, record.z - local.z) : null;
  context.recentUnknownPositions.push({
    ...record,
    observedAt,
    distance
  });
  const cutoff = Date.parse(observedAt) - 15000;
  context.recentUnknownPositions = context.recentUnknownPositions
    .filter((item) => {
      const itemMs = Date.parse(item.observedAt);
      return Number.isFinite(itemMs) && itemMs >= cutoff;
    })
    .slice(-80);
}

function shouldEmitUnknownWorldPosition(context, record) {
  if (record.entityId === context.localActorId) return false;
  const local = localPosition(context);
  if (!local) return false;
  const distance = Math.hypot(record.x - local.x, record.y - local.y, record.z - local.z);
  return Number.isFinite(distance) && distance <= UNKNOWN_WORLD_POSITION_RADIUS;
}

function bindRecentConTarget(context, conEvent, observedAt) {
  if (!conEvent?.target) return null;
  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(observedMs)) return null;
  const selected = (context.recentTargetSelections || [])
    .filter((selection) => {
      const selectionMs = Date.parse(selection.observedAt);
      if (!Number.isFinite(selectionMs) || observedMs - selectionMs < 0 || observedMs - selectionMs > 3500) return false;
      const knownName = context.entityNameById.get(selection.entityId);
      return !knownName || knownName.toLowerCase() === conEvent.target.toLowerCase() || isPlaceholderEntityName(knownName);
    })
    .sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt))[0];
  if (selected) {
    const position = context.lastPositionById.get(selected.entityId);
    const existingName = context.entityNameById.get(selected.entityId);
    if (!existingName || existingName.toLowerCase() === conEvent.target.toLowerCase() || isPlaceholderEntityName(existingName)) {
      context.entityNameById.set(selected.entityId, conEvent.target);
    }
    if (!context.entityKindById.has(selected.entityId)) context.entityKindById.set(selected.entityId, 'mob');
    return {
      entityId: selected.entityId,
      x: position?.x,
      y: position?.y,
      z: position?.z
    };
  }
  const local = localPosition(context);
  const candidates = context.recentUnknownPositions
    .filter((record) => {
      if (context.entityNameById.has(record.entityId) || context.actorNameById.has(record.entityId)) return false;
      const recordMs = Date.parse(record.observedAt);
      if (!Number.isFinite(recordMs) || Math.abs(observedMs - recordMs) > 12000) return false;
      const distance = local ? Math.hypot(record.x - local.x, record.y - local.y, record.z - local.z) : record.distance;
      return !Number.isFinite(distance) || distance <= UNKNOWN_WORLD_POSITION_RADIUS;
    })
    .sort((left, right) => {
      const leftDistance = local ? Math.hypot(left.x - local.x, left.y - local.y, left.z - local.z) : left.distance ?? Infinity;
      const rightDistance = local ? Math.hypot(right.x - local.x, right.y - local.y, right.z - local.z) : right.distance ?? Infinity;
      return leftDistance - rightDistance;
  });
  const bound = candidates[0] || null;
  if (!bound) return null;
  const existingName = context.entityNameById.get(bound.entityId);
  if (!existingName || existingName.toLowerCase() === conEvent.target.toLowerCase() || isPlaceholderEntityName(existingName)) {
    context.entityNameById.set(bound.entityId, conEvent.target);
  }
  if (!context.entityKindById.has(bound.entityId)) context.entityKindById.set(bound.entityId, 'mob');
  return bound;
}

function bindUnknownPositionToRecentCon(context, record, observedAt) {
  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(observedMs)) return null;
  const local = localPosition(context);
  const distance = local ? Math.hypot(record.x - local.x, record.y - local.y, record.z - local.z) : Infinity;
  if (Number.isFinite(distance) && distance > UNKNOWN_WORLD_POSITION_RADIUS) return null;
  const candidates = context.recentTargetCons
    .filter((event) => {
      if (!event.target) return false;
      const eventMs = Date.parse(event.observedAt);
      return Number.isFinite(eventMs) && Math.abs(observedMs - eventMs) <= 12000;
    })
    .sort((left, right) => Math.abs(observedMs - Date.parse(left.observedAt)) - Math.abs(observedMs - Date.parse(right.observedAt)));
  const conEvent = candidates[0] || null;
  if (!conEvent) return null;
  const existingName = context.entityNameById.get(record.entityId);
  if (!existingName || existingName.toLowerCase() === conEvent.target.toLowerCase() || isPlaceholderEntityName(existingName)) {
    context.entityNameById.set(record.entityId, conEvent.target);
  }
  if (!context.entityKindById.has(record.entityId)) context.entityKindById.set(record.entityId, 'mob');
  return conEvent;
}

function buildServerMitigationEvent(record, target, ability) {
  if (!record.mitigated) return null;
  return {
    observedAt: record.observedAt,
    eventType: 'mitigation_estimate',
    source: sourceDisplayName(record),
    target,
    ability,
    amount: record.mitigated,
    damageType: record.damageType || record.targetId,
    rawText: `${target} mitigated ${record.mitigated} from ${ability}`,
    eventKey: eventKey([record.observedAt, 'mitigation_estimate', record.sourceId, record.targetId, record.amount, record.mitigated, ability])
  };
}

function flushPendingDamage(context, entityId, events) {
  if (!context.pendingDamageById) return;
  const target = context.entityNameById.get(entityId);
  const pending = context.pendingDamageById.get(entityId);
  if (!target || !pending?.length) return;

  for (const record of pending) {
    events.push(buildServerDamageEvent(record, target, record.ability));
    const mitigationEvent = buildServerMitigationEvent(record, target, record.ability);
    if (mitigationEvent) events.push(mitigationEvent);
  }
  context.pendingDamageById.delete(entityId);
}

function parseCombatText(text, observedAt = new Date().toISOString()) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim().replace(/^\[\d{1,2}:\d{2}:\d{2}\]\s*/, '');
  const events = [];
  if (/^LOCATION:\s*https?:\/\//i.test(clean)) return events;

  const damage = clean.match(/^(.+?) dealt ([\d.]+) ([A-Za-z]+) damage to (.+?) with (.+?)\.(?: \(([\d.]+) mitigated\))?$/i);
  if (damage) {
    events.push({
      observedAt,
      eventType: 'damage',
      source: damage[1].trim(),
      amount: Number(damage[2]),
      damageType: damage[3],
      target: damage[4].trim(),
      ability: damage[5].trim(),
      rawText: clean
    });
    if (damage[6]) {
      events.push({
        observedAt,
        eventType: 'mitigation',
        source: damage[1].trim(),
        amount: Number(damage[6]),
        damageType: damage[3],
        target: damage[4].trim(),
        ability: damage[5].trim(),
        rawText: clean
      });
    }
  }

  const selfDamage = clean.match(/^(.+?) took ([\d.]+) ([A-Za-z]+) damage from (.+?)\.$/i);
  if (selfDamage) {
    events.push({
      observedAt,
      eventType: 'damage',
      source: selfDamage[4].trim(),
      amount: Number(selfDamage[2]),
      damageType: selfDamage[3],
      target: selfDamage[1].trim(),
      ability: selfDamage[4].trim(),
      rawText: clean
    });
  }

  const resisted = clean.match(/^(.+?)'s (.+?) was fully resisted by (.+?)\.$/i);
  if (resisted) {
    events.push({
      observedAt,
      eventType: 'ability_resist',
      source: resisted[1].trim(),
      target: resisted[3].trim(),
      ability: resisted[2].trim(),
      rawText: clean
    });
  }

  const missed = clean.match(/^(.+?)'s (.+?) missed (.+?)\.$/i);
  if (missed) {
    events.push({
      observedAt,
      eventType: 'ability_miss',
      source: missed[1].trim(),
      target: missed[3].trim(),
      ability: missed[2].trim(),
      rawText: clean
    });
  }

  const failedCast = clean.match(/^Failed ability cast:\s*(.+?)\.$/i);
  if (failedCast) {
    events.push({
      observedAt,
      eventType: 'ability_failed',
      source: null,
      target: null,
      ability: failedCast[1].trim(),
      rawText: clean
    });
  }

  const healedByAbility = clean.match(/\b(.+?) was healed for ([\d.]+) by (.+?)(?: with (.+?))?\./i);
  if (healedByAbility) {
    events.push({
      observedAt,
      eventType: 'healing',
      source: (healedByAbility[3] || healedByAbility[4] || '').trim(),
      target: healedByAbility[1].trim(),
      ability: (healedByAbility[4] || healedByAbility[3] || 'Healing').trim(),
      amount: Number(healedByAbility[2]),
      rawText: clean
    });
  }

  const sourcedHeal = clean.match(/\b(.+?) healed (.+?) for ([\d.]+)(?: with (.+?))?\./i);
  if (sourcedHeal) {
    events.push({
      observedAt,
      eventType: 'healing',
      source: sourcedHeal[1].trim(),
      target: sourcedHeal[2].trim(),
      amount: Number(sourcedHeal[3]),
      ability: (sourcedHeal[4] || 'Healing').trim(),
      rawText: clean
    });
  }

  return events.map((event) => ({
    ...event,
    eventKey: eventKey([
      event.observedAt,
      event.eventType,
      event.source,
      event.target,
      event.ability,
      event.amount,
      event.damageType,
      event.rawText
    ])
  }));
}

function parseTelemetryText(text, observedAt = new Date().toISOString()) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const events = [];

  const xp = clean.match(/\b(?:experience|xp)\s*(?:gained)?\s*[:+]?[\s=]*([+-]?\d+(?:\.\d+)?)/i);
  if (xp) {
    events.push({
      observedAt,
      eventType: 'experience',
      amount: Number(xp[1]),
      rawText: clean
    });
  }

  const positionText = clean.match(/\b(?:pos|position|loc|location)\b(.+)/i);
  const position = positionText ? positionText[1].match(/-?\d+(?:\.\d+)?/g) : null;
  const hasCoordinateLabels = /\b[xyz]\s*[:=]/i.test(clean);
  if (position && position.length >= 3 && hasCoordinateLabels) {
    events.push({
      observedAt,
      eventType: 'position',
      x: Number(position[0]),
      y: Number(position[1]),
      z: Number(position[2]),
      rawText: clean
    });
  }

  return events.map((event) => ({
    ...event,
    eventKey: eventKey([event.observedAt, event.eventType, event.amount, event.x, event.y, event.z, event.rawText])
  }));
}

function parseSystemText(text, observedAt = new Date().toISOString()) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const events = [];

  const kill = clean.match(/^You have slain (.+?) and you have gained (.+?) experience(?:\s*\((.+)\))?\.$/i);
  if (kill) {
    const target = kill[1].trim();
    events.push({
      observedAt,
      eventType: 'kill',
      target,
      ability: kill[3] ? kill[3].trim() : null,
      rawText: clean
    });
    events.push({
      observedAt,
      eventType: 'experience_gain',
      target,
      ability: kill[2].trim(),
      rawText: clean
    });
  }

  const simpleKill = clean.match(/^You have slain (.+?)\.$/i);
  if (simpleKill && !kill) {
    events.push({
      observedAt,
      eventType: 'kill',
      target: simpleKill[1].trim(),
      ability: null,
      rawText: clean
    });
  }

  const con = clean.match(/^(.+?) is (.+?) to your presence\. This (?:(?:would be|fight would be)\s+)?(.+?)(?:[.!?] \((.+?)\))?[.!?]?"?$/i);
  if (con) {
    events.push({
      observedAt,
      eventType: 'target_con',
      target: con[1].trim(),
      ability: [con[2].trim(), con[3].trim(), con[4]?.trim()].filter(Boolean).join(' | '),
      rawText: clean
    });
  }

  const friendlyCon = clean.match(/^(.+?) is (.+?) to see you\. This (?:(?:would be|fight would be)\s+)?(.+?)(?:[.!?] \((.+?)\))?[.!?]?"?$/i);
  if (friendlyCon) {
    events.push({
      observedAt,
      eventType: 'target_con',
      target: friendlyCon[1].trim(),
      ability: [friendlyCon[2].trim(), friendlyCon[3].trim(), friendlyCon[4]?.trim()].filter(Boolean).join(' | '),
      rawText: clean
    });
  }

  const prepared = clean.match(/^(.+?) is prepared to attack you\. This (?:(?:would be|opponent is|fight would be)\s+)?(.+?)(?:[.!?] \((.+?)\))?[.!?]?"?$/i);
  if (prepared) {
    events.push({
      observedAt,
      eventType: 'target_con',
      target: prepared[1].trim(),
      ability: ['prepared to attack', prepared[2].trim(), prepared[3]?.trim()].filter(Boolean).join(' | '),
      rawText: clean
    });
  }

  const hatred = clean.match(/^(.+?) seethes with hatred, eager to slay you\. This (?:(?:would be|opponent is|fight would be)\s+)?(.+?)(?:[.!?] \((.+?)\))?[.!?]?"?$/i);
  if (hatred) {
    events.push({
      observedAt,
      eventType: 'target_con',
      target: hatred[1].trim(),
      ability: ['prepared to attack', hatred[2].trim(), hatred[3]?.trim()].filter(Boolean).join(' | '),
      rawText: clean
    });
  }

  if (/^(Camping, please wait|Teleporting to .+)\.?$/i.test(clean)) {
    events.push({
      observedAt,
      eventType: 'system_message',
      rawText: clean
    });
  }

  return events.map((event) => ({
    ...event,
    eventKey: eventKey([event.observedAt, event.eventType, event.target, event.ability, event.rawText])
  }));
}

function parserEventFromParsedTextEvent(event) {
  if (event.eventType === 'damage') {
    return {
      ...event,
      eventType: 'damage_estimate',
      eventKey: eventKey([
        event.observedAt,
        'combat_log_damage',
        event.source,
        event.target,
        event.ability,
        event.amount,
        event.damageType,
        event.rawText
      ])
    };
  }
  if (event.eventType === 'mitigation') {
    return {
      ...event,
      eventType: 'mitigation_estimate',
      eventKey: eventKey([
        event.observedAt,
        'combat_log_mitigation',
        event.source,
        event.target,
        event.ability,
        event.amount,
        event.damageType,
        event.rawText
      ])
    };
  }
  return event;
}

function looksLikeAssetCode(text) {
  const value = String(text || '');
  return value.length >= 6
    && /^[A-Za-z0-9<>_.' -]+$/.test(value)
    && (/[_<>.]/.test(value) || /^(DeerFemale|DeerMale|Elk|GasBat)/.test(value))
    && !/[!?]$/.test(text)
    && !/\.$/.test(text);
}

function looksLikeDisplayName(text) {
  const value = String(text || '');
  const openCount = (value.match(/\(/g) || []).length;
  const closeCount = (value.match(/\)/g) || []).length;
  return /^[A-Za-z][A-Za-z0-9'() -]{3,60}$/.test(value)
    && /[aeiou]/i.test(value)
    && (value.length >= 6 || /[ '()]/.test(value))
    && openCount === closeCount
    && !/^[A-Z0-9]+$/.test(value)
    && !/^Loadout \d+$/i.test(text)
    && !/[.!?]$/.test(text);
}

function normalizeItemName(text) {
  return String(text || '').replace(/[;]$/, '').replace(/([a-z)])([A-Z0-9])$/, '$1').trim();
}

function normalizeResourceName(name, asset) {
  const cleanName = String(name || '').trim();
  const cleanAsset = String(asset || '');
  const looksNoisy = cleanName.length < 6 || !/[a-z]{3,}/i.test(cleanName);
  if (/Harvest_HempPlant/i.test(cleanAsset) && looksNoisy) return 'Jute Plant';
  return cleanName;
}

function isCreatureOrNpcAsset(text) {
  return /^(Common|Deinocheirus|Elk|FantasyBeast|FantasyTiger|GasBat|Rat|Rabbit|Spider|Toad|Wolf|Deer|Orc|Goblin|Hornet|Skeleton|TrainingDummy|Harvest|MHM|MHF|HALF|HUM|XT_|Crafting|Arcamental|Mining)|_(Brown|Grass|Emerald|Common|Purple|Normal|Male|Female|Yellow|beetle)|[a-z]_[a-z]/.test(text);
}

function isResourceAsset(text) {
  return /^(Harvest|Mining)_/i.test(String(text || ''));
}

function findNearbyActorAsset(rows, startIndex) {
  for (let offset = 1; offset <= 5; offset += 1) {
    const candidate = rows[startIndex + offset];
    if (!candidate) return null;
    if (offset > 1 && looksLikeDisplayName(candidate.text)) return null;
    if (looksLikeAssetCode(candidate.text) && isCreatureOrNpcAsset(candidate.text)) return candidate;
  }
  return null;
}

function parsePacketMessages(messages, observedAt = new Date().toISOString(), options = {}) {
  const events = [];
  const context = options.context || {};
  if (!context.entityNameById) context.entityNameById = new Map();
  if (!context.actorNameById) context.actorNameById = new Map();
  if (!context.lastHealthById) context.lastHealthById = new Map();
  if (!context.recentClientActions) context.recentClientActions = [];
  if (!context.recentAbilityHints) context.recentAbilityHints = [];
  if (!context.pendingDamageById) context.pendingDamageById = new Map();
  if (!context.learnedDamagePatterns) context.learnedDamagePatterns = new Map();
  if (!context.lastPositionById) context.lastPositionById = new Map();
  if (!context.lastClientPositionById) context.lastClientPositionById = new Map();
  if (!context.localActorNameById) context.localActorNameById = new Map();
  if (!context.petNameById) context.petNameById = new Map();
  if (!context.petDisplayNameById) context.petDisplayNameById = new Map();
  if (!context.entityLevelById) context.entityLevelById = new Map();
  if (!context.entityKindById) context.entityKindById = new Map();
  if (!context.recentServerDamageByTarget) context.recentServerDamageByTarget = new Map();
  if (!context.recentUnknownPositions) context.recentUnknownPositions = [];
  if (!context.recentTargetCons) context.recentTargetCons = [];
  if (!context.recentTargetSelections) context.recentTargetSelections = [];
  const positionOnly = Boolean(options.positionOnly);
  const spawnRecords = extractSpawnRecords(options.payloadHex);
  for (const record of spawnRecords) {
    if (record.entityId && Number.isFinite(record.level) && record.level > 0) {
      context.entityLevelById.set(record.entityId, record.level);
    }
  }
  const entityIds = spawnRecords.map((record) => record.entityId);
  const namedEntityRecords = positionOnly ? [] : extractNamedEntityRecords(options.payloadHex);
  const action = positionOnly ? null : extractClientActionCandidate(options.payloadHex, options.packet);
  const targetEntityIds = positionOnly ? [] : extractClientTargetEntityIds(options.payloadHex, options.packet);
  const abilityCastRecords = positionOnly ? [] : extractClientAbilityCastRecords(options.payloadHex, options.packet);
  const abilityEffectRecords = positionOnly ? [] : extractServerAbilityEffectRecords(options.payloadHex, options.packet);
  const positionRecord = extractClientPositionRecord(options.payloadHex, options.packet);
  const serverActorPositionRecords = extractServerActorPositionRecords(options.payloadHex, options.packet);
  let entityIndex = 0;
  const rows = positionOnly ? [] : (messages || [])
    .map((message) => ({
      messageId: message.id || message.messageId || null,
      text: String(message.text || '').replace(/\s+/g, ' ').trim()
    }))
    .filter((message) => message.text);

  for (const record of namedEntityRecords) {
    const isLocal = record.entityId === context.localActorId;
    rememberActorName(context, record.entityId, record.name, isLocal);
    if (typeof options.onActorName === 'function') {
      options.onActorName({
        ...record,
        isLocal,
        observedAt
      });
    }
  }

  if (action) {
    const actionEvent = {
      observedAt,
      eventType: 'client_action_candidate',
      source: localActorName(context),
      ability: `${action.ability} (candidate)`,
      amount: action.byteLength,
      damageType: action.signature,
      rawText: `client action 0x${action.opcode} ${action.signature}`,
      eventKey: eventKey([observedAt, 'client_action_candidate', action.signature])
    };
    events.push(actionEvent);
    context.recentClientActions.push(actionEvent);
    if (context.recentClientActions.length > 20) context.recentClientActions.shift();
  }

  if (targetEntityIds.length) {
    for (const entityId of targetEntityIds) {
      context.recentTargetSelections.push({ observedAt, entityId });
    }
    const cutoff = Date.parse(observedAt) - 6000;
    context.recentTargetSelections = context.recentTargetSelections
      .filter((selection) => {
        const selectionMs = Date.parse(selection.observedAt);
        return Number.isFinite(selectionMs) && selectionMs >= cutoff;
      })
      .slice(-30);
  }

  if (positionRecord) {
    const ignoreRepeatedClientPosition = shouldIgnoreRepeatedClientPosition(context, positionRecord);
    context.lastClientPositionById.set(positionRecord.entityId, {
      observedAt,
      x: positionRecord.x,
      y: positionRecord.y,
      z: positionRecord.z,
      heading: positionRecord.heading
    });
    if (!ignoreRepeatedClientPosition && shouldEmitPosition(context, positionRecord, observedAt)) {
      const previousLocalActorId = context.localActorId || null;
      context.localActorId = positionRecord.entityId;
      context.localActorName = context.localActorNameById.get(positionRecord.entityId)
        || context.actorNameById.get(positionRecord.entityId)
        || (previousLocalActorId === positionRecord.entityId ? context.localActorName : null);
      const source = localActorName(context);
      events.push({
        observedAt,
        eventType: 'position_update',
        source,
        target: source,
        damageType: positionRecord.entityId,
        heading: positionRecord.heading,
        headingRaw: positionRecord.headingRaw,
        x: positionRecord.x,
        y: positionRecord.y,
        z: positionRecord.z,
        rawText: `${source} position ${positionRecord.x} ${positionRecord.y} ${positionRecord.z} heading ${positionRecord.heading ?? 'unknown'} raw ${positionRecord.headingRaw ?? 'unknown'}`,
        eventKey: eventKey([observedAt, 'position_update', positionRecord.entityId, positionRecord.x, positionRecord.y, positionRecord.z, positionRecord.heading])
      });
      context.lastPositionById.set(positionRecord.entityId, {
        observedAt,
        x: positionRecord.x,
        y: positionRecord.y,
        z: positionRecord.z,
        heading: positionRecord.heading,
        sourceType: 'client_position'
      });
    }
  }

  for (const record of serverActorPositionRecords) {
    const name = context.actorNameById.get(record.entityId);
    const entityName = context.entityNameById.get(record.entityId);
    if (!shouldEmitPosition(context, record, observedAt)) continue;
    if (record.entityId === context.localActorId) {
      const source = name || localActorName(context);
      events.push({
        observedAt,
        eventType: 'position_update',
        source,
        target: source,
        damageType: record.entityId,
        x: record.x,
        y: record.y,
        z: record.z,
        rawText: `${source} server position ${record.x} ${record.y} ${record.z}`,
        eventKey: eventKey([observedAt, 'position_update_server', record.entityId, record.x, record.y, record.z])
      });
    } else if (!name && !entityName) {
      const conEvent = bindUnknownPositionToRecentCon(context, record, observedAt);
      if (!conEvent) {
        rememberUnknownPosition(context, record, observedAt);
        if (shouldEmitUnknownWorldPosition(context, record)) {
          events.push({
            observedAt,
            eventType: 'world_entity',
            target: `Unknown entity ${record.entityId}`,
            ability: 'entityKind:mob',
            amount: context.entityLevelById.get(record.entityId) || null,
            damageType: record.entityId,
            x: record.x,
            y: record.y,
            z: record.z,
            rawText: `Unknown entity ${record.entityId} position ${record.x} ${record.y} ${record.z}`,
            eventKey: eventKey([observedAt, 'world_entity', record.entityId, record.x, record.y, record.z])
          });
        }
        context.lastPositionById.set(record.entityId, {
          observedAt,
          x: record.x,
          y: record.y,
          z: record.z
        });
        continue;
      }
      events.push({
        observedAt,
        eventType: 'world_entity',
        target: conEvent.target,
        ability: 'entityKind:mob',
        amount: context.entityLevelById.get(record.entityId) || null,
        damageType: record.entityId,
        x: record.x,
        y: record.y,
        z: record.z,
        rawText: `${conEvent.target} position ${record.x} ${record.y} ${record.z} (target con inferred)`,
        eventKey: eventKey([observedAt, 'world_entity', record.entityId, record.x, record.y, record.z])
      });
    } else
    if (name && record.entityId !== context.localActorId) {
      events.push({
        observedAt,
        eventType: 'player_position',
        source: name,
        target: name,
        damageType: record.entityId,
        x: record.x,
        y: record.y,
        z: record.z,
        rawText: `${name} player position ${record.x} ${record.y} ${record.z}`,
        eventKey: eventKey([observedAt, 'player_position', record.entityId, record.x, record.y, record.z])
      });
    } else if (entityName) {
      events.push({
        observedAt,
        eventType: 'world_entity',
        target: entityName,
        ability: context.entityKindById.get(record.entityId) ? `entityKind:${context.entityKindById.get(record.entityId)}` : undefined,
        amount: context.entityLevelById.get(record.entityId) || null,
        damageType: record.entityId,
        x: record.x,
        y: record.y,
        z: record.z,
        rawText: `${entityName} position ${record.x} ${record.y} ${record.z}`,
        eventKey: eventKey([observedAt, 'world_entity', record.entityId, record.x, record.y, record.z])
      });
    }
    context.lastPositionById.set(record.entityId, {
      observedAt,
      x: record.x,
      y: record.y,
      z: record.z,
      sourceType: record.entityId === context.localActorId ? 'server_actor_position' : 'server_actor'
    });
  }

  for (const record of abilityCastRecords) {
    const source = combatActorName(context, record.sourceId) || `Unknown actor ${record.sourceId}`;
    events.push({
      observedAt,
      eventType: 'ability_cast_candidate',
      source,
      target: source,
      ability: `${record.ability} (candidate)`,
      amount: record.byteLength,
      damageType: record.token,
      rawText: `${source} cast ${record.ability} candidate 0x${record.token}`,
      eventKey: eventKey([observedAt, 'ability_cast_candidate', record.sourceId, record.ability, record.signature])
    });
  }

  for (const record of abilityEffectRecords) {
    const target = combatActorName(context, record.targetId) || `Unknown actor ${record.targetId}`;
    events.push({
      observedAt,
      eventType: 'ability_effect_candidate',
      source: target,
      target,
      ability: `${record.ability} (effect candidate)`,
      amount: record.byteLength,
      damageType: record.state || record.token,
      rawText: `${target} gained ${record.ability}${record.state ? ` (${record.state})` : ''} candidate 0x${record.token}`,
      eventKey: eventKey([observedAt, 'ability_effect_candidate', record.targetId, record.ability, record.signature])
    });
  }

  for (const message of rows) {
    rememberAbilityHint(context, message.text, observedAt);
    const parsedEvents = parseMessage(message.text, observedAt)
      .map(parserEventFromParsedTextEvent)
      .map((event) => ({
        ...event,
        messageId: message.messageId
      }));
    for (const event of parsedEvents) {
      events.push(event);
      if (
        event.eventType === 'damage_estimate'
        && event.ability
        && !/shield of spinning spikes/i.test(event.ability)
        && !/^(Unknown ability|Health delta)/i.test(event.ability)
      ) {
        const learnedSource = event.source && !/^Unknown actor /i.test(event.source) ? event.source : null;
        const cleanedAbility = String(event.ability).replace(/\s+\(estimated\)$/i, '');
        learnDamagePattern(
          context,
          learnedSource,
          event.damageType,
          event.amount,
          null,
          cleanedAbility,
          1
        );
      }
      if (event.eventType !== 'target_con') continue;
      context.recentTargetCons.push(event);
      context.recentTargetCons = context.recentTargetCons.slice(-20);
      const bound = bindRecentConTarget(context, event, observedAt);
      if (!bound) continue;
      if (!event.damageType) event.damageType = bound.entityId;
      if (![bound.x, bound.y, bound.z].every(Number.isFinite)) continue;
      events.push({
        observedAt,
        eventType: 'world_entity',
        target: event.target,
        ability: 'entityKind:mob',
        amount: context.entityLevelById.get(bound.entityId) || null,
        damageType: bound.entityId,
        x: bound.x,
        y: bound.y,
        z: bound.z,
        rawText: `${event.target} position ${bound.x} ${bound.y} ${bound.z} (target con inferred)`,
        eventKey: eventKey([observedAt, 'world_entity', bound.entityId, bound.x, bound.y, bound.z])
      });
    }
  }

  for (let i = 0; i < rows.length - 1; i++) {
    const current = rows[i];
    const next = rows[i + 1];

    if (looksLikeDisplayName(current.text) && isResourceAsset(next.text)) {
      const entityId = entityIds[entityIndex++] || null;
      const spawnRecord = entityId ? spawnRecords.find((record) => record.entityId === entityId) : null;
      const resourceName = normalizeResourceName(current.text, next.text);
      if (entityId) {
        context.entityNameById.set(entityId, resourceName);
        if (spawnRecord?.entityKind) context.entityKindById.set(entityId, spawnRecord.entityKind);
        flushPendingDamage(context, entityId, events);
      }
      events.push({
        messageId: next.messageId || current.messageId,
        observedAt,
        eventType: 'harvest_node',
          target: resourceName,
          ability: next.text,
          amount: spawnRecord?.level,
          damageType: entityId,
        x: spawnRecord?.x,
        y: spawnRecord?.y,
        z: spawnRecord?.z,
        rawText: `${resourceName} | ${next.text}`,
        eventKey: eventKey([observedAt, 'harvest_node', resourceName, next.text, entityId])
      });
      continue;
    }

    const minionOwner = minionTitleOwner(next.text);
    const minionName = normalizeCharacterNameToken(current.text);
    if (minionName && minionOwner) {
      const entityId = entityIds[entityIndex++] || null;
      if (entityId) {
        context.petNameById.set(entityId, minionName);
        context.petDisplayNameById.set(entityId, minionDisplayName(minionOwner, next.text, minionName));
        if (typeof options.onPetName === 'function') {
          options.onPetName({
            entityId,
            name: minionName,
            ownerName: minionOwner,
            rawTitle: next.text,
            observedAt
          });
        }
      }
      events.push({
        messageId: next.messageId || current.messageId,
        observedAt,
        eventType: 'pet_name',
        source: minionOwner,
        target: minionName,
        ability: next.text,
        damageType: entityId,
        rawText: `${minionName} | ${next.text}`,
        eventKey: eventKey([observedAt, 'pet_name', entityId, minionName, next.text])
      });
      continue;
    }

    if (looksLikeDisplayName(current.text)) {
      const asset = findNearbyActorAsset(rows, i);
      if (asset) {
        const entityId = entityIds[entityIndex++] || null;
        const spawnRecord = entityId ? spawnRecords.find((record) => record.entityId === entityId) : null;
        const eventType = isResourceAsset(asset.text) ? 'harvest_node' : 'world_entity';
        const targetName = eventType === 'harvest_node' ? normalizeResourceName(current.text, asset.text) : current.text;
        if (entityId) {
          context.entityNameById.set(entityId, targetName);
          if (spawnRecord?.entityKind) context.entityKindById.set(entityId, spawnRecord.entityKind);
          flushPendingDamage(context, entityId, events);
        }
        events.push({
          messageId: asset.messageId || current.messageId,
          observedAt,
          eventType,
          target: targetName,
          ability: asset.text,
          amount: spawnRecord?.level,
          damageType: entityId,
          x: spawnRecord?.x,
          y: spawnRecord?.y,
          z: spawnRecord?.z,
          rawText: `${targetName} | ${asset.text}`,
          eventKey: eventKey([observedAt, eventType, targetName, asset.text, entityId])
        });
        continue;
      }
    }

    if (looksLikeDisplayName(current.text) && /^[A-Za-z0-9_]+$/.test(next.text) && next.text.includes('_') && !next.text.includes(' ')) {
      events.push({
        messageId: next.messageId || current.messageId,
        observedAt,
        eventType: 'item_seen',
        target: normalizeItemName(current.text),
        ability: next.text,
        rawText: `${normalizeItemName(current.text)} | ${next.text}`,
        eventKey: eventKey([observedAt, 'item_seen', normalizeItemName(current.text), next.text])
      });
    }
  }

  for (const spawnRecord of spawnRecords) {
    if (!spawnRecord.entityId || ![spawnRecord.x, spawnRecord.y, spawnRecord.z].every(Number.isFinite)) continue;
    const knownName = context.entityNameById.get(spawnRecord.entityId);
    if (!knownName) continue;
    const eventType = spawnRecord.spawnType === 'resource' ? 'harvest_node' : 'world_entity';
    if (events.some((event) => event.eventType === eventType && event.damageType === spawnRecord.entityId)) continue;
    if (spawnRecord.entityKind) context.entityKindById.set(spawnRecord.entityId, spawnRecord.entityKind);
    events.push({
      observedAt,
      eventType,
      target: knownName,
      ability: spawnRecord.entityKind ? `entityKind:${spawnRecord.entityKind}` : undefined,
      amount: spawnRecord.level ?? context.entityLevelById.get(spawnRecord.entityId) ?? null,
      damageType: spawnRecord.entityId,
      x: spawnRecord.x,
      y: spawnRecord.y,
      z: spawnRecord.z,
      rawText: `${knownName} position ${spawnRecord.x} ${spawnRecord.y} ${spawnRecord.z}`,
      eventKey: eventKey([observedAt, eventType, spawnRecord.entityId, spawnRecord.x, spawnRecord.y, spawnRecord.z])
    });
  }

  const healthRecords = positionOnly ? [] : extractHealthRecords(options.payloadHex);
  const serverDamageRecords = positionOnly ? [] : extractServerDamageRecords(options.payloadHex);
  const packetKill = events.find((event) => event.eventType === 'kill' && event.target);
  const killHealthRecord = packetKill
    ? healthRecords
      .filter((record) => !context.entityNameById.has(record.entityId) && record.current <= 0.01 && record.max >= 1)
      .sort((left, right) => right.max - left.max)[0]
    : null;
  if (packetKill && killHealthRecord) {
    context.entityNameById.set(killHealthRecord.entityId, packetKill.target);
    flushPendingDamage(context, killHealthRecord.entityId, events);
  }
  const serverDamageTargetIds = new Set();

  for (const record of serverDamageRecords) {
    const resolvedSourceName = sourceName => sourceName && !/^Unknown actor /i.test(sourceName) ? sourceName : null;
    const target = context.entityNameById.get(record.targetId)
      || combatActorName(context, record.targetId)
      || `Unknown entity ${record.targetId}`;
    const sourceName = combatActorName(context, record.sourceId);
    const knownSourceName = resolvedSourceName(sourceName);
    const hintedAbility = estimatedAbility(context, observedAt, knownSourceName)
      || (!knownSourceName ? estimatedAbility(context, observedAt, null) : null);
    const learnedAbility = learnedAbilityFromPattern(context, knownSourceName, record)
      || (!knownSourceName ? learnedAbilityFromPattern(context, null, record) : null);
    const inferredAbility = inferredAbilityFromDamagePattern(record, knownSourceName);
    const ability = record.ability
      ? `${record.ability} (estimated)`
      : inferredAbility
        ? inferredAbility
      : learnedAbility
        ? learnedAbility
      : hintedAbility
        ? hintedAbility
      : 'Unknown ability (estimated)';
    const eventRecord = {
      ...record,
      observedAt,
      ability,
      sourceName,
      damageType: record.damageType
    };
    serverDamageTargetIds.add(record.targetId);
    context.recentServerDamageByTarget.set(record.targetId, Date.parse(observedAt) || Date.now());
    if (context.recentServerDamageByTarget.size > 200) {
      const cutoff = (Date.parse(observedAt) || Date.now()) - 10000;
      for (const [entityId, lastSeen] of context.recentServerDamageByTarget.entries()) {
        if (lastSeen < cutoff) context.recentServerDamageByTarget.delete(entityId);
      }
    }
    events.push(buildServerDamageEvent(eventRecord, target, ability));
    const mitigationEvent = buildServerMitigationEvent(eventRecord, target, ability);
    if (mitigationEvent) events.push(mitigationEvent);
    if (ability && ability !== 'Unknown ability (estimated)' && sourceName) {
      learnDamagePattern(context, sourceName, record.damageType, record.amount, record.mitigated, ability.replace(/\s+\(estimated\)$/i, ''), inferredAbility || record.ability || hintedAbility || learnedAbility ? 1 : 0.5);
    }
  }

  for (const record of healthRecords) {
    const target = context.entityNameById.get(record.entityId);
    if (!target) continue;

    const previous = context.lastHealthById.get(record.entityId);
    events.push({
      observedAt,
      eventType: 'health_update',
      target,
      ability: String(record.max),
      amount: record.current,
      damageType: record.entityId,
      rawText: `${target} hp ${record.current}/${record.max}`,
      eventKey: eventKey([observedAt, 'health_update', record.entityId, record.current, record.max])
    });

    if (
      previous
      && record.current < previous.current - 0.01
      && !serverDamageTargetIds.has(record.entityId)
    ) {
      const recentServerDamageAt = context.recentServerDamageByTarget.get(record.entityId) || 0;
      const observedMillis = Date.parse(observedAt) || Date.now();
      if (recentServerDamageAt && observedMillis - recentServerDamageAt <= 1500) {
        context.lastHealthById.set(record.entityId, record);
        continue;
      }
      const delta = Number((previous.current - record.current).toFixed(3));
      if (delta < 1) {
        context.lastHealthById.set(record.entityId, record);
        continue;
      }
      events.push({
        observedAt,
        eventType: 'damage_estimate',
        source: 'Unattributed damage',
        target,
        ability: 'Health delta (estimated)',
        amount: delta,
        damageType: record.entityId,
        rawText: `${target} hp ${previous.current} -> ${record.current}`,
        eventKey: eventKey([observedAt, 'damage_estimate', record.entityId, previous.current, record.current])
      });
    }

    context.lastHealthById.set(record.entityId, record);
  }

  return events;
}

function parseMessage(text, observedAt = new Date().toISOString()) {
  return [
    ...parseCombatText(text, observedAt),
    ...parseTelemetryText(text, observedAt),
    ...parseSystemText(text, observedAt)
  ];
}

module.exports = {
  eventKey,
  extractClientActionCandidate,
  extractClientAbilityCastRecords,
  extractClientPositionRecord,
  extractServerAbilityEffectRecords,
  extractServerActorPositionRecords,
  extractHealthRecords,
  extractNamedEntityRecords,
  extractServerDamageRecords,
  extractSpawnRecords,
  extractSpawnEntityIds,
  normalizeCharacterNameToken,
  parseCombatText,
  parseMessage,
  parsePacketMessages,
  parseSystemText,
  parseTelemetryText,
  inferredAbilityFromDamagePattern
};
