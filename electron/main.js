const fs = require('node:fs');
const https = require('node:https');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require('electron');
const packageJson = require('../package.json');

let runtime = null;
let mainWindow = null;
let quitting = false;
let startingAtlas = false;
let updateCheckInFlight = false;

const UPDATE_REPO = 'sh4dowf0x/pantheon-atlas';
const UPDATE_API_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;

function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 3117;
      server.close(() => resolve(port));
    });
  });
}

function waitForHttp(url, timeoutMs = 15_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', (error) => {
        if (Date.now() - started > timeoutMs) {
          reject(error);
          return;
        }
        setTimeout(check, 250);
      });
      req.setTimeout(1000, () => req.destroy(new Error('Dashboard did not respond in time')));
    };
    check();
  });
}

function compareVersions(left, right) {
  const parse = (value) => String(value || '')
    .replace(/^v/i, '')
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
  const a = parse(left);
  const b = parse(right);
  const length = Math.max(a.length, b.length, 3);
  for (let index = 0; index < length; index += 1) {
    const delta = (a[index] || 0) - (b[index] || 0);
    if (delta) return delta > 0 ? 1 : -1;
  }
  return 0;
}

function fetchJson(url, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `PantheonAtlas/${packageJson.version}`
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`GitHub release check failed: ${res.statusCode} ${text}`.trim()));
          return;
        }
        try {
          resolve(JSON.parse(text));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('GitHub release check timed out')));
  });
}

function releaseAssetForPlatform(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  return assets.find((asset) => /\.exe$/i.test(asset.name || '') && /PantheonAtlas/i.test(asset.name || ''))
    || assets.find((asset) => /\.exe$/i.test(asset.name || ''))
    || null;
}

async function latestUpdateInfo() {
  if (process.env.PANTHEON_ATLAS_DISABLE_UPDATE_CHECK === '1') {
    return {
      checked: false,
      available: false,
      currentVersion: packageJson.version,
      error: 'Update checks are disabled.'
    };
  }
  const release = await fetchJson(UPDATE_API_URL);
  const latestVersion = String(release.tag_name || '').replace(/^v/i, '');
  const asset = releaseAssetForPlatform(release);
  const releaseUrl = release.html_url || `https://github.com/${UPDATE_REPO}/releases/latest`;
  const downloadUrl = asset?.browser_download_url || releaseUrl;
  return {
    checked: true,
    available: Boolean(latestVersion && compareVersions(latestVersion, packageJson.version) > 0),
    currentVersion: packageJson.version,
    latestVersion: latestVersion || null,
    releaseUrl,
    downloadUrl,
    assetName: asset?.name || null,
    publishedAt: release.published_at || null
  };
}

async function checkForUpdates({ manual = false } = {}) {
  if (updateCheckInFlight || process.env.PANTHEON_ATLAS_DISABLE_UPDATE_CHECK === '1') return null;
  if (process.env.PANTHEON_ATLAS_SMOKE_TEST === '1' && !manual) return null;
  updateCheckInFlight = true;
  try {
    const info = await latestUpdateInfo();
    if (!info.available) {
      if (manual) {
        await dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Pantheon Atlas Updates',
          message: 'Pantheon Atlas is up to date.',
          detail: `Current version: ${packageJson.version}`
        });
      }
      return null;
    }

    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Pantheon Atlas Update Available',
      message: `Pantheon Atlas ${info.latestVersion} is available.`,
      detail: `You are running ${packageJson.version}. Download the latest build from GitHub, then close Atlas and run the new installer or portable EXE.`,
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1
    });
    if (result.response === 0) await shell.openExternal(info.downloadUrl);
    return info;
  } catch (error) {
    console.error(`Update check failed: ${error.message}`);
    if (manual) {
      await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Pantheon Atlas Updates',
        message: 'Could not check for updates.',
        detail: error.message
      });
    }
    return null;
  } finally {
    updateCheckInFlight = false;
  }
}

