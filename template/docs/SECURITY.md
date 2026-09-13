# Security

## Secrets

| Variable | Purpose | Notes |
|---|---|---|
| `JWT_PUBLIC_KEY` | Validate incoming efa-one JWTs (RS256) | Base64-encoded RSA public key from efa-one |
| `APP_SESSION_SECRET` | Sign app `app_session` cookies | Generate: `openssl rand -hex 32` |
| `APP_DB_PASSWORD` | PostgreSQL password | Use a strong random value |

Never commit `.env` to version control.

## Session Cookie

`app_session` is set with:
- `httpOnly: true` – not accessible via JavaScript (XSS protection)
- `sameSite: 'lax'` – allows cross-site top-level navigations, blocks CSRF from third-party sites
- `secure: true` in production – HTTPS only
- expiry = expiry of the exchanged efa-one token (since `@efa-one/sdk` 1.17.0; before: a flat 8 h from exchange)
- bound to the efa-one session: the cookie carries `kernelJti`/`kernelIat`, and `requireAuth` checks the session live against the kernel (`GET /api/internal/sessions/:jti/status`, cached 30 s). Kernel logout, password change, lock and kernel restart end the app session within 30 s; a failed lookup answers 503 (fail-closed). Requires a kernel that has this endpoint.

## Dev Routes

`GET /dev/token` is only registered when `ENVIRONMENT !== 'production'`.
The Dockerfile sets `ENV ENVIRONMENT=production`, so dev routes are never active in containers.
The double-check inside the route handler provides a secondary guard.

## Database Isolation

The `database` service is only on the `app-internal` Docker network. It is never reachable from `converge-net` or the host. Only the `backend` container can connect to it.

## Host Port Mapping

The `frontend` service uses `ports:` to map a host port (e.g. `6802:80`). This is required because efa-one loads apps as iframes — the browser must be able to reach the frontend URL directly.

The `backend` and `database` services do not expose host ports. Security is not provided by network isolation of the frontend — apps validate every request against the efa-one JWT, so direct access without a valid token yields an auth error.

## JWT Validation (RS256)

efa-one signiert JWTs asymmetrisch mit RSA-2048 (RS256). Apps verifizieren mit dem öffentlichen Schlüssel (`JWT_PUBLIC_KEY`). Der private Schlüssel liegt nur im Kernel und in converge-chat (das kurzlebige User-Token für die Delegation an MCP-Tools signiert — RS256, 10 min). Eine kompromittierte App kann keine gültigen efa-one-JWTs ausstellen.

App-interne Session-Cookies (`app_session`) nutzen weiterhin HS256 mit einem eigenen `APP_SESSION_SECRET` pro App.

## Input Validation

- efa-one JWT validation uses `jsonwebtoken.verify()` with `{ algorithms: ['RS256'] }` – signature, algorithm, and expiry are checked
- All DB queries use parameterized statements (`$1`, `$2`, ...)

## Permissions (Live-Lookup, not in JWT)

The efa-one JWT carries **only identity** (`sub`, `name`, `email`, `language`, `tenant`, `iat`, `exp`, `forcePasswordChange?`). It does **not** carry permissions, roles, or any access flag. The same is true for the app's own `app_session` cookie — both contain identity, never authorization data.

Permissions are resolved **live per request** against the central `converge_access` service:

```
HTTP request → requireAuth (decode app_session) → permission middleware
                                                       │
                                                       └─► getUserPermissions(convergeId)
                                                               │
                                                               └─► GET converge_access
                                                                     /api/internal/users/:id/permissions
                                                                     → { keys: ["myapp.default", "converge-admin", ...] }
```

- The list of effective keys joins the user's roles (from `converge_zbv`) with the permission objects each role carries (from `converge_access`).
- **No caching, no JWT-embedded copy.** Revoking a permission takes effect on the next request — there is no 8 h session lag.
- `converge_access` is therefore a hard dependency: if it is unavailable, every permission-guarded route returns 503 / 403. This is fail-closed by design (see `@efa-one/sdk/backend/permissionClient.ts`).

### Permission key schema

- `{service_key}.default` – tile visibility / basic usage (auto-created per tile)
- `{service_key}.admin` – app-level admin (auto-created for internal/network tiles)
- `{service_key}.<custom>` – additional granular permissions registered by the app via `registerPermissions()` at startup
- `converge-admin` – platform-wide admin, **treated as a regular permission key** (no separate `role` field, no special JWT claim)

### Route-level guards (backend)

Import from the app-local re-export `./middleware/auth` (which forwards to `@efa-one/sdk/backend/auth.ts`):

```ts
import { requireAuth, requireAdmin, requirePermission, requireAdminOrPermission } from '../middleware/auth';

// Authenticated user, no permission check:
router.get('/me', requireAuth, handler);

// efa-one-Admin only (rare — usually you want requireAdminOrPermission):
router.post('/system/reset', requireAdmin, handler);

// One specific app permission, no admin bypass (rare):
router.get('/export', requirePermission('myapp.can-export'), handler);

// Default: app permission OR efa-one-Admin (most routes):
router.delete('/items/:id', requireAdminOrPermission('myapp.admin'), handler);
router.get('/items',        requireAdminOrPermission('myapp.default', 'myapp.admin'), handler);
```

`requireAdminOrPermission(...keys)` lets the request through if `converge-admin` **or** any of the listed app permission keys is in the live lookup result. Each middleware does its own lookup; you do not call `getUserPermissions()` manually.

### Permission checks (frontend)

`useConvergeAuth()` loads permissions immediately after the token exchange via `GET /api/auth/permissions` (which the backend serves by calling `getUserPermissions()` under the hood). They live as `user.permissions: string[]` on the `AppUser`:

```ts
const { user } = useConvergeAuth();
const isAdmin   = user?.permissions?.includes('converge-admin') ?? false;
const canExport = user?.permissions?.includes('myapp.can-export') ?? false;
```

For a fresh re-check (e.g. after a role change applied elsewhere), call `fetchUserPermissions()` from the hook module — do **not** persist permissions outside the hook's state and never use `localStorage`.

### Anti-patterns (do not introduce)

- ❌ `req.user.roles` / `user.roles` — fields do not exist in the current model
- ❌ `req.user.role === 'admin'` — admin is a permission key, not a role string
- ❌ Embedding `roles[]` or `permissions[]` in the efa-one JWT or the `app_session` cookie
- ❌ Caching permissions in memory, `localStorage`, or a custom TTL store inside the app
- ❌ Calling `converge_access` directly from app code — always go through `@efa-one/sdk/backend/permissionClient.ts` or the auth middleware

## Cross-App Calls (Service Discovery)

- Resolve internal target services only via efa-one's registry API (`/api/registry/resolve/:serviceKey`)
- Never accept arbitrary destination hosts/ports from user input for backend-to-backend calls
- Treat `service_key` as allowlisted contract values in app code
- Cache discovery responses only briefly and re-resolve regularly to avoid stale routing
- Do not use manual endpoint/host fallback outside registry (`registry-only` mode)
- If required OpenAPI/capability contract data is missing, stop and request clarification instead of guessing paths
