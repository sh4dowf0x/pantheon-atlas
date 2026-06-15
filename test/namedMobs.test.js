const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  getNamedMobSummary,
  normalizeMobName,
  parseMonsterDetailPage,
  parseNamedMobListPage,
  upsertNamedMob
} = require('../src/namedMobs');
const { openStore } = require('../src/store');

const listHtml = `
  <div>1-50 of 167</div>
  <a href="/monsters/6-larcs-the-weaponsmith">Larcs the Weaponsmith</a>
  <a href="/monsters/582-anok-tular">Anok&#39;Tular</a>
`;

const list = parseNamedMobListPage(listHtml);
assert.equal(list.totalCount, 167);
assert.equal(list.rows.length, 2);
assert.equal(list.rows[0].shalazamId, 6);
assert.equal(list.rows[1].name, "Anok'Tular");

const detailHtml = `
  <link href="/monsters/6-larcs-the-weaponsmith" rel="canonical" />
  <h1>Larcs the Weaponsmith</h1>
  <dl>
    <dt class="tag">Location</dt><dd class="tag">Gadai Camps</dd>
    <dt class="tag">Level</dt><dd class="tag">10</dd>
    <dt class="tag">Difficulty</dt><dd class="tag">Solo</dd>
    <dt class="tag">Faction</dt><dd class="tag">Gadai Bandits</dd>
  </dl>
  <a href="/maps/1?x=3949.0&amp;y=2899.0&amp;zoom=6">Full Map</a>
  <span title="X (East-West)">3949</span>, <span title="Z (Altitude)">518</span>, <span title="Y (North-South)">2899</span>
  <p>Larcs the Weaponsmith is a level 10 named mob in Gadai Camps (Thronefast).</p>
`;

const detail = parseMonsterDetailPage(detailHtml);
assert.equal(detail.shalazamId, 6);
assert.equal(detail.name, 'Larcs the Weaponsmith');
assert.equal(detail.location, 'Gadai Camps');
assert.equal(detail.zone, 'Thronefast');
assert.equal(detail.levelMin, 10);
assert.equal(detail.levelMax, 10);
assert.equal(detail.difficulty, 'Solo');
assert.equal(detail.faction, 'Gadai Bandits');
assert.deepEqual(detail.spawnPoint, { x: 3949, y: 2899, z: 518 });
assert.equal(normalizeMobName('Anok’Tular!'), "anok'tular");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pantheon-named-mobs-test-'));
const store = openStore(path.join(tempDir, 'test.sqlite'));
assert.equal(upsertNamedMob(store.db, detail, '2026-01-01T00:00:00.000Z'), true);
const summary = getNamedMobSummary(store.db, { search: 'larcs' });
assert.equal(summary.totals.mobs, 1);
assert.equal(summary.totals.spawnPoints, 1);
assert.equal(summary.rows[0].name, 'Larcs the Weaponsmith');
assert.equal(summary.rows[0].spawnPoints, 1);
store.close();
fs.rmSync(tempDir, { recursive: true, force: true });

console.log('named mob tests passed');
