import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { camundaProxy } from './camundaProxy.js';

// Local dev uses the camundaProxy Vite plugin to forward /api/* to Camunda SaaS.
// In production on Vercel, the equivalent forwarding is handled by the
// serverless function in api/camunda.js (wired up via vercel.json rewrites).
// The plugin below only runs during `vite` dev — it is a no-op for `vite build`.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');

  const region = env.CAMUNDA_CLUSTER_REGION;
  const clusterId = env.CAMUNDA_CLUSTER_ID;
  const clusterUrl = env.ZEEBE_REST_ADDRESS || `https://${region}.api.camunda.io/${clusterId}`;

  return {
    plugins: [
      react(),
      camundaProxy({
        clusterUrl,
        oauthUrl: env.CAMUNDA_OAUTH_URL || 'https://login.cloud.camunda.io/oauth/token',
        clientId: env.CAMUNDA_CLIENT_ID,
        clientSecret: env.CAMUNDA_CLIENT_SECRET,
        audience: env.CAMUNDA_TOKEN_AUDIENCE || 'zeebe.camunda.io',
      }),
    ],
    server: {
      allowedHosts: 'all',
      port: 5173,
    },
  };
});
