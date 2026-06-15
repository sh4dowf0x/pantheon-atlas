const state = {
  tab: 'parser',
  windowSeconds: 0,
  selectedSource: null,
  selectedAbilityKey: null,
  parserData: null,
  healingData: null,
  xpData: null,
  encounterData: null,
  selectedEncounterId: null,
  lootData: null,
  selectedLootItemId: null,
  lootSearch: '',
  lootRarity: '',
  lootType: '',
  lootClass: '',
  lootSlot: '',
  lootMaxLevel: '',
  lootSort: 'lastSeen',
  healingSelectedSource: null,
  healingSelectedAbilityKey: null,
  petAssignments: loadPetAssignments(),
  petMenuSource: null,
  mapAxis: window.localStorage.getItem('pantheonParser2.mapAxis') || 'xz',
  mapFollow: window.localStorage.getItem('pantheonParser2.mapShowTrail') !== 'false',
  mapShowNpcs: (window.localStorage.getItem('pantheonParser2.mapShowNpcs') ?? window.localStorage.getItem('pantheonParser2.mapShowEntities')) !== 'false',
  mapShowMobs: (window.localStorage.getItem('pantheonParser2.mapShowMobs') ?? window.localStorage.getItem('pantheonParser2.mapShowNpcs') ?? window.localStorage.getItem('pantheonParser2.mapShowEntities')) !== 'false',
  mapShowPlayers: window.localStorage.getItem('pantheonParser2.mapShowPlayers') !== 'false',
  mapShowNodes: (window.localStorage.getItem('pantheonParser2.mapShowNodes') ?? window.localStorage.getItem('pantheonParser2.mapShowEntities')) !== 'false',
  mapShowQuestItems: (window.localStorage.getItem('pantheonParser2.mapShowQuestItems') ?? window.localStorage.getItem('pantheonParser2.mapShowEntities')) !== 'false',
  mapShowChests: (window.localStorage.getItem('pantheonParser2.mapShowChests') ?? window.localStorage.getItem('pantheonParser2.mapShowEntities')) !== 'false',
  mapShowPlants: window.localStorage.getItem('pantheonParser2.mapShowPlants') !== 'false',
  mapShowTrees: window.localStorage.getItem('pantheonParser2.mapShowTrees') !== 'false',
  mapShowOre: window.localStorage.getItem('pantheonParser2.mapShowOre') !== 'false',
  mapShowLabels: window.localStorage.getItem('pantheonParser2.mapShowLabels') === 'true',
  mapIgnoreHeight: window.localStorage.getItem('pantheonParser2.mapIgnoreHeight') === 'true',
  mapIgnoreHeightExplicit: window.localStorage.getItem('pantheonParser2.mapIgnoreHeight') !== null,
  mapSelection: window.localStorage.getItem('pantheonParser2.mapSelection') || 'auto',
  mapLayerSelection: window.localStorage.getItem('pantheonParser2.mapLayerSelection') || 'auto',
  mapCalibrationLabel: window.localStorage.getItem('pantheonParser2.mapCalibrationLabel') || 'surface-road',
  mapCalibrationRecording: window.localStorage.getItem('pantheonParser2.mapCalibrationRecording') === 'true',
  mapCalibrationSession: window.localStorage.getItem('pantheonParser2.mapCalibrationSession') || '',
  mapCalibrationSamples: [],
  mapCalibrationFetchedAt: 0,
  mapCalibrationPostInFlight: false,
  mapLastCalibrationSample: null,
  mapCalibrationRecordedCount: Number(window.localStorage.getItem('pantheonParser2.mapCalibrationRecordedCount') || 0) || 0,
  mapPlayerLevelOverride: Number(window.localStorage.getItem('pantheonParser2.mapPlayerLevelOverride') || 0) || null,
  mapEntitySearch: window.localStorage.getItem('pantheonParser2.mapEntitySearch') || '',
  mapSearchOnly: window.localStorage.getItem('pantheonParser2.mapSearchOnly') === 'true',
  priorityMobList: window.localStorage.getItem('pantheonParser2.priorityMobList') || '',
  prioritySound: window.localStorage.getItem('pantheonParser2.prioritySound') !== 'false',
  prioritySeenIds: new Set(),
  priorityActiveIds: new Set(),
  priorityAudioContext: null,
  priorityOverlayTimer: null,
  respawnCampList: window.localStorage.getItem('pantheonParser2.respawnCampList') || 'Larcs the Weaponsmith | 15',
  respawnDefaultMinutes: Number(window.localStorage.getItem('pantheonParser2.respawnDefaultMinutes') || 15) || 15,
  respawnManualTimers: loadRespawnManualTimers(),
  respawnDismissedKeys: loadRespawnDismissedKeys(),
  respawnDeaths: [],
  respawnDeathsFetchedAt: 0,
  respawnDeathsRefreshInFlight: false,
  mapCatalog: null,
  mapConfig: null,
  mapState: null,
  mapEntities: [],
  mapEntitiesFetchedAt: 0,
  mapEntityRefreshInFlight: false,
  mapVisibleEntities: [],
  mapCanvasRows: [],
  mapZoom: Number(window.localStorage.getItem('pantheonParser2.mapZoom') || 6),
  mapRenderId: 0,
  mapHoverMarkers: [],
  refreshInFlight: false,
  refreshQueued: false,
  displaySince: window.localStorage.getItem('pantheonParser2.displaySince') || null
};

const tileImageCache = new Map();
const RADAR_RANGE_UNITS = 66;
const MAP_ENTITY_REFRESH_MS = 1_000;

const els = {
  status: document.querySelector('#status'),
  parserView: document.querySelector('#parser-view'),
  mapView: document.querySelector('#map-view'),
  diagnosticsView: document.querySelector('#diagnostics-view'),
  totalDps: document.querySelector('#total-dps'),
  totalDamage: document.querySelector('#total-damage'),
  totalKills: document.querySelector('#total-kills'),
  duration: document.querySelector('#duration'),
  totalHealingHps: document.querySelector('#total-healing-hps'),
  totalHealing: document.querySelector('#total-healing'),
  totalHealHits: document.querySelector('#total-heal-hits'),
  healingDuration: document.querySelector('#healing-duration'),
  combatants: document.querySelector('#combatants'),
  combatantCount: document.querySelector('#combatant-count'),
  detailTitle: document.querySelector('#detail-title'),
  detailSubtitle: document.querySelector('#detail-subtitle'),
  breakdown: document.querySelector('#breakdown'),
  parserEvents: document.querySelector('#parser-events'),
  lastUpdated: document.querySelector('#last-updated'),
  healingCombatants: document.querySelector('#healing-combatants'),
  healingCombatantCount: document.querySelector('#healing-combatant-count'),
  healingDetailTitle: document.querySelector('#healing-detail-title'),
  healingDetailSubtitle: document.querySelector('#healing-detail-subtitle'),
  healingBreakdown: document.querySelector('#healing-breakdown'),
  healingEvents: document.querySelector('#healing-events'),
  healingLastUpdated: document.querySelector('#healing-last-updated'),
  xpProgress: document.querySelector('#xp-progress'),
  xpCurrent: document.querySelector('#xp-current'),
  xpRemaining: document.querySelector('#xp-remaining'),
  xpRate: document.querySelector('#xp-rate'),
  xpUpdated: document.querySelector('#xp-updated'),
  xpProgressFill: document.querySelector('#xp-progress-fill'),
  xpProgressLabel: document.querySelector('#xp-progress-label'),
  xpProgressSubtitle: document.querySelector('#xp-progress-subtitle'),
  xpTargetCount: document.querySelector('#xp-target-count'),
  xpTargetList: document.querySelector('#xp-target-list'),
  xpEventCount: document.querySelector('#xp-event-count'),
  xpEvents: document.querySelector('#xp-events'),
  encounterCount: document.querySelector('#encounter-count'),
  encounterTotalDamage: document.querySelector('#encounter-total-damage'),
  encounterEnemyDamage: document.querySelector('#encounter-enemy-damage'),
  encounterTotalHealing: document.querySelector('#encounter-total-healing'),
  encounterDuration: document.querySelector('#encounter-duration'),
  encounterList: document.querySelector('#encounter-list'),
  encounterTitle: document.querySelector('#encounter-title'),
  encounterSubtitle: document.querySelector('#encounter-subtitle'),
  encounterReport: document.querySelector('#encounter-report'),
  lootItemCount: document.querySelector('#loot-item-count'),
  lootInstanceCount: document.querySelector('#loot-instance-count'),
  lootRareCount: document.querySelector('#loot-rare-count'),
  lootTotalValue: document.querySelector('#loot-total-value'),
  lootUpdated: document.querySelector('#loot-updated'),
  lootSearch: document.querySelector('#loot-search'),
  lootRarityFilter: document.querySelector('#loot-rarity-filter'),
  lootTypeFilter: document.querySelector('#loot-type-filter'),
  lootClassFilter: document.querySelector('#loot-class-filter'),
  lootSlotFilter: document.querySelector('#loot-slot-filter'),
  lootLevelFilter: document.querySelector('#loot-level-filter'),
  lootSortFilter: document.querySelector('#loot-sort-filter'),
  lootList: document.querySelector('#loot-list'),
  lootDetailTitle: document.querySelector('#loot-detail-title'),
  lootDetailSubtitle: document.querySelector('#loot-detail-subtitle'),
  lootDetail: document.querySelector('#loot-detail'),
  mapActor: document.querySelector('#map-actor'),
  mapX: document.querySelector('#map-x'),
  mapY: document.querySelector('#map-y'),
  mapZ: document.querySelector('#map-z'),
  mapUpdated: document.querySelector('#map-updated'),
  mapCount: document.querySelector('#map-count'),
  mapEntityCount: document.querySelector('#map-entity-count'),
  mapEntitySearch: document.querySelector('#map-entity-search'),
  mapSearchOnly: document.querySelector('#map-search-only'),
  mapEntityList: document.querySelector('#map-entity-list'),
  mapCanvas: document.querySelector('#map-canvas'),
  mapSelect: document.querySelector('#map-select'),
  mapLayerSelect: document.querySelector('#map-layer-select'),
  mapCalibrationLabel: document.querySelector('#map-calibration-label'),
  mapCalibrationToggle: document.querySelector('#map-calibration-toggle'),
  mapCalibrationStatus: document.querySelector('#map-calibration-status'),
  mapPlayerLevel: document.querySelector('#map-player-level'),
  mapZoom: document.querySelector('#map-zoom'),
  mapZoomIn: document.querySelector('#map-zoom-in'),
  mapZoomOut: document.querySelector('#map-zoom-out'),
  mapFollow: document.querySelector('#map-follow'),
  mapIgnoreHeight: document.querySelector('#map-ignore-height'),
  mapNpcs: document.querySelector('#map-npcs'),
  mapMobs: document.querySelector('#map-mobs'),
  mapPlayers: document.querySelector('#map-players'),
  mapNodes: document.querySelector('#map-nodes'),
  mapQuestItems: document.querySelector('#map-quest-items'),
  mapChests: document.querySelector('#map-chests'),
  mapPlants: document.querySelector('#map-plants'),
  mapTrees: document.querySelector('#map-trees'),
  mapOre: document.querySelector('#map-ore'),
  mapLabels: document.querySelector('#map-labels'),
  mapTooltip: document.querySelector('#map-tooltip'),
  shalazamLink: document.querySelector('#shalazam-link'),
  priorityCount: document.querySelector('#priority-count'),
  priorityMobList: document.querySelector('#priority-mob-list'),
  prioritySound: document.querySelector('#priority-sound'),
  priorityTestSound: document.querySelector('#priority-test-sound'),
  priorityActiveList: document.querySelector('#priority-active-list'),
  respawnCount: document.querySelector('#respawn-count'),
  respawnCampList: document.querySelector('#respawn-camp-list'),
  respawnDefaultMinutes: document.querySelector('#respawn-default-minutes'),
  respawnClearExpired: document.querySelector('#respawn-clear-expired'),
  respawnManualName: document.querySelector('#respawn-manual-name'),
  respawnManualStart: document.querySelector('#respawn-manual-start'),
  respawnTimerList: document.querySelector('#respawn-timer-list'),
  positionList: document.querySelector('#position-list'),
  eventCount: document.querySelector('#event-count'),
  actorCount: document.querySelector('#actor-count'),
  lastEvent: document.querySelector('#last-event'),
  communitySyncState: document.querySelector('#community-sync-state'),
  communitySyncEnabled: document.querySelector('#community-sync-enabled'),
  communitySyncDownload: document.querySelector('#community-sync-download'),
  communitySyncUpload: document.querySelector('#community-sync-upload'),
  communitySyncMode: document.querySelector('#community-sync-mode'),
  communitySyncAccessKey: document.querySelector('#community-sync-access-key'),
  communitySyncSecretKey: document.querySelector('#community-sync-secret-key'),
  communitySyncSaveKeys: document.querySelector('#community-sync-save-keys'),
  communitySyncCheck: document.querySelector('#community-sync-check'),
  communitySyncNow: document.querySelector('#community-sync-now'),
  communitySyncDetails: document.querySelector('#community-sync-details'),
  unresolvedCount: document.querySelector('#unresolved-count'),
  unresolvedActors: document.querySelector('#unresolved-actors'),
  events: document.querySelector('#events'),
  resetButton: document.querySelector('#reset-button'),
  restartButton: document.querySelector('#restart-button'),
  petMenuBackdrop: document.querySelector('#pet-menu-backdrop'),
  petMenu: document.querySelector('#pet-menu'),
  petMenuTitle: document.querySelector('#pet-menu-title'),
  petOwnerSelect: document.querySelector('#pet-owner-select'),
  petAssignButton: document.querySelector('#pet-assign-button'),
  petUnassignButton: document.querySelector('#pet-unassign-button')
};

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function formatRate(value) {
  return Number(value || 0).toFixed(2);
}

function formatDuration(seconds) {
  const value = Math.round(Number(seconds || 0));
  if (value < 60) return `${value}s`;
  return `${Math.floor(value / 60)}m ${value % 60}s`;
}

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString() : '-';
}

function formatAge(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return '';
  if (value < 60) return `${Math.round(value)}s ago`;
  if (value < 3600) return `${Math.round(value / 60)}m ago`;
  return `${Math.round(value / 3600)}h ago`;
}

function formatCountdown(ms) {
  const value = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  if (hours) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function formatCoord(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '-';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

function loadPetAssignments() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem('pantheonParser2.petAssignments') || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed)
      .filter(([pet, owner]) => typeof pet === 'string' && typeof owner === 'string' && pet && owner && pet !== owner));
  } catch {
    return {};
  }
}

function savePetAssignments() {
  window.localStorage.setItem('pantheonParser2.petAssignments', JSON.stringify(state.petAssignments));
}

function loadRespawnManualTimers() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem('pantheonParser2.respawnManualTimers') || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((timer) => timer && typeof timer === 'object' && timer.campName && timer.killedAt);
  } catch {
    return [];
  }
}

function saveRespawnManualTimers() {
  window.localStorage.setItem('pantheonParser2.respawnManualTimers', JSON.stringify(state.respawnManualTimers || []));
}

function loadRespawnDismissedKeys() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem('pantheonParser2.respawnDismissedKeys') || '[]');
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((key) => typeof key === 'string' && key));
  } catch {
    return new Set();
  }
}

function saveRespawnDismissedKeys() {
  window.localStorage.setItem('pantheonParser2.respawnDismissedKeys', JSON.stringify([...state.respawnDismissedKeys].slice(-300)));
}

function addCombatantTotals(target, source) {
  for (const key of ['total', 'damage', 'events', 'targets', 'damageTaken', 'mitigated', 'mitigatedTaken', 'crits']) {
    target[key] = Number(target[key] || 0) + Number(source[key] || 0);
  }
}

function combinedCombatants(data = state.parserData) {
  const rows = (data?.combatants || []).map((row) => ({
    ...row,
    assignedPets: []
  }));
  const bySource = new Map(rows.map((row) => [row.source, row]));
  const hiddenPets = new Set();
  for (const [pet, owner] of Object.entries(state.petAssignments)) {
    const petRow = bySource.get(pet);
    const ownerRow = bySource.get(owner);
    if (!petRow || !ownerRow || pet === owner) continue;
    addCombatantTotals(ownerRow, petRow);
    ownerRow.assignedPets.push(pet);
    hiddenPets.add(pet);
  }
  return rows
    .filter((row) => !hiddenPets.has(row.source))
    .map((row) => ({
      ...row,
      targets: Number(row.targets || 0),
      rate: data?.durationSeconds ? Number((Number(row.total || 0) / data.durationSeconds).toFixed(2)) : Number(row.rate || 0)
    }))
    .sort((left, right) => Number(right.total || 0) - Number(left.total || 0) || Number(right.events || 0) - Number(left.events || 0));
}

function selectedCombatant() {
  return combinedCombatants().find((row) => row.source === state.selectedSource) || null;
}

function selectedSources() {
  const row = selectedCombatant();
  return [state.selectedSource, ...((row && row.assignedPets) || [])].filter(Boolean);
}

function aggregateAbilityRows(rows = [], source = null) {
  const merged = new Map();
  for (const row of rows) {
    if (!row || (source && row.source !== source)) continue;
    const key = row.ability || 'Unknown ability';
    const current = merged.get(key) || {
      ...row,
      total: 0,
      events: 0,
      mitigated: 0,
      crits: 0,
      targets: [],
      targetCount: 0
    };
    current.total += Number(row.amount || 0);
    current.events += 1;
    current.mitigated += Number(row.mitigated || 0);
    current.crits += Number(row.crits || 0);
    const targets = Array.isArray(row.targets) ? row.targets : [row.target].filter(Boolean);
    const mergedTargets = new Set([...(current.targets || []), ...targets]);
    current.targets = [...mergedTargets];
    current.targetCount = current.targets.length || Number(row.targetCount || 0);
    current.target = current.targetCount === 1 ? current.targets[0] : `${current.targetCount} targets`;
    if (!current.firstSeen || (row.observedAt && row.observedAt < current.firstSeen)) current.firstSeen = row.observedAt;
    if (!current.lastSeen || (row.observedAt && row.observedAt > current.lastSeen)) current.lastSeen = row.observedAt;
    merged.set(key, current);
  }
  return [...merged.values()].sort((left, right) => Number(right.total || 0) - Number(left.total || 0) || Number(right.events || 0) - Number(left.events || 0));
}

