const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const { DATA_ROOT } = require('./config');

const ITEM_ART_CACHE_ROOT = path.join(DATA_ROOT, 'data', 'item-art', 'shalazam');
const ITEM_ART_INDEX_PATH = path.join(ITEM_ART_CACHE_ROOT, 'index.json');

function normalizeItemArtName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isAllowedItemArtUrl(url) {
  try {
    const parsed = new URL(String(url || ''));
    return parsed.protocol === 'https:' && parsed.hostname === 'shalazam.info' && parsed.pathname.startsWith('/static/icons/');
  } catch {
    return false;
  }
}

function readItemArtIndex(indexPath = ITEM_ART_INDEX_PATH) {
  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeItemArtIndex(rows, indexPath = ITEM_ART_INDEX_PATH) {
  const current = readItemArtIndex(indexPath);
  for (const row of rows || []) {
    const name = String(row?.name || row?.itemName || '').trim();
    const artUrl = String(row?.artUrl || '').trim();
    if (!name || !artUrl || !isAllowedItemArtUrl(artUrl)) continue;
    current[normalizeItemArtName(name)] = { name, artUrl, source: row.artSource || row.source || 'shalazam' };
  }
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, `${JSON.stringify(current, null, 2)}\n`);
  return current;
}

function itemArtUrlForName(name, indexPath = ITEM_ART_INDEX_PATH) {
  const key = normalizeItemArtName(name);
  if (!key) return null;
  const row = readItemArtIndex(indexPath)[key];
  return row?.artUrl || null;
}

function itemArtCachePath(url) {
  if (!isAllowedItemArtUrl(url)) return null;
  const parsed = new URL(String(url));
  const basename = path.basename(parsed.pathname).replace(/[^a-z0-9._-]/gi, '_') || 'item.webp';
  const digest = crypto.createHash('sha256').update(String(url)).digest('hex').slice(0, 16);
  return path.join(ITEM_ART_CACHE_ROOT, `${digest}-${basename}`);
}

function fetchItemArtBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Pantheon Atlas item art cache',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
      }
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        fetchItemArtBuffer(new URL(res.headers.location, url).toString()).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Item art fetch failed: ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function readCachedItemArt(url) {
  const filePath = itemArtCachePath(url);
  if (!filePath) return null;
  try {
    return await fs.promises.readFile(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function cacheItemArt(url, options = {}) {
  const filePath = itemArtCachePath(url);
  if (!filePath) throw new Error('Unsupported item art URL');
  if (!options.force) {
    try {
      const stat = await fs.promises.stat(filePath);
      if (stat.size > 0) return { filePath, downloaded: false, bytes: stat.size };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const data = await fetchItemArtBuffer(url);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, data);
  return { filePath, downloaded: true, bytes: data.length };
}

module.exports = {
  ITEM_ART_CACHE_ROOT,
  ITEM_ART_INDEX_PATH,
  cacheItemArt,
  isAllowedItemArtUrl,
  itemArtCachePath,
  itemArtUrlForName,
  normalizeItemArtName,
  readItemArtIndex,
  writeItemArtIndex,
  readCachedItemArt
};
