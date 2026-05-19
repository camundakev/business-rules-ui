# Railway Deployment

The frontend (Vite dev server) is deployed to Railway directly from this repo.
Railway builds and serves the `frontend/` directory using the configuration in
[frontend/railway.json](frontend/railway.json).

## Service configuration

In the Railway dashboard, point the service at the `frontend/` directory as
its **root directory** so Railway picks up `frontend/railway.json` and
`frontend/package.json`.

- **Build command:** `npm install`
- **Start command:** `npm run dev -- --host 0.0.0.0`

The `--host 0.0.0.0` flag is required so Railway's edge router can reach the
Vite server inside the container. The listening port is read from Railway's
injected `PORT` environment variable by `vite.config.js` (with a `5173`
fallback for local development).

## Required environment variables

Set these in **Railway dashboard → Service → Variables**. They mirror the
local `.env` (see [.env.example](.env.example)) and are used by the Vite
proxy to authenticate against the Camunda SaaS cluster:

| Variable | Description |
| --- | --- |
| `CAMUNDA_CLUSTER_ID` | Camunda SaaS cluster ID |
| `CAMUNDA_CLUSTER_REGION` | Cluster region, e.g. `jfk-1` |
| `CAMUNDA_CLIENT_ID` | OAuth client ID (from SaaS Console → Cluster → API) |
| `CAMUNDA_CLIENT_SECRET` | OAuth client secret |
| `CAMUNDA_OAUTH_URL` | `https://login.cloud.camunda.io/oauth/token` |
| `CAMUNDA_CREDENTIALS_SCOPES` | `Orchestration` |
| `CAMUNDA_CLIENT_MODE` | `saas` |
| `CAMUNDA_TOKEN_AUDIENCE` | `zeebe.camunda.io` |
| `ZEEBE_REST_ADDRESS` | `https://<region>.api.camunda.io/<cluster-id>` |
| `ZEEBE_GRPC_ADDRESS` | `grpcs://<cluster-id>.<region>.zeebe.camunda.io:443` |
| `ZEEBE_AUTHORIZATION_SERVER_URL` | `https://login.cloud.camunda.io/oauth/token` |

Do **not** set `PORT` — Railway injects it automatically.

## Workers

Only the frontend is deployed to Railway. The job workers in [workers/](workers/)
must be run separately (locally or in another environment) and pointed at the
**same Camunda cluster** as the deployed frontend, otherwise jobs published by
the deployed UI will sit unhandled in the cluster.

To run workers locally against the shared cluster, populate `.env` with the
same Camunda credentials configured in Railway and start them with the
existing local workflow (see [README](README.md) / [dev.sh](dev.sh)).