function renderRecentEventList(container, rows, emptyText) {
  if (!rows.length) {
    container.innerHTML = `<div class="empty">${escapeHtml(emptyText)}</div>`;
    return;
  }
  container.replaceChildren(...rows.map((row) => {
    const div = document.createElement('div');
    div.className = 'event-line';
    div.innerHTML = `
      <span class="event-time">${formatTime(row.observedAt)}</span>
      <span class="event-type">${escapeHtml(row.eventType)}</span>
      <span class="event-message" title="${escapeHtml(row.rawText)}">${escapeHtml(row.rawText)}</span>
      <span class="event-amount">${row.amount ? formatNumber(row.amount) : ''}</span>
    `;
    return div;
  }));
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function displayParams(extra = {}) {
  const params = new URLSearchParams(extra);
  if (state.displaySince) params.set('since', state.displaySince);
  return params;
}

function recentMapParams(extra = {}, windowMs = 45_000) {
  const params = new URLSearchParams(extra);
  const recentSince = new Date(Date.now() - windowMs).toISOString();
  const displaySince = state.displaySince && !Number.isNaN(Date.parse(state.displaySince))
    ? state.displaySince
    : null;
  params.set('since', displaySince && Date.parse(displaySince) > Date.parse(recentSince) ? displaySince : recentSince);
  return params;
}

function renderParserMetrics(data) {
  els.totalDps.textContent = formatRate(data.totals.dps);
  els.totalDamage.textContent = formatNumber(data.totals.damage);
  els.totalKills.textContent = formatNumber(data.totals.kills);
  els.duration.textContent = formatDuration(data.durationSeconds);
  els.lastUpdated.textContent = `Updated ${formatTime(data.generatedAt)}`;
}

function renderCombatants(data) {
  const rows = combinedCombatants(data);
  els.combatantCount.textContent = `${rows.length} source${rows.length === 1 ? '' : 's'}`;
  if (!rows.length) {
    state.selectedSource = null;
    state.selectedAbilityKey = null;
    els.combatants.innerHTML = '<tr><td colspan="8" class="empty">Waiting for combat data...</td></tr>';
    renderBreakdown([]);
    return;
  }
  if (!state.selectedSource || !rows.some((row) => row.source === state.selectedSource)) {
    state.selectedSource = rows[0].source;
  }
  const max = Math.max(...rows.map((row) => row.total), 1);
  els.combatants.replaceChildren(...rows.map((row) => {
    const tr = document.createElement('tr');
    tr.className = `combatant-row${row.source === state.selectedSource ? ' selected' : ''}`;
    tr.style.setProperty('--class-color', row.classColor || getClassColor(row.className));
    tr.style.setProperty('--bar-width', `${Math.max(3, (row.total / max) * 100)}%`);
    tr.dataset.source = row.source;
    const petLabel = row.assignedPets?.length
      ? `<span class="source-kind pet-count">+${row.assignedPets.length} pet${row.assignedPets.length === 1 ? '' : 's'}</span>`
      : '';
    tr.innerHTML = `
      <td class="name">${escapeHtml(row.source)}<span class="source-kind">estimated</span>${petLabel}</td>
      <td><span class="class-badge">${escapeHtml(row.className || 'Unknown')}</span></td>
      <td class="number">${formatNumber(row.total)}</td>
      <td class="number">${formatRate(row.rate)}</td>
      <td class="number">${formatNumber(row.events)}</td>
      <td class="number">-</td>
      <td class="number">${row.mitigated ? formatNumber(row.mitigated) : '-'}</td>
      <td class="number">-</td>
    `;
    tr.addEventListener('click', () => selectSource(row.source));
    tr.addEventListener('contextmenu', (event) => openPetMenu(event, row.source));
    return tr;
  }));
}

function renderHealingMetrics(data) {
  els.totalHealingHps.textContent = formatRate(data.totals.hps);
  els.totalHealing.textContent = formatNumber(data.totals.healing);
  els.totalHealHits.textContent = formatNumber(data.totals.events);
  els.healingDuration.textContent = formatDuration(data.durationSeconds);
  els.healingLastUpdated.textContent = `Updated ${formatTime(data.generatedAt)}`;
}

function renderHealingCombatants(data) {
  const rows = combinedCombatants(data);
  els.healingCombatantCount.textContent = `${rows.length} source${rows.length === 1 ? '' : 's'}`;
  if (!rows.length) {
    state.healingSelectedSource = null;
    state.healingSelectedAbilityKey = null;
    els.healingCombatants.innerHTML = '<tr><td colspan="6" class="empty">Waiting for healing data...</td></tr>';
    renderHealingBreakdown([]);
    return;
  }
  if (!state.healingSelectedSource || !rows.some((row) => row.source === state.healingSelectedSource)) {
    state.healingSelectedSource = rows[0].source;
  }
  const max = Math.max(...rows.map((row) => row.total), 1);
  els.healingCombatants.replaceChildren(...rows.map((row) => {
    const tr = document.createElement('tr');
    tr.className = `combatant-row${row.source === state.healingSelectedSource ? ' selected' : ''}`;
    tr.style.setProperty('--class-color', row.classColor || getClassColor(row.className));
    tr.style.setProperty('--bar-width', `${Math.max(3, (row.total / max) * 100)}%`);
    tr.dataset.source = row.source;
    tr.innerHTML = `
      <td class="name">${escapeHtml(row.source)}<span class="source-kind">healing</span></td>
      <td><span class="class-badge">${escapeHtml(row.className || 'Unknown')}</span></td>
      <td class="number">${formatNumber(row.total)}</td>
      <td class="number">${formatRate(row.rate)}</td>
      <td class="number">${formatNumber(row.events)}</td>
      <td class="number">${formatNumber(row.targets)}</td>
    `;
    tr.addEventListener('click', () => selectHealingSource(row.source));
    return tr;
  }));
}

async function selectHealingSource(source) {
  state.healingSelectedSource = source;
  state.healingSelectedAbilityKey = null;
  document.querySelectorAll('#healing-combatants .combatant-row').forEach((row) => row.classList.toggle('selected', row.dataset.source === source));
  renderHealingBreakdown();
}

function renderHealingBreakdown(rows = null) {
  const source = state.healingSelectedSource;
  if (!source) {
    els.healingDetailTitle.textContent = 'Healing Breakdown';
    els.healingDetailSubtitle.textContent = 'Select a source';
    els.healingBreakdown.className = 'breakdown empty';
    els.healingBreakdown.textContent = 'No source selected.';
    return;
  }
  const events = (state.healingData?.recentEvents || []).filter((row) => row.source === source && row.eventType === 'healing');
  const breakdownRows = rows || aggregateAbilityRows(events, source);
  els.healingDetailTitle.textContent = source;
  els.healingDetailSubtitle.textContent = `${breakdownRows.length} abilit${breakdownRows.length === 1 ? 'y' : 'ies'}`;
  if (!breakdownRows.length) {
    els.healingBreakdown.className = 'breakdown empty';
    els.healingBreakdown.textContent = 'No healing events yet.';
    return;
  }
  els.healingBreakdown.className = 'breakdown';
  els.healingBreakdown.replaceChildren(...breakdownRows.map((row) => {
    const key = row.ability || 'Unknown ability';
    const node = document.createElement('div');
    node.dataset.abilityKey = key;
    node.className = `ability-row${state.healingSelectedAbilityKey === key ? ' expanded' : ''}`;
    node.innerHTML = `
      <div class="ability-name">${escapeHtml(row.ability)}<span class="ability-meta">${formatNumber(row.events)} heals</span></div>
      <div class="number">${formatNumber(row.total)}</div>
      <div class="number">${row.targets?.length ? `${row.targets.length} targ${row.targets.length === 1 ? 'et' : 'ets'}` : '-'}</div>
    `;
    node.addEventListener('click', async () => {
      state.healingSelectedAbilityKey = state.healingSelectedAbilityKey === key ? null : key;
      if (!state.healingSelectedAbilityKey) {
        renderHealingBreakdown(breakdownRows);
        return;
      }
      await renderHealingAbilityHistory(row);
    });
    return node;
  }));
  if (state.healingSelectedAbilityKey) {
    const selectedRow = breakdownRows.find((row) => (row.ability || 'Unknown ability') === state.healingSelectedAbilityKey);
    if (selectedRow) void renderHealingAbilityHistory(selectedRow);
  }
}

async function renderHealingAbilityHistory(row) {
  const key = row.ability || 'Unknown ability';
  if (state.healingSelectedAbilityKey !== key) return;
  els.healingBreakdown.querySelectorAll('.ability-history').forEach((history) => history.remove());
  const rows = (state.healingData?.recentEvents || [])
    .filter((hit) => hit.source === state.healingSelectedSource && hit.ability === row.ability)
    .sort((left, right) => new Date(right.observedAt).getTime() - new Date(left.observedAt).getTime())
    .slice(0, 30);
  if (state.healingSelectedAbilityKey !== key) return;
  const history = document.createElement('div');
  history.className = 'ability-history';
  history.replaceChildren(...rows.map((hit) => {
    const line = document.createElement('div');
    line.className = 'ability-history-line';
    line.innerHTML = `<span>${formatTime(hit.observedAt)}</span><span>${formatNumber(hit.amount)}</span><span>${escapeHtml(hit.rawText)}</span>`;
    return line;
  }));
  const abilityRows = [...els.healingBreakdown.querySelectorAll('.ability-row')];
  const index = abilityRows.findIndex((item) => item.dataset.abilityKey === key);
  if (index >= 0) abilityRows[index].after(history);
}

async function selectSource(source) {
  state.selectedSource = source;
  state.selectedAbilityKey = null;
  document.querySelectorAll('.combatant-row').forEach((row) => row.classList.toggle('selected', row.dataset.source === source));
  await loadBreakdown();
}

async function loadBreakdown() {
  if (!state.selectedSource) {
    renderBreakdown([]);
    return;
  }
  const sources = selectedSources();
  const results = await Promise.all(sources.map(async (source) => {
    const params = displayParams({ window: String(state.windowSeconds), source });
    const data = await fetchJson(`/api/parser/breakdown?${params}`);
    return data.rows || [];
  }));
  const merged = new Map();
  for (const row of results.flat()) {
    const key = row.ability || 'Unknown ability';
    const current = merged.get(key) || {
      ...row,
      total: 0,
      events: 0,
      mitigated: 0,
      crits: 0,
      targets: [],
      targetCount: 0
    };
    current.total += Number(row.total || 0);
    current.events += Number(row.events || 0);
    current.mitigated += Number(row.mitigated || 0);
    current.crits += Number(row.crits || 0);
    const targets = Array.isArray(row.targets) ? row.targets : [row.target].filter(Boolean);
    const mergedTargets = new Set([...(current.targets || []), ...targets]);
    current.targets = [...mergedTargets];
    current.targetCount = current.targets.length || Number(row.targetCount || 0);
    current.target = current.targetCount === 1 ? current.targets[0] : `${current.targetCount} targets`;
    if (!current.firstSeen || (row.firstSeen && row.firstSeen < current.firstSeen)) current.firstSeen = row.firstSeen;
    if (!current.lastSeen || (row.lastSeen && row.lastSeen > current.lastSeen)) current.lastSeen = row.lastSeen;
    merged.set(key, current);
  }
  renderBreakdown([...merged.values()].sort((left, right) => Number(right.total || 0) - Number(left.total || 0) || Number(right.events || 0) - Number(left.events || 0)));
}

function renderBreakdown(rows) {
  if (!state.selectedSource) {
    els.detailTitle.textContent = 'Breakdown';
    els.detailSubtitle.textContent = 'Select a source';
    els.breakdown.className = 'breakdown empty';
    els.breakdown.textContent = 'No source selected.';
    return;
  }
  els.detailTitle.textContent = state.selectedSource;
  const petCount = Math.max(0, selectedSources().length - 1);
  els.detailSubtitle.textContent = `${rows.length} abilit${rows.length === 1 ? 'y' : 'ies'}${petCount ? ` / ${petCount} pet${petCount === 1 ? '' : 's'}` : ''}`;
  if (!rows.length) {
    els.breakdown.className = 'breakdown empty';
    els.breakdown.textContent = 'No damage estimates yet.';
    return;
  }
  els.breakdown.className = 'breakdown';
  els.breakdown.replaceChildren(...rows.map((row) => {
    const key = row.ability || 'Unknown ability';
    const node = document.createElement('div');
    node.dataset.abilityKey = key;
    node.className = `ability-row${state.selectedAbilityKey === key ? ' expanded' : ''}`;
    node.innerHTML = `
      <div class="ability-name">${escapeHtml(row.ability)}<span class="ability-meta">${formatNumber(row.events)} hits</span></div>
      <div class="number">${formatNumber(row.total)}</div>
      <div class="number">${row.mitigated ? `${formatNumber(row.mitigated)} mit` : formatRate(row.events ? row.total / row.events : 0)}</div>
    `;
    node.addEventListener('click', async () => {
      state.selectedAbilityKey = state.selectedAbilityKey === key ? null : key;
      if (!state.selectedAbilityKey) {
        renderBreakdown(rows);
        return;
      }
      await renderAbilityHistory(row);
    });
    return node;
  }));
  if (state.selectedAbilityKey) {
    const selectedRow = rows.find((row) => (row.ability || 'Unknown ability') === state.selectedAbilityKey);
    if (selectedRow) void renderAbilityHistory(selectedRow);
  }
}

async function renderAbilityHistory(row) {
  const key = row.ability || 'Unknown ability';
  if (state.selectedAbilityKey !== key) return;
  els.breakdown.querySelectorAll('.ability-history').forEach((history) => history.remove());
  const results = await Promise.all(selectedSources().map(async (source) => {
    const params = new URLSearchParams({
      ...Object.fromEntries(displayParams()),
      window: String(state.windowSeconds),
      source,
      ability: row.ability,
      limit: '30'
    });
    const data = await fetchJson(`/api/parser/ability-events?${params}`);
    return data.rows || [];
  }));
  if (state.selectedAbilityKey !== key) return;
  const rows = results.flat()
    .sort((left, right) => new Date(right.observedAt).getTime() - new Date(left.observedAt).getTime())
    .slice(0, 30);
  const history = document.createElement('div');
  history.className = 'ability-history';
  history.replaceChildren(...rows.map((hit) => {
    const line = document.createElement('div');
    line.className = 'ability-history-line';
    line.innerHTML = `<span>${formatTime(hit.observedAt)}</span><span>${formatNumber(hit.amount)}</span><span>${escapeHtml(hit.rawText)}</span>`;
    return line;
  }));
  const abilityRows = [...els.breakdown.querySelectorAll('.ability-row')];
  const index = abilityRows.findIndex((item) => item.dataset.abilityKey === key);
  if (index >= 0) abilityRows[index].after(history);
}

function petOwnerCandidates(source) {
  const assignedOwner = state.petAssignments[source] || '';
  const assignedPets = new Set(Object.entries(state.petAssignments)
    .filter(([, owner]) => owner === source)
    .map(([pet]) => pet));
  return (state.parserData?.combatants || [])
    .map((row) => row.source)
    .filter((owner) => owner && owner !== source && !assignedPets.has(owner))
    .filter((owner) => state.petAssignments[owner] !== source || owner === assignedOwner)
    .sort((left, right) => left.localeCompare(right));
}

function closePetMenu() {
  state.petMenuSource = null;
  if (els.petMenu) els.petMenu.hidden = true;
  if (els.petMenuBackdrop) els.petMenuBackdrop.hidden = true;
}

function openPetMenu(event, source) {
  event.preventDefault();
  if (!els.petMenu || !els.petOwnerSelect) return;
  state.petMenuSource = source;
  const owner = state.petAssignments[source] || '';
  const candidates = petOwnerCandidates(source);
  els.petMenuTitle.textContent = `Assign ${source}`;
  els.petOwnerSelect.replaceChildren(
    new Option('Choose owner...', ''),
    ...candidates.map((candidate) => new Option(candidate, candidate))
  );
  els.petOwnerSelect.value = candidates.includes(owner) ? owner : '';
  els.petUnassignButton.disabled = !owner;
  els.petAssignButton.disabled = !candidates.length;
  els.petMenu.hidden = false;
  if (els.petMenuBackdrop) els.petMenuBackdrop.hidden = false;
  const menuWidth = 220;
  const menuHeight = 146;
  const left = Math.min(event.clientX, window.innerWidth - menuWidth - 8);
  const top = Math.min(event.clientY, window.innerHeight - menuHeight - 8);
  els.petMenu.style.left = `${Math.max(8, left)}px`;
  els.petMenu.style.top = `${Math.max(8, top)}px`;
}

async function assignPetFromMenu() {
  const pet = state.petMenuSource;
  const owner = els.petOwnerSelect?.value || '';
  if (!pet || !owner || pet === owner) return;
  state.petAssignments[pet] = owner;
  savePetAssignments();
  closePetMenu();
  renderCombatants(state.parserData);
  await loadBreakdown();
}

async function unassignPetFromMenu() {
  const pet = state.petMenuSource;
  if (!pet) return;
  delete state.petAssignments[pet];
  savePetAssignments();
  closePetMenu();
  renderCombatants(state.parserData);
  await loadBreakdown();
}

function renderParserEvents(data) {
  const rows = (data.recentEvents || []).filter((row) => row.eventType !== 'position_update' && row.eventType !== 'player_position');
  if (!rows.length) {
    els.parserEvents.innerHTML = '<div class="empty">No recent parser events.</div>';
    return;
  }
  els.parserEvents.replaceChildren(...rows.map((row) => {
    const div = document.createElement('div');
    div.className = 'event-line';
    div.innerHTML = `
      <span class="event-time">${formatTime(row.observedAt)}</span>
      <span class="event-type">${escapeHtml(row.eventType)}</span>
      <span class="event-message" title="${escapeHtml(row.rawText)}">${escapeHtml(row.rawText)}</span>
      <span class="event-amount">${row.amount ? formatNumber(row.amount) : ''}</span>
    `;
    return div;
  }));
}

function rowCard(title, meta, text) {
  const div = document.createElement('div');
  div.className = 'row-card';
  div.innerHTML = `<div class="row-title"><span>${escapeHtml(title)}</span><span>${escapeHtml(meta)}</span></div><div class="row-text">${escapeHtml(text || '')}</div>`;
  return div;
}

function renderNetworkRows(container, rows, mapper) {
  container.replaceChildren();
  if (!rows.length) {
    container.append(rowCard('No rows', '', ''));
    return;
  }
  container.replaceChildren(...rows.map(mapper));
}

function renderCommunitySync(status = {}) {
  if (!els.communitySyncDetails) return;
  const enabled = Boolean(status.enabled);
  const downloadEnabled = status.downloadEnabled !== false;
  const uploadEnabled = Boolean(status.uploadEnabled);
  els.communitySyncState.textContent = status.lastError || (enabled ? uploadEnabled ? 'Ready' : downloadEnabled ? 'Download only' : 'Enabled' : 'Disabled');
  els.communitySyncEnabled.checked = enabled;
  if (els.communitySyncDownload) els.communitySyncDownload.checked = downloadEnabled;
  if (els.communitySyncDownload) els.communitySyncDownload.disabled = !enabled;
  els.communitySyncUpload.checked = uploadEnabled;
  els.communitySyncUpload.disabled = !enabled;
  els.communitySyncMode.disabled = !enabled;
  if (els.communitySyncAccessKey) els.communitySyncAccessKey.disabled = !enabled || els.communitySyncMode.value !== 'r2';
  if (els.communitySyncSecretKey) els.communitySyncSecretKey.disabled = !enabled || els.communitySyncMode.value !== 'r2';
  if (els.communitySyncSaveKeys) els.communitySyncSaveKeys.disabled = !enabled || els.communitySyncMode.value !== 'r2';
  if (els.communitySyncCheck) els.communitySyncCheck.disabled = !enabled || !downloadEnabled;
  els.communitySyncNow.disabled = !enabled || !uploadEnabled;
  if (status.uploadMode && [...els.communitySyncMode.options].some((option) => option.value === status.uploadMode)) {
    els.communitySyncMode.value = status.uploadMode;
  }
  els.communitySyncDetails.textContent = JSON.stringify({
    mode: status.uploadMode || 'worker',
    bucket: status.bucket || null,
    r2Endpoint: status.r2Endpoint || null,
    r2AccessKeyConfigured: Boolean(status.r2AccessKeyConfigured),
    r2SecretKeyConfigured: Boolean(status.r2SecretKeyConfigured),
    uploadEndpoint: status.uploadEndpoint || null,
    publicBaseUrl: status.publicBaseUrl || null,
    manifestUrl: status.manifestUrl || null,
    lastCheckedAt: status.lastCheckedAt || null,
    lastDownloadedAt: status.lastDownloadedAt || null,
    lastUploadedAt: status.lastUploadedAt || null,
    lastDownloadedCount: status.lastDownloadedCount || 0,
    lastChangedCount: status.lastChangedCount || 0,
    lastUploadedCount: status.lastUploadedCount || 0,
    lastError: status.lastError || null
  }, null, 2);
}

function renderUnresolvedActors(rows) {
  els.unresolvedCount.textContent = `${rows.length} ID${rows.length === 1 ? '' : 's'}`;
  if (!rows.length) {
    els.unresolvedActors.replaceChildren(rowCard('All current actors resolved', '', ''));
    return;
  }
  els.unresolvedActors.replaceChildren(...rows.map((row) => {
    const abilities = (row.abilities || []).join(', ') || 'unknown abilities';
    const targets = (row.targets || []).join(', ') || 'unknown targets';
    return rowCard(
      `Unknown actor ${row.entityId}`,
      `${formatNumber(row.damage)} damage / ${formatNumber(row.events)} rows`,
      `${abilities} -> ${targets}`
    );
  }));
}

function mapsByKey() {
  return new Map((state.mapCatalog?.maps || []).map((map) => [map.key, map]));
}

function isSurfaceCalibrationSample(sample) {
  const value = String(sample?.label || '').toLowerCase();
  return sample?.mapKey === 'kingsreach'
    || sample?.layerKey === 'base'
    || value.includes('surface')
    || value.includes('road')
    || value.includes('above');
}

function nearestCalibrationForMap(row, predicate) {
  let best = null;
  let bestScore = Infinity;
  for (const sample of state.mapCalibrationSamples || []) {
    if (!predicate(sample)) continue;
    const horizontal = Math.hypot(Number(row.x) - Number(sample.x), Number(row.z) - Number(sample.z));
    const vertical = Math.abs(Number(row.y) - Number(sample.y));
    if (!Number.isFinite(horizontal) || !Number.isFinite(vertical)) continue;
    const score = horizontal + vertical * 0.25;
    if (score < bestScore) {
      best = { sample, score, horizontal };
      bestScore = score;
    }
  }
  return best;
}

function detectMapForPosition(row) {
  const maps = mapsByKey();
  if (row && state.mapCalibrationSamples?.length) {
    const surface = nearestCalibrationForMap(row, isSurfaceCalibrationSample);
    const cave = nearestCalibrationForMap(row, (sample) => sample.mapKey === 'goblin_cave' && !isTransitionCalibrationSample(sample));
    if (surface && surface.horizontal <= 90 && (!cave || surface.score <= cave.score + 5)) {
      const surfaceMap = maps.get('kingsreach');
      if (surfaceMap) return surfaceMap;
    }
    if (cave && cave.horizontal <= 90) {
      const caveMap = maps.get('goblin_cave');
      if (caveMap) return caveMap;
    }
  }
  const halnir = maps.get('halnir_cave');
  if (halnir && row) {
    const x = Number(row.x);
    const y = Number(row.y);
    const z = Number(row.z);
    if (Number.isFinite(x) && Number.isFinite(z) && x >= -260 && x <= 260 && z >= -260 && z <= 260) return halnir;
    const goblin = maps.get('goblin_cave');
    if (
      goblin
      && Number.isFinite(x) && x >= 3300 && x <= 3700
      && Number.isFinite(z) && z >= 3000 && z <= 3350
      && Number.isFinite(y) && y >= 430 && y <= 560
    ) return goblin;
  }
  return maps.get(state.mapCatalog?.defaultMapId) || maps.values().next().value || null;
}

function chooseMapConfig(latestRow = null, mapState = state.mapState) {
  const maps = mapsByKey();
  if (state.mapSelection !== 'auto' && maps.has(state.mapSelection)) return maps.get(state.mapSelection);
  if (mapState?.mapKey && maps.has(mapState.mapKey)) return maps.get(mapState.mapKey);
  return detectMapForPosition(latestRow);
}

function renderMapSelector() {
  if (!els.mapSelect || !state.mapCatalog) return;
  if (!els.mapSelect.options.length) {
    els.mapSelect.replaceChildren(
      new Option('Auto', 'auto'),
      ...(state.mapCatalog.maps || []).map((map) => new Option(map.name, map.key))
    );
  }
  els.mapSelect.value = state.mapSelection;
}

function renderMapLayerSelector() {
  if (!els.mapLayerSelect) return;
  const layers = state.mapConfig?.tileLayers || [];
  const hasLayers = layers.length > 1;
  els.mapLayerSelect.replaceChildren(
    new Option('Default', 'auto'),
    ...layers.map((layer) => new Option(layer.name || layer.key, layer.key))
  );
  if (state.mapLayerSelection !== 'auto' && !layers.some((layer) => layer.key === state.mapLayerSelection)) {
    state.mapLayerSelection = 'auto';
    window.localStorage.setItem('pantheonParser2.mapLayerSelection', state.mapLayerSelection);
  }
  els.mapLayerSelect.value = state.mapLayerSelection;
  els.mapLayerSelect.disabled = !hasLayers;
}

function renderAxisButtons() {
  const effectiveAxis = state.mapConfig?.coordinatePlane || state.mapAxis;
  document.querySelectorAll('.map-axis-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.axis === effectiveAxis);
  });
}

