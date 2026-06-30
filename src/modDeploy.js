const fs = require('node:fs');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const MODS_REPO = 'sh4dowf0x/pantheon-mods';
const MODS_RELEASE_API = `https://api.github.com/repos/${MODS_REPO}/releases/latest`;
const REQUIRED_MOD_ASSETS = [
  'PantheonCombatDataMod.zip',
  'PantheonEntityScannerMod.zip',
  'PantheonLootDataMod.zip'
];

function fetchJson(url, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'PantheonAtlasModDeploy'
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`GitHub release read failed: ${res.statusCode} ${text}`.trim()));
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
    req.setTimeout(timeoutMs, () => req.destroy(new Error('GitHub release read timed out')));
  });
}

function downloadFile(url, filePath, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: { 'User-Agent': 'PantheonAtlasModDeploy' }
    }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        downloadFile(response.headers.location, filePath, timeoutMs).then(resolve, reject);
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`Mod download failed: ${response.statusCode}`));
        return;
      }
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const stream = fs.createWriteStream(filePath);
      response.pipe(stream);
      stream.on('finish', () => stream.close(resolve));
      stream.on('error', reject);
    });
    request.on('error', reject);
    request.setTimeout(timeoutMs, () => request.destroy(new Error('Mod download timed out')));
  });
}

function runPowerShell(args) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...args], {
      windowsHide: true
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(String(stderr || stdout || error.message).trim()));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function expandZip(zipPath, destinationPath) {
  fs.mkdirSync(destinationPath, { recursive: true });
  const command = [
    'Expand-Archive',
    '-LiteralPath',
    JSON.stringify(zipPath),
    '-DestinationPath',
    JSON.stringify(destinationPath),
    '-Force'
  ].join(' ');
  await runPowerShell([
    '-Command',
    command
  ]);
}

function validatePantheonDirectory(pantheonDir) {
  const resolved = path.resolve(String(pantheonDir || '').trim());
  if (!resolved || !fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error('Choose an existing Pantheon game folder.');
  }
  return resolved;
}

function copyExtractedGameFolder(extractPath, pantheonDir) {
  const gameFolder = path.join(extractPath, 'GameFolder');
  const sourceRoot = fs.existsSync(gameFolder) && fs.statSync(gameFolder).isDirectory()
    ? gameFolder
    : extractPath;
  const entries = fs.readdirSync(sourceRoot, { withFileTypes: true });
  for (const entry of entries) {
    const source = path.join(sourceRoot, entry.name);
    const destination = path.join(pantheonDir, entry.name);
    fs.cpSync(source, destination, { recursive: true, force: true });
  }
}

function requiredAssetsFromRelease(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  return REQUIRED_MOD_ASSETS.map((name) => {
    const asset = assets.find((row) => row.name === name);
    if (!asset?.browser_download_url) throw new Error(`Latest pantheon-mods release is missing ${name}.`);
    return {
      name,
      url: asset.browser_download_url,
      size: Number(asset.size || 0)
    };
  });
}

async function deployAtlasMods(options = {}) {
  const pantheonDir = validatePantheonDirectory(options.pantheonDir);
  const release = await fetchJson(options.releaseApiUrl || MODS_RELEASE_API);
  const assets = requiredAssetsFromRelease(release);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pantheon-atlas-mods-'));
  const installed = [];
  try {
    for (const asset of assets) {
      const zipPath = path.join(tempDir, asset.name);
      const extractPath = path.join(tempDir, `${path.basename(asset.name, '.zip')}-extract`);
      await downloadFile(asset.url, zipPath);
      await expandZip(zipPath, extractPath);
      copyExtractedGameFolder(extractPath, pantheonDir);
      installed.push(asset.name);
    }
    return {
      ok: true,
      pantheonDir,
      releaseTag: release.tag_name || null,
      releaseName: release.name || null,
      installed,
      installedAt: new Date().toISOString()
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

module.exports = {
  MODS_REPO,
  REQUIRED_MOD_ASSETS,
  deployAtlasMods,
  expandZip,
  copyExtractedGameFolder,
  requiredAssetsFromRelease,
  validatePantheonDirectory
};
