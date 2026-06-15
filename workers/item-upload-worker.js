const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const DEFAULT_PREFIX = 'contributions';
const MANIFEST_KEY = 'items-manifest.json';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
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

async function readManifest(bucket) {
  try {
    const object = await bucket.get(MANIFEST_KEY);
    if (!object) return { format: 'pantheon-atlas-items-manifest-v1', objects: [] };
    const parsed = await object.json();
    return {
      format: 'pantheon-atlas-items-manifest-v1',
      generatedAt: parsed.generatedAt || null,
      objects: Array.isArray(parsed.objects) ? parsed.objects : []
    };
  } catch {
    return { format: 'pantheon-atlas-items-manifest-v1', objects: [] };
  }
}

async function updateManifest(bucket, row) {
  const manifest = await readManifest(bucket);
  const objects = manifest.objects.filter((item) => item && item.key !== row.key);
  objects.unshift(row);
  const next = {
    format: 'pantheon-atlas-items-manifest-v1',
    generatedAt: new Date().toISOString(),
    objects: objects.slice(0, 5000)
  };
  await bucket.put(MANIFEST_KEY, JSON.stringify(next, null, 2), {
    httpMetadata: {
      contentType: 'application/json'
    }
  });
}

function bearerToken(request) {
  const match = String(request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Encoding, Content-Type, X-Atlas-Format, X-Atlas-Generated-At, X-Atlas-Install-Id, X-Atlas-Payload-SHA256',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);
    if (!env.ITEM_BUCKET) return json({ error: 'ITEM_BUCKET binding is not configured' }, 500);

    if (env.ATLAS_UPLOAD_TOKEN && bearerToken(request) !== env.ATLAS_UPLOAD_TOKEN) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const contentEncoding = String(request.headers.get('Content-Encoding') || '').toLowerCase();
    const contentType = String(request.headers.get('Content-Type') || '').toLowerCase();
    if (contentEncoding !== 'gzip') return json({ error: 'Expected gzip upload' }, 415);
    if (!contentType.includes('application/json')) return json({ error: 'Expected JSON content type' }, 415);

    const body = await request.arrayBuffer();
    if (!body.byteLength) return json({ error: 'Empty upload' }, 400);
    if (body.byteLength > MAX_UPLOAD_BYTES) return json({ error: 'Upload too large' }, 413);

    const claimedHash = String(request.headers.get('X-Atlas-Payload-SHA256') || '').toLowerCase();
    const actualHash = await sha256Hex(body);
    if (claimedHash && claimedHash !== actualHash) return json({ error: 'Payload hash mismatch' }, 400);

    const installId = sanitizePathPart(request.headers.get('X-Atlas-Install-Id'), 'anonymous');
    const stamp = timestampForKey(request.headers.get('X-Atlas-Generated-At'));
    const prefix = sanitizePathPart(env.OBJECT_PREFIX || DEFAULT_PREFIX, DEFAULT_PREFIX);
    const key = `${prefix}/${installId}/items-${stamp}-${actualHash.slice(0, 16)}.json.gz`;

    await env.ITEM_BUCKET.put(key, body, {
      httpMetadata: {
        contentType: 'application/json',
        contentEncoding: 'gzip'
      },
      customMetadata: {
        format: request.headers.get('X-Atlas-Format') || 'pantheon-atlas-items-v1',
        installId,
        payloadSha256: actualHash
      }
    });
    await updateManifest(env.ITEM_BUCKET, {
      key,
      sha256: actualHash,
      generatedAt: request.headers.get('X-Atlas-Generated-At') || new Date().toISOString(),
      uploadedAt: new Date().toISOString(),
      installId
    });

    return json({ ok: true, key });
  }
};
