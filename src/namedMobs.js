const SHALAZAM_BASE_URL = 'https://shalazam.info';

function decodeHtml(value = '') {
  return String(value)
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function htmlToText(value = '') {
  return decodeHtml(String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function normalizeMobName(value = '') {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9'"\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function parseLevelRange(value = '') {
  const text = htmlToText(value);
  const range = text.match(/(\d+)\s*-\s*(\d+)/);
  if (range) return { levelMin: Number(range[1]), levelMax: Number(range[2]) };
  const single = text.match(/\d+/);
  if (single) return { levelMin: Number(single[0]), levelMax: Number(single[0]) };
  return { levelMin: null, levelMax: null };
}

function parseShalazamMonsterPath(path = '') {
  const match = String(path).match(/^\/monsters\/(\d+)-([^/?#]+)/);
  if (!match) return null;
  return {
    shalazamId: Number(match[1]),
    slug: match[2],
    sourceUrl: `${SHALAZAM_BASE_URL}${match[0]}`
  };
}

function parseNamedMobListPage(html = '') {
  const byId = new Map();
  for (const match of String(html).matchAll(/<a\b[^>]*href="(\/monsters\/(\d+)-[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const parsed = parseShalazamMonsterPath(match[1]);
    if (!parsed || byId.has(parsed.shalazamId)) continue;
    byId.set(parsed.shalazamId, {
      ...parsed,
      name: htmlToText(match[3])
    });
  }
  const countMatch = htmlToText(html).match(/\b\d+\s*-\s*\d+\s+of\s+(\d+)\b/i);
  return {
    totalCount: countMatch ? Number(countMatch[1]) : byId.size,
    rows: [...byId.values()]
  };
}

function parseDefinitionField(html = '', label = '') {
  const pattern = new RegExp(`<dt[^>]*>\\s*${label}\\s*<\\/dt>\\s*<dd[^>]*>([\\s\\S]*?)<\\/dd>`, 'i');
  const match = String(html).match(pattern);
  return match ? htmlToText(match[1]) : null;
}

function parseBreadcrumbLocation(html = '') {
  const crumbs = [...String(html).matchAll(/<li[^>]*>\s*<a\b[^>]*href="[^"]*"[^>]*>([\s\S]*?)<\/a>\s*<\/li>/gi)]
    .map((match) => htmlToText(match[1]))
    .filter(Boolean);
  const mobsIndex = crumbs.findIndex((crumb) => crumb.toLowerCase() === 'mobs');
  if (mobsIndex >= 0 && crumbs[mobsIndex + 1]) return crumbs[mobsIndex + 1];
  return null;
}

function parseMapCoordinates(html = '') {
  const text = String(html);
  const titlePattern = /title="X \(East-West\)">\s*([-+]?\d+(?:\.\d+)?)\s*<\/span>[\s\S]*?title="Z \(Altitude\)">\s*([-+]?\d+(?:\.\d+)?)\s*<\/span>[\s\S]*?title="Y \(North-South\)">\s*([-+]?\d+(?:\.\d+)?)\s*<\/span>/i;
  const titleMatch = text.match(titlePattern);
  if (titleMatch) {
    return {
      x: Number(titleMatch[1]),
      y: Number(titleMatch[3]),
      z: Number(titleMatch[2])
    };
  }
  const mapMatch = text.match(/\/maps\/([^"?]+)\?x=([-+]?\d+(?:\.\d+)?)&amp;y=([-+]?\d+(?:\.\d+)?)&amp;zoom=/i);
  if (mapMatch) {
    return {
      x: Number(mapMatch[2]),
      y: Number(mapMatch[3]),
      z: null,
      mapId: mapMatch[1]
    };
  }
  return null;
}

function parseMonsterDetailPage(html = '', fallback = {}) {
  const titleMatch = String(html).match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const name = titleMatch ? htmlToText(titleMatch[1]) : fallback.name || null;
  const canonicalTag = String(html).match(/<link\b[^>]*rel="canonical"[^>]*>/i)?.[0] || '';
  const canonicalHref = canonicalTag.match(/\bhref="([^"]+)"/i)?.[1] || null;
  const pathMatch = canonicalHref
    ? [null, canonicalHref]
    : String(html).match(/property="og:url"[^>]+content="([^"]+)"/i);
  const parsedPath = parseShalazamMonsterPath(pathMatch ? decodeHtml(pathMatch[1]) : fallback.sourceUrl || '');
  const location = parseDefinitionField(html, 'Location') || parseBreadcrumbLocation(html) || fallback.location || null;
  const fullText = htmlToText(html);
  const zoneMatch = location
    ? fullText.match(new RegExp(`\\b${location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(([^)]+)\\)`, 'i'))
    : null;
  const level = parseLevelRange(parseDefinitionField(html, 'Level') || '');
  const coords = parseMapCoordinates(html);
  return {
    shalazamId: parsedPath?.shalazamId ?? fallback.shalazamId ?? null,
    slug: parsedPath?.slug ?? fallback.slug ?? null,
    name,
    location,
    zone: zoneMatch ? zoneMatch[1].trim() : location && location.includes('>') ? location.split('>')[0].trim() : fallback.zone || null,
    levelMin: level.levelMin,
    levelMax: level.levelMax,
    difficulty: parseDefinitionField(html, 'Difficulty'),
    spawn: parseDefinitionField(html, 'Spawn'),
    faction: parseDefinitionField(html, 'Faction'),
    sourceUrl: parsedPath?.sourceUrl || fallback.sourceUrl || null,
    spawnPoint: coords,
    rawUpdatedLabel: htmlToText(String(html).match(/Updated\s*<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/i)?.[1] || '') || null
  };
}

function upsertNamedMob(db, mob, importedAt = new Date().toISOString()) {
  if (!mob?.shalazamId || !mob?.name || !mob?.sourceUrl) return false;
  db.prepare(`
    INSERT INTO named_mobs (
      shalazam_id, slug, name, location, zone, level_min, level_max, difficulty,
      spawn, faction, source_url, source_updated_label, imported_at, last_seen_source_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(shalazam_id) DO UPDATE SET
      slug = excluded.slug,
      name = excluded.name,
      location = COALESCE(excluded.location, named_mobs.location),
      zone = COALESCE(excluded.zone, named_mobs.zone),
      level_min = COALESCE(excluded.level_min, named_mobs.level_min),
      level_max = COALESCE(excluded.level_max, named_mobs.level_max),
      difficulty = COALESCE(excluded.difficulty, named_mobs.difficulty),
      spawn = COALESCE(excluded.spawn, named_mobs.spawn),
      faction = COALESCE(excluded.faction, named_mobs.faction),
      source_url = excluded.source_url,
      source_updated_label = COALESCE(excluded.source_updated_label, named_mobs.source_updated_label),
      imported_at = excluded.imported_at,
      last_seen_source_at = excluded.last_seen_source_at
  `).run(
    mob.shalazamId,
    mob.slug || null,
    mob.name,
    mob.location || null,
    mob.zone || null,
    mob.levelMin ?? null,
    mob.levelMax ?? null,
    mob.difficulty || null,
    mob.spawn || null,
    mob.faction || null,
    mob.sourceUrl,
    mob.rawUpdatedLabel || null,
    importedAt,
    importedAt
  );

  const normalized = normalizeMobName(mob.name);
  if (normalized) {
    db.prepare(`
      INSERT INTO named_mob_aliases (
        shalazam_id, alias, normalized_alias, role, confidence, source, first_seen, last_seen
      ) VALUES (?, ?, ?, 'named', 1, 'shalazam', ?, ?)
      ON CONFLICT(shalazam_id, normalized_alias, role) DO UPDATE SET
        alias = excluded.alias,
        confidence = MAX(named_mob_aliases.confidence, excluded.confidence),
        last_seen = excluded.last_seen
    `).run(mob.shalazamId, mob.name, normalized, importedAt, importedAt);
  }

  if (mob.spawnPoint && Number.isFinite(Number(mob.spawnPoint.x)) && Number.isFinite(Number(mob.spawnPoint.y))) {
    db.prepare(`
      INSERT INTO named_spawn_points (
        shalazam_id, x, y, z, radius, map_id, source, confidence, first_seen, last_seen
      ) VALUES (?, ?, ?, ?, 35, ?, 'shalazam', ?, ?, ?)
      ON CONFLICT(shalazam_id, source, x, y, z) DO UPDATE SET
        radius = excluded.radius,
        map_id = COALESCE(excluded.map_id, named_spawn_points.map_id),
        confidence = MAX(named_spawn_points.confidence, excluded.confidence),
        last_seen = excluded.last_seen
    `).run(
      mob.shalazamId,
      Number(mob.spawnPoint.x),
      Number(mob.spawnPoint.y),
      Number.isFinite(Number(mob.spawnPoint.z)) ? Number(mob.spawnPoint.z) : 0,
      mob.spawnPoint.mapId || null,
      Number.isFinite(Number(mob.spawnPoint.z)) ? 0.85 : 0.55,
      importedAt,
      importedAt
    );
  }
  return true;
}

function getNamedMobSummary(db, options = {}) {
  const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
  const search = normalizeMobName(options.search || '');
  const location = String(options.location || '').trim();
  const where = [];
  const params = [];
  if (search) {
    where.push(`EXISTS (
      SELECT 1 FROM named_mob_aliases a
      WHERE a.shalazam_id = nm.shalazam_id
        AND a.normalized_alias LIKE ?
    )`);
    params.push(`%${search}%`);
  }
  if (location) {
    where.push('nm.location LIKE ?');
    params.push(`%${location}%`);
  }
  const rows = db.prepare(`
    SELECT nm.shalazam_id shalazamId, nm.slug, nm.name, nm.location, nm.zone,
           nm.level_min levelMin, nm.level_max levelMax, nm.difficulty, nm.spawn,
           nm.faction, nm.source_url sourceUrl, nm.imported_at importedAt,
           COUNT(DISTINCT sp.id) spawnPoints
    FROM named_mobs nm
    LEFT JOIN named_spawn_points sp ON sp.shalazam_id = nm.shalazam_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    GROUP BY nm.shalazam_id
    ORDER BY nm.name COLLATE NOCASE
    LIMIT ?
  `).all(...params, limit);
  const totals = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM named_mobs) mobs,
      (SELECT COUNT(*) FROM named_spawn_points) spawnPoints,
      (SELECT COUNT(*) FROM named_mob_aliases) aliases,
      (SELECT MAX(imported_at) FROM named_mobs) importedAt
  `).get();
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      mobs: Number(totals.mobs || 0),
      spawnPoints: Number(totals.spawnPoints || 0),
      aliases: Number(totals.aliases || 0),
      importedAt: totals.importedAt || null
    },
    rows
  };
}

module.exports = {
  SHALAZAM_BASE_URL,
  decodeHtml,
  getNamedMobSummary,
  htmlToText,
  normalizeMobName,
  parseMonsterDetailPage,
  parseNamedMobListPage,
  parseShalazamMonsterPath,
  upsertNamedMob
};
