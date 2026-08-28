# Architecture

## Overview

This template implements the standard efa-one app integration pattern:

```
efa-one Portal (IdP)
  │  iframe embeds app
  │  postMessage → CONVERGE_AUTH { token, theme }
  ▼
App Frontend (React)
  │  POST /api/auth/exchange { token }
  ▼
App Backend (Express)
  │  Validates efa-one JWT (RS256 via JWT_PUBLIC_KEY)
  │  Provisions app_users row
  │  Issues own session JWT → httpOnly cookie app_session
  ▼
App Database (PostgreSQL)
  app_users, example_items, ...
```

## Auth Flow

### In Production (embedded in efa-one)

1. efa-one renders an iframe pointing to the app's frontend URL
2. After iframe loads, efa-one sends `CONVERGE_AUTH` via postMessage:
   ```js
   { type: 'CONVERGE_AUTH', token: '<converge_jwt>', theme: { id, mode, colors } }
   ```
3. `useConvergeAuth` hook receives the message and calls `POST /api/auth/exchange`
4. The backend validates the efa-one JWT, auto-provisions the user, and sets an httpOnly `app_session` cookie
5. The efa-one JWT is discarded – it never lives in JS memory beyond the exchange
6. All subsequent API calls use `credentials: 'include'` – the cookie is sent automatically

### Local Development (not embedded)

1. `useConvergeAuth` detects it's not in an iframe
2. Calls `GET /dev/token` → backend returns a mock efa-one JWT (signed with RS256 via `JWT_PRIVATE_KEY`)
3. Proceeds with the same exchange flow as production
4. `DevHeader` is shown with a DEV MODE badge

The exchange flow is identical in both cases – no special code paths in business logic.

## Token Exchange (Security Rationale)

Receiving a JWT via postMessage and storing it in React state exposes it to XSS attacks. By immediately exchanging it for an httpOnly cookie:
- The session credential is never readable by JavaScript
- The cookie is scoped to the app's domain (not efa-one's domain)
- The app manages its own session lifecycle independently of efa-one

