const fs = require('node:fs');
const path = require('node:path');

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] || '';
}

function requireArg(name) {
  const value = argValue(name);
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const configPath = path.resolve(argValue('--config') || 'config.json');
const accessKeyId = requireArg('--access-key-id').trim();
const secretAccessKey = requireArg('--secret-access-key').trim();
const endpoint = (argValue('--endpoint') || 'https://7e51af449fba623b17c429354bda9f69.r2.cloudflarestorage.com').trim();
const bucket = (argValue('--bucket') || 'pantheon-item-database').trim();
const publicBaseUrl = (argValue('--public-base-url') || 'https://pub-bb6b866e2c73493f83b42111abb2e1c9.r2.dev').trim();
const manifestUrl = (argValue('--manifest-url') || `${publicBaseUrl.replace(/\/+$/g, '')}/items-manifest.json`).trim();
const downloadEveryMinutes = Math.max(1, Math.min(1440, Number(argValue('--download-every-minutes') || 5) || 5));
const uploadEveryMinutes = Math.max(1, Math.min(1440, Number(argValue('--upload-every-minutes') || 5) || 5));

const config = readJson(configPath);
config.communityItems = {
  ...(config.communityItems || {}),
  enabled: true,
  downloadEnabled: true,
  uploadEnabled: true,
  uploadMode: 'r2',
  downloadEveryMinutes,
  uploadEveryMinutes,
  publicBaseUrl,
  manifestUrl,
  r2: {
    ...(config.communityItems?.r2 || {}),
    endpoint,
    bucket,
    region: 'auto',
    objectPrefix: 'contributions',
    accessKeyId,
    secretAccessKey
  }
};

fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`R2 sync credentials saved to ${configPath}`);
console.log(`Endpoint: ${endpoint}`);
console.log(`Bucket: ${bucket}`);
console.log(`Public manifest: ${manifestUrl}`);
console.log(`Download every: ${downloadEveryMinutes} minute(s)`);
console.log(`Upload every: ${uploadEveryMinutes} minute(s)`);
