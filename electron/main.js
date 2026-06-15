const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');

let runtime = null;
let mainWindow = null;
let quitting = false;
let startingAtlas = false;

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
      width: 560,
      height: Math.min(720, 210 + choices.length * 76),
      resizable: false,
      title: 'Choose Character',
      backgroundColor: '#101418',
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true
      }
    });

    let settled = false;
    const settle = (character) => {
      if (settled) return;
      settled = true;
      ipcMain.removeAllListeners('atlas-character-selected');
      if (!picker.isDestroyed()) picker.close();
      resolve(sanitizeCharacterName(character) || configured || choices[0]?.name || null);
    };

    ipcMain.once('atlas-character-selected', (_event, character) => settle(character));
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
          <h1>Choose Character</h1>
          <p>Pantheon Atlas will tail the active combat and entity logs for this character.</p>
          <div class="list">${rows}</div>
          <script>
            const { ipcRenderer } = require('electron');
            document.querySelectorAll('.choice').forEach((button) => {
              button.addEventListener('click', () => {
                ipcRenderer.send('atlas-character-selected', button.dataset.character);
              });
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

Menu.setApplicationMenu(null);

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