function isRowCompatibleWithMap(row, config = state.mapConfig) {
  if (!row || !config) return false;
  const point = mapPoint(row, config);
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  if (config.key === 'halnir_cave') return point.x >= -320 && point.x <= 320 && point.y >= -420 && point.y <= 240;
  if (config.key === 'goblin_cave') return point.x >= 3300 && point.x <= 3700 && point.y >= 3000 && point.y <= 3350 && Number(row.y) >= 430 && Number(row.y) <= 560;
  return Math.abs(point.x) > 250 || Math.abs(point.y) > 250;
}

function mapPoint(row, config = state.mapConfig) {
  const plane = config?.coordinatePlane || state.mapAxis;
  return {
    x: Number(row.x),
    y: plane === 'xy' ? Number(row.y) : Number(row.z)
  };
}

function effectivePlayerLevel() {
  const override = Number(state.mapPlayerLevelOverride);
  if (Number.isFinite(override) && override > 0) return Math.round(override);
  return null;
}

function mapDistance(left, right, config = state.mapConfig) {
  const leftPoint = mapPoint(left, config);
  const rightPoint = mapPoint(right, config);
  if (![leftPoint.x, leftPoint.y, rightPoint.x, rightPoint.y].every(Number.isFinite)) return Infinity;
  return Math.hypot(leftPoint.x - rightPoint.x, leftPoint.y - rightPoint.y);
}

function mapCalibrationLayerKeyForLabel(label) {
  const value = String(label || '').toLowerCase();
  if (value.includes('lower2') || value.includes('lower 2') || value.includes('lowest')) return 'lower2';
  if (value.includes('lower1') || value.includes('lower 1')) return 'lower1';
  if (value.includes('lower')) return 'lower1';
  if (value.includes('mid')) return 'mid';
  if (value.includes('upper') || value.includes('first') || value.includes('entrance')) return 'upper';
  if (value.includes('surface') || value.includes('road') || value.includes('above')) return 'base';
  return null;
}

function isTransitionCalibrationSample(sample) {
  const value = String(sample?.label || '').toLowerCase();
  return !sample?.layerKey || value.includes('ramp') || value.includes('transition');
}

function goblinLayerForY(y) {
  const value = Number(y);
  if (!Number.isFinite(value)) return null;
  if (value < 480) return 'lower2';
  if (value < 495) return 'lower1';
  if (value < 520) return 'mid';
  return 'upper';
}

function sampleMatchesGoblinLayerBand(sample) {
  if (sample?.mapKey !== 'goblin_cave') return true;
  if (!sample?.layerKey || isTransitionCalibrationSample(sample)) return false;
  return goblinLayerForY(sample.y) === sample.layerKey;
}

function currentCalibrationLayerKey() {
  if (state.mapLayerSelection !== 'auto') return state.mapLayerSelection;
  return mapCalibrationLayerKeyForLabel(state.mapCalibrationLabel);
}

function nearestCalibrationSample(row, config = state.mapConfig) {
  if (!row || !config?.key || !state.mapCalibrationSamples?.length) return null;
  const candidates = state.mapCalibrationSamples
    .filter((sample) => sample.mapKey === config.key
      && !isTransitionCalibrationSample(sample)
      && sampleMatchesGoblinLayerBand(sample)
      && (sample.layerKey || mapCalibrationLayerKeyForLabel(sample.label)));
  let best = null;
  let bestScore = Infinity;
  for (const sample of candidates) {
    if (config.key === 'goblin_cave') {
      const rowBand = goblinLayerForY(row.y);
      const sampleBand = sample.layerKey || mapCalibrationLayerKeyForLabel(sample.label);
      if (rowBand && sampleBand && rowBand !== sampleBand) continue;
    }
    const horizontal = mapDistance(row, sample, config);
    const vertical = Math.abs(Number(row.y) - Number(sample.y));
    if (!Number.isFinite(horizontal) || !Number.isFinite(vertical)) continue;
    const score = horizontal + vertical * 0.35;
    if (score < bestScore) {
      best = sample;
      bestScore = score;
    }
  }
  if (!best || bestScore > 90) return null;
  return best;
}

async function refreshMapCalibration(force = false) {
  if (!force && Date.now() - Number(state.mapCalibrationFetchedAt || 0) < 10_000) return;
  try {
    const data = await fetchJson('/api/map/calibration?limit=2500');
    state.mapCalibrationSamples = data.samples || [];
    state.mapCalibrationFetchedAt = Date.now();
    renderMapCalibrationControls();
  } catch {
    state.mapCalibrationSamples = state.mapCalibrationSamples || [];
  }
}

function calibrationSampleMovedEnough(row) {
  const previous = state.mapLastCalibrationSample;
  if (!previous) return true;
  if (previous.mapKey !== state.mapConfig?.key || previous.label !== state.mapCalibrationLabel) return true;
  if (Date.now() - Number(previous.createdAt || 0) > 5000) return true;
  return mapDistance(row, previous, state.mapConfig) >= 4 || Math.abs(Number(row.y) - Number(previous.y)) >= 1.5;
}

async function recordMapCalibrationSample(row) {
  if (!state.mapCalibrationRecording || state.mapCalibrationPostInFlight || !row || !state.mapConfig?.key) return;
  if (!calibrationSampleMovedEnough(row)) return;
  const layerKey = currentCalibrationLayerKey();
  state.mapCalibrationPostInFlight = true;
  try {
    const body = {
      observedAt: row.observedAt,
      sessionName: state.mapCalibrationSession,
      label: state.mapCalibrationLabel,
      mapKey: state.mapConfig.key,
      layerKey,
      source: row.source || null,
      entityId: row.entityId || null,
      x: row.x,
      y: row.y,
      z: row.z,
      heading: row.heading
    };
    const result = await postJson('/api/map/calibration', body);
    state.mapLastCalibrationSample = { ...body, createdAt: Date.now() };
    state.mapCalibrationRecordedCount += 1;
    window.localStorage.setItem('pantheonParser2.mapCalibrationRecordedCount', String(state.mapCalibrationRecordedCount));
    if (result.sample) state.mapCalibrationSamples.unshift(result.sample);
    renderMapCalibrationControls();
  } catch {
    renderMapCalibrationControls('Trace save failed');
  } finally {
    state.mapCalibrationPostInFlight = false;
  }
}

function renderMapCalibrationControls(message = null) {
  if (els.mapCalibrationLabel) els.mapCalibrationLabel.value = state.mapCalibrationLabel;
  if (els.mapCalibrationToggle) {
    els.mapCalibrationToggle.textContent = state.mapCalibrationRecording ? 'Stop Trace' : 'Start Trace';
  }
  const row = els.mapCalibrationStatus?.closest('.map-calibration-row');
  if (row) row.classList.toggle('recording', state.mapCalibrationRecording);
  if (!els.mapCalibrationStatus) return;
  if (message) {
    els.mapCalibrationStatus.textContent = message;
    return;
  }
  const label = state.mapCalibrationLabel.replaceAll('-', ' ');
  const count = Number(state.mapCalibrationRecordedCount || 0);
  const saved = state.mapCalibrationSamples.filter((sample) => sample.label === state.mapCalibrationLabel).length;
  els.mapCalibrationStatus.textContent = state.mapCalibrationRecording
    ? `Recording ${label} (${count})`
    : saved ? `${saved} saved ${label}` : 'No trace';
}

function isEntityNearRadar(entity, centerRow, radius = RADAR_RANGE_UNITS * 2.6) {
  if (!centerRow) return true;
  if (priorityMatchForEntity(entity)) return true;
  if (normalizedMapSearch() && matchesMapSearch(entity)) return true;
  return mapDistance(entity, centerRow) <= radius;
}

function shalazamUrl(row) {
  const point = mapPoint(row);
  const x = Math.round(point.x);
  const y = Math.round(point.y);
  const id = state.mapConfig?.id || 1;
  return `https://shalazam.info/maps/${id}?zoom=${encodeURIComponent(state.mapZoom)}&x=${encodeURIComponent(x)}&y=${encodeURIComponent(y)}`;
}

function clampMapZoom(value) {
  const min = Number(state.mapConfig?.minZoom || 3);
  const max = Number(state.mapConfig?.maxZoom || 9);
  return Math.min(max, Math.max(min, Number(value) || Number(state.mapConfig?.defaultZoom || 6)));
}

function storedMapZoom(config) {
  if (!config?.key) return Number(window.localStorage.getItem('pantheonParser2.mapZoom') || 6);
  const stored = window.localStorage.getItem(`pantheonParser2.mapZoom.${config.key}`);
  return Number(stored || config.defaultZoom || 6);
}

function renderZoomControls() {
  const min = Number(state.mapConfig?.minZoom || 3);
  const max = Number(state.mapConfig?.maxZoom || 9);
  state.mapZoom = clampMapZoom(state.mapZoom);
  if (els.mapZoom) els.mapZoom.textContent = `Zoom ${state.mapZoom}`;
  if (els.mapZoomOut) els.mapZoomOut.disabled = state.mapZoom <= min;
  if (els.mapZoomIn) els.mapZoomIn.disabled = state.mapZoom >= max;
  renderMapSelector();
  renderMapLayerSelector();
  renderAxisButtons();
}

function resizeMapCanvas() {
  const canvas = els.mapCanvas;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.round(rect.width));
  const height = Math.max(320, Math.round(rect.height));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function loadTileImage(url) {
  if (tileImageCache.has(url)) return tileImageCache.get(url);
  const promise = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
  tileImageCache.set(url, promise);
  return promise;
}

function locToLatLng(row) {
  const config = state.mapConfig;
  const cal = config && config.calibrations;
  if (!cal || !cal.a || !cal.b) {
    const point = mapPoint(row);
    return { lat: point.y, lng: point.x };
  }
  const point = mapPoint(row);
  const xScale = (cal.b.loc.x - cal.a.loc.x) / (cal.b.latlng.lng - cal.a.latlng.lng);
  const yScale = (cal.b.loc.y - cal.a.loc.y) / (cal.b.latlng.lat - cal.a.latlng.lat);
  return {
    lng: cal.a.latlng.lng + (point.x - cal.a.loc.x) / xScale,
    lat: cal.a.latlng.lat + (point.y - cal.a.loc.y) / yScale
  };
}

function mapTileUrl(layer, z, x, y) {
  const template = layer?.tilePath || state.mapConfig?.tilePath || '/api/map/tile/{z}/{x}/{y}.webp';
  return template
    .replace('{z}', encodeURIComponent(z))
    .replace('{x}', encodeURIComponent(x))
    .replace('{y}', encodeURIComponent(y));
}

function mapLayerForRow(row, config = state.mapConfig) {
  const layers = config?.tileLayers || [];
  if (!layers.length) return null;
  if (layers.length <= 1) return layers[0];
  if (state.mapLayerSelection !== 'auto') {
    const selected = layers.find((layer) => layer.key === state.mapLayerSelection);
    if (selected) return selected;
  }
  const sample = nearestCalibrationSample(row, config);
  if (sample) {
    const sampleLayerKey = sample.layerKey || mapCalibrationLayerKeyForLabel(sample.label);
    const calibratedLayer = layers.find((layer) => layer.key === sampleLayerKey);
    if (calibratedLayer) return calibratedLayer;
  }
  const y = Number(row?.y);
  if (Number.isFinite(y)) {
    const ranged = layers.find((layer) => {
      const range = layer.verticalRange || {};
      const minY = Number(range.minY);
      const maxY = Number(range.maxY);
      if (Number.isFinite(minY) && Number.isFinite(maxY)) return y >= minY && y < maxY;
      if (Number.isFinite(minY)) return y >= minY;
      if (Number.isFinite(maxY)) return y < maxY;
      return false;
    });
    if (ranged) return ranged;
    let closest = layers[0];
    let bestDistance = Infinity;
    for (const layer of layers) {
      const range = layer.verticalRange || {};
      const minY = Number(range.minY);
      const maxY = Number(range.maxY);
      let targetY = 0;
      if (Number.isFinite(minY) && Number.isFinite(maxY)) targetY = (minY + maxY) / 2;
      else if (Number.isFinite(minY)) targetY = minY;
      else if (Number.isFinite(maxY)) targetY = maxY;
      const distance = Math.abs(y - targetY);
      if (distance < bestDistance) {
        bestDistance = distance;
        closest = layer;
      }
    }
    return closest;
  }
  return layers[0];
}

function isRowOnMapLayer(row, layer, config = state.mapConfig) {
  if (!layer || (config?.tileLayers || []).length <= 1) return true;
  return mapLayerForRow(row, config)?.key === layer.key;
}

function mapEntityKind(entity) {
  if (String(entity?.name || '').toLowerCase() === 'hirode') return 'pet';
  if (entity?.questItem) return 'quest';
  if (entity?.kind === 'player') return 'player';
  if (entity?.kind === 'resource') return 'resource';
  if (entity?.kind === 'chest') return 'chest';
  if (entity?.kind === 'mob') return 'mob';
  return 'npc';
}

function mapResourceType(entity) {
  const value = `${entity?.name || ''} ${entity?.asset || ''} ${entity?.rawText || ''}`.toLowerCase();
  if (/\b(ore|deposit|caspilrite|asherite)\b/.test(value) || value.includes('mining_')) return 'ore';
  if (/\b(tree|ash|maple|walnut|oak)\b/.test(value)) return 'wood';
  if (/\b(herb|vegetable|plant|cotton|jute|blackberry|bush)\b/.test(value)) return 'plant';
  return 'node';
}

function mapEntityTypeLabel(entity) {
  const kind = mapEntityKind(entity);
  if (kind === 'resource') {
    const resourceType = mapResourceType(entity);
    if (resourceType === 'ore') return 'Ore';
    if (resourceType === 'wood') return 'Wood';
    if (resourceType === 'plant') return 'Plant';
    return 'Node';
  }
  if (kind === 'quest') return 'Quest';
  if (kind === 'chest') return 'Chest';
  if (kind === 'pet') return 'Pet';
  if (kind === 'player') return 'Player';
  if (kind === 'mob') return 'Mob';
  return 'NPC';
}

function mapEntitySearchText(entity) {
  return [
    entity?.name,
    entity?.petAlias,
    entity?.petLabel,
    entity?.asset,
    entity?.entityId,
    entity?.kind,
    entity?.questItem ? 'quest' : null,
    entity?.kind === 'chest' ? 'chest loot lockbox crate' : null,
    entity?.faction,
    entity?.namedMob?.name,
    entity?.namedMob?.location,
    entity?.namedSpawn?.name,
    entity?.namedSpawn?.location,
    entity?.rawText,
    mapEntityTypeLabel(entity)
  ].filter(Boolean).join(' ').toLowerCase();
}

function normalizedMapSearch() {
  return String(state.mapEntitySearch || '').trim().toLowerCase();
}

function normalizePriorityName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\bdreadheart\b/g, 'deadheart');
}

