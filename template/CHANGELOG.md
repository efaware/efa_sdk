# Changelog

All notable changes to this template will be documented here.

## [Unreleased]

### Changed

- **Oberste Berechtigung heißt `efa-all` (vormals `converge-admin`, efa #343, efaware/efa_kernel#98).** `App.tsx` blendet das Einstellungs-Zahnrad und die Route `/settings` für Inhaber von `efa-all` **oder** dem Alt-Key `converge-admin` ein — der Kernel liefert Apps bis Q1-2027 beide, ein Kernel vor v1.1.0 nur den Alt-Key. `requireAdmin`/`requireAdminOrPermission` aus dem SDK akzeptieren beide Keys ebenfalls. `CLAUDE.md`, `docs/ARCHITECTURE.md` und `docs/SECURITY.md` beschreiben `efa-all` und empfehlen `isPlatformAdmin()` aus `@efa-one/sdk/backend` bzw. `/frontend` statt eines String-Vergleichs. Sobald das Scaffold auf eine SDK-Version mit `isPlatformAdmin` zeigt, ersetzt der Helper die lokale Liste in `App.tsx`.

## [1.15.0] - 2026-10-19

### Added

- **Intake-Frage 0 „Werkzeug oder Verwaltung?“** — kommt vor allen anderen Fragen und muss vom User ausdrücklich beantwortet werden. Hintergrund: Nicht-Entwickler beschreiben, was eine App *tun* soll, fast nie, was sie sich *merken* soll; Claude baute dann Formulare ohne Übersicht und ohne Speicherung, auch dort, wo später nachvollzogen werden muss, was passiert ist (z. B. im ERP angelegte Aufgaben). `CLAUDE.md` erklärt die drei Grundformen (Werkzeug / Verwaltung / Werkzeug mit Verlauf) in Alltagssprache, nennt Warnzeichen, wann ein Werkzeug nicht reicht, und legt fest, was pro Antwort gebaut wird. `docs/intake.md` und `docs/BUSINESS_PROMPT_TEMPLATE.md` haben den passenden Abschnitt.

## [1.14.0] - 2026-10-19

### Changed

- **CI/CD ist für App-Bauer optional, nicht Pflicht.** README und `CLAUDE.md` erklären jetzt, dass efa one zum Installieren nur Container-Images in einer lesbaren Registry braucht. Der Build-Workflow `docker-image.yml` ist der einfachste Weg dorthin; `build-check.yml`, `security.yml`, `image-scan.yml`, Dependabot und Auto-merge sind der interne efa-one-Standard und für alle anderen eine Empfehlung. Neue Regel in `CLAUDE.md`: Agenten richten keine CI/CD ein, solange der User nicht ausdrücklich danach fragt.
- **README: neuer Abschnitt „Ausliefern"** — Images bauen, Installation über die Deployer-Kachel, Cosign-Signatur nur für die Kennzeichnung „Zertifizierte App" nötig.

### Fixed

- **`.env.example` beschrieb das abgeschaffte Shared-Secret-Modell.** `REGISTRY_API_KEY` durch die per-App-Identität `SERVICE_AUTH_KEY` ersetzt (die das SDK seit 2026-08 ausschließlich liest); Verweise auf `system/converge-kernel/scripts/deploy.sh` und `generate-jwt-keys.sh` entfernt, beides existiert nicht mehr — die Werte schreibt der Deployer. Hinweis auf den `# @pflicht`-Marker ergänzt.
- **Image-Default zeigte auf `ghcr.io/d-w-it-consulting/template_app`.** Jetzt neutraler Platzhalter `ghcr.io/your-org/template_app` in `.env.example` und beiden Compose-Dateien.
- **Naming-Beispiele mit `converge_`-Präfix** auf `efa_` umgestellt; `converge_` tragen nur noch Bestands-Apps.

## [1.5.0] - 2026-05-12

### Fixed

- **`docs/SECURITY.md` und `docs/ARCHITECTURE.md` beschrieben das alte JWT-`roles[]`-Permission-Modell.** Beide Dateien erklärten Permissions als optionales `roles?: string[]`-Feld im JWT bzw. im `app_session`-Cookie, mit `req.user.roles` / `user.roles` als Lese-Pfad und einem separaten `role === 'admin'`-Bypass für Converge-Admins. Dieser Stand existiert seit Version 1.2.0 nicht mehr (`template-core/permissionClient.ts` macht Live-Lookups gegen `converge_access`, `useConvergeAuth` füllt `user.permissions[]` aus `GET /api/auth/permissions`, `converge-admin` ist eine reguläre Permission ohne Sonderfeld). Beide Dateien wurden auf das aktuelle Modell umgeschrieben und beim Versuch eines frischen Claude-Code-Agenten, die App nur auf Basis dieser Doku zu bauen, kam genau dieser Drift als Fehler heraus. Beide Dateien enthalten jetzt zusätzlich einen expliziten „Anti-patterns"-Abschnitt mit den nicht-mehr-existenten Feldern.

- **`docs/ARCHITECTURE.md` „Shadow User Pattern" beschrieb App-managed Rollen.** Behauptungen wie „Converge role seeds the app role" und „Role management (admin ↔ user) is the app's responsibility" stammen aus 1.0.0 und sind seit der Auslagerung an `converge_zbv` (Identität + Rollen) und `converge_access` (Permission-Objekte) falsch. Abschnitt umgeschrieben: `app_users` ist ein Schatten-Eintrag für FK-Zwecke, keine `role`-Spalte mehr.

- **`backend/src/routes/dev.ts` signierte das Dev-Token mit Feldern aus dem alten Modell.** Der Mock-Payload enthielt `permissions: ['converge-admin']` (Relikt: JWT trägt keine Permissions mehr — `permissionClient.getUserPermissions()` liefert sie live aus `converge_access`) und ihm fehlte das Pflichtfeld `name` (aktuelles `JwtPayload` verlangt `name: string`). Der pg-Driver akzeptierte `undefined` als `NULL`, sodass der Exchange durchlief, aber jede UI, die `user.name` rendert, zeigte im Dev-Mode `undefined`. Payload jetzt auf das aktuelle Schema reduziert (`sub`, `name`, `email`, `tenant`); Kommentar erklärt zusätzlich, dass im Single-App-Dev ohne Converge-Stack permission-geprüfte Routen 503 zurückgeben, weil `converge_access` nicht erreichbar ist. `docs/OPERATIONS.md` entsprechend von „mock admin JWT" auf „mock identity JWT" korrigiert.

## [1.4.0] - 2026-05-11

### Fixed

- **`docker-compose.yml` ohne `image:`-Block** – Frontend- und Backend-Service hatten nur `build:`. Beim Deployment via Deployer fehlte damit der GHCR-Pull-Pfad, und der Tag-getriggerte CI-Build (`.github/workflows/docker-image.yml`) erzeugte zwar Images auf GHCR, aber Compose kannte deren Namen nicht. Folge: aus dem Template gescaffolte Apps waren ohne Hand-Edit nicht deployment-fähig.

### Added

- **`IMAGE_REPOSITORY` als App-`.env`-Variable** – Frontend und Backend nutzen jetzt `image: ${IMAGE_REPOSITORY:-ghcr.io/d-w-it-consulting/template_app}-{backend|frontend}:${IMAGE_TAG:-latest}`. Die GHCR-Org gehört in den seltensten Fällen `d-w-it-consulting` (System-Apps), sondern meist dem Partner/Kunden — `IMAGE_REPOSITORY` entkoppelt deshalb den Image-Pfad von `SERVICE_KEY` (App-Identität in Converge) und entspricht 1:1 dem CI-Output `ghcr.io/${{ github.repository }}`. Anpassung pro App vor dem ersten Tag-Push.

## [1.3.0] - 2026-04-14

### Fixed

- **Routing hardening for shared `converge-net`** - `frontend/nginx.conf` no longer proxies to generic `http://backend:3001`. The template now uses an explicit upstream host (`template-backend`) to avoid cross-app DNS collisions.

### Added

- **Backend alias contract in compose** - `docker-compose.yml` now defines a dedicated `converge-net` alias for backend traffic (`template-backend`).
- **Routing documentation for template copies** - `CLAUDE.md`, `docs/ARCHITECTURE.md`, and `docs/OPERATIONS.md` now document the required gateway -> frontend -> backend routing chain and the mandatory post-copy alias checks.

## [1.2.0] – 2026-04-07

### Fixed

- **`apiFetch` bricht FormData-Uploads** – `Content-Type: application/json` wird nicht mehr gesetzt wenn `body` eine `FormData`-Instanz ist. Der Browser setzt nun korrekt `multipart/form-data` mit Boundary.
- **CLAUDE.md nutzt `roles` statt `permissions`** – Alle Code-Beispiele und Erklaerungen verwenden jetzt `permissions`, passend zu `SessionPayload.permissions`, `AppUser.permissions` und den tatsaechlichen Typen.

### Added

- **Header-Theme-Farben** – `ConvergeThemeColors` enthält jetzt optionale Felder `headerBg`, `headerText`, `headerButtonHover`. `useConvergeAuth` setzt diese als CSS-Variablen `--color-header-bg`, `--color-header-text`, `--color-header-button-hover` mit Fallbacks. Defaults in `index.css` ergaenzt.
- **File-Upload-Boilerplate** – `store.ts` mit Upload-Verzeichnis-Management, auskommentiertes Multer-Beispiel in `index.ts`, `multer` + `@types/multer` als Dependencies. Alles opt-in per Einkommentieren.

---

## [1.1.0] – 2026-03-29

### Fixed

- **Backend `requireAdminOrPermission`** added to `backend/src/middleware/auth.ts`.
  `requirePermission` only checks `roles[]`; Converge admins have `role === 'admin'` with an empty `roles[]` and were blocked with 403 on all admin routes. The new helper runs `requireAuth` first (to populate `req.user`), then passes if `role === 'admin'` OR `roles.includes(permission)`. Use this instead of `requirePermission` for any admin-gated route.

- **Two-step back navigation** in `frontend/src/App.tsx`.
  `CONVERGE_GO_BACK` previously always called `navigate('/')`. When the user was already on `/`, pressing the Converge back button was a no-op — there was no way to return to the dashboard. Fixed: if `location.pathname === '/'`, call `sendAtStart()` (signals Converge to close the embedded view); otherwise `navigate('/')`.

- **`CONVERGE_DECLARE_SETTINGS` gated on admin status** in `frontend/src/App.tsx`.
  The settings gear icon in the Converge header was shown to all users. Non-admins who clicked it would navigate to `/settings` and be silently redirected back to `/`. Fixed: the message is only sent after auth resolves and `isAdmin` is true.

### Added

- `CLAUDE.md` and `docs/ARCHITECTURE.md` extended with explicit pitfall warnings and correct code patterns for all three fixes above.

---

## [1.0.0] – 2026-03-25

Initial release.

### Included
- `template-core/auth.ts` – JWT validation middleware, token exchange endpoint, session cookie management
- `template-core/health.ts` – `/health` and `/health/ready` endpoints
- `template-core/audit.ts` – fire-and-forget audit client
- `template-core/DevHeader.tsx` – dev-mode header with iframe detection
- Backend: app_users table, auto-provisioning, role management API
- Frontend: `useConvergeAuth` hook, postMessage + dev-mode auth flow
- Docker: converge-net / app-internal network topology, expose-only services
- Token exchange pattern: Converge JWT → httpOnly `app_session` cookie