`JWT_PUBLIC_KEY` (efa-one's RSA public key) is only used for validation at the exchange endpoint.
`APP_SESSION_SECRET` (the app's own key) signs session cookies – these are separate secrets.

## Network Topology

```
[Internet / efa-one reverse proxy]
        │
   converge-net (external Docker network)
        │
   ┌────┴────┐
   frontend  backend
   └────┬────┘
        │
   app-internal (bridge network)
        │
     database   ← NEVER on converge-net
```

- `database` is only reachable from `backend`, never from outside
- `frontend` has a `ports:` mapping so efa-one can load it as an iframe tile; `backend` uses `expose:` only
- efa-one's nginx routes traffic to the frontend URL

## Routing Chain (Gateway -> App)

Every browser request to an embedded app follows this chain:

1. efa-one gateway receives `/apps/{serviceKey}/...`
2. Gateway rewrites and proxies to the app frontend container
3. App frontend nginx proxies:
   - `/api/*` -> app backend `:3001`
   - `/dev/*` -> app backend `:3001`
   - `/health` -> app backend `:3001`
4. Backend serves business routes

Important for shared `converge-net`:

- Do not use `proxy_pass http://backend:3001` in app nginx configs.
- Always use an app-specific backend upstream alias (for example `converge-myapp-backend`).
- Define that alias in `docker-compose.yml` under `backend -> networks -> converge-net -> aliases`.

If nginx and docker alias do not match, requests can land on another app backend and produce random 404/401 behavior.

## The @efa-one/sdk package

The efa-one integration contract lives in the `@efa-one/sdk` npm package, not in the app repo:
- `@efa-one/sdk/backend` for the Node/Express side, `@efa-one/sdk/frontend` for the browser/React side
- **Never forked or locally patched** — updates arrive via `npm update @efa-one/sdk`
- The boundary between efa-one infrastructure and app business logic

## User Model (Shadow User Pattern)

Apps don't manage passwords, identities, or roles. Identity, roles, and the role↔permission mapping live outside the app:

- **`converge_zbv`** is the single source of truth for user accounts (`name`, `email`, `forcePasswordChange`) and for role↔user assignment.
- **`converge_access`** owns permission objects and role↔permission mapping.
- **The app** maintains a thin local `app_users` table keyed on `converge_id` (= JWT `sub`). It exists only so foreign keys like `owner_id` can point at a stable UUID inside the app DB. It carries no password, no role, no permission flag — those columns must not be added.

```
ZBV (users, roles, user_roles)      ─┐
                                     ├─► converge_access joins them
converge_access (permission_objects, │   into effective permission keys
                role_permissions)   ─┘   per user, served live on
                                         GET /api/internal/users/:id/permissions
```

On first JWT exchange the app auto-provisions a row in `app_users` (id, converge_id, copy of name/email for display). On subsequent logins `last_seen_at` is bumped — nothing else changes. The app never decides "this user is admin"; it asks `converge_access` per request.

> **Übergangsmodell:** the local `name`/`email` copy in `app_users` is a cache and may drift. The target state is live lookup against ZBV (see root `BACKLOG.md` → "app_users → ZBV-SoT"). Until then, do not treat `app_users.name` as authoritative for anything beyond display.

## owner_id Convention

All user-owned data tables include `owner_id UUID REFERENCES app_users(id) ON DELETE SET NULL`. This makes scoping queries (`WHERE owner_id = $1`) straightforward and survives a future migration to live ZBV lookup without schema changes.

## Permission Model (live lookup via `converge_access`)

Permissions are **not in the JWT** and **not in the app session cookie**. Both carry identity only. Every permission decision triggers a live request to `converge_access`:

```
efa-one JWT ── identity only ──► /api/auth/exchange
   { sub, name, email,                │
     language, tenant, iat, exp }     │ sets app_session (identity only)
                                      ▼
                              business route
                                      │ requireAdminOrPermission('myapp.admin')
                                      ▼
                       @efa-one/sdk/backend/permissionClient.ts
                                      │ getUserPermissions(convergeId)
                                      ▼
                  converge_access  GET /api/internal/users/:id/permissions
                                      │
                                      ▼
                       { keys: ["myapp.default", "converge-admin", ...] }
```

**Key facts:**

- The JWT payload is exactly `{ sub, name, email, language, tenant, iat, exp, forcePasswordChange? }`. There is **no** `roles`, **no** `permissions`, **no** `role` field. Apps that look for those fields are reading a model that no longer exists.
- `converge-admin` is a permission key like any other. There is no separate "admin role". The middleware `requireAdmin` is just sugar for "must have the `converge-admin` key in the live lookup".
- Permission keys follow `{service_key}.{permission}`. Two are auto-created per tile: `.default` and `.admin` (external/weblink tiles only get `.default`). Apps register additional keys at startup via `registerPermissions()` from `@efa-one/sdk/backend/permissions.ts` — they appear immediately in the efa-one role management UI.
- No caching, no TTL. Permission changes take effect on the next request. The trade-off is one extra hop to `converge_access` per guarded route — acceptable for the responsiveness gain; see `@efa-one/sdk/backend/permissionClient.ts` header comment for the rationale.

### Backend usage (preferred)

```ts
import {
  requireAuth,                 // identity only
  requireAdmin,                // requires 'converge-admin' (live lookup)
  requirePermission,           // exact key, no admin bypass (rare)
  requireAdminOrPermission,    // 'converge-admin' OR any of the listed keys (default)
} from '../middleware/auth';

router.get('/items',          requireAdminOrPermission('myapp.default', 'myapp.admin'), handler);
router.post('/items',         requireAdminOrPermission('myapp.admin'), handler);
router.delete('/items/:id',   requireAdminOrPermission('myapp.admin'), handler);
router.get('/export',         requirePermission('myapp.can-export'), handler);   // intentionally excludes efa-one admins
router.post('/system/reset',  requireAdmin, handler);
```

> **Default is `requireAdminOrPermission`.** Use bare `requirePermission(key)` only when efa-one platform admins should explicitly **not** bypass the check — a deliberately narrow case (e.g. a privacy-sensitive export only the owning role should run).

### Frontend usage

`useConvergeAuth()` fetches the user's effective permissions via `GET /api/auth/permissions` right after the token exchange and exposes them on the `AppUser` object:

```ts
interface AppUser {
  id: string;
  convergeId: string;
  email: string | null;
  name: string;
  permissions?: string[];   // live-loaded — never persisted, never in JWT
  // ...
}

const { user } = useConvergeAuth();
const isAdmin   = user?.permissions?.includes('converge-admin') ?? false;
const canExport = user?.permissions?.includes('myapp.can-export') ?? false;
```

For a fresh re-check after a known role change, call `fetchUserPermissions()` from `hooks/useConvergeAuth.ts` — do not write your own permission cache.

### Anti-patterns (do not introduce)

- ❌ Reading `req.user.roles` / `req.user.role` / `user.roles` / `user.role` — those fields do not exist.
- ❌ Putting permissions into the efa-one JWT, the `app_session` cookie, `localStorage`, or any custom in-app cache.
- ❌ Adding a `role` column to `app_users`. Roles live in `converge_zbv`.
- ❌ Hard-coded admin lists or `if (email.endsWith('@…')) isAdmin = true` shortcuts.
- ❌ Calling `converge_access` directly from a route handler — always go through `@efa-one/sdk/backend/permissionClient.ts` or the auth middleware (which already does the lookup and emits the correct 403/503 responses).

## efa-one IPC (postMessage)

Apps communicate with the efa-one parent frame via `window.parent.postMessage`. Use the helpers in `@efa-one/sdk/frontend/ipc.ts`.

### Messages the app sends → efa-one listens for

| Message type | When to send | efa-one reacts |
|---|---|---|
| `CONVERGE_AT_START` | User navigated back to app's root/start state | efa-one navigates back to dashboard, resets history |
| `CONVERGE_DECLARE_SETTINGS` | App has an in-app settings page | efa-one shows a settings button in the tile header |

```ts
import { sendAtStart } from '@efa-one/sdk/frontend/ipc';

// e.g. in a router back-handler that reaches the root route:
sendAtStart();
```

### Messages efa-one sends → app listens for

| Message type | Meaning |
|---|---|
| `CONVERGE_AUTH` | `{ token, theme }` – sent after iframe load and on token refresh |
| `CONVERGE_GO_BACK` | User clicked efa-one's back button – navigate back within the app |
| `CONVERGE_OPEN_SETTINGS` | User clicked settings button – open the in-app settings view |

`useConvergeAuth()` handles `CONVERGE_AUTH` automatically. The template's `App.tsx` sets up the other two listeners with the correct two-step back navigation pattern:

```ts
import { sendAtStart } from '@efa-one/sdk/frontend/ipc';

// location = useLocation() from react-router-dom
window.addEventListener('message', (event) => {
  if (event.data?.type === 'CONVERGE_GO_BACK') {
    if (location.pathname === '/') {
      // Already at root — signal efa-one to close the embedded view
      sendAtStart();
    } else {
      navigate('/');
    }
  }
  if (event.data?.type === 'CONVERGE_OPEN_SETTINGS') navigate('/settings');
});
```

> **Two-step back navigation (important):** `CONVERGE_GO_BACK` means "go one step back in the app". It does NOT mean "close the embedded view". Only `CONVERGE_AT_START` (sent via `sendAtStart()`) signals efa-one to return to the dashboard. If you handle `CONVERGE_GO_BACK` by always calling `navigate('/')`, the back button stops working once the user is already on `/` — the app stays open with no way to return to the dashboard.

### Dashboard widget tiles (`/widget` route)

When a tile has a **widget path** (e.g. `/widget`), efa-one embeds that route in a small iframe. The dashboard keeps those iframes mounted when you switch to settings or full-screen app view, so widgets do not reload on every return.

**Tile click → open app (default):** On the dashboard grid, a widget tile is normally covered by a transparent control that opens the full app (same behavior as a non-widget tile). The iframe is not pointer-targetable until the widget opts in.

**Widget opt-in for links and controls:** If your widget exposes its own links, buttons, or other interactive controls, notify the parent so the iframe receives pointer events:

| Direction | Message type | Payload |
|---|---|---|
| iframe → Parent | `CONVERGE_WIDGET_INTERACTION` | `{ interactive: boolean }` — `true` when the widget has interactive elements the user must click; `false` when it does not (e.g. read-only list), so the tile click opens the app again. |

Optional: `{ suppressTileOpenMs?: number }` temporarily allows the iframe to receive clicks without opening the app (e.g. advanced cases).

```js
import { getParentOrigin } from '@efa-one/sdk/frontend/ipc';

// After mount (or when DOM gains interactive elements), e.g. when you render <a href="...">:
window.parent.postMessage({ type: 'CONVERGE_WIDGET_INTERACTION', interactive: true }, getParentOrigin());

// Read-only widget only — omit or send false so the tile surface opens the app:
window.parent.postMessage({ type: 'CONVERGE_WIDGET_INTERACTION', interactive: false }, getParentOrigin());
```

Only accept messages from `event.source === window.parent` when handling parent→iframe traffic; efa-one validates iframe→parent messages by `event.source ===` the widget iframe’s `contentWindow`.

**Soft refresh (no full iframe reload):** efa-one may send:

| Direction | Message type | Payload |
|---|---|---|
| Parent → iframe | `CONVERGE_WIDGET_REFRESH` | `{ requestId: string }` |
| iframe → Parent | `CONVERGE_WIDGET_REFRESH_RESULT` | `{ requestId, ok: boolean, error?: string }` |

Implement `CONVERGE_WIDGET_REFRESH` on the widget route: refetch data in the background (keep showing previous content if possible), then reply with `CONVERGE_WIDGET_REFRESH_RESULT` using the same `requestId`. Only accept messages from `event.source === window.parent` when embedded.

If the app does not implement the result message, efa-one falls back to a full iframe reload after a timeout.

## Theme Colors

efa-one sends a `theme` object via `CONVERGE_AUTH`. `useConvergeAuth()` applies all colors as CSS custom properties on `<html>` (e.g. `var(--color-primary)`). Never hardcode hex values – always use these variables.

| CSS variable | Property path | Description |
|---|---|---|
| `--color-primary` | `theme.colors.primary` | Brand / accent color |
| `--color-primary-hover` | `theme.colors.primaryHover` | Hover state for primary |
| `--color-secondary` | `theme.colors.secondary` | Secondary accent |
| `--color-background` | `theme.colors.background` | Page background |
| `--color-surface` | `theme.colors.surface` | Card / panel background |
| `--color-surface-raised` | `theme.colors.surfaceRaised` | Elevated surface (dropdowns) |
| `--color-border` | `theme.colors.border` | Default border |
| `--color-text-primary` | `theme.colors.textPrimary` | Main text |
| `--color-text-secondary` | `theme.colors.textSecondary` | Secondary text |
| `--color-text-muted` | `theme.colors.textMuted` | Disabled / hint text |
| `--color-success` | `theme.colors.success` | Success state |
| `--color-warning` | `theme.colors.warning` | Warning state |
| `--color-danger` | `theme.colors.danger` | Error / destructive state |
| `--color-header-bg` | `theme.colors.headerBg` | Header background |
| `--color-header-text` | `theme.colors.headerText` | Header text / icons |
| `--color-header-button-hover` | `theme.colors.headerButtonHover` | Header icon hover overlay |

The theme also carries `theme.mode` (`'light'` or `'dark'`) and `theme.id` (the efa-one theme name).

## Audit & Reporting

### Two systems, different purposes

| System | Client | Env var | Purpose |
|---|---|---|---|
| **Reporting** | `@efa-one/sdk/backend/reporting.ts` | `REPORTING_URL` | Analytics, dashboards, usage metrics in efa-one reporting-db |
| **Audit** | `@efa-one/sdk/backend/audit.ts` | `AUDIT_URL` | Compliance trail, permission-relevant actions |

Both are fire-and-forget. Both are silent no-ops when their env var is not set.

### Mandatory triggers

Business logic routes **must** emit the appropriate calls. This is how efa-one reporting-db gets populated.

| Operation | Call | Notes |
|---|---|---|
| Entity created | `reportEvent('entity.created', { id, ...ctx }, userId)` | After successful DB insert |
| Entity updated | `reportEvent('entity.updated', { id, changes }, userId)` | After successful DB update |
| Entity deleted | `reportEvent('entity.deleted', { id }, userId)` | After successful DB delete |
| User-triggered action | `reportActivity('verb', 'entity', userId)` | Export, submit, approve, reject |
| Measured operation | `reportMetric('name_ms', elapsed, { dims })` | File processing, batch sync |
| Permission-relevant event | `logAudit('entity.verb', { targetId, actor, ...ctx }, token)` | Role changes, access grants |
| Error with business context | `reportLog('error', 'message', { ctx })` | Catch blocks |

`reportActivity`'s `userId` is **mandatory in practice**: the kernel silently drops the
entry if it's missing or unresolvable (`user_activity.user_id` is `NOT NULL`).
`reportEvent`'s `userId` is optional (system-triggered events may omit it). Always pass
the platform user id — `req.user?.convergeId`, never `req.user?.sub` (app-local id, won't
resolve against the kernel's `users` table) and never a raw session cookie/token.

### Event naming convention

`noun.verb` in lowercase. Examples: `order.created`, `export.started`, `approval.rejected`, `user.role_changed`.

### Usage

```ts
import { reportEvent, reportLog, reportMetric, reportActivity } from '@efa-one/sdk/backend/reporting';
import { logAudit } from '@efa-one/sdk/backend/audit';

// After a successful DB insert:
reportEvent('item.created', { itemId: result.id }, req.user?.convergeId);

// After a user-triggered export:
const start = Date.now();
// ... export logic ...
reportActivity('export', 'items', req.user?.convergeId);
reportMetric('export_duration_ms', Date.now() - start, { format: 'csv' });

// After a permission-relevant action (role change, access grant):
logAudit('user.role_changed', { targetId: userId, newRole: 'admin', actor: req.user.sub }, req.cookies?.app_session);

// In a catch block with business context:
reportLog('error', 'Export failed', { itemCount: count, reason: err.message });
```

`logAudit` still takes an optional trailing `token` (unchanged — see `audit.ts`); `reportEvent`/`reportActivity` take a plain `userId` string, resolved live by the kernel — never pass a cookie or JWT there.

### Reporting-DB

All `reportEvent`, `reportLog`, `reportMetric`, and `reportActivity` data lands in the efa-one central reporting PostgreSQL instance. It is queryable in the efa-one admin UI under **Settings → Reporting** (requires `REPORTING_POSTGRES_PASSWORD` on the efa-one instance). Queries run against the reporting-db — never against productive app databases.

## Cross-App Service Discovery via efa-one

When an app needs data from another efa-one-integrated app, never hardcode internal Docker URLs like `http://wohnungen-backend:3000`.

Use efa-one as the source of truth:

1. Resolve the target service by `service_key` via efa-one registry (`/api/registry/resolve/:serviceKey`)
2. Cache the response for a short TTL (for example 60 seconds)
3. Use `baseUrlInternal` for backend-to-backend calls
4. On failure or non-running status, apply retry/backoff and return a clear UI hint

Recommended fallback behavior:
- transient failures: retry with exponential backoff
- `status !== 'running'`: stop early and return a domain-specific "dependent service unavailable" error
- do not silently switch to arbitrary hosts

Use `@efa-one/sdk/backend/serviceDiscovery.ts` as the default integration helper.

## Implementation Intake (required before coding)

For Cursor and Claude Code, use this checklist before implementing cross-app business logic.
If any item is unanswered, ask follow-up questions first.

1. Which dependent apps are needed (`service_key` list)?
2. Which business objects/fields are needed from each service?
3. Which operations are required per service (`read`, `write`, `update`, `delete`)?
4. What is the expected behavior when a dependency is unavailable?
5. Are there consistency rules (eventual consistency, retries, idempotency)?
6. Which acceptance criteria prove integration is complete?

The implementation may start only after these answers are explicit.

## Registry Resolve Workflow (mandatory)

For every dependent service:

1. Resolve by key: `resolveService(serviceKey)`
2. Validate returned status (`running` required for live call path)
3. Use `baseUrlInternal` for backend-to-backend calls
4. Use short TTL cache (default 60s in helper)
5. Use `openApiUrl` from registry response when endpoint contracts are needed

If `openApiUrl` is missing for required operations:
- stop implementation assumptions
- ask a follow-up question / report blocker

### Backend usage example

```ts
import { resolveService } from '@efa-one/sdk/backend/serviceDiscovery';

const wohnungen = await resolveService('wohnungen');
if (wohnungen.status !== 'running') {
  throw new Error('Dependent service wohnungen is unavailable');
}
const response = await fetch(`${wohnungen.baseUrlInternal}/api/v1/stammdaten`);
```