function ensureUserConfig(userDataPath) {
  const configPath = path.join(userDataPath, 'config.json');
  if (!fs.existsSync(configPath)) {
    const examplePath = path.resolve(__dirname, '..', 'config.example.json');
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.copyFileSync(examplePath, configPath);
  }
  migrateUserConfig(configPath);
  return configPath;
}

function migrateUserConfig(configPath) {
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return;
  }

  let changed = false;
  const legacyCaptureConfig = Boolean(config.capture || config.decode);
  if (config.capture) {
    delete config.capture;
    changed = true;
  }
  if (config.decode) {
    delete config.decode;
    changed = true;
  }

  const ensureFeed = (key, defaults) => {
    const current = config[key] && typeof config[key] === 'object' ? config[key] : {};
    const next = { ...defaults, ...current };
    if (legacyCaptureConfig || current.enabled !== true) next.enabled = true;
    if (JSON.stringify(current) !== JSON.stringify(next)) {
      config[key] = next;
      changed = true;
    }
  };

  ensureFeed('addonLogs', {
    enabled: true,
    liveFile: '%ProgramData%\\PantheonCombatData\\combat-live-{character}.jsonl',
    pollEveryMs: 1000
  });
  ensureFeed('entityScannerLogs', {
    enabled: true,
    liveFile: '%ProgramData%\\PantheonEntityScanner\\entities-live-{character}.jsonl',
    pollEveryMs: 1000
  });
  ensureFeed('lootLogs', {
    enabled: true,
    liveFile: '%ProgramData%\\PantheonLootData\\loot-events-current.jsonl',
    pollEveryMs: 1000
  });

  if (changed) {
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  }
}

