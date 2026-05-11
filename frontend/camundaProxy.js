// Vite middleware that injects an OAuth bearer token on every request
// to /api/* and forwards the request to the Camunda SaaS REST cluster.
// Token is cached in-memory and refreshed proactively before expiry.

import { Readable } from 'node:stream';

let cache = null;

async function getToken({ oauthUrl, clientId, clientSecret, audience }) {
  if (cache && cache.expiresAt > Date.now() + 60_000) return cache.token;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    audience,
    client_id: clientId,
    client_secret: clientSecret,
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

export function camundaProxy(opts) {
  const { clusterUrl, oauthUrl, clientId, clientSecret, audience } = opts;

  return {
    name: 'camunda-proxy',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        try {
          const token = await getToken({ oauthUrl, clientId, clientSecret, audience });

          const path = req.url.startsWith('/api') ? req.url.slice(4) : req.url;
          const upstream = `${clusterUrl}${path}`;

          const headers = { ...req.headers, authorization: `Bearer ${token}` };
          delete headers.host;
          delete headers['content-length'];

          const init = { method: req.method, headers };
          if (!['GET', 'HEAD'].includes(req.method)) {
            init.body = Readable.toWeb(req);
            init.duplex = 'half';
          }

          const upstreamRes = await fetch(upstream, init);

          res.statusCode = upstreamRes.status;
          for (const [k, v] of upstreamRes.headers.entries()) {
            if (['transfer-encoding', 'content-encoding', 'connection'].includes(k.toLowerCase())) continue;
            res.setHeader(k, v);
          }

          if (upstreamRes.body) {
            Readable.fromWeb(upstreamRes.body).pipe(res);
          } else {
            res.end();
          }
        } catch (err) {
          console.error('[camunda-proxy]', err);
          res.statusCode = 502;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}
