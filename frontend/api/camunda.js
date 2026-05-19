// Vercel serverless function that proxies /api/* to the Camunda SaaS cluster.
// Mirrors the local Vite middleware in ../camundaProxy.js: fetches an OAuth
// token with cached expiry, then forwards the request with a bearer header.
//
// All /api/* paths reach this single function via the rewrite in ../vercel.json,
// which captures the path tail into ?camundaPath=... so we can reconstruct it.

export const config = {
  api: { bodyParser: false },
};

let cache = null;

async function getToken() {
  if (cache && cache.expiresAt > Date.now() + 60_000) return cache.token;

  const oauthUrl = process.env.CAMUNDA_OAUTH_URL || 'https://login.cloud.camunda.io/oauth/token';
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    audience: process.env.CAMUNDA_TOKEN_AUDIENCE || 'zeebe.camunda.io',
    client_id: process.env.CAMUNDA_CLIENT_ID,
    client_secret: process.env.CAMUNDA_CLIENT_SECRET,
  });

  const res = await fetch(oauthUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth ${res.status}: ${text}`);
  }

  const data = await res.json();
  cache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cache.token;
}

function getClusterUrl() {
  if (process.env.ZEEBE_REST_ADDRESS) return process.env.ZEEBE_REST_ADDRESS;
  const region = process.env.CAMUNDA_CLUSTER_REGION;
  const clusterId = process.env.CAMUNDA_CLUSTER_ID;
  return `https://${region}.api.camunda.io/${clusterId}`;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  try {
    const token = await getToken();
    const clusterUrl = getClusterUrl();

    const url = new URL(req.url, 'http://localhost');
    let camundaPath = url.searchParams.get('camundaPath');
    url.searchParams.delete('camundaPath');

    let upstreamPath;
    if (camundaPath != null) {
      upstreamPath = '/' + camundaPath.replace(/^\/+/, '');
    } else {
      // Fallback if the function is hit directly without the rewrite.
      upstreamPath = url.pathname.startsWith('/api') ? url.pathname.slice(4) : url.pathname;
    }
    const queryString = url.searchParams.toString();
    const upstream = `${clusterUrl}${upstreamPath}${queryString ? '?' + queryString : ''}`;

    const headers = { ...req.headers, authorization: `Bearer ${token}` };
    delete headers.host;
    delete headers['content-length'];
    delete headers['x-forwarded-host'];
    delete headers['x-forwarded-proto'];
    delete headers['x-forwarded-for'];
    delete headers['x-real-ip'];
    delete headers['x-vercel-id'];
    delete headers['x-vercel-deployment-url'];
    delete headers['x-vercel-forwarded-for'];

    const init = { method: req.method, headers };
    if (!['GET', 'HEAD'].includes(req.method)) {
      init.body = await readBody(req);
    }

    const upstreamRes = await fetch(upstream, init);

    res.statusCode = upstreamRes.status;
    for (const [k, v] of upstreamRes.headers.entries()) {
      if (['transfer-encoding', 'content-encoding', 'connection'].includes(k.toLowerCase())) continue;
      res.setHeader(k, v);
    }

    const buf = Buffer.from(await upstreamRes.arrayBuffer());
    res.end(buf);
  } catch (err) {
    console.error('[camunda-proxy]', err);
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: err.message }));
  }
}