function persistSelectedCharacter(configPath, character) {
  const safeCharacter = String(character || '').trim();
  if (!safeCharacter) return;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.pantheon = { ...(config.pantheon || {}), localPlayerName: safeCharacter };
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  } catch (error) {
    console.error(`Could not save selected character: ${error.message}`);
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pickCharacter(configPath) {
  if (
    process.env.PANTHEON_ATLAS_SMOKE_TEST === '1'
    && process.env.PANTHEON_ATLAS_AUTO_SELECT_CHARACTER !== '1'
  ) {
    return Promise.resolve(null);
  }
  const { readConfig } = require('../src/config');
  const { discoverCharacterLogChoices, sanitizeCharacterName } = require('../src/app');
  const config = readConfig(configPath);
  const choices = discoverCharacterLogChoices(config);
  if (!choices.length) return Promise.resolve(sanitizeCharacterName(config.pantheon?.localPlayerName));

  const configured = sanitizeCharacterName(config.pantheon?.localPlayerName);
  return new Promise((resolve) => {
    const picker = new BrowserWindow({
      width: 620,
      height: Math.min(820, 300 + choices.length * 76),
      resizable: false,
      title: 'Choose Character',
      backgroundColor: '#101418',
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true
      }
    });

    let settled = false;
    let latestDownloadUrl = null;
    const handleCharacterSelected = (_event, character) => settle(character);
    const handleUpdateCheck = async () => {
      if (process.env.PANTHEON_ATLAS_SMOKE_TEST === '1') {
        return {
          checked: false,
          available: false,
          currentVersion: packageJson.version,
          error: 'Skipped during smoke test.'
        };
      }
      try {
        const info = await latestUpdateInfo();
        latestDownloadUrl = info.downloadUrl || null;
        return info;
      } catch (error) {
        console.error(`Update check failed: ${error.message}`);
        return {
          checked: false,
          available: false,
          currentVersion: packageJson.version,
          error: error.message
        };
      }
    };
    const handleOpenUpdate = async () => {
      const url = latestDownloadUrl || `https://github.com/${UPDATE_REPO}/releases/latest`;
      await shell.openExternal(url);
      return { ok: true };
    };
    const settle = (character) => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener('atlas-character-selected', handleCharacterSelected);
      ipcMain.removeHandler('atlas-update-check');
      ipcMain.removeHandler('atlas-open-update');
      if (!picker.isDestroyed()) picker.close();
      resolve(sanitizeCharacterName(character) || configured || choices[0]?.name || null);
    };

    ipcMain.on('atlas-character-selected', handleCharacterSelected);
    ipcMain.handle('atlas-update-check', handleUpdateCheck);
    ipcMain.handle('atlas-open-update', handleOpenUpdate);
    picker.on('closed', () => settle(configured || choices[0]?.name || null));

    const rows = choices.map((choice, index) => {
      const parts = [
        choice.combat ? 'combat' : null,
        choice.entity ? 'entities' : null
      ].filter(Boolean).join(' + ') || 'logs';
      const ageSeconds = Math.max(0, Math.round((Date.now() - choice.lastWriteMs) / 1000));
      const marker = configured && choice.name.toLowerCase() === configured.toLowerCase() ? '<span class="tag">configured</span>' : '';
      return `
        <button class="choice${index === 0 ? ' first' : ''}" data-character="${escapeHtml(choice.name)}">
          <strong>${escapeHtml(choice.name)}</strong>
          ${marker}
          <span>${escapeHtml(parts)} · ${ageSeconds}s ago</span>
        </button>
      `;
    }).join('');

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 24px;
              background: #101418;
              color: #eef3f7;
              font-family: "Segoe UI", system-ui, sans-serif;
            }
            h1 {
              margin: 0 0 8px;
              font-size: 24px;
              font-weight: 700;
            }
            p {
              margin: 0 0 18px;
              color: #9fb0bd;
              line-height: 1.4;
            }
            .top {
              display: grid;
              grid-template-columns: 1fr auto;
              gap: 14px;
              align-items: start;
            }
            .update {
              min-width: 210px;
              padding: 12px;
              border: 1px solid #2b3a42;
              border-radius: 8px;
              background: #151d23;
            }
            .update-title {
              display: block;
              margin-bottom: 5px;
              color: #eef3f7;
              font-size: 13px;
              font-weight: 700;
            }
            .update-status {
              min-height: 34px;
              margin-bottom: 10px;
              color: #9fb0bd;
              font-size: 12px;
              line-height: 1.35;
            }
            .update button {
              width: 100%;
              padding: 9px 10px;
              border: 1px solid #426477;
              border-radius: 7px;
              background: #24475a;
              color: #dff5ff;
              font-weight: 700;
              cursor: pointer;
            }
            .update button:disabled {
              border-color: #2b3a42;
              background: #182128;
              color: #6f808a;
              cursor: default;
            }
            .list {
              display: grid;
              gap: 10px;
            }
            .choice {
              width: 100%;
              display: grid;
              grid-template-columns: 1fr auto;
              gap: 4px 10px;
              align-items: center;
              padding: 14px 16px;
              border: 1px solid #2b3a42;
              border-radius: 8px;
              background: #182128;
              color: inherit;
              text-align: left;
              cursor: pointer;
            }
            .choice:hover,
            .choice:focus {
              border-color: #6fb6d6;
              background: #1d2a32;
              outline: none;
            }
            .choice strong {
              font-size: 17px;
            }
            .choice span:last-child {
              grid-column: 1 / -1;
              color: #9fb0bd;
              font-size: 13px;
            }
            .tag {
              padding: 3px 8px;
              border-radius: 999px;
              background: #24475a;
              color: #aee4ff;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="top">
            <div>
              <h1>Choose Character</h1>
              <p>Pantheon Atlas will tail the active combat and entity logs for this character.</p>
            </div>
            <section class="update" aria-label="Atlas update">
              <span class="update-title">Atlas Update</span>
              <div id="update-status" class="update-status">Checking GitHub...</div>
              <button id="update-button" type="button" disabled>Update Atlas</button>
            </section>
          </div>
          <div class="list">${rows}</div>
          <script>
            const { ipcRenderer } = require('electron');
            const updateStatus = document.querySelector('#update-status');
            const updateButton = document.querySelector('#update-button');
            document.querySelectorAll('.choice').forEach((button) => {
              button.addEventListener('click', () => {
                ipcRenderer.send('atlas-character-selected', button.dataset.character);
              });
            });
            updateButton.addEventListener('click', async () => {
              updateButton.disabled = true;
              updateStatus.textContent = 'Opening GitHub...';
              await ipcRenderer.invoke('atlas-open-update');
              updateStatus.textContent = 'Download opened in your browser.';
              updateButton.disabled = false;
            });
            ipcRenderer.invoke('atlas-update-check').then((info) => {
              if (info.available) {
                updateStatus.textContent = 'Version ' + info.latestVersion + ' is available. Current: ' + info.currentVersion + '.';
                updateButton.disabled = false;
                return;
              }
              updateStatus.textContent = info.error || ('Up to date: ' + info.currentVersion + '.');
              updateButton.disabled = true;
            }).catch((error) => {
              updateStatus.textContent = error.message || 'Could not check for updates.';
              updateButton.disabled = true;
            });
          </script>
        </body>
      </html>
    `;
    picker.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    if (process.env.PANTHEON_ATLAS_AUTO_SELECT_CHARACTER === '1') {
      picker.webContents.once('did-finish-load', () => {
        setTimeout(() => settle(choices[0]?.name), 100);
      });
    }
  });
}

function createWindow(dashboardUrl) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    title: 'Pantheon Atlas',
    backgroundColor: '#101418',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL(dashboardUrl);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function cleanupRuntime() {
  if (!runtime) return;
  const current = runtime;
  runtime = null;
  try {
    if (current.addonLogIngestor) current.addonLogIngestor.stop();
    if (current.entityScannerLogIngestor) current.entityScannerLogIngestor.stop();
    if (current.lootLogIngestor) current.lootLogIngestor.stop();
    if (current.server) {
      await new Promise((resolve) => current.server.close(resolve));
    }
    if (current.store) current.store.close();
  } catch (error) {
    console.error(`Pantheon Atlas shutdown warning: ${error.message}`);
  }
}

async function startAtlas() {
  startingAtlas = true;
  app.setName('Pantheon Atlas');
  app.setPath('userData', path.join(app.getPath('appData'), 'Pantheon Atlas'));
  const userDataPath = app.getPath('userData');
  process.env.PANTHEON_ATLAS_HOME = userDataPath;
  process.env.PANTHEON_ATLAS_ELECTRON = '1';

  const configPath = ensureUserConfig(userDataPath);
  const port = await findOpenPort();
  const { runApp } = require('../src/app');
  const character = await pickCharacter(configPath);
  persistSelectedCharacter(configPath, character);
  const argv = ['electron', 'pantheon-atlas', '--config', configPath, '--port', String(port)];
  if (character) argv.push('--character', character);
  runtime = await runApp(argv);

  const dashboardUrl = `http://127.0.0.1:${port}/`;
  await waitForHttp(dashboardUrl);
  if (process.env.PANTHEON_ATLAS_SMOKE_TEST === '1') {
    await cleanupRuntime();
    app.quit();
    return;
  }
  createWindow(dashboardUrl);
  startingAtlas = false;
}

if (Menu?.setApplicationMenu && Menu?.buildFromTemplate) {
  Menu.setApplicationMenu(Menu.buildFromTemplate([{
    label: 'Pantheon Atlas',
    submenu: [
      { label: 'Check for Updates', click: () => checkForUpdates({ manual: true }).catch(() => {}) },
      { type: 'separator' },
      { role: 'quit' }
    ]
  }]));
}

app.whenReady()
  .then(startAtlas)
  .catch((error) => {
    console.error(error);
    app.quit();
  });

app.on('activate', () => {
  if (!mainWindow && runtime?.server) {
    const address = runtime.server.address();
    const port = address && typeof address === 'object' ? address.port : 3117;
    createWindow(`http://127.0.0.1:${port}/`);
  }
});

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
});

app.on('before-quit', async (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  await cleanupRuntime();
  app.quit();
});

app.on('window-all-closed', () => {
  if (startingAtlas) return;
  app.quit();
});
