# Operations

## Local Development

### Prerequisites
- Node.js 20+
- PostgreSQL running locally (or via Docker)

### Setup

```bash
# 1. Copy and fill in env vars
cp .env.example .env
# Set JWT_PUBLIC_KEY (base64-encoded RSA public key from efa-one)
# Set APP_SESSION_SECRET (generate: openssl rand -hex 32)
# Set DATABASE_URL or APP_DB_* vars
# Set ENVIRONMENT=development

# 2. Backend
cd backend
npm install
npm run dev

# 3. Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

The frontend dev server proxies `/api` and `/dev` to `http://localhost:3001`.

With `ENVIRONMENT=development`, visiting the frontend will:
1. Detect it's not in an iframe
2. Call `GET /dev/token` to get a mock identity JWT (sub/name/email/tenant — no permissions)
3. Exchange it for an `app_session` cookie
4. Show the DEV MODE header

> Permissions come from `converge_access` live per request — they are not in the dev JWT. In a standalone single-app dev session without the efa-one stack, `converge_access` is unreachable, so permission-guarded routes will respond 503. Since `@efa-one/sdk` 1.17.0 this applies to **every** `requireAuth`-protected route: the session is checked live against the kernel endpoint `GET /api/internal/sessions/:jti/status`, which is unreachable without the stack. To test those, run the full efa-one stack locally and assign roles to `dev-user-001` (or whichever `sub` the dev token uses), or temporarily switch the route to `requireAuth` while developing.

### Running in Docker locally

```bash
# Override ENVIRONMENT for local Docker dev (enables /dev/token)
ENVIRONMENT=development docker compose up --build
```

The frontend service exposes a host port (e.g. `6802:80`) — required for iframe embedding in efa-one.

## Production Deployment

```bash
# Ensure converge-net exists (created by efa-one on the host)
docker network create converge-net  # if not already present

# Deploy
docker compose up -d --build
```

efa-one discovers the app via the tile configuration (URL pointing to the frontend container's
hostname on `converge-net`).

## Post-Copy Checklist (required)

After copying this template into a new app repository, verify routing before first run:

1. Pick a unique backend alias on `converge-net` (recommended: `converge-<app>-backend`)
2. Set that alias in `docker-compose.yml`:
   - `services.backend.networks.converge-net.aliases`
3. Use the exact same host in `frontend/nginx.conf`:
   - `set $backend_upstream <alias>`
   - `proxy_pass http://$backend_upstream:3001` for `/api`, `/dev`, `/health`
4. Ensure app `SERVICE_KEY` matches the tile's `serviceKey` in efa-one

Never keep generic upstream hosts like `backend` on shared networks. They can resolve to the wrong app container.

## Template Migration

When the template releases a new major version, a `MIGRATION_x_to_y.md` guide will be provided.

To perform a migration:
1. Read `MIGRATION_x_to_y.md`
2. Use it as a Claude Code prompt:
   > "Read MIGRATION_1_to_2.md and perform the described migration in this repo.
   > Ask me before changing files that contain business logic."
3. Update `converge-template-version` in `CLAUDE.md` after migration

## Health Checks

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness check – always returns `{ status: 'ok' }` |
| `GET /health/ready` | Readiness check – verifies DB connectivity |

efa-one monitors both the frontend and backend health endpoints.
The tile shows degraded status if either returns non-ok.
