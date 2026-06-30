const MAX_JSON_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_ICON_UPLOAD_BYTES = 512 * 1024;

const ROUTES = {
  items: {
    format: 'pantheon-atlas-items-v1',
    manifestFormat: 'pantheon-atlas-items-manifest-v1',
    manifestKey: 'items-manifest.json',
    prefixVar: 'ITEM_OBJECT_PREFIX',
    defaultPrefix: 'contributions',
    label: 'items'
  },
  mobs: {
    format: 'pantheon-atlas-mobs-v1',
    manifestFormat: 'pantheon-atlas-mobs-manifest-v1',
    manifestKey: 'mobs-manifest.json',
    prefixVar: 'MOB_OBJECT_PREFIX',
    defaultPrefix: 'mob-contributions',
    label: 'mobs'
  }
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function cors(status = 204) {
  return new Response(null, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': [
        'Authorization',
        'Content-Encoding',
        'Content-Type',
        'X-Atlas-Format',
        'X-Atlas-Generated-At',
        'X-Atlas-Icon-Key',
        'X-Atlas-Icon-Name',
        'X-Atlas-Install-Id',
        'X-Atlas-Payload-SHA256'
      ].join(', '),
      'Access-Control-Max-Age': '86400'
    }
  });
}

function sanitizePathPart(value, fallback) {
  const clean = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return clean || fallback;
}

function timestampForKey(value) {
  const parsed = Date.parse(value || '');
  const iso = Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
  return iso.replace(/[:-]|\.\d{3}/g, '').replace(/\D/g, '').slice(0, 14);
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function bearerToken(request) {
  const match = String(request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

function objectPublicUrl(env, key) {
  const base = String(env.PUBLIC_BASE_URL || '').replace(/\/+$/g, '');
  if (!base) return null;
  return `${base}/${String(key).split('/').map((part) => encodeURIComponent(part)).join('/')}`;
}

async function readManifest(bucket, route) {
  try {
    const object = await bucket.get(route.manifestKey);
    if (!object) return { format: route.manifestFormat, objects: [] };
    const parsed = await object.json();
    return {
      format: route.manifestFormat,
      generatedAt: parsed.generatedAt || null,
      objects: Array.isArray(parsed.objects) ? parsed.objects : []
    };
  } catch {
    return { format: route.manifestFormat, objects: [] };
  }
}

async function updateManifest(bucket, route, row) {
  const manifest = await readManifest(bucket, route);
  const objects = manifest.objects.filter((item) => item && item.key !== row.key);
  objects.unshift(row);
  const next = {
    format: route.manifestFormat,
    generatedAt: new Date().toISOString(),
    objects: objects.slice(0, 5000)
  };
  await bucket.put(route.manifestKey, JSON.stringify(next, null, 2), {
    httpMetadata: {
      contentType: 'application/json'
    }
  });
}

async function handleJsonUpload(request, env, route) {
  const contentEncoding = String(request.headers.get('Content-Encoding') || '').toLowerCase();
  const contentType = String(request.headers.get('Content-Type') || '').toLowerCase();
  if (contentEncoding !== 'gzip') return json({ error: 'Expected gzip upload' }, 415);
  if (!contentType.includes('application/json')) return json({ error: 'Expected JSON content type' }, 415);

  const body = await request.arrayBuffer();
  if (!body.byteLength) return json({ error: 'Empty upload' }, 400);
  if (body.byteLength > MAX_JSON_UPLOAD_BYTES) return json({ error: 'Upload too large' }, 413);

  const claimedHash = String(request.headers.get('X-Atlas-Payload-SHA256') || '').toLowerCase();
  const actualHash = await sha256Hex(body);
  if (claimedHash && claimedHash !== actualHash) return json({ error: 'Payload hash mismatch' }, 400);

  const installId = sanitizePathPart(request.headers.get('X-Atlas-Install-Id'), 'anonymous');
  const stamp = timestampForKey(request.headers.get('X-Atlas-Generated-At'));
  const prefix = sanitizePathPart(env[route.prefixVar] || route.defaultPrefix, route.defaultPrefix);
  const key = `${prefix}/${installId}/${route.label}-${stamp}-${actualHash.slice(0, 16)}.json.gz`;
  const format = request.headers.get('X-Atlas-Format') || route.format;

  await env.ITEM_BUCKET.put(key, body, {
    httpMetadata: {
      contentType: 'application/json',
      contentEncoding: 'gzip'
    },
    customMetadata: {
      format,
      installId,
      payloadSha256: actualHash
    }
  });
  await updateManifest(env.ITEM_BUCKET, route, {
    key,
    sha256: actualHash,
    generatedAt: request.headers.get('X-Atlas-Generated-At') || new Date().toISOString(),
    uploadedAt: new Date().toISOString(),
    installId
  });

  return json({ ok: true, key, publicUrl: objectPublicUrl(env, key) });
}

function iconExtension(contentType, iconName) {
  const lower = String(contentType || '').toLowerCase();
  if (lower.includes('png')) return '.png';
  if (lower.includes('webp')) return '.webp';
  if (lower.includes('jpeg') || lower.includes('jpg')) return '.jpg';
  const match = String(iconName || '').match(/\.(png|webp|jpe?g)$/i);
  return match ? `.${match[1].toLowerCase().replace('jpeg', 'jpg')}` : '.png';
}

async function handleIconUpload(request, env) {
  const contentType = String(request.headers.get('Content-Type') || '').toLowerCase();
  if (!contentType.startsWith('image/')) return json({ error: 'Expected image content type' }, 415);
  const body = await request.arrayBuffer();
  if (!body.byteLength) return json({ error: 'Empty icon upload' }, 400);
  if (body.byteLength > MAX_ICON_UPLOAD_BYTES) return json({ error: 'Icon upload too large' }, 413);

  const publicBaseUrl = String(env.PUBLIC_BASE_URL || '').trim();
  if (!publicBaseUrl) return json({ error: 'PUBLIC_BASE_URL is required for icon uploads' }, 500);

  const hash = await sha256Hex(body);
  const installId = sanitizePathPart(request.headers.get('X-Atlas-Install-Id'), 'anonymous');
  const iconName = sanitizePathPart(request.headers.get('X-Atlas-Icon-Key') || request.headers.get('X-Atlas-Icon-Name'), 'item-icon');
  const prefix = sanitizePathPart(env.ICON_OBJECT_PREFIX || 'item-icons', 'item-icons');
  const key = `${prefix}/${iconName}-${hash.slice(0, 16)}${iconExtension(contentType, iconName)}`;
  await env.ITEM_BUCKET.put(key, body, {
    httpMetadata: {
      contentType
    },
    customMetadata: {
      installId,
      payloadSha256: hash
    }
  });
  return json({ ok: true, key, publicUrl: objectPublicUrl(env, key) });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return cors();
    if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);
    if (!env.ITEM_BUCKET) return json({ error: 'ITEM_BUCKET binding is not configured' }, 500);

    if (env.ATLAS_UPLOAD_TOKEN && bearerToken(request) !== env.ATLAS_UPLOAD_TOKEN) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const routeName = new URL(request.url).pathname.split('/').filter(Boolean).pop() || 'items';
    if (routeName === 'icons') return handleIconUpload(request, env);
    const route = ROUTES[routeName];
    if (!route) return json({ error: 'Unknown upload route' }, 404);
    return handleJsonUpload(request, env, route);
  }
};