function inferredPriorityCandidate(entity) {
  if (!entity || entity.isDead) return false;
  const kind = mapEntityKind(entity);
  if (kind !== 'mob' && kind !== 'npc') return false;
  const name = normalizePriorityName(entity.name || entity.asset || '');
  if (!name) return false;
  if (!/\bthe\b/.test(name) && !/\b(?:boss|lord|king|queen|prince|princess|deadheart)\b/.test(name)) return false;
  if (String(entity.disposition || '').toLowerCase() !== 'prepared to attack') return false;
  const difficulty = String(entity.difficulty || '').toLowerCase();
  if (/\b(great challenge|even greater challenge|incredibly dangerous|madness|death wish|formidable)\b/.test(difficulty)) return true;
  return Number.isFinite(Number(entity.level)) && Number(entity.level) >= 10;
}

function priorityEntries() {
  return String(state.priorityMobList || '')
    .split(/\r?\n|,/)
    .map((value) => normalizePriorityName(value))
    .filter((value, index, values) => value && values.indexOf(value) === index);
}

function priorityMatchForEntity(entity, entries = priorityEntries()) {
  if (entity?.isDead) return null;
  const kind = mapEntityKind(entity);
  if (kind !== 'mob' && kind !== 'npc') return null;
  const name = normalizePriorityName(entity.name || entity.asset || '');
  if (!name) return null;
  const match = entries.find((entry) => {
    if (entry.length <= 2) return name === entry;
    return name === entry || name.includes(entry);
  }) || null;
  if (match) return match;
  return inferredPriorityCandidate(entity) ? name : null;
}

function respawnDefaultMinutes() {
  const value = Number(state.respawnDefaultMinutes);
  return Number.isFinite(value) && value > 0 ? Math.max(1, Math.min(240, Math.round(value))) : 15;
}

function respawnCampEntries() {
  const entries = [];
  const seenKeys = new Set();
  for (const line of String(state.respawnCampList || '').split(/\r?\n/)) {
    const parts = line.split('|').map((part) => part.trim()).filter(Boolean);
    if (!parts.length) continue;
    let minutes = respawnDefaultMinutes();
    if (/^\d+(?:\.\d+)?$/.test(parts[parts.length - 1])) {
      minutes = Math.max(1, Math.min(240, Math.round(Number(parts.pop()))));
    }
    const names = parts
      .flatMap((part) => part.split(/[,;]/))
      .map((part) => part.trim())
      .filter(Boolean);
    if (!names.length) continue;
    const normalizedNames = names.map((name) => normalizePriorityName(name)).filter(Boolean);
    const key = normalizedNames[0];
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    entries.push({
      key,
      campName: names[0],
      aliases: normalizedNames,
      aliasLabels: names,
      respawnMinutes: minutes,
      source: 'camp'
    });
  }

  for (const entry of priorityEntries()) {
    if (entries.some((camp) => camp.aliases.includes(entry))) continue;
    entries.push({
      key: `watch:${entry}`,
      campName: entry.replace(/\b\w/g, (letter) => letter.toUpperCase()),
      aliases: [entry],
      aliasLabels: [entry],
      respawnMinutes: respawnDefaultMinutes(),
      source: 'watchlist'
    });
  }
  return entries;
}

function respawnDeathKey(death, campKey = '') {
  return [
    campKey,
    death?.eventType || '',
    death?.entityId || '',
    death?.target || '',
    death?.observedAt || ''
  ].join('|');
}

function respawnCampMatchesDeath(camp, death) {
  const target = normalizePriorityName(death?.target || '');
  if (!target) return false;
  return camp.aliases.some((alias) => {
    if (!alias) return false;
    if (alias.length <= 2 || target.length <= 2) return target === alias;
    return target === alias || target.includes(alias) || alias.includes(target);
  });
}

function buildRespawnTimers() {
  const nowMs = Date.now();
  const timers = [];
  const camps = respawnCampEntries();
  for (const camp of camps) {
    const death = (state.respawnDeaths || [])
      .filter((row) => respawnCampMatchesDeath(camp, row))
      .sort((left, right) => Date.parse(right.observedAt || 0) - Date.parse(left.observedAt || 0))[0];
    if (!death) continue;
    const key = respawnDeathKey(death, camp.key);
    if (state.respawnDismissedKeys.has(key)) continue;
    const killedAtMs = Date.parse(death.observedAt || '');
    if (!Number.isFinite(killedAtMs)) continue;
    const respawnAtMs = killedAtMs + camp.respawnMinutes * 60_000;
    timers.push({
      id: key,
      campName: camp.campName,
      sourceName: death.target,
      killedAt: death.observedAt,
      respawnMinutes: camp.respawnMinutes,
      respawnAt: new Date(respawnAtMs).toISOString(),
      remainingMs: respawnAtMs - nowMs,
      manual: false,
      source: camp.source,
      eventType: death.eventType
    });
  }

  for (const timer of state.respawnManualTimers || []) {
    const killedAtMs = Date.parse(timer.killedAt || '');
    const minutes = Number(timer.respawnMinutes || respawnDefaultMinutes());
    if (!Number.isFinite(killedAtMs) || !Number.isFinite(minutes)) continue;
    const respawnAtMs = killedAtMs + minutes * 60_000;
    const id = timer.id || `manual|${timer.campName}|${timer.killedAt}`;
    if (state.respawnDismissedKeys.has(id)) continue;
    timers.push({
      ...timer,
      id,
      respawnMinutes: minutes,
      respawnAt: new Date(respawnAtMs).toISOString(),
      remainingMs: respawnAtMs - nowMs,
      manual: true,
      source: 'manual'
    });
  }

  return timers.sort((left, right) => {
    const leftDue = left.remainingMs <= 0;
    const rightDue = right.remainingMs <= 0;
    if (leftDue !== rightDue) return leftDue ? -1 : 1;
    return left.remainingMs - right.remainingMs;
  });
}

function matchesMapSearch(entity, query = normalizedMapSearch()) {
  if (!query) return true;
  return query.split(/\s+/).every((part) => mapEntitySearchText(entity).includes(part));
}

function shouldShowMapEntity(entity) {
  const kind = mapEntityKind(entity);
  if (kind === 'quest') return state.mapShowQuestItems;
  if (kind === 'chest') return state.mapShowChests;
  if (kind === 'resource') {
    if (!state.mapShowNodes) return false;
    const resourceType = mapResourceType(entity);
    if (resourceType === 'plant') return state.mapShowPlants;
    if (resourceType === 'wood') return state.mapShowTrees;
    if (resourceType === 'ore') return state.mapShowOre;
    return true;
  }
  if (kind === 'player') return state.mapShowPlayers;
  if (kind === 'mob') return state.mapShowMobs;
  if (kind === 'npc') return state.mapShowNpcs;
  if (kind === 'pet') return state.mapShowMobs || state.mapShowNpcs;
  return true;
}

function mapChallengeColor(entity) {
  const difficulty = String(entity?.difficulty || '').toLowerCase();
  if (!difficulty) return null;
  if (difficulty.includes('trivial')) return '#8d949b';
  if (difficulty.includes('relatively safe')) return '#63c06f';
  if (difficulty.includes('evenly matched')) return '#edf1f4';
  if (difficulty.includes('formidable')) return '#4f8dff';
  if (difficulty.includes('even greater challenge')) return '#f2a23d';
  if (difficulty.includes('great challenge')) return '#e2c94d';
  if (difficulty.includes('incredibly dangerous')) return '#9b5cff';
  if (difficulty.includes('madness') || difficulty.includes('death wish')) return '#c41f4a';
  return null;
}

function mapChallengeColorFromLevel(entity) {
  const explicit = mapChallengeColor(entity);
  if (explicit) return explicit;
  const level = Number(entity?.level);
  const localLevel = Number(entity?.localPlayerLevel || effectivePlayerLevel());
  if (!Number.isFinite(level) || !Number.isFinite(localLevel)) return null;
  const delta = Math.round(level - localLevel);
  if (delta <= -10) return '#8d949b';
  if (delta <= -4) return '#63c06f';
  if (delta <= -2) return '#78adff';
  if (delta <= 0) return '#edf1f4';
  if (delta === 1) return '#e2c94d';
  if (delta === 2) return '#f2a23d';
  if (delta === 3) return '#b784ff';
  return '#ff4e66';
}

function mapEntityNameColor(entity) {
  if (entity?.isDead) return null;
  const kind = mapEntityKind(entity);
  if (kind === 'quest') return '#d9b65f';
  if (kind === 'chest') return '#dca66a';
  if (kind === 'npc') return '#c9d1d9';
  if (kind === 'pet') return '#edf1f4';
  return mapChallengeColorFromLevel(entity);
}

function isFriendlyDisposition(entity) {
  const disposition = String(entity?.disposition || '').toLowerCase();
  return disposition === 'glad' || disposition === 'indifferent';
}

function playerTrailHeading(rows, project) {
  if (!rows.length) return -Math.PI / 2;
  const latestRow = rows[rows.length - 1];
  const decodedHeading = Number(latestRow.heading);
  if (Number.isFinite(decodedHeading)) return decodedHeading * Math.PI / 180 - Math.PI / 2;
  const latest = project(rows[rows.length - 1]);
  for (let i = rows.length - 2; i >= 0; i -= 1) {
    const previous = project(rows[i]);
    const dx = latest.x - previous.x;
    const dy = latest.y - previous.y;
    if (Math.hypot(dx, dy) >= 6) return Math.atan2(dy, dx);
  }
  return -Math.PI / 2;
}

