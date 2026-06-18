const fs = require('node:fs');
const path = require('node:path');
const { readConfig } = require('../src/config');
const { parseLootLogLine } = require('../src/lootLog');
const { openStore } = require('../src/store');

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] || '';
}

function readLines(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function mergeTemplate(existingJson, incomingJson) {
  const existing = JSON.parse(existingJson || '{}');
  const incoming = JSON.parse(incomingJson || '{}');
  return JSON.stringify({
    ...existing,
    iconKey: incoming.iconKey || existing.iconKey || null,
    iconFile: incoming.iconFile || existing.iconFile || null,
    artUrl: incoming.artUrl || existing.artUrl || null,
    artSource: incoming.artSource || existing.artSource || null,
    exportedIconFile: incoming.exportedIconFile || existing.exportedIconFile || null,
    iconSpriteName: incoming.iconSpriteName || existing.iconSpriteName || null,
    iconTextureName: incoming.iconTextureName || existing.iconTextureName || null,
    iconWidth: incoming.iconWidth || existing.iconWidth || null,
    iconHeight: incoming.iconHeight || existing.iconHeight || null
  });
}

function main() {
  const programData = process.env.ProgramData || 'C:\\ProgramData';
  const defaultLootDir = path.join(programData, 'PantheonLootData');
  const configPath = argValue('--config') || undefined;
  const config = readConfig(configPath);
  const databasePath = argValue('--database') || config.database.path;
  const lootLog = argValue('--loot-log') || path.join(defaultLootDir, 'loot-events-current.jsonl');
  const iconLog = argValue('--icon-log') || path.join(defaultLootDir, 'loot-icons-current.jsonl');
  const store = openStore(databasePath);
  const select = store.db.prepare('SELECT template_json templateJson FROM loot_items WHERE item_id = ?');
  const update = store.db.prepare('UPDATE loot_items SET template_json = ? WHERE item_id = ?');
  let scanned = 0;
  let withArt = 0;
  let updated = 0;
  try {
    store.db.exec('BEGIN IMMEDIATE');
    for (const filePath of [lootLog, iconLog]) {
      const iconBaseDir = path.dirname(filePath);
      for (const line of readLines(filePath)) {
        scanned += 1;
        const parsed = parseLootLogLine(line, { iconBaseDir });
        if (!parsed?.item) continue;
        const template = JSON.parse(parsed.item.templateJson || '{}');
        if (!template.artUrl || template.artSource !== 'lootdata') continue;
        withArt += 1;
        const row = select.get(parsed.item.itemId);
        if (!row) continue;
        const existing = JSON.parse(row.templateJson || '{}');
        if (existing.artSource === 'lootdata' && existing.artUrl === template.artUrl) continue;
        update.run(mergeTemplate(row.templateJson, parsed.item.templateJson), parsed.item.itemId);
        updated += 1;
      }
    }
    store.db.exec('COMMIT');
  } catch (error) {
    store.db.exec('ROLLBACK');
    throw error;
  } finally {
    store.close();
  }
  console.log(JSON.stringify({ databasePath, lootLog, iconLog, scanned, withArt, updated }, null, 2));
}

main();