function drawPlayerChevron(ctx, x, y, angle) {
  const radius = 11;
  const tip = {
    x: x + Math.cos(angle) * radius,
    y: y + Math.sin(angle) * radius
  };
  const left = {
    x: x + Math.cos(angle + 2.32) * radius * 0.78,
    y: y + Math.sin(angle + 2.32) * radius * 0.78
  };
  const notch = {
    x: x - Math.cos(angle) * radius * 0.28,
    y: y - Math.sin(angle) * radius * 0.28
  };
  const right = {
    x: x + Math.cos(angle - 2.32) * radius * 0.78,
    y: y + Math.sin(angle - 2.32) * radius * 0.78
  };

  ctx.shadowColor = 'rgba(0, 0, 0, 0.58)';
  ctx.shadowBlur = 5;
  ctx.fillStyle = '#4fb477';
  ctx.strokeStyle = '#06100b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(left.x, left.y);
  ctx.lineTo(notch.x, notch.y);
  ctx.lineTo(right.x, right.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawMapCompass(ctx, width) {
  const x = width - 42;
  const y = 42;
  ctx.save();
  ctx.strokeStyle = 'rgba(237, 241, 244, 0.72)';
  ctx.fillStyle = 'rgba(237, 241, 244, 0.88)';
  ctx.lineWidth = 2;
  ctx.font = '700 11px Segoe UI, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.beginPath();
  ctx.moveTo(x, y - 18);
  ctx.lineTo(x, y + 18);
  ctx.moveTo(x - 18, y);
  ctx.lineTo(x + 18, y);
  ctx.stroke();
  ctx.fillText('N', x, y - 27);
  ctx.fillText('S', x, y + 27);
  ctx.fillText('W', x - 27, y);
  ctx.fillText('E', x + 27, y);
  ctx.restore();
}

function offsetMapRow(row, dx, dy) {
  const plane = state.mapConfig?.coordinatePlane || state.mapAxis;
  if (plane === 'xy') {
    return {
      ...row,
      x: Number(row.x) + dx,
      y: Number(row.y) + dy
    };
  }
  return {
    ...row,
    x: Number(row.x) + dx,
    z: Number(row.z) + dy
  };
}

function drawRadarRangeRing(ctx, row, project) {
  if (!row) return;
  const center = project(row);
  const xEdge = project(offsetMapRow(row, RADAR_RANGE_UNITS, 0));
  const yEdge = project(offsetMapRow(row, 0, RADAR_RANGE_UNITS));
  const radiusX = Math.abs(xEdge.x - center.x);
  const radiusY = Math.abs(yEdge.y - center.y);
  if (![center.x, center.y, radiusX, radiusY].every(Number.isFinite) || radiusX < 4 || radiusY < 4) return;

  ctx.save();
  ctx.fillStyle = 'rgba(237, 241, 244, 0.025)';
  ctx.strokeStyle = 'rgba(237, 241, 244, 0.34)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 7]);
  ctx.beginPath();
  ctx.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

async function drawMapTiles(ctx, centerLatLng, width, height, activeLayer = null) {
  const config = state.mapConfig;
  if (!config) return null;
  const z = Math.min(Number(config.maxZoom || 9), Math.max(Number(config.minZoom || 3), state.mapZoom));
  const scale = 2 ** (z - 2);
  const center = {
    x: centerLatLng.lng * scale,
    y: centerLatLng.lat * scale
  };
  const topLeft = {
    x: center.x - width / 2,
    y: center.y - height / 2
  };
  const maxTileX = Math.ceil((config.bounds.width * scale) / 256);
  const maxTileY = Math.ceil((config.bounds.height * scale) / 256);
  const startX = Math.max(0, Math.floor(topLeft.x / 256));
  const endX = Math.min(maxTileX - 1, Math.floor((topLeft.x + width) / 256));
  const startY = Math.max(0, Math.floor(topLeft.y / 256));
  const endY = Math.min(maxTileY - 1, Math.floor((topLeft.y + height) / 256));
  const layers = activeLayer
    ? [activeLayer]
    : config.tileLayers?.length ? config.tileLayers : [{ tilePath: config.tilePath }];
  const tiles = [];
  for (let tileY = startY; tileY <= endY; tileY += 1) {
    for (let tileX = startX; tileX <= endX; tileX += 1) {
      for (const layer of layers) {
        tiles.push({ tileX, tileY, url: mapTileUrl(layer, z, tileX, tileY) });
      }
    }
  }
  const images = await Promise.all(tiles.map((tile) => loadTileImage(tile.url)));
  images.forEach((image, index) => {
    if (!image) return;
    const tile = tiles[index];
    ctx.drawImage(
      image,
      Math.round(tile.tileX * 256 - topLeft.x),
      Math.round(tile.tileY * 256 - topLeft.y),
      256,
      256
    );
  });
  return {
    scale,
    topLeft,
    activeLayer: layers[0] || null,
    project(row) {
      const latLng = locToLatLng(row);
      return {
        x: latLng.lng * scale - topLeft.x,
        y: latLng.lat * scale - topLeft.y
      };
    }
  };
}

function drawMapEntities(ctx, entities, project) {
  const hoverMarkers = [];
  if (!entities.length) return hoverMarkers;
  const query = normalizedMapSearch();
  const pulse = query ? 0.45 + 0.55 * Math.abs(Math.sin(Date.now() / 230)) : 0;
  const visible = entities
    .map((entity) => ({ entity, point: project(entity) }))
    .filter(({ point }) => point.x >= -24 && point.x <= ctx.canvas.width + 24 && point.y >= -24 && point.y <= ctx.canvas.height + 24)
    .slice(0, 250);
  for (const { entity, point } of visible) {
    const kind = mapEntityKind(entity);
    const isPriority = state.priorityActiveIds.has(entity.entityId);
    const isResource = kind === 'resource';
    const resourceType = isResource ? mapResourceType(entity) : null;
    const isQuest = kind === 'quest';
    const isChest = kind === 'chest';
    const isPet = kind === 'pet';
    const isPlayer = kind === 'player';
    const isMob = kind === 'mob';
    const isDead = Boolean(entity.isDead);
    const isCombatActive = Boolean(entity.combatState) && !isDead;
    const isFriendly = isFriendlyDisposition(entity);
    const isPrepared = String(entity.disposition || '').toLowerCase() === 'prepared to attack' && !isDead && !isFriendly;
    const challengeColor = (isMob || kind === 'npc') && !isDead
      ? mapChallengeColor(entity) || mapChallengeColorFromLevel(entity)
      : null;
    const npcFill = kind === 'npc' ? '#b7c0c9' : null;
    const npcStroke = kind === 'npc' ? 'rgba(70, 79, 88, 0.9)' : null;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = isPriority ? 14 : isQuest ? 12 : isChest ? 8 : (!isFriendly && (isCombatActive || isPrepared)) ? 8 : isResource || isPet ? 3 : 4;
    ctx.fillStyle = isDead ? '#777b80' : npcFill || challengeColor || (isQuest ? '#ffe05a' : isChest ? '#dca66a' : !isFriendly && isCombatActive ? '#ff675d' : resourceType === 'ore' ? '#b9c7d4' : resourceType === 'wood' ? '#7fb069' : resourceType === 'plant' ? '#70d6a1' : isResource ? '#7fc8a9' : isPet ? '#edf1f4' : isPlayer ? '#58d7ff' : isMob ? '#f2b65d' : '#d7dce2');
    ctx.strokeStyle = isPriority ? '#ff1616' : isDead ? 'rgba(28, 31, 35, 0.9)' : npcStroke || (isQuest ? '#8f6d04' : isChest ? '#4f2b10' : (isPrepared ? '#ff3d35' : !isFriendly && isCombatActive ? '#5a1110' : resourceType === 'ore' ? '#2f4657' : resourceType === 'wood' ? '#244016' : resourceType === 'plant' ? '#0b4b31' : isResource ? '#07100b' : isPet ? '#10162d' : 'rgba(6, 16, 11, 0.82)'));
    ctx.lineWidth = isPriority ? 4 : isQuest || isChest ? 2.5 : isPrepared ? 3 : 2;
    ctx.beginPath();
    if (resourceType === 'ore') {
      ctx.moveTo(point.x, point.y - 8);
      ctx.lineTo(point.x + 8, point.y);
      ctx.lineTo(point.x, point.y + 8);
      ctx.lineTo(point.x - 8, point.y);
      ctx.closePath();
    } else if (isQuest) {
      const outer = 8;
      const inner = 3.5;
      for (let i = 0; i < 10; i += 1) {
        const angle = -Math.PI / 2 + (Math.PI / 5) * i;
        const radius = i % 2 === 0 ? outer : inner;
        const x = point.x + Math.cos(angle) * radius;
        const y = point.y + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else if (isChest) {
      ctx.rect(point.x - 7, point.y - 5, 14, 11);
      ctx.moveTo(point.x - 7, point.y - 1);
      ctx.lineTo(point.x + 7, point.y - 1);
      ctx.moveTo(point.x, point.y - 5);
      ctx.lineTo(point.x, point.y + 6);
    } else if (isResource) {
      if (resourceType === 'wood') {
        ctx.moveTo(point.x, point.y - 8);
        ctx.lineTo(point.x + 7, point.y + 6);
        ctx.lineTo(point.x - 7, point.y + 6);
        ctx.closePath();
      } else if (resourceType === 'plant') {
        ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
      } else {
        ctx.rect(point.x - 6, point.y - 6, 12, 12);
      }
    } else if (isPet) {
      ctx.moveTo(point.x, point.y - 6);
      ctx.lineTo(point.x + 5, point.y);
      ctx.lineTo(point.x, point.y + 6);
      ctx.lineTo(point.x - 5, point.y);
      ctx.closePath();
    } else if (isPlayer) {
      ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
    } else {
      ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
    if (isPriority) {
      const alertPulse = 0.45 + 0.55 * Math.abs(Math.sin(Date.now() / 170));
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(255, 20, 20, ${0.48 + alertPulse * 0.48})`;
      ctx.fillStyle = `rgba(255, 20, 20, ${0.08 + alertPulse * 0.12})`;
      ctx.lineWidth = 4 + alertPulse * 4;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.arc(point.x, point.y, 22 + alertPulse * 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ff2f2f';
      ctx.beginPath();
      ctx.moveTo(point.x, point.y - 28 - alertPulse * 8);
      ctx.lineTo(point.x + 9, point.y - 12);
      ctx.lineTo(point.x - 9, point.y - 12);
      ctx.closePath();
      ctx.fill();
    }
    if (query && matchesMapSearch(entity, query)) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 + pulse * 0.55})`;
      ctx.lineWidth = 2 + pulse * 2.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(point.x, point.y, isResource ? 14 + pulse * 8 : 15 + pulse * 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.shadowBlur = 0;
    hoverMarkers.push({
      entity,
      x: point.x,
      y: point.y,
      radius: isResource ? 12 : isQuest || isChest ? 13 : isPet ? 10 : isPlayer ? 14 : 13
    });
  }

  if (!state.mapShowLabels) return hoverMarkers;

  ctx.font = '600 11px Segoe UI, Arial, sans-serif';
  ctx.textBaseline = 'middle';
  visible.slice(0, 50).forEach(({ entity, point }) => {
    const label = String(entity.name || '').slice(0, 28);
    if (!label) return;
    const textWidth = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(10, 12, 14, 0.76)';
    ctx.fillRect(point.x + 8, point.y - 9, textWidth + 8, 18);
    ctx.fillStyle = '#edf1f4';
    ctx.fillText(label, point.x + 12, point.y);
  });
  return hoverMarkers;
}

async function renderMapCanvas(rows, entities = []) {
  const renderId = ++state.mapRenderId;
  const canvas = els.mapCanvas;
  resizeMapCanvas();
  const width = canvas.width;
  const height = canvas.height;
  const buffer = document.createElement('canvas');
  buffer.width = width;
  buffer.height = height;
  const ctx = buffer.getContext('2d');
  ctx.fillStyle = '#253d48';
  ctx.fillRect(0, 0, width, height);

  const compatibleRows = rows
    .filter((row) => {
      const point = mapPoint(row);
      return Number.isFinite(point.x) && Number.isFinite(point.y) && isRowCompatibleWithMap(row);
    })
    .reverse();
  const compatibleEntities = entities.filter((entity) => isRowCompatibleWithMap(entity));
  const layerReferenceRow = compatibleRows[compatibleRows.length - 1] || compatibleEntities[0] || null;
  const activeLayer = mapLayerForRow(layerReferenceRow);
  const ignoreHeight = Boolean(state.mapIgnoreHeight);
  const drawableRows = compatibleRows.filter((row) => isRowOnMapLayer(row, activeLayer));
  const drawableEntities = ignoreHeight
    ? compatibleEntities.filter((entity) => shouldShowMapEntity(entity))
    : compatibleEntities.filter((entity) => isRowOnMapLayer(entity, activeLayer) && shouldShowMapEntity(entity));
  const centerRow = drawableRows[drawableRows.length - 1] || drawableEntities[0] || null;
  if (!centerRow) {
    ctx.fillStyle = '#9aa6b2';
    ctx.font = '14px Segoe UI, Arial, sans-serif';
    ctx.fillText('Waiting for position updates...', 24, 36);
    if (renderId !== state.mapRenderId) return;
    const visibleCtx = canvas.getContext('2d');
    visibleCtx.clearRect(0, 0, width, height);
    visibleCtx.drawImage(buffer, 0, 0);
    state.mapHoverMarkers = [];
    return;
  }

  const latestRow = drawableRows[drawableRows.length - 1] || null;
  const viewport = await drawMapTiles(ctx, locToLatLng(centerRow), width, height, activeLayer);
  if (renderId !== state.mapRenderId) return;
  const project = (row) => viewport ? viewport.project(row) : {
    x: width / 2,
    y: height / 2
  };

  ctx.strokeStyle = 'rgba(237, 241, 244, 0.16)';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 128) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 128) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  drawMapCompass(ctx, width);
  if (latestRow) drawRadarRangeRing(ctx, latestRow, project);

  const hoverMarkers = drawMapEntities(ctx, drawableEntities, project);

  if (drawableRows.length) {
    ctx.strokeStyle = '#d2a84b';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    drawableRows.forEach((row, index) => {
      const projected = project(row);
      if (index === 0) ctx.moveTo(projected.x, projected.y);
      else ctx.lineTo(projected.x, projected.y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    const heading = playerTrailHeading(drawableRows, project);
    drawableRows.forEach((row, index) => {
      const projected = project(row);
      const latest = index === drawableRows.length - 1;
      if (latest) {
        drawPlayerChevron(ctx, projected.x, projected.y, heading);
        return;
      }
      ctx.fillStyle = latest ? '#4fb477' : 'rgba(79, 180, 119, 0.38)';
      ctx.strokeStyle = latest ? '#06100b' : 'rgba(6, 16, 11, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(projected.x, projected.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    const latestPoint = project(latestRow);
    ctx.fillStyle = '#edf1f4';
    ctx.font = '700 13px Segoe UI, Arial, sans-serif';
    ctx.fillText(latestRow.source || latestRow.entityId || 'Position', latestPoint.x + 12, latestPoint.y - 10);
  }
  ctx.fillStyle = '#9aa6b2';
  ctx.font = '12px Segoe UI, Arial, sans-serif';
  const latest = mapPoint(centerRow);
  const label = drawableRows.length ? 'position' : 'entity context';
  const layerLabel = activeLayer?.name ? ` | ${activeLayer.name}` : '';
  ctx.fillText(`${(state.mapConfig?.coordinatePlane || state.mapAxis).toUpperCase()} ${formatCoord(latest.x)}, ${formatCoord(latest.y)} | ${label}${layerLabel} | cached Shalazam tiles`, 16, height - 16);
  if (renderId !== state.mapRenderId) return;
  const visibleCtx = canvas.getContext('2d');
  visibleCtx.clearRect(0, 0, width, height);
  visibleCtx.drawImage(buffer, 0, 0);
  state.mapHoverMarkers = hoverMarkers;
}

function renderPositionList(rows) {
  if (!rows.length) {
    els.positionList.innerHTML = '<div class="empty">No position updates yet.</div>';
    return;
  }
  els.positionList.replaceChildren(...rows.slice(0, 24).map((row) => {
    const div = document.createElement('div');
    div.className = 'position-row';
    div.innerHTML = `
      <div><strong>${escapeHtml(row.source || row.entityId || 'Unknown')}</strong><span>${formatTime(row.observedAt)}</span></div>
      <div class="position-coords">X ${formatCoord(row.x)} / Y ${formatCoord(row.y)} / Z ${formatCoord(row.z)}${Number.isFinite(Number(row.heading)) ? ` / H ${formatCoord(row.heading)}` : ''}</div>
    `;
    return div;
  }));
}

function ensurePriorityAudio() {
  if (!state.priorityAudioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    state.priorityAudioContext = new AudioContext();
  }
  if (state.priorityAudioContext.state === 'suspended') state.priorityAudioContext.resume();
  return state.priorityAudioContext;
}

function playPriorityAlert() {
  if (!state.prioritySound) return;
  const audio = ensurePriorityAudio();
  if (!audio) return;
  const now = audio.currentTime;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);
  gain.connect(audio.destination);

  [740, 988, 740].forEach((frequency, index) => {
    const osc = audio.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(frequency, now + index * 0.18);
    osc.connect(gain);
    osc.start(now + index * 0.18);
    osc.stop(now + index * 0.18 + 0.14);
  });
}

function renderPriorityMobs(entities) {
  if (!els.priorityActiveList || !els.priorityCount) return;
  const entries = priorityEntries();
  const matches = entities
    .map((entity) => ({ entity, match: priorityMatchForEntity(entity, entries) }))
    .filter((row) => row.match);
  const activeIds = new Set(matches.map((row) => row.entity.entityId).filter(Boolean));
  const newIds = [...activeIds].filter((id) => !state.prioritySeenIds.has(id));
  state.priorityActiveIds = activeIds;
  activeIds.forEach((id) => state.prioritySeenIds.add(id));
  if (newIds.length) playPriorityAlert();

  els.priorityCount.textContent = entries.length
    ? `${matches.length} active / ${entries.length} watched`
    : `${matches.length} active`;
  if (!entries.length && !matches.length) {
    els.priorityActiveList.innerHTML = '<div class="empty">Add mob names to the watchlist.</div>';
    return;
  }
  if (!matches.length) {
    els.priorityActiveList.innerHTML = '<div class="empty">No priority mobs on radar.</div>';
    return;
  }

  const sorted = matches.sort((left, right) => {
    const leftTime = Date.parse(left.entity.observedAt || 0);
    const rightTime = Date.parse(right.entity.observedAt || 0);
    return rightTime - leftTime;
  });
  els.priorityActiveList.replaceChildren(...sorted.slice(0, 24).map(({ entity, match }) => {
    const row = document.createElement('div');
    row.className = 'priority-row';
    const name = entity.name || entity.asset || entity.entityId || match;
    const level = Number.isFinite(Number(entity.level)) ? `Lv ${Number(entity.level).toFixed(0)} ` : '';
    const health = entity.health && Number.isFinite(Number(entity.health.max))
      ? ` / ${Math.max(0, Number(entity.health.current)).toFixed(0)}/${Number(entity.health.max).toFixed(0)}`
      : '';
    row.innerHTML = `
      <div><strong>${escapeHtml(name)}</strong><span>${escapeHtml(`${level}${mapEntityTypeLabel(entity)}${health}`)}</span></div>
      <div class="priority-meta">
        <span>X ${formatCoord(entity.x)} / Y ${formatCoord(entity.y)} / Z ${formatCoord(entity.z)}</span>
        <span>${escapeHtml(formatAge(entity.ageSeconds) || formatTime(entity.observedAt))}</span>
      </div>
    `;
    return row;
  }));
}

function renderRespawnTimers() {
  if (!els.respawnTimerList || !els.respawnCount) return;
  const timers = buildRespawnTimers();
  const dueCount = timers.filter((timer) => timer.remainingMs <= 0).length;
  els.respawnCount.textContent = `${timers.length} timer${timers.length === 1 ? '' : 's'}${dueCount ? ` / ${dueCount} due` : ''}`;
  if (!timers.length) {
    els.respawnTimerList.innerHTML = '<div class="empty">No watched deaths yet.</div>';
    return;
  }
  els.respawnTimerList.replaceChildren(...timers.slice(0, 32).map((timer) => {
    const row = document.createElement('div');
    const due = timer.remainingMs <= 0;
    row.className = `respawn-row${due ? ' due' : ''}`;
    const sourceLabel = timer.manual
      ? 'manual'
      : `${timer.eventType === 'health_update' ? 'health' : 'kill'} / ${timer.source}`;
    row.innerHTML = `
      <div class="respawn-row-main">
        <strong>${escapeHtml(timer.campName || timer.sourceName || 'Unknown camp')}</strong>
        <span>${due ? 'Due' : formatCountdown(timer.remainingMs)}</span>
      </div>
      <div class="respawn-progress"><span style="width: ${Math.max(0, Math.min(100, 100 - (Math.max(0, timer.remainingMs) / (timer.respawnMinutes * 60_000)) * 100)).toFixed(1)}%"></span></div>
      <div class="respawn-meta">
        <span>${escapeHtml(timer.sourceName || timer.campName || '')}</span>
        <span>${formatTime(timer.killedAt)} -> ${formatTime(timer.respawnAt)}</span>
      </div>
      <div class="respawn-meta">
        <span>${escapeHtml(sourceLabel)}</span>
        <button class="respawn-dismiss" type="button" data-respawn-id="${escapeHtml(timer.id)}">Dismiss</button>
      </div>
    `;
    row.querySelector('.respawn-dismiss')?.addEventListener('click', () => {
      state.respawnDismissedKeys.add(timer.id);
      if (timer.manual) {
        state.respawnManualTimers = state.respawnManualTimers.filter((item) => (item.id || `manual|${item.campName}|${item.killedAt}`) !== timer.id);
        saveRespawnManualTimers();
      }
      saveRespawnDismissedKeys();
      renderRespawnTimers();
    });
    return row;
  }));
}

async function refreshRespawnDeaths(force = false) {
  if (state.respawnDeathsRefreshInFlight) return;
  if (!force && Date.now() - Number(state.respawnDeathsFetchedAt || 0) < 5_000) {
    renderRespawnTimers();
    return;
  }
  state.respawnDeathsRefreshInFlight = true;
  try {
    const params = displayParams({ window: String(6 * 60 * 60), limit: '300' });
    const data = await fetchJson(`/api/respawns/deaths?${params}`);
    state.respawnDeaths = data.rows || [];
    state.respawnDeathsFetchedAt = Date.now();
    renderRespawnTimers();
  } catch (error) {
    console.warn(error);
  } finally {
    state.respawnDeathsRefreshInFlight = false;
  }
}

function startManualRespawnTimer() {
  const name = (els.respawnManualName?.value || '').trim();
  if (!name) return;
  const timer = {
    id: `manual|${Date.now()}|${name}`,
    campName: name,
    sourceName: name,
    killedAt: new Date().toISOString(),
    respawnMinutes: respawnDefaultMinutes()
  };
  state.respawnManualTimers = [timer, ...(state.respawnManualTimers || [])].slice(0, 50);
  if (els.respawnManualName) els.respawnManualName.value = '';
  saveRespawnManualTimers();
  renderRespawnTimers();
}

function clearDueRespawnTimers() {
  const due = buildRespawnTimers().filter((timer) => timer.remainingMs <= 0);
  for (const timer of due) state.respawnDismissedKeys.add(timer.id);
  state.respawnManualTimers = (state.respawnManualTimers || []).filter((item) => {
    const id = item.id || `manual|${item.campName}|${item.killedAt}`;
    return !state.respawnDismissedKeys.has(id);
  });
  saveRespawnDismissedKeys();
  saveRespawnManualTimers();
  renderRespawnTimers();
}

function refreshPriorityOverlayFromCache() {
  window.clearTimeout(state.priorityOverlayTimer);
  state.priorityOverlayTimer = window.setTimeout(() => {
    renderPriorityMobs(state.mapVisibleEntities || []);
    renderRespawnTimers();
    renderMapEntityList(state.mapVisibleEntities || []);
    if (state.tab === 'map' && els.mapCanvas) {
      renderMapCanvas(state.mapCanvasRows || [], state.mapVisibleEntities || []);
    }
  }, 160);
}

function renderMapEntityList(entities) {
  if (!els.mapEntityList || !els.mapEntityCount) return;
  const liveCount = entities.filter((entity) => !entity.isDead).length;
  const deadCount = entities.length - liveCount;
  const combatCount = entities.filter((entity) => entity.combatState && !entity.isDead).length;
  const query = normalizedMapSearch();
  const matchCount = query ? entities.filter((entity) => matchesMapSearch(entity, query)).length : 0;
  els.mapEntityCount.textContent = query
    ? `${matchCount} match${matchCount === 1 ? '' : 'es'}`
    : `${liveCount} live${combatCount ? ` / ${combatCount} active` : ''}${deadCount ? ` / ${deadCount} dead` : ''}`;
  if (!entities.length) {
    els.mapEntityList.innerHTML = `<div class="empty">${query && state.mapSearchOnly ? 'No matching entities.' : 'No entity location updates yet.'}</div>`;
    return;
  }

  const sorted = [...entities].sort((left, right) => {
    if (query) {
      const leftMatch = matchesMapSearch(left, query);
      const rightMatch = matchesMapSearch(right, query);
      if (leftMatch !== rightMatch) return leftMatch ? -1 : 1;
    }
    if (Boolean(left.isDead) !== Boolean(right.isDead)) return left.isDead ? 1 : -1;
    const leftPriority = state.priorityActiveIds.has(left.entityId);
    const rightPriority = state.priorityActiveIds.has(right.entityId);
    if (leftPriority !== rightPriority) return leftPriority ? -1 : 1;
    if (Boolean(left.combatState) !== Boolean(right.combatState)) return left.combatState ? -1 : 1;
    const leftPrepared = String(left.disposition || '').toLowerCase() === 'prepared to attack';
    const rightPrepared = String(right.disposition || '').toLowerCase() === 'prepared to attack';
    if (leftPrepared !== rightPrepared) return leftPrepared ? -1 : 1;
    if (left.kind !== right.kind) return String(left.kind).localeCompare(String(right.kind));
    return Date.parse(right.observedAt || 0) - Date.parse(left.observedAt || 0);
  });

  els.mapEntityList.replaceChildren(...sorted.slice(0, 180).map((entity) => {
    const row = document.createElement('div');
    const disposition = String(entity.disposition || '').toLowerCase();
    const kind = mapEntityKind(entity);
    row.className = `map-entity-row ${state.priorityActiveIds.has(entity.entityId) ? 'priority' : ''} ${query && matchesMapSearch(entity, query) ? 'search-match' : ''} ${entity.isDead ? 'dead' : ''} ${entity.combatState && !entity.isDead ? 'combat' : ''} ${disposition === 'prepared to attack' && !entity.isDead ? 'hostile' : ''} ${disposition === 'indifferent' && !entity.isDead ? 'indifferent' : ''} ${kind === 'quest' ? 'quest' : ''} ${kind === 'chest' ? 'chest' : ''}`;
    const name = entity.name || entity.asset || entity.entityId || 'Unknown';
    const observedName = entity.petAlias && entity.petAlias !== name ? entity.petAlias : '';
    const petLabel = entity.petLabel && entity.petLabel !== name ? entity.petLabel : '';
    const health = entity.health && Number.isFinite(Number(entity.health.max))
      ? `${Math.max(0, Number(entity.health.current)).toFixed(0)}/${Number(entity.health.max).toFixed(0)}`
      : '';
    const age = formatAge(entity.ageSeconds);
    const level = Number.isFinite(Number(entity.level)) && (kind === 'npc' || kind === 'mob')
      ? ` Lv ${Number(entity.level).toFixed(0)}`
      : '';
    const con = entity.disposition
      ? ` / ${entity.disposition}${entity.difficulty ? ` (${entity.difficulty})` : ''}`
      : '';
    const targetRole = String(entity.targetRole || '').toLowerCase();
    const targetTag = targetRole === 'offensive' ? ' / Target' : targetRole === 'defensive' ? ' / Defensive' : '';
    const detailParts = [
      entity.namedMob ? `Named: ${entity.namedMob.location || entity.namedMob.zone || 'known'}` : null,
      !entity.namedMob && entity.namedSpawn ? `Near ${entity.namedSpawn.name} spawn (${entity.namedSpawn.distance}m)` : null,
      entity.title && entity.title !== name ? entity.title : null,
      entity.profession && entity.profession !== 'None' ? entity.profession : null,
      entity.className && entity.className !== 'None' ? entity.className : null,
      Number.isFinite(Number(entity.distanceFromLocal)) ? `${Number(entity.distanceFromLocal).toFixed(0)}m` : null
    ].filter(Boolean);
    const nameColor = mapEntityNameColor(entity) || mapChallengeColorFromLevel(entity);
    row.innerHTML = `
      <div class="entity-row-main">
        <strong${nameColor ? ` style="color: ${nameColor}"` : ''}>${escapeHtml(name)}</strong>
        <span>${escapeHtml(`${mapEntityTypeLabel(entity)}${level}${targetTag}`)}${entity.combatState && !entity.isDead ? ' / Active' : ''}${entity.isDead ? ' / Dead' : ''}</span>
      </div>
      ${observedName ? `<div class="entity-row-con">Observed: ${escapeHtml(observedName)}</div>` : ''}
      ${petLabel ? `<div class="entity-row-con">Pet: ${escapeHtml(petLabel)}</div>` : ''}
      ${detailParts.length ? `<div class="entity-row-con">${escapeHtml(detailParts.join(' / '))}</div>` : ''}
      ${con ? `<div class="entity-row-con">${escapeHtml(`${entity.disposition}${entity.difficulty ? ` (${entity.difficulty})` : ''}`)}</div>` : ''}
      <div class="entity-row-meta">
        <span>X ${formatCoord(entity.x)} / Y ${formatCoord(entity.y)} / Z ${formatCoord(entity.z)}</span>
        <span>${health ? escapeHtml(health) : escapeHtml(entity.faction || age || formatTime(entity.observedAt))}</span>
      </div>
    `;
    return row;
  }));
}

function hideMapTooltip() {
  if (!els.mapTooltip) return;
  els.mapTooltip.hidden = true;
  els.mapTooltip.textContent = '';
}

function showMapTooltip(marker, canvasX, canvasY) {
  if (!els.mapTooltip) return;
  const name = marker?.entity?.name || marker?.entity?.asset || marker?.entity?.entityId || '';
  if (!name) {
    hideMapTooltip();
    return;
  }
  const kind = mapEntityKind(marker.entity);
  const observedName = marker?.entity?.petAlias && marker.entity.petAlias !== name
    ? ` / Observed: ${marker.entity.petAlias}`
    : '';
  const petLabel = marker?.entity?.petLabel && marker.entity.petLabel !== name
    ? ` / Pet: ${marker.entity.petLabel}`
    : '';
  const con = marker.entity?.disposition
    ? ` / ${marker.entity.disposition}${marker.entity?.difficulty ? ` (${marker.entity.difficulty})` : ''}${marker.entity?.faction ? ` / ${marker.entity.faction}` : ''}`
    : '';
  const targetRole = String(marker.entity?.targetRole || '').toLowerCase();
  const targetTag = targetRole === 'offensive' ? ' / Target' : targetRole === 'defensive' ? ' / Defensive' : '';
  const distance = Number.isFinite(Number(marker.entity?.distanceFromLocal)) ? ` / ${Number(marker.entity.distanceFromLocal).toFixed(0)}m` : '';
  const label = `${mapEntityTypeLabel(marker.entity)}${targetTag}${observedName}${petLabel}${con}${distance}${marker.entity?.combatState && !marker.entity?.isDead ? ' / Active' : ''}${marker.entity?.isDead ? ' / Dead' : ''}`;
  const age = formatAge(marker.entity?.ageSeconds);
  els.mapTooltip.innerHTML = `<strong>${escapeHtml(name)}</strong><span>${escapeHtml(age ? `${label} / ${age}` : label)}</span>`;
  els.mapTooltip.hidden = false;

  const wrap = els.mapTooltip.parentElement;
  const wrapRect = wrap.getBoundingClientRect();
  const tipRect = els.mapTooltip.getBoundingClientRect();
  const left = Math.min(Math.max(8, canvasX + 14), Math.max(8, wrapRect.width - tipRect.width - 8));
  const top = Math.min(Math.max(8, canvasY + 14), Math.max(8, wrapRect.height - tipRect.height - 8));
  els.mapTooltip.style.left = `${left}px`;
  els.mapTooltip.style.top = `${top}px`;
}

function handleMapHover(event) {
  if (!els.mapCanvas || !state.mapHoverMarkers.length) {
    hideMapTooltip();
    return;
  }
  const rect = els.mapCanvas.getBoundingClientRect();
  const canvasX = (event.clientX - rect.left) * (els.mapCanvas.width / rect.width);
  const canvasY = (event.clientY - rect.top) * (els.mapCanvas.height / rect.height);
  let best = null;
  let bestDistance = Infinity;
  for (const marker of state.mapHoverMarkers) {
    const distance = Math.hypot(canvasX - marker.x, canvasY - marker.y);
    if (distance <= marker.radius && distance < bestDistance) {
      best = marker;
      bestDistance = distance;
    }
  }
  if (!best) {
    hideMapTooltip();
    return;
  }
  const cssX = event.clientX - rect.left;
  const cssY = event.clientY - rect.top;
  showMapTooltip(best, cssX, cssY);
}

async function refreshMap() {
  if (!state.mapCatalog) state.mapCatalog = await fetchJson('/api/map/config');
  await refreshMapCalibration();
  const params = recentMapParams({ limit: '80', actors: '10' }, 45_000);
  const [data, mapState] = await Promise.all([
    fetchJson(`/api/positions?${params}`),
    fetchJson('/api/map/state')
  ]);
  state.mapState = mapState;
  await refreshMapEntities();
  await refreshRespawnDeaths();
  const latest = (data.latest || [])[0] || null;
  const trail = data.trail || [];
  const entities = state.mapEntities || [];
  const nextMapConfig = chooseMapConfig(latest, mapState);
  const mapChanged = nextMapConfig?.key && nextMapConfig.key !== state.mapConfig?.key;
  state.mapConfig = nextMapConfig;
  if (mapChanged) state.mapZoom = clampMapZoom(storedMapZoom(state.mapConfig));
  if (state.mapConfig?.key === 'halnir_cave' && !state.mapIgnoreHeightExplicit && !state.mapIgnoreHeight) {
    state.mapIgnoreHeight = true;
    window.localStorage.setItem('pantheonParser2.mapIgnoreHeight', 'true');
    if (els.mapIgnoreHeight) els.mapIgnoreHeight.checked = true;
  }
  renderZoomControls();
  const compatibleTrail = trail.filter((row) => isRowCompatibleWithMap(row));
  const compatibleLatest = latest && isRowCompatibleWithMap(latest) ? latest : (compatibleTrail[0] || null);
  await recordMapCalibrationSample(compatibleLatest);
  const compatibleEntities = entities.filter((entity) => isRowCompatibleWithMap(entity));
  const layerReferenceRow = compatibleLatest || compatibleTrail[0] || compatibleEntities[0] || null;
  const activeLayer = mapLayerForRow(layerReferenceRow);
  const radarCenterRow = compatibleLatest || compatibleTrail[0] || null;
  const ignoreHeight = Boolean(state.mapIgnoreHeight);
  const layerEntities = ignoreHeight
    ? compatibleEntities.filter((entity) => shouldShowMapEntity(entity) && isEntityNearRadar(entity, radarCenterRow))
    : compatibleEntities.filter((entity) => isRowOnMapLayer(entity, activeLayer) && shouldShowMapEntity(entity));
  const nearbyCrossLayerEntities = !ignoreHeight && state.mapLayerSelection === 'auto' && radarCenterRow
    ? compatibleEntities.filter((entity) => !isRowOnMapLayer(entity, activeLayer)
      && shouldShowMapEntity(entity)
      && isEntityNearRadar(entity, radarCenterRow))
    : [];
  const query = normalizedMapSearch();
  const radarEntities = [];
  const radarKeys = new Set();
  for (const entity of [...layerEntities, ...nearbyCrossLayerEntities]) {
    const key = entity.entityId || `${entity.kind || 'entity'}|${entity.name || ''}|${Number(entity.x).toFixed(2)}|${Number(entity.z).toFixed(2)}|${Number(entity.y).toFixed(2)}`;
    if (radarKeys.has(key)) continue;
    radarKeys.add(key);
    if (isEntityNearRadar(entity, radarCenterRow)) radarEntities.push(entity);
  }
  const visibleEntities = query && state.mapSearchOnly ? radarEntities.filter((entity) => matchesMapSearch(entity, query)) : radarEntities;
  const canvasRows = compatibleLatest ? (state.mapFollow ? compatibleTrail : [compatibleLatest]) : [];
  state.mapVisibleEntities = visibleEntities;
  state.mapCanvasRows = canvasRows;
  els.mapCount.textContent = `${compatibleTrail.length} point${compatibleTrail.length === 1 ? '' : 's'} / ${visibleEntities.length} marker${visibleEntities.length === 1 ? '' : 's'}`;
  renderPriorityMobs(visibleEntities);
  renderMapEntityList(visibleEntities);
  if (!compatibleLatest) {
    els.mapActor.textContent = '-';
    els.mapX.textContent = '-';
    els.mapY.textContent = '-';
    els.mapZ.textContent = '-';
    els.mapUpdated.textContent = compatibleEntities.length ? `Entity context ${formatTime(compatibleEntities[0].observedAt)}` : 'Waiting';
    await renderMapCanvas(canvasRows, visibleEntities);
    renderPositionList([]);
  } else {
    els.mapActor.textContent = compatibleLatest.source || compatibleLatest.entityId || '-';
    els.mapX.textContent = formatCoord(compatibleLatest.x);
    els.mapY.textContent = formatCoord(compatibleLatest.y);
    els.mapZ.textContent = formatCoord(compatibleLatest.z);
    els.mapUpdated.textContent = `Updated ${formatTime(compatibleLatest.observedAt)}`;
    els.shalazamLink.href = shalazamUrl(compatibleLatest);
    await renderMapCanvas(canvasRows, visibleEntities);
    renderPositionList(compatibleTrail);
  }
  const suffix = state.displaySince ? ` since ${formatTime(state.displaySince)}` : '';
  const zoneName = state.mapSelection === 'auto' && state.mapState?.zoneName ? ` (${state.mapState.zoneName})` : '';
  const mapName = state.mapConfig?.name ? ` on ${state.mapConfig.name}${zoneName}` : '';
  const latestAt = compatibleLatest?.observedAt || compatibleEntities[0]?.observedAt || state.mapState?.observedAt;
  els.status.textContent = `Map data through ${formatTime(latestAt)}${mapName}${suffix}`;
}

async function refreshMapEntities(force = false) {
  if (state.mapEntityRefreshInFlight) return;
  if (!force && Date.now() - Number(state.mapEntitiesFetchedAt || 0) < MAP_ENTITY_REFRESH_MS) return;
  state.mapEntityRefreshInFlight = true;
  try {
    const entityParams = recentMapParams({ limit: '500' }, 10 * 60_000);
    const entityData = await fetchJson(`/api/map/entities?${entityParams}`);
    state.mapEntities = entityData.rows || [];
    state.mapEntitiesFetchedAt = Date.now();
  } catch (error) {
    console.warn(error);
  } finally {
    state.mapEntityRefreshInFlight = false;
  }
}

async function refreshParser() {
  const params = displayParams({ window: String(state.windowSeconds) });
  const data = await fetchJson(`/api/parser/summary?${params}`);
  state.parserData = data;
  renderParserMetrics(data);
  renderCombatants(data);
  await loadBreakdown();
  renderParserEvents(data);
  const suffix = state.displaySince ? ` since ${formatTime(state.displaySince)}` : '';
  els.status.textContent = data.lastSeen ? `Parser data through ${formatTime(data.lastSeen)}${suffix}` : `Waiting for parser data${suffix}`;
}

async function refreshHealing() {
  const params = displayParams({ window: String(state.windowSeconds) });
  const data = await fetchJson(`/api/healing/summary?${params}`);
  state.healingData = data;
  renderHealingMetrics(data);
  renderHealingCombatants(data);
  renderHealingBreakdown();
  renderRecentEventList(els.healingEvents, data.recentEvents || [], 'No recent healing events.');
  const suffix = state.displaySince ? ` since ${formatTime(state.displaySince)}` : '';
  els.status.textContent = data.lastSeen ? `Healing data through ${formatTime(data.lastSeen)}${suffix}` : `Waiting for healing data${suffix}`;
}

function renderXpProgress(data) {
  const latest = data?.latest;
  const percent = latest?.progressPercent ?? 0;
  els.xpProgress.textContent = `${Number(percent || 0).toFixed(2)}%`;
  els.xpCurrent.textContent = latest?.currentXp === null || latest?.currentXp === undefined ? '-' : formatNumber(latest.currentXp);
  els.xpRemaining.textContent = latest?.remainingXp === null || latest?.remainingXp === undefined ? '-' : formatNumber(latest.remainingXp);
  els.xpRate.textContent = formatRate(data?.totals?.xpPerHour || 0);
  els.xpUpdated.textContent = latest?.observedAt ? `Updated ${formatTime(latest.observedAt)}` : 'Waiting';
  els.xpProgressFill.style.width = `${Math.max(0, Math.min(100, Number(percent || 0)))}%`;
  if (!latest) {
    els.xpProgressLabel.textContent = 'Waiting for XP data';
    els.xpProgressSubtitle.textContent = 'No gains recorded yet.';
    return;
  }
  els.xpProgressLabel.textContent = `${formatNumber(latest.currentXp)} / ${formatNumber(latest.toNextLevel)} XP`;
  els.xpProgressSubtitle.textContent = `${formatNumber(latest.remainingXp)} XP remaining / last gain +${formatNumber(latest.deltaXp)}`;
}

function renderXpTargets(rows = []) {
  els.xpTargetCount.textContent = `${rows.length} target${rows.length === 1 ? '' : 's'}`;
  if (!rows.length) {
    els.xpTargetList.innerHTML = '<div class="empty">Waiting for XP data...</div>';
    return;
  }
  const max = Math.max(1, ...rows.map((row) => Number(row.xp || 0)));
  els.xpTargetList.replaceChildren(...rows.slice(0, 20).map((row) => {
    const item = document.createElement('div');
    item.className = 'xp-target-row';
    item.style.setProperty('--bar-width', `${Math.max(4, (Number(row.xp || 0) / max) * 100)}%`);
    item.innerHTML = `
      <span class="xp-target-main">
        <strong>${escapeHtml(row.target)}</strong>
        <span>${row.targetLevel ? `Level ${formatNumber(row.targetLevel)}` : 'Level unknown'} / ${formatNumber(row.events)} gain${row.events === 1 ? '' : 's'}</span>
      </span>
      <span class="xp-target-stat">
        <strong>${formatNumber(row.xp)}</strong>
        <span>${formatNumber(row.averageXp)} avg</span>
      </span>
    `;
    return item;
  }));
}

function renderXpEvents(rows = []) {
  els.xpEventCount.textContent = `${rows.length} gain${rows.length === 1 ? '' : 's'}`;
  if (!rows.length) {
    els.xpEvents.innerHTML = '<tr><td colspan="6" class="empty">Waiting for XP data...</td></tr>';
    return;
  }
  els.xpEvents.replaceChildren(...rows.slice(0, 80).map((row) => {
    const tr = document.createElement('tr');
    const levelText = [
      row.playerLevel ? `P${formatNumber(row.playerLevel)}` : null,
      row.targetLevel ? `M${formatNumber(row.targetLevel)}` : null
    ].filter(Boolean).join(' / ') || '-';
    tr.innerHTML = `
      <td>${formatTime(row.observedAt)}</td>
      <td>${escapeHtml(row.source || '-')}</td>
      <td>${escapeHtml(row.target || 'Unknown')}</td>
      <td class="number">+${formatNumber(row.deltaXp)}</td>
      <td class="number">${row.progressPercent === null || row.progressPercent === undefined ? '-' : `${Number(row.progressPercent).toFixed(2)}%`}</td>
      <td class="number">${escapeHtml(levelText)}</td>
    `;
    return tr;
  }));
}

async function refreshXp() {
  const params = displayParams({ window: String(state.windowSeconds) });
  const data = await fetchJson(`/api/xp/summary?${params}`);
  state.xpData = data;
  renderXpProgress(data);
  renderXpTargets(data.targets || []);
  renderXpEvents(data.rows || []);
  const suffix = state.displaySince ? ` since ${formatTime(state.displaySince)}` : '';
  els.status.textContent = data.lastSeen ? `XP data through ${formatTime(data.lastSeen)}${suffix}` : `Waiting for XP data${suffix}`;
}

function renderEncounterMetrics(selected) {
  const totals = selected?.totals || {};
  els.encounterTotalDamage.textContent = formatNumber(totals.damage || 0);
  els.encounterEnemyDamage.textContent = formatNumber(totals.enemyDamage || 0);
  els.encounterTotalHealing.textContent = formatNumber(totals.healing || 0);
  els.encounterDuration.textContent = formatDuration(selected?.durationSeconds || 0);
}

function renderEncounterList(rows = []) {
  els.encounterCount.textContent = `${rows.length} fight${rows.length === 1 ? '' : 's'}`;
  if (!rows.length) {
    els.encounterList.innerHTML = '<div class="empty">Waiting for encounter damage...</div>';
    return;
  }
  const maxDamage = Math.max(1, ...rows.map((row) => Number(row.damage || 0)));
  els.encounterList.replaceChildren(...rows.map((row) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `encounter-row${row.id === state.selectedEncounterId ? ' selected' : ''}`;
    button.style.setProperty('--bar-width', `${Math.max(3, (Number(row.damage || 0) / maxDamage) * 100)}%`);
    button.dataset.encounterId = row.id;
    button.innerHTML = `
      <span class="encounter-row-main">
        <strong>${escapeHtml(row.target)}</strong>
        <span>${formatDuration(row.durationSeconds)} / ${formatTime(row.lastSeen)}</span>
      </span>
      <span class="encounter-row-stat">
        <strong>${formatNumber(row.damage)}</strong>
        <span>${formatRate(row.dps)} DPS</span>
      </span>
    `;
    button.addEventListener('click', async () => {
      state.selectedEncounterId = row.id;
      await refreshEncounters();
    });
    return button;
  }));
}

function encounterBarRows(title, rows = [], valueKey = 'total', labelFields = ['source'], emptyText = 'No rows yet.') {
  const max = Math.max(1, ...rows.map((row) => Number(row[valueKey] || 0)));
  const body = rows.length
    ? rows.slice(0, 12).map((row) => {
      const label = labelFields.map((field) => row[field]).filter(Boolean).join(' / ') || 'Unknown';
      const value = Number(row[valueKey] || 0);
      return `
        <div class="report-bar-row">
          <span class="report-bar-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
          <span class="report-bar-track"><span style="width:${Math.max(2, (value / max) * 100)}%"></span></span>
          <span class="report-bar-value">${formatNumber(value)}</span>
        </div>
      `;
    }).join('')
    : `<div class="empty">${escapeHtml(emptyText)}</div>`;
  return `
    <section class="report-section">
      <h3>${escapeHtml(title)}</h3>
      <div class="report-bars">${body}</div>
    </section>
  `;
}

function renderEncounterTimeline(rows = []) {
  if (!rows.length) return '<div class="empty">No timeline data yet.</div>';
  return `
    <div class="encounter-timeline">
      ${rows.map((row) => `
        <div class="timeline-bucket" title="+${row.startOffsetSeconds}s: ${formatNumber(row.damageDone)} damage, ${formatNumber(row.damageTaken)} taken, ${formatNumber(row.healing)} healing">
          <span class="timeline-damage" style="height:${Math.max(2, row.damageDonePercent)}%"></span>
          <span class="timeline-taken" style="height:${Math.max(2, row.damageTakenPercent)}%"></span>
          <span class="timeline-healing" style="height:${Math.max(2, row.healingPercent)}%"></span>
        </div>
      `).join('')}
    </div>
    <div class="timeline-legend">
      <span><i class="legend-damage"></i>Damage</span>
      <span><i class="legend-taken"></i>Taken</span>
      <span><i class="legend-healing"></i>Healing</span>
    </div>
  `;
}

function renderEncounterEvents(rows = []) {
  if (!rows.length) return '<div class="empty">No encounter events.</div>';
  return rows.slice(0, 18).map((row) => `
    <div class="encounter-event-line">
      <span>${formatTime(row.observedAt)}</span>
      <span>${escapeHtml(row.eventType)}</span>
      <span title="${escapeHtml(row.rawText)}">${escapeHtml(row.rawText)}</span>
      <span>${row.amount ? formatNumber(row.amount) : ''}</span>
    </div>
  `).join('');
}

function renderEncounterReport(selected) {
  if (!selected) {
    els.encounterTitle.textContent = 'Encounter Report';
    els.encounterSubtitle.textContent = 'Select a fight';
    els.encounterReport.innerHTML = '<div class="empty">No encounter selected.</div>';
    renderEncounterMetrics(null);
    return;
  }
  const totals = selected.totals || {};
  els.encounterTitle.textContent = selected.target;
  els.encounterSubtitle.textContent = `${formatTime(selected.firstSeen)} - ${formatTime(selected.lastSeen)} / ${formatRate(totals.dps)} DPS / ${formatRate(totals.hps)} HPS`;
  renderEncounterMetrics(selected);
  els.encounterReport.innerHTML = `
    <section class="report-summary">
      <div><span>Hits</span><strong>${formatNumber(totals.hits)}</strong></div>
      <div><span>Enemy Hits</span><strong>${formatNumber(totals.enemyHits)}</strong></div>
      <div><span>Mitigated</span><strong>${formatNumber(totals.mitigated)}</strong></div>
      <div><span>Resists/Misses</span><strong>${formatNumber(totals.resists)}</strong></div>
    </section>
    <section class="report-section report-section-wide">
      <h3>Timeline</h3>
      ${renderEncounterTimeline(selected.timeline || [])}
    </section>
    <section class="report-grid">
      ${encounterBarRows('Damage By Source', selected.damageBySource || [], 'total', ['source'])}
      ${encounterBarRows('Damage By Ability', selected.damageByAbility || [], 'total', ['ability'])}
      ${encounterBarRows('Enemy Abilities', selected.enemyDamageByAbility || [], 'total', ['ability'], 'No enemy damage found.')}
      ${encounterBarRows('Healing By Source', selected.healingBySource || [], 'total', ['source'], 'No healing found in this window.')}
      ${encounterBarRows('Resists And Misses', selected.resistedAbilities || [], 'events', ['source', 'ability', 'eventType'], 'No resists or misses found.')}
      ${encounterBarRows('Enemy Damage Targets', selected.enemyDamageByTarget || [], 'total', ['target'], 'No enemy targets found.')}
    </section>
    <section class="report-section report-section-wide">
      <h3>Event Log</h3>
      <div class="encounter-events">${renderEncounterEvents(selected.recentEvents || [])}</div>
    </section>
  `;
}

async function refreshEncounters() {
  const params = displayParams({ window: String(state.windowSeconds) });
  if (state.selectedEncounterId) params.set('id', state.selectedEncounterId);
  const data = await fetchJson(`/api/encounters?${params}`);
  state.encounterData = data;
  const rows = data.rows || [];
  if (state.selectedEncounterId && !rows.some((row) => row.id === state.selectedEncounterId)) {
    state.selectedEncounterId = data.selected?.id || rows[0]?.id || null;
  }
  if (!state.selectedEncounterId) state.selectedEncounterId = data.selected?.id || rows[0]?.id || null;
  renderEncounterList(rows);
  renderEncounterReport(data.selected || null);
  const suffix = state.displaySince ? ` since ${formatTime(state.displaySince)}` : '';
  els.status.textContent = data.selected ? `Encounter data through ${formatTime(data.selected.lastSeen)}${suffix}` : `Waiting for encounter data${suffix}`;
}

function rarityClass(rarity) {
  return `rarity-${String(rarity || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function renderLootMetrics(data) {
  const totals = data?.totals || {};
  els.lootItemCount.textContent = formatNumber(totals.items || 0);
  els.lootInstanceCount.textContent = formatNumber(totals.instances || 0);
  els.lootRareCount.textContent = formatNumber(totals.rareItems || 0);
  els.lootTotalValue.textContent = formatNumber(totals.totalValue || 0);
  els.lootUpdated.textContent = totals.lastEventAt ? `Updated ${formatTime(totals.lastEventAt)}` : 'Waiting';
}

function updateLootFilterOptions(data) {
  if (!els.lootRarityFilter || !els.lootTypeFilter) return;
  const rarityValue = els.lootRarityFilter.value;
  const typeValue = els.lootTypeFilter.value;
  const classValue = els.lootClassFilter?.value || '';
  const slotValue = els.lootSlotFilter?.value || '';
  els.lootRarityFilter.replaceChildren(
    new Option('All rarities', ''),
    ...(data.rarities || []).map((row) => new Option(`${row.rarity} (${row.count})`, row.rarity))
  );
  els.lootTypeFilter.replaceChildren(
    new Option('All types', ''),
    ...(data.types || []).map((row) => new Option(`${row.itemType} (${row.count})`, row.itemType))
  );
  if (els.lootClassFilter) {
    els.lootClassFilter.replaceChildren(
      new Option('All classes', ''),
      ...(data.classNames || []).map((row) => new Option(`${row.name} (${row.count})`, row.name))
    );
  }
  if (els.lootSlotFilter) {
    els.lootSlotFilter.replaceChildren(
      new Option('All slots', ''),
      ...(data.slots || []).map((row) => new Option(`${row.slot} (${row.count})`, row.slot))
    );
  }
  els.lootRarityFilter.value = [...els.lootRarityFilter.options].some((option) => option.value === rarityValue) ? rarityValue : '';
  els.lootTypeFilter.value = [...els.lootTypeFilter.options].some((option) => option.value === typeValue) ? typeValue : '';
  if (els.lootClassFilter) els.lootClassFilter.value = [...els.lootClassFilter.options].some((option) => option.value === classValue) ? classValue : '';
  if (els.lootSlotFilter) els.lootSlotFilter.value = [...els.lootSlotFilter.options].some((option) => option.value === slotValue) ? slotValue : '';
}

function renderLootList(rows = []) {
  if (!rows.length) {
    state.selectedLootItemId = null;
    els.lootList.innerHTML = '<div class="empty">No matching items.</div>';
    renderLootDetail(null);
    return;
  }
  if (!state.selectedLootItemId || !rows.some((row) => row.itemId === state.selectedLootItemId)) {
    state.selectedLootItemId = rows[0].itemId;
  }
  els.lootList.replaceChildren(...rows.map((row) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `loot-row ${rarityClass(row.rarity)}${row.itemId === state.selectedLootItemId ? ' selected' : ''}`;
    button.dataset.itemId = row.itemId;
    const flags = (row.flags || []).slice(0, 3).join(', ');
    const typeLine = [row.rarity, row.equipSlotName || row.displaySubtype || row.itemType, row.requiredLevel ? `Req ${row.requiredLevel}` : ''].filter(Boolean).join(' / ');
    const sideLabel = row.itemType === 'Weapon' && row.weaponDps ? `${formatRate(row.weaponDps)} DPS` : row.armorValue ? `${formatNumber(row.armorValue)} Armor` : flags || 'seen';
    button.innerHTML = `
      <span class="loot-row-icon">${escapeHtml(String(row.iconKey || row.itemType || '?').slice(0, 2).toUpperCase())}</span>
      <span class="loot-row-main">
        <strong>${escapeHtml(row.name)}</strong>
        <span>${escapeHtml(typeLine)}</span>
      </span>
      <span class="loot-row-side">
        <strong>${formatNumber(row.instanceCount || 0)}</strong>
        <span>${escapeHtml(sideLabel)}</span>
      </span>
    `;
    button.addEventListener('click', async () => {
      state.selectedLootItemId = row.itemId;
      renderLootList(state.lootData?.rows || []);
      await loadLootDetail(row.itemId);
    });
    return button;
  }));
}

function itemStatLines(item) {
  const lines = [];
  const stats = item.stats || {};
  const statLabel = (value) => String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/Resistance$/, ' Resistance')
    .replace(/\s+/g, ' ')
    .trim();
  const statModifiers = Array.isArray(stats.statModifiers) ? stats.statModifiers : [];
  const statValue = (name) => {
    const row = statModifiers.find((stat) => String(stat.stat || stat.name || stat.Stat || stat.Name || stat.StatName || stat.statName || '').toLowerCase() === String(name).toLowerCase());
    const value = row ? row.value ?? row.Value ?? row.amount ?? row.Amount ?? row.modifier ?? row.Modifier : null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const armorValue = statValue('Armor');
  if (item.maxDamage) lines.push(`${formatNumber(item.maxDamage)} ${item.template?.damageTypeName || 'Physical'} Damage`);
  if (item.maxDamage && item.delay) lines.push(`${formatRate(Number(item.maxDamage) / Number(item.delay))} DPS`);
  if (item.itemType === 'Armor' && armorValue !== null) lines.push(`${formatNumber(armorValue)} Armor`);
  else if (item.itemType === 'Armor' && Number.isFinite(Number(item.template?.armorModifier))) lines.push(`${formatNumber(item.template.armorModifier)} Armor`);
  for (const stat of statModifiers) {
    const name = stat.stat || stat.name || stat.Stat || stat.Name || stat.StatName || stat.statName || stat.displayName || stat.DisplayName;
    const value = stat.value ?? stat.Value ?? stat.amount ?? stat.Amount ?? stat.modifier ?? stat.Modifier;
    if (!name || value === undefined || value === null) continue;
    if (item.itemType === 'Armor' && String(name).toLowerCase() === 'armor') continue;
    const critMatch = String(name).match(/^(Physical|Spell|Healing)?CritRating$/i);
    if (critMatch) {
      const critType = critMatch[1] ? `${critMatch[1]} ` : '';
      lines.push(`${Number(value) > 0 ? '+' : ''}${formatNumber(Number(value) / 10)}% ${critType}Crit Bonus`);
      continue;
    }
    lines.push(`${Number(value) > 0 ? '+' : ''}${value} ${statLabel(name)}`);
  }
  const multiplierModifiers = Array.isArray(stats.multiplierModifiers) ? stats.multiplierModifiers : [];
  for (const modifier of multiplierModifiers) {
    const name = modifier.stat || modifier.name || modifier.Stat || modifier.Name || modifier.StatName || modifier.statName || modifier.displayName || modifier.DisplayName;
    const value = modifier.value ?? modifier.Value ?? modifier.amount ?? modifier.Amount ?? modifier.multiplier ?? modifier.Multiplier;
    if (name && value !== undefined && value !== null) lines.push(`${Number(value) > 0 ? '+' : ''}${value} ${statLabel(name)}`);
  }
  if (item.requiredLevel) lines.push(`Requires Level ${item.requiredLevel}`);
  if (item.requiredProficiency) lines.push(`Requires ${item.requiredProficiency} proficiency`);
  else if (item.primarySkill) lines.push(`Requires ${item.primarySkill} proficiency`);
  return lines;
}

function itemEquipSlotLabel(item) {
  const explicit = item.equipSlotName || item.template?.slotName || item.template?.equipSlot || item.template?.equipSlotName || item.template?.allowedLocationName;
  if (explicit && !String(explicit).startsWith('Il2Cpp') && explicit !== '0') return String(explicit);
  const equipped = (item.instances || []).find((instance) => instance.slotType === 'Equipped' && Number.isFinite(Number(instance.slotIndex)));
  const slotIndex = Number(equipped?.slotIndex);
  const slots = new Map([
    [0, 'Head'],
    [1, 'Neck'],
    [2, 'Shoulders'],
    [3, 'Back'],
    [4, 'Chest'],
    [5, 'Wrist'],
    [6, 'Chest'],
    [7, 'Hands'],
    [8, 'Waist'],
    [9, 'Legs'],
    [10, 'Feet'],
    [11, 'Ring'],
    [12, 'Ring'],
    [13, 'Trinket'],
    [14, 'Trinket'],
    [15, 'Ammo'],
    [16, 'Off Hand'],
    [17, 'Main Hand']
  ]);
  return slots.get(slotIndex) || '';
}

function itemArmorFamily(value) {
  const text = String(value || '').replace(/^(Light|Medium|Heavy)/, '').trim();
  return text && text !== 'Plate' ? text : String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2');
}

function itemClassLine(item) {
  const explicit = item.classRequirementNames || item.template?.classRequirementNames || item.template?.allowedClassNames || item.template?.classNames || item.template?.allowedClassesText || item.template?.classes;
  if (Array.isArray(explicit) && explicit.length) return `Class: ${explicit.join(', ')}`;
  if (explicit && explicit !== '0' && !String(explicit).startsWith('Il2Cpp')) return `Class: ${explicit}`;
  return '';
}

function itemRequirementLines(item) {
  const requirements = Array.isArray(item?.stats?.requirementOverrides) ? item.stats.requirementOverrides : [];
  return requirements.map((requirement) => {
    const name = requirement.requirement || requirement.Requirement || requirement.name || requirement.Name || requirement.type || requirement.Type;
    const value = requirement.value || requirement.Value || requirement.displayValue || requirement.DisplayValue || requirement.text || requirement.Text;
    if (name && value) return `${name}: ${value}`;
    if (value) return String(value);
    return '';
  }).filter(Boolean);
}

function renderLootDetail(item) {
  if (!item) {
    els.lootDetailTitle.textContent = 'Item Detail';
    els.lootDetailSubtitle.textContent = 'Select an item';
    els.lootDetail.innerHTML = '<div class="empty">No item selected.</div>';
    return;
  }
  els.lootDetailTitle.textContent = item.name;
  els.lootDetailSubtitle.textContent = `${item.rarity || 'Unknown'} / ${item.itemType || 'Unknown'}`;
  const flags = item.flags || [];
  const statLines = itemStatLines(item);
  const requirementLines = itemRequirementLines(item);
  const classLine = itemClassLine(item);
  if (classLine && !requirementLines.includes(classLine)) requirementLines.unshift(classLine);
  const description = item.template?.itemDescription || '';
  const locationLine = itemEquipSlotLabel(item) || item.displaySubtype || item.itemType || '';
  const typeLine = item.itemType === 'Weapon'
    ? [item.rarity, item.weaponType, 'Weapon'].filter(Boolean).join(' ')
    : [item.rarity, itemArmorFamily(item.armorTypeName || item.displaySubtype) || item.itemType].filter(Boolean).join(' ');
  const headerMeta = item.itemType === 'Weapon' && item.delay
    ? `${item.weaponType || item.equipSlotName || 'Weapon'} Weapon\n${formatNumber(item.delay)} Delay`
    : locationLine;
  const lootEventSourceLine = (event) => {
    const acquisition = event.acquisition || {};
    const source = acquisition.source?.name || event.source || event.character || '';
    const bits = [
      source,
      acquisition.method ? acquisition.method.replace(/_/g, ' ') : null,
      acquisition.confidence ? `${acquisition.confidence} confidence` : null
    ].filter(Boolean);
    return bits.join(' / ');
  };
  els.lootDetail.innerHTML = `
    <article class="item-tooltip ${rarityClass(item.rarity)}">
      <header class="item-tooltip-head">
        <h3>${escapeHtml(item.name)}</h3>
        <span>${escapeHtml(headerMeta)}</span>
      </header>
      <div class="item-flags">${flags.map((flag) => `<span>${escapeHtml(flag)}</span>`).join('')}</div>
      <div class="item-type-line">${escapeHtml(typeLine)}</div>
      <div class="item-stat-lines">
        ${statLines.length ? statLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('') : ''}
        ${requirementLines.length ? requirementLines.map((line) => `<div class="item-requirement-line">${escapeHtml(line)}</div>`).join('') : ''}
        ${Array.isArray(item.stats?.statModifiers) && item.stats.statModifiers.length ? '' : '<div class="muted-line">No attribute/resistance stats exported yet.</div>'}
      </div>
      ${description ? `<p class="item-description">${escapeHtml(description)}</p>` : ''}
      <footer class="item-tooltip-foot">
        <span>Value: ${formatNumber(item.coinValue || 0)}</span>
        <span>Weight: ${item.weight ?? '-'}</span>
      </footer>
    </article>
    <section class="loot-detail-section">
      <h3>Inventory Instances</h3>
      <div class="loot-instance-list">
        ${(item.instances || []).length ? item.instances.map((instance) => `
          <div class="loot-instance-line">
            <span>${escapeHtml(instance.character || '-')}</span>
            <span>${escapeHtml(instance.slotType || '-')} ${instance.slotIndex ?? ''}</span>
            <span>${formatTime(instance.lastSeen)}</span>
          </div>
        `).join('') : '<div class="empty">No instances recorded.</div>'}
      </div>
    </section>
    <section class="loot-detail-section">
      <h3>Recent Loot Events</h3>
      <div class="loot-instance-list">
        ${(item.events || []).length ? item.events.map((event) => `
          <div class="loot-instance-line">
            <span>${formatTime(event.observedAt)}</span>
            <span>${escapeHtml(event.eventType)}</span>
            <span>${escapeHtml(lootEventSourceLine(event))}</span>
          </div>
        `).join('') : '<div class="empty">No item events recorded.</div>'}
      </div>
    </section>
  `;
}

async function loadLootDetail(itemId = state.selectedLootItemId) {
  if (!itemId) {
    renderLootDetail(null);
    return;
  }
  const detail = await fetchJson(`/api/loot/item?itemId=${encodeURIComponent(itemId)}`);
  renderLootDetail(detail);
}

async function refreshLoot() {
  const params = new URLSearchParams({ limit: '160' });
  if (state.lootSearch) params.set('search', state.lootSearch);
  if (state.lootRarity) params.set('rarity', state.lootRarity);
  if (state.lootType) params.set('type', state.lootType);
  if (state.lootClass) params.set('class', state.lootClass);
  if (state.lootSlot) params.set('slot', state.lootSlot);
  if (state.lootMaxLevel) params.set('maxLevel', state.lootMaxLevel);
  if (state.lootSort && state.lootSort !== 'lastSeen') params.set('sort', state.lootSort);
  const data = await fetchJson(`/api/loot/summary?${params}`);
  state.lootData = data;
  renderLootMetrics(data);
  updateLootFilterOptions(data);
  renderLootList(data.rows || []);
  await loadLootDetail();
  els.status.textContent = data.totals.lastEventAt ? `Loot data through ${formatTime(data.totals.lastEventAt)}` : 'Waiting for loot data';
}

async function refreshDiagnostics() {
  const params = displayParams();
  const unresolvedParams = displayParams({ window: String(state.windowSeconds) });
  const [status, unresolved] = await Promise.all([
    fetchJson(`/api/status?${params}`),
    fetchJson(`/api/actors/unresolved?${unresolvedParams}`)
  ]);
  const recent = await fetchJson(`/api/recent?${params}`);
  const totals = status.summary.totals || {};
  els.eventCount.textContent = formatNumber(totals.events);
  els.actorCount.textContent = formatNumber(totals.actors);
  els.lastEvent.textContent = formatTime(totals.lastEventAt);
  renderCommunitySync(status.communityItems || {});
  renderNetworkRows(els.events, recent.events || [], (row) => rowCard(`#${row.id} ${row.eventType}`, `${formatTime(row.observedAt)} ${row.amount || ''}`, row.rawText));
  renderUnresolvedActors(unresolved.rows || []);
}

async function refresh() {
  if (state.refreshInFlight) {
    state.refreshQueued = true;
    return;
  }
  state.refreshInFlight = true;
  try {
    do {
      state.refreshQueued = false;
      try {
        els.status.classList.remove('error');
        if (state.tab === 'parser') await refreshParser();
        else if (state.tab === 'healing') await refreshHealing();
        else if (state.tab === 'xp') await refreshXp();
        else if (state.tab === 'encounters') await refreshEncounters();
        else if (state.tab === 'loot') await refreshLoot();
        else if (state.tab === 'map') await refreshMap();
        else await refreshDiagnostics();
      } catch (error) {
        els.status.textContent = `Dashboard error: ${error.message}`;
        els.status.classList.add('error');
      }
    } while (state.refreshQueued);
  } finally {
    state.refreshInFlight = false;
  }
}

document.querySelectorAll('.tab-button').forEach((button) => {
  button.addEventListener('click', async () => {
    document.querySelectorAll('.tab-button').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    state.tab = button.dataset.tab;
    document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === `${state.tab}-view`));
    await refresh();
  });
});

document.querySelectorAll('.map-axis-button').forEach((button) => {
  button.classList.toggle('active', button.dataset.axis === state.mapAxis);
  button.addEventListener('click', async () => {
    state.mapAxis = button.dataset.axis;
    window.localStorage.setItem('pantheonParser2.mapAxis', state.mapAxis);
    renderAxisButtons();
    if (state.tab === 'map') await refreshMap();
  });
});

if (els.mapSelect) {
  els.mapSelect.value = state.mapSelection;
  els.mapSelect.addEventListener('change', async () => {
    state.mapSelection = els.mapSelect.value || 'auto';
    window.localStorage.setItem('pantheonParser2.mapSelection', state.mapSelection);
    state.mapConfig = chooseMapConfig();
    renderZoomControls();
    if (state.tab === 'map') await refreshMap();
  });
}

if (els.lootSearch) {
  els.lootSearch.addEventListener('input', async () => {
    state.lootSearch = els.lootSearch.value.trim();
    state.selectedLootItemId = null;
    if (state.tab === 'loot') await refreshLoot();
  });
}

if (els.lootRarityFilter) {
  els.lootRarityFilter.addEventListener('change', async () => {
    state.lootRarity = els.lootRarityFilter.value;
    state.selectedLootItemId = null;
    if (state.tab === 'loot') await refreshLoot();
  });
}

if (els.lootTypeFilter) {
  els.lootTypeFilter.addEventListener('change', async () => {
    state.lootType = els.lootTypeFilter.value;
    state.selectedLootItemId = null;
    if (state.tab === 'loot') await refreshLoot();
  });
}
if (els.lootClassFilter) {
  els.lootClassFilter.addEventListener('change', async () => {
    state.lootClass = els.lootClassFilter.value;
    state.selectedLootItemId = null;
    if (state.tab === 'loot') await refreshLoot();
  });
}
if (els.lootSlotFilter) {
  els.lootSlotFilter.addEventListener('change', async () => {
    state.lootSlot = els.lootSlotFilter.value;
    state.selectedLootItemId = null;
    if (state.tab === 'loot') await refreshLoot();
  });
}
if (els.lootLevelFilter) {
  els.lootLevelFilter.addEventListener('input', async () => {
    state.lootMaxLevel = els.lootLevelFilter.value.trim();
    state.selectedLootItemId = null;
    if (state.tab === 'loot') await refreshLoot();
  });
}
if (els.lootSortFilter) {
  els.lootSortFilter.addEventListener('change', async () => {
    state.lootSort = els.lootSortFilter.value || 'lastSeen';
    state.selectedLootItemId = null;
    if (state.tab === 'loot') await refreshLoot();
  });
}

async function updateCommunitySyncConfig(patch) {
  const result = await postJson('/api/community-items/config', patch);
  renderCommunitySync(result.status || {});
}

if (els.communitySyncEnabled) {
  els.communitySyncEnabled.addEventListener('change', async () => {
    try {
      await updateCommunitySyncConfig({
        enabled: els.communitySyncEnabled.checked,
        downloadEnabled: els.communitySyncDownload ? els.communitySyncDownload.checked : true,
        uploadEnabled: els.communitySyncUpload.checked,
        uploadMode: els.communitySyncMode.value
      });
    } catch (error) {
      els.status.textContent = `Community sync error: ${error.message}`;
      els.status.classList.add('error');
    }
  });
}

if (els.communitySyncDownload) {
  els.communitySyncDownload.addEventListener('change', async () => {
    try {
      await updateCommunitySyncConfig({
        enabled: els.communitySyncEnabled.checked,
        downloadEnabled: els.communitySyncDownload.checked,
        uploadEnabled: els.communitySyncUpload.checked,
        uploadMode: els.communitySyncMode.value
      });
    } catch (error) {
      els.status.textContent = `Community sync error: ${error.message}`;
      els.status.classList.add('error');
    }
  });
}

if (els.communitySyncUpload) {
  els.communitySyncUpload.addEventListener('change', async () => {
    try {
      await updateCommunitySyncConfig({
        enabled: els.communitySyncEnabled.checked,
        downloadEnabled: els.communitySyncDownload ? els.communitySyncDownload.checked : true,
        uploadEnabled: els.communitySyncUpload.checked,
        uploadMode: els.communitySyncMode.value
      });
    } catch (error) {
      els.status.textContent = `Community sync error: ${error.message}`;
      els.status.classList.add('error');
    }
  });
}

if (els.communitySyncMode) {
  els.communitySyncMode.addEventListener('change', async () => {
    try {
      await updateCommunitySyncConfig({
        enabled: els.communitySyncEnabled.checked,
        downloadEnabled: els.communitySyncDownload ? els.communitySyncDownload.checked : true,
        uploadEnabled: els.communitySyncUpload.checked,
        uploadMode: els.communitySyncMode.value
      });
    } catch (error) {
      els.status.textContent = `Community sync error: ${error.message}`;
      els.status.classList.add('error');
    }
  });
}

if (els.communitySyncSaveKeys) {
  els.communitySyncSaveKeys.addEventListener('click', async () => {
    try {
      const accessKeyId = els.communitySyncAccessKey.value.trim();
      const secretAccessKey = els.communitySyncSecretKey.value.trim();
      if (!accessKeyId || !secretAccessKey) throw new Error('Both R2 key fields are required.');
      await updateCommunitySyncConfig({
        enabled: els.communitySyncEnabled.checked,
        downloadEnabled: els.communitySyncDownload ? els.communitySyncDownload.checked : true,
        uploadEnabled: els.communitySyncUpload.checked,
        uploadMode: els.communitySyncMode.value,
        r2: { accessKeyId, secretAccessKey }
      });
      els.communitySyncAccessKey.value = '';
      els.communitySyncSecretKey.value = '';
      els.status.textContent = 'R2 keys saved locally.';
      els.status.classList.remove('error');
    } catch (error) {
      els.status.textContent = `Community sync error: ${error.message}`;
      els.status.classList.add('error');
    }
  });
}

if (els.communitySyncCheck) {
  els.communitySyncCheck.addEventListener('click', async () => {
    try {
      els.communitySyncCheck.disabled = true;
      const res = await fetch('/api/community-items/download', { method: 'POST', cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const result = await res.json();
      renderCommunitySync(result.status || {});
      els.status.textContent = `Community sync imported ${formatNumber(result.imported || 0)} item updates.`;
      els.status.classList.remove('error');
      if (state.tab === 'loot') await refreshLoot();
    } catch (error) {
      els.status.textContent = `Community sync error: ${error.message}`;
      els.status.classList.add('error');
    } finally {
      els.communitySyncCheck.disabled = !els.communitySyncEnabled.checked || (els.communitySyncDownload && !els.communitySyncDownload.checked);
    }
  });
}

if (els.communitySyncNow) {
  els.communitySyncNow.addEventListener('click', async () => {
    try {
      els.communitySyncNow.disabled = true;
      const res = await fetch('/api/community-items/upload', { method: 'POST', cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const result = await res.json();
      renderCommunitySync(result.status || {});
      els.status.textContent = `Community sync uploaded ${formatNumber(result.uploaded || 0)} item changes.`;
    } catch (error) {
      els.status.textContent = `Community sync error: ${error.message}`;
      els.status.classList.add('error');
    } finally {
      els.communitySyncNow.disabled = !els.communitySyncEnabled.checked || !els.communitySyncUpload.checked;
    }
  });
}

if (els.mapLayerSelect) {
  els.mapLayerSelect.value = state.mapLayerSelection;
  els.mapLayerSelect.addEventListener('change', async () => {
    state.mapLayerSelection = els.mapLayerSelect.value || 'auto';
    window.localStorage.setItem('pantheonParser2.mapLayerSelection', state.mapLayerSelection);
    renderMapLayerSelector();
    if (state.tab === 'map') await refreshMap();
  });
}

if (els.mapCalibrationLabel) {
  els.mapCalibrationLabel.value = state.mapCalibrationLabel;
  els.mapCalibrationLabel.addEventListener('change', () => {
    state.mapCalibrationLabel = els.mapCalibrationLabel.value || 'surface-road';
    state.mapCalibrationRecordedCount = 0;
    state.mapLastCalibrationSample = null;
    window.localStorage.setItem('pantheonParser2.mapCalibrationLabel', state.mapCalibrationLabel);
    window.localStorage.setItem('pantheonParser2.mapCalibrationRecordedCount', '0');
    renderMapCalibrationControls();
  });
}

if (els.mapCalibrationToggle) {
  els.mapCalibrationToggle.addEventListener('click', () => {
    state.mapCalibrationRecording = !state.mapCalibrationRecording;
    state.mapLastCalibrationSample = null;
    if (state.mapCalibrationRecording) {
      state.mapCalibrationSession = `${state.mapCalibrationLabel}-${new Date().toISOString()}`;
      state.mapCalibrationRecordedCount = 0;
      window.localStorage.setItem('pantheonParser2.mapCalibrationSession', state.mapCalibrationSession);
      window.localStorage.setItem('pantheonParser2.mapCalibrationRecordedCount', '0');
    }
    window.localStorage.setItem('pantheonParser2.mapCalibrationRecording', String(state.mapCalibrationRecording));
    renderMapCalibrationControls();
  });
  renderMapCalibrationControls();
}

if (els.mapPlayerLevel) {
  els.mapPlayerLevel.value = state.mapPlayerLevelOverride || '';
  els.mapPlayerLevel.addEventListener('change', async () => {
    const value = Number(els.mapPlayerLevel.value);
    state.mapPlayerLevelOverride = Number.isFinite(value) && value > 0 ? Math.round(value) : null;
    window.localStorage.setItem('pantheonParser2.mapPlayerLevelOverride', state.mapPlayerLevelOverride ? String(state.mapPlayerLevelOverride) : '');
    if (state.tab === 'map') await refreshMap();
  });
  els.mapPlayerLevel.addEventListener('keydown', async (event) => {
    if (event.key !== 'Escape') return;
    els.mapPlayerLevel.value = '';
    state.mapPlayerLevelOverride = null;
    window.localStorage.removeItem('pantheonParser2.mapPlayerLevelOverride');
    if (state.tab === 'map') await refreshMap();
  });
}

async function setMapZoom(value) {
  state.mapZoom = clampMapZoom(value);
  window.localStorage.setItem('pantheonParser2.mapZoom', String(state.mapZoom));
  if (state.mapConfig?.key) window.localStorage.setItem(`pantheonParser2.mapZoom.${state.mapConfig.key}`, String(state.mapZoom));
  renderZoomControls();
  if (state.tab === 'map') await refreshMap();
}

if (els.mapZoomIn) {
  els.mapZoomIn.addEventListener('click', () => setMapZoom(state.mapZoom + 1));
}

if (els.mapZoomOut) {
  els.mapZoomOut.addEventListener('click', () => setMapZoom(state.mapZoom - 1));
}

window.addEventListener('resize', () => {
  if (state.tab === 'map') refreshMap();
});

function bindMapCheckbox(element, stateKey, storageKey) {
  if (!element) return;
  element.checked = Boolean(state[stateKey]);
  element.addEventListener('change', async () => {
    state[stateKey] = element.checked;
    window.localStorage.setItem(storageKey, String(state[stateKey]));
    hideMapTooltip();
    if (state.tab === 'map') await refreshMap();
  });
}

if (els.mapFollow) {
  els.mapFollow.checked = state.mapFollow;
  els.mapFollow.addEventListener('change', () => {
    state.mapFollow = els.mapFollow.checked;
    window.localStorage.setItem('pantheonParser2.mapShowTrail', String(state.mapFollow));
  });
}

if (els.mapIgnoreHeight) {
  els.mapIgnoreHeight.checked = state.mapIgnoreHeight;
  els.mapIgnoreHeight.addEventListener('change', async () => {
    state.mapIgnoreHeight = els.mapIgnoreHeight.checked;
    state.mapIgnoreHeightExplicit = true;
    window.localStorage.setItem('pantheonParser2.mapIgnoreHeight', String(state.mapIgnoreHeight));
    hideMapTooltip();
    if (state.tab === 'map') await refreshMap();
  });
}

if (els.mapEntitySearch) {
  els.mapEntitySearch.value = state.mapEntitySearch;
  els.mapEntitySearch.addEventListener('input', async () => {
    state.mapEntitySearch = els.mapEntitySearch.value;
    window.localStorage.setItem('pantheonParser2.mapEntitySearch', state.mapEntitySearch);
    hideMapTooltip();
    if (state.tab === 'map') await refreshMap();
  });
}

if (els.mapSearchOnly) {
  els.mapSearchOnly.checked = state.mapSearchOnly;
  els.mapSearchOnly.addEventListener('change', async () => {
    state.mapSearchOnly = els.mapSearchOnly.checked;
    window.localStorage.setItem('pantheonParser2.mapSearchOnly', String(state.mapSearchOnly));
    hideMapTooltip();
    if (state.tab === 'map') await refreshMap();
  });
}

if (els.priorityMobList) {
  els.priorityMobList.value = state.priorityMobList;
  els.priorityMobList.addEventListener('input', () => {
    state.priorityMobList = els.priorityMobList.value;
    state.prioritySeenIds.clear();
    window.localStorage.setItem('pantheonParser2.priorityMobList', state.priorityMobList);
    refreshPriorityOverlayFromCache();
  });
}

if (els.prioritySound) {
  els.prioritySound.checked = state.prioritySound;
  els.prioritySound.addEventListener('change', () => {
    state.prioritySound = els.prioritySound.checked;
    window.localStorage.setItem('pantheonParser2.prioritySound', String(state.prioritySound));
    if (state.prioritySound) ensurePriorityAudio();
  });
}

if (els.priorityTestSound) {
  els.priorityTestSound.addEventListener('click', () => {
    state.prioritySound = true;
    if (els.prioritySound) els.prioritySound.checked = true;
    window.localStorage.setItem('pantheonParser2.prioritySound', 'true');
    playPriorityAlert();
  });
}

if (els.respawnCampList) {
  els.respawnCampList.value = state.respawnCampList;
  els.respawnCampList.addEventListener('input', () => {
    state.respawnCampList = els.respawnCampList.value;
    window.localStorage.setItem('pantheonParser2.respawnCampList', state.respawnCampList);
    renderRespawnTimers();
  });
}

if (els.respawnDefaultMinutes) {
  els.respawnDefaultMinutes.value = respawnDefaultMinutes();
  els.respawnDefaultMinutes.addEventListener('change', () => {
    state.respawnDefaultMinutes = respawnDefaultMinutes();
    const nextValue = Number(els.respawnDefaultMinutes.value);
    if (Number.isFinite(nextValue) && nextValue > 0) state.respawnDefaultMinutes = Math.max(1, Math.min(240, Math.round(nextValue)));
    els.respawnDefaultMinutes.value = state.respawnDefaultMinutes;
    window.localStorage.setItem('pantheonParser2.respawnDefaultMinutes', String(state.respawnDefaultMinutes));
    renderRespawnTimers();
  });
}

if (els.respawnManualStart) {
  els.respawnManualStart.addEventListener('click', startManualRespawnTimer);
}

if (els.respawnManualName) {
  els.respawnManualName.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') startManualRespawnTimer();
  });
}

if (els.respawnClearExpired) {
  els.respawnClearExpired.addEventListener('click', clearDueRespawnTimers);
}

if (els.mapNpcs) {
  els.mapNpcs.checked = state.mapShowNpcs;
  els.mapNpcs.addEventListener('change', async () => {
    state.mapShowNpcs = els.mapNpcs.checked;
    window.localStorage.setItem('pantheonParser2.mapShowNpcs', String(state.mapShowNpcs));
    hideMapTooltip();
    if (state.tab === 'map') await refreshMap();
  });
}

if (els.mapMobs) {
  els.mapMobs.checked = state.mapShowMobs;
  els.mapMobs.addEventListener('change', async () => {
    state.mapShowMobs = els.mapMobs.checked;
    window.localStorage.setItem('pantheonParser2.mapShowMobs', String(state.mapShowMobs));
    hideMapTooltip();
    if (state.tab === 'map') await refreshMap();
  });
}

if (els.mapPlayers) {
  els.mapPlayers.checked = state.mapShowPlayers;
  els.mapPlayers.addEventListener('change', async () => {
    state.mapShowPlayers = els.mapPlayers.checked;
    window.localStorage.setItem('pantheonParser2.mapShowPlayers', String(state.mapShowPlayers));
    hideMapTooltip();
    if (state.tab === 'map') await refreshMap();
  });
}

if (els.mapNodes) {
  els.mapNodes.checked = state.mapShowNodes;
  els.mapNodes.addEventListener('change', async () => {
    state.mapShowNodes = els.mapNodes.checked;
    window.localStorage.setItem('pantheonParser2.mapShowNodes', String(state.mapShowNodes));
    hideMapTooltip();
    if (state.tab === 'map') await refreshMap();
  });
}

bindMapCheckbox(els.mapPlants, 'mapShowPlants', 'pantheonParser2.mapShowPlants');
bindMapCheckbox(els.mapTrees, 'mapShowTrees', 'pantheonParser2.mapShowTrees');
bindMapCheckbox(els.mapOre, 'mapShowOre', 'pantheonParser2.mapShowOre');
bindMapCheckbox(els.mapQuestItems, 'mapShowQuestItems', 'pantheonParser2.mapShowQuestItems');
bindMapCheckbox(els.mapChests, 'mapShowChests', 'pantheonParser2.mapShowChests');

if (els.mapLabels) {
  els.mapLabels.checked = state.mapShowLabels;
  els.mapLabels.addEventListener('change', async () => {
    state.mapShowLabels = els.mapLabels.checked;
    window.localStorage.setItem('pantheonParser2.mapShowLabels', String(state.mapShowLabels));
    hideMapTooltip();
    if (state.tab === 'map') await refreshMap();
  });
}

if (els.mapCanvas) {
  els.mapCanvas.addEventListener('mousemove', handleMapHover);
  els.mapCanvas.addEventListener('mouseleave', hideMapTooltip);
}

if (els.petMenuBackdrop) {
  els.petMenuBackdrop.addEventListener('click', closePetMenu);
}

if (els.petAssignButton) {
  els.petAssignButton.addEventListener('click', assignPetFromMenu);
}

if (els.petUnassignButton) {
  els.petUnassignButton.addEventListener('click', unassignPetFromMenu);
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closePetMenu();
});

document.querySelectorAll('.range-button').forEach((button) => {
  button.addEventListener('click', async () => {
    document.querySelectorAll('.range-button').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    state.windowSeconds = Number(button.dataset.window || 300);
    state.selectedSource = null;
    state.selectedEncounterId = null;
    state.selectedLootItemId = null;
    await refresh();
  });
});

els.resetButton.addEventListener('click', async () => {
  state.displaySince = new Date().toISOString();
  window.localStorage.setItem('pantheonParser2.displaySince', state.displaySince);
  state.selectedSource = null;
  state.selectedAbilityKey = null;
  state.selectedEncounterId = null;
  state.selectedLootItemId = null;
  await refresh();
});

async function restartParser() {
  if (!els.restartButton) return;
  els.restartButton.disabled = true;
  const originalLabel = els.restartButton.textContent;
  els.restartButton.textContent = 'Restarting...';
  try {
    const response = await fetch('/api/restart', { method: 'POST' });
    if (!response.ok) throw new Error(`Restart request failed: ${response.status}`);
    setTimeout(() => window.location.reload(), 2500);
  } catch (error) {
    console.error(error);
    els.restartButton.textContent = 'Restart failed';
    setTimeout(() => {
      els.restartButton.textContent = originalLabel;
      els.restartButton.disabled = false;
    }, 2000);
    return;
  }
}

if (els.restartButton) {
  els.restartButton.addEventListener('click', restartParser);
}

refresh();
setInterval(refresh, 1000);
