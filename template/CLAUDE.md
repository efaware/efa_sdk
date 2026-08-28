# efa-one App Template

efa-app-template-version: 1.13.0

## What this is

This is the standard template for apps that integrate with the efa-one portal.
It provides all infrastructure ready-built. You build business logic only.

## Rules

### The SDK is off-limits — never fork or patch it
The shared infrastructure lives in the `@efa-one/sdk` npm package, not in this repo.
Never vendor, fork, or locally patch it — changes go into the `efa-sdk` repo + a new npm
release, and the app pulls them with `npm update @efa-one/sdk`. All business logic goes
in `backend/src/` and `frontend/src/`.

What the SDK provides:
- `@efa-one/sdk/backend/auth.ts` – JWT validation, token exchange, session middleware
- `@efa-one/sdk/backend/health.ts` – health endpoints
- `@efa-one/sdk/backend/audit.ts` – audit client
- `@efa-one/sdk/backend/reporting.ts` – reporting client (events, logs, metrics, activity)
- `@efa-one/sdk/backend/notifications.ts` – notification client (fire-and-forget to kernel)
- `@efa-one/sdk/frontend/ipc.ts` – postMessage helpers for efa-one parent frame communication
- `@efa-one/sdk/backend/permissions.ts` – Boot-Push-Registrierung von Code-Permissions (Legacy-Pfad, additiv beibehalten)
- `@efa-one/sdk/backend/permissionClient.ts` – live permission lookup, Bulk-Variante (Default für bestehende Apps)
- `@efa-one/sdk/backend/permissionCheck.ts` – Single-Permission-Check mit Audit-Logging bei unbekanntem Key (optional, additiv)
- `@efa-one/sdk/backend/customPermissions.ts` – Custom Permission Objects zur Laufzeit anlegen/löschen
- `@efa-one/sdk/backend/apiRegistry.ts` – API metadata & capability registration (MCP tools)
- `@efa-one/sdk/backend/serviceDiscovery.ts` – service registry lookups with TTL cache
- `@efa-one/sdk/backend/serviceClient.ts` – app-to-app calls via efa-one gateway
- `@efa-one/sdk/frontend/i18n.ts` – frontend i18n factory (react-i18next init)
- `@efa-one/sdk/backend/i18n-backend.ts` – backend i18n helper (loadLocales, t)
- `@efa-one/sdk/frontend/format` – platform-wide date/time display (`formatDate` → `01.09.2026`,
  `formatDateTime` → `01.09.2026, 11:05`, `formatTime`, `formatFileStamp`, `localeForLanguage`).
  Mandatory for every timestamp shown in the UI — `toLocaleDateString`/`toLocaleString` on a
  date is forbidden (renders `1.9.2026`, or the browser locale's `9/1/2026`) and is caught by
  the `no-restricted-syntax` ESLint gate. Spec: DESIGN_SYSTEM.md → „Datum & Uhrzeit“
- `@efa-one/sdk/frontend/DevHeader.tsx` – dev-mode header
- `@efa-one/sdk/frontend/ui` – das efa-one-Design-System-Kit (Button, Dialog, DropdownMenu, Tooltip, Badge, Input, Alert, EmptyState, Skeleton, RecordDialog, **DataTable**) + `@efa-one/sdk/frontend/ui/styles.css`
- `@efa-one/sdk/frontend/viewPreferences` – Persistenz-Adapter der `DataTable` (`createViewPreferencesClient`, `useViewPreferences`)

### Externe Abhängigkeiten — erst prüfen, dann aufnehmen
Keine neue npm-Dependency (oder OS-/`apk`-Paket) wird eingebaut, ohne sie vorher zu
prüfen. Vor jedem `npm install <paket>` bzw. `apk add`:

1. **Notwendigkeit** — kann das `@efa-one/sdk`, die Node-Standardbibliothek oder eine
   bereits vorhandene Dependency das schon? Keine Dependency für Trivialitäten.
2. **Lizenz** — permissiv ok (MIT, MIT-0, ISC, Apache-2.0, BSD, MPL-2.0, OFL-1.1).
   **Copyleft (GPL/AGPL/LGPL) ist rückfragepflichtig**, nicht einfach aufnehmen.
3. **Wartung & CVEs** — letzter Release aktuell? `npm audit` / Advisories sauber?
   Unmaintainte Pakete (letzter Release > ~2 Jahre) meiden.
4. **Angriffsfläche** — parst das Paket untrusted Input (Uploads, externe Feeds)?
   Ist es ein natives Modul? Dann bewusst entscheiden + isolieren.

Keine `DEPENDENCIES.md` pflegen — der Dependency-Nachweis lebt in `package-lock.json`
+ `npm audit`. CVEs und Lizenzen prüft die CI automatisch (Dependabot, Trivy,
`license-checker` — Copyleft GPL/AGPL/LGPL failt den Build). Der einzige manuelle
Schritt ist die Notwendigkeitsfrage (Punkt 1).

### Auth is handled – do not re-implement it
- Frontend: use `useConvergeAuth()` hook → provides `{ user, theme, isReady }`
- Backend: protect routes with `requireAuth` / `requireAdmin` from `./middleware/auth`
- Cookie-based session is managed by `@efa-one/sdk/backend/auth.ts` via the exchange endpoint

### API calls use credentials: include
All frontend fetch calls go through `apiFetch()` in `src/api.ts`.
Never add Authorization headers – the httpOnly cookie handles auth automatically.

### Cross-app integrations use efa-one Registry
- Always resolve other app backends via efa-one service discovery (`/api/registry/resolve/:serviceKey`)
- Never hardcode internal Docker hosts (e.g. `http://service:3000`) in business code
- Use stable `service_key` contracts between apps
- Prefer `@efa-one/sdk/backend/serviceDiscovery.ts` for registry lookups + short-lived cache

### Mandatory Workflow for Cursor + Claude Code
For cross-app requirements, follow this order and do not skip steps:
1. Ask the required intake questions (see `docs/ARCHITECTURE.md`, section "Implementation Intake")
2. Collect and confirm target `service_key` values
3. Resolve targets via efa-one Registry only
4. If registry/OpenAPI data is missing, ask follow-up questions and stop implementation assumptions
5. Implement only after intake answers and registry data are complete

Failure policy:
- No registry entry or missing OpenAPI data for required operations means blocker.
- Do not invent endpoint paths.
- Do not accept manual host/port fallback outside registry.

### Dev routes are automatically disabled in production
The Dockerfile sets `ENVIRONMENT=production`. The `/dev/token` route only registers
when `ENVIRONMENT !== 'production'`. Never change this.

### Tests: die mitgelieferte Basis erweitern, nicht ersetzen

Das Scaffold kommt mit einer **laufenden Testsuite** — `npm test` ist ab dem ersten
Commit grün, es gibt kein `--passWithNoTests`. Verbindlicher Standard ist die
`TESTING.md` des Meta-Repos; hier nur, was für diese App-Vorlage gilt:

| Ort | Inhalt |
|---|---|
| `backend/test/helpers/` | geteilte Bausteine: `sqliteDb` (echte Temp-SQLite aus `schema.sqlite.sql`), `testApp` (Express-App um einen Router) |
| `backend/test/factories/` | typsichere Factories für Domänenobjekte |
| `backend/src/__tests__/unit/` | reine Logik, I/O gemockt |
| `backend/src/__tests__/routes/` | supertest gegen den echten Router-Stack |

**`backend/test/**` liegt bewusst außerhalb `src/`** und ist in `tsconfig.json`
ausgeschlossen — Testcode darf nie im `dist/` landen. Weil Vitest per esbuild
transpiliert und dabei **nicht** typprüft, gibt es dafür `tsconfig.test.json` und
`npm run typecheck:test`. Beides mitziehen, wenn du Testverzeichnisse verschiebst.

Zwei Kommandos:

```bash
npm test              # schnell, alles gemockt — läuft im Stop-Hook und im PR-Gate
npm run test:coverage # dieselbe Suite + Coverage-Gate (so läuft die CI)
```

**Coverage-Ratchet:** In `vitest.config.ts` steht ein globaler Floor plus Per-Datei-Gates
auf den dicht getesteten Modulen. Wenn deine Tests die Abdeckung heben, **zieh die Werte
nach — senke sie nie.** Neue kritische Module bekommen sofort ein eigenes Per-Datei-Gate.
Ein Schwellen-Key, der auf keine Datei mehr passt, würde von Vitest **still ignoriert**;
dagegen steht ein `existsSync`-Guard in der Config, der beim Laden hart abbricht.

Was die mitgelieferten Tests abdecken (und warum genau das): den SQLite-Adapter
(`dbSqlite.ts` — die Datei mit der meisten echten Logik, inkl. `$n`→`?`-Übersetzung),
die Treiberwahl in `db.ts`, den Token-Exchange gegen eine echte SQLite und die
Health-/OpenAPI-/Dev-Routen. Reine SDK-Fassaden (`middleware/auth.ts`, `audit.ts`)
bekommen nur einen Export-Flächen-Test — ihr Verhalten gehört ins SDK, nicht hierher.

## Stack-Varianten: Standard (3 Container) vs. Single-Container

Eine App wählt **eine** von zwei Stack-Varianten. Beide werden von der Plattform
**identisch** verarbeitet (Discovery, Gateway-Routing, Auth, Reporting) — die
Wahl betrifft nur Container-Zuschnitt und Datenbank.

| | **Standard-Stack** | **Single-Container-Stack** |
|---|---|---|
| Container | frontend + backend + database (3) | backend (1) |
| Datenbank | PostgreSQL (eigene Instanz) | SQLite-Datei im Volume |
| `DB_DRIVER` | `postgres` (Default) | `sqlite` |
| Compose | `docker-compose.yml` | `docker-compose.single.yml` |
| Dockerfile(s) | `backend/Dockerfile` + `frontend/Dockerfile` | `Dockerfile.single` |
| Schema | `backend/src/db/schema.sql` | `backend/src/db/schema.sqlite.sql` |
| CI-Workflow | `.github/workflows/docker-image.yml` | `…/docker-image.single.yml` (umbenennen) |
| SPA-Auslieferung | Frontend-nginx | Backend via `express.static` (`SERVE_STATIC=true`) |

**Wann welche Variante? (verbindliche Entscheidungsregel)**

Nimm **Single-Container + SQLite**, wenn **alle** zutreffen:
- Die App ist **kein System-of-Record für Stammdaten**, die andere Apps/Prozesse als Quelle nutzen.
- Kleines bis mittleres Datenvolumen, überwiegend **einzelne Schreiber** (kein hoher Schreib-Parallelismus — SQLite serialisiert Writes).
- Keine komplexen relationalen Auswertungen, keine JSONB-/Volltext-Indizes, kein Reporting direkt auf der DB.
- Kein absehbares Wachstum in eine der obigen Richtungen.

Nimm **Standard-Stack + PostgreSQL**, wenn **eines** zutrifft:
- Die App hält **Stammdaten** (Mitarbeiter, Kunden, Artikel …) oder ist deren Quelle.
- Hohe Schreib-Concurrency, große Datenmengen oder **komplexe Queries** (Joins, JSONB, Volltext).
- Reporting/Analytik direkt auf der App-DB.
- Absehbares Wachstum dorthin.

> Im Zweifel **PostgreSQL**: eine spätere Migration SQLite → PostgreSQL ist Aufwand,
> der umgekehrte Weg meist unnötig. Faustregel: „Hält die App komplexe Stammdaten
> oder bildet komplexes Verhalten ab? → 3 Container + PostgreSQL. Sonst → 1 Container + SQLite."

**Wie es technisch funktioniert (keine Kernel-Änderung nötig):**
- `backend/src/db.ts` schaltet anhand `DB_DRIVER` zwischen echtem `pg.Pool` und einem
  `pg.Pool`-kompatiblen SQLite-Adapter (`backend/src/dbSqlite.ts`). **Das `@efa-one/sdk`
  bleibt unangetastet** — `@efa-one/sdk/backend/auth` erwartet einen `pg.Pool`, der Adapter erfüllt diesen
  Vertrag (übersetzt `$n`→`?`, registriert `NOW()`/`gen_random_uuid()`, nutzt nativ
  `ON CONFLICT … RETURNING`). App-/Business-Code importiert nur `pool` und sieht keinen Unterschied.
- Single-Container: ein Image bedient SPA + `/api` + `/health` auf Port **3001**. Die
  Plattform erkennt den Service über das Label `com.docker.compose.service=backend`; da kein
  `frontend`-Service existiert, fällt `registrySync` auf den backend-Container zurück und das
  Gateway routet `/apps/{serviceKey}/` → `backend:3001` (Prefix wird weggerewritet). Genau
  deshalb **muss** das Backend die SPA selbst ausliefern (`SERVE_STATIC=true`).
- SQLite-Daten liegen im Volume `app-data` unter `/app/data/app.db`. Backup = Volume/Datei.
  Kein `app-internal`-Netz, kein DB-Container.

**Beim Umstieg auf den Single-Container-Stack** (oder beim Scaffolding einer Single-Container-App):
- `docker-compose.single.yml` als `docker-compose.yml` verwenden, die 3-Container-Variante entfernen.
- `.github/workflows/docker-image.single.yml` → `docker-image.yml` umbenennen, die alte löschen
  (sonst doppelter Build beim Tag-Push).
- `schema.sqlite.sql` pflegen (SQLite-Dialekt: TEXT-IDs, `CURRENT_TIMESTAMP`); `schema.sql`
  kann entfernt werden. Strukturierte Werte selbst als TEXT serialisieren (kein JSONB).

## How auth works

```
efa-one iframe → postMessage CONVERGE_AUTH { token }
  → useConvergeAuth hook → POST /api/auth/exchange
  → httpOnly app_session cookie set
  → all requests use credentials: 'include'
```

In local dev (not in iframe + ENVIRONMENT=development):
```
GET /dev/token → mock JWT → same exchange flow
```

## Fachliche Intake-Fragen (Pflicht — verbindlich für Claude)

Diese App hat eine `docs/intake.md`. Sie enthält pro Kernel-/System-Service einen
Block mit der **fachlichen** Frage und der daraus abgeleiteten Code-Stelle.

**Ziel:** Auch Nicht-Entwickler sollen fachlich beschreiben, was die App tun
soll — der Rest (welche SDK-Funktion, welche Permission, welcher
Reporting-Hook) wird daraus abgeleitet. Fragen sind immer fachlich gestellt
(„Wer darf was?"), nicht technisch (nicht „Soll `registerPermissions` aufgerufen
werden?").

### Pflicht-Workflow vor jeder Code-Änderung

1. **Lies `docs/intake.md`.** Pro Frage: Antwort vorhanden → respektieren und
   überspringen. Antwort fehlt (`Status: ⏳ offen`) → vor dem ersten Code-Diff
   stellen.
2. **Vorschlag mitliefern.** Bevor du eine Frage stellst, leite aus der
   App-Beschreibung (`description` in `package.json` / OpenAPI) eine Vermutung
   ab und formuliere sie so:
   > „Aus der App-Beschreibung **„{description}"** vermute ich
   > **{Heuristik}**. Daher schlage ich vor: **{Default-Option}**. Passt das?"
3. **Frage über `AskUserQuestion`** mit 3–4 vorgeschlagenen Optionen plus
   Freitext-Slot. Die erste Option ist deine Empfehlung mit „(Empfehlung)".
4. **Antwort persistieren** — den entsprechenden Block in `docs/intake.md`
   füllen (Status auf `✅ beantwortet (YYYY-MM-DD)`, Antwort-Text + Ableitung).
5. **Code-Stub setzen** (oder als TODO markieren mit Rückreferenz
   `// INTAKE: docs/intake.md §N`). Status auf `🔧 im Code umgesetzt`.

### Wiedereinstieg / spätere Erweiterungen

- `Template-Version` in `docs/intake.md` < aktuelle Template-Version → nur die
  neu hinzugekommenen Fragen stellen.
- Wenn der User „durchlauf den Intake nochmal" sagt → alle 13 Punkte mit den
  vorhandenen Antworten zur Aktualisierung anbieten.

### Pflichtfragen (9)

Reihenfolge ist verbindlich. Wenn `/new-app` schon einen Pre-Intake gemacht hat
(Fragen 1, 2, 7, 8, 9 — alles, was direkt aufs Scaffolding wirkt), starte beim
ersten unbeantworteten Punkt.

| # | Frage (in Du-Form, Deutsch) | Vorgeschlagene Optionen | Was du daraus ableitest |
|---|---|---|---|
| 1 | Wer darf in deiner App was? Beschreibe die Rollen aus Sicht der Mitarbeiter. | (a) Alle dürfen alles — nur `.default` reicht  (b) Lesen / Bearbeiten / Admin (Empfehlung)  (c) Eigene Rollen | `registerPermissions(SERVICE_KEY, [...])` in `backend/src/index.ts`; `requireAdminOrPermission(...)` auf POST/PATCH/DELETE; `x-converge.default_permissions` synchron in `routes/openapi.ts` |
| 2 | Sehen alle Benutzer dieselben Daten, oder soll jeder Mitarbeiter nur seine eigenen Datensätze sehen? | (a) Alle sehen alle Daten (zentrale Verwaltung)  (b) Jeder sieht nur eigene Daten  (c) Eigene + explizit geteilte Daten  (d) Rollenabhängig (Mitarbeiter eigene, Vorgesetzte alles) | bei (a): keine Änderung. bei (b)/(d): `WHERE owner_id = $userId` in jeder SELECT-Route, zentral als `restrictToOwner(req, query)`-Helper in `backend/src/db/scope.ts`. bei (c): zusätzliche `record_shares`-Tabelle in `schema.sql`. bei (d): `canSeeAll`-Permission-Check vor dem Filter |
| 3 | Welche Vorgänge in deiner App sollen im efa-one-Dashboard als Kennzahlen sichtbar werden? | (a) Anzahl neuer Einträge  (b) Abgeschlossene Vorgänge  (c) Fehler / Abbrüche  (d) Eigene | `reportEvent` / `reportActivity` / `reportMetric`-Hooks in den passenden Routen (siehe „Audit & Reporting accompany every business logic change" weiter unten) |
| 4 | Welche Vorgänge müssen revisionssicher protokolliert werden? | (a) Nur Löschungen  (b) Genehmigungen + Statusänderungen + Löschen (Empfehlung bei Compliance)  (c) Alle Schreibvorgänge  (d) Keine | `logAudit('entity.verb', { targetId, …context })` in den entsprechenden Routen |
| 5 | Wann sollen Nutzer eine Push-Benachrichtigung in efa-one erhalten? | (a) Bei Zuweisung  (b) Bei Fehler / Frist  (c) Nie  (d) Eigene | `sendNotification({ userId, type, title, body, link })` mit deep-link auf die App |
| 6 | Versendet die App E-Mails nach außen? | (a) Nein  (b) Transaktional (Bestätigung, Reset)  (c) Regelmäßige Reports — Cron geplant | `sendMail({ to, subject, body_text })` aus `@efa-one/sdk/backend/mail`. Bei (c): Hinweis „Cron-Jobs sind geplant (`@efa-one/sdk` `jobs`, BACKLOG), vorerst nur manueller / externer Trigger" |
| 7 | Soll der efa-one-KI-Assistent Aktionen in deiner App ausführen können (z.B. „Lege einen neuen Kunden an" per Sprachbefehl)? | (a) Nein, App ist nur über UI bedienbar  (b) Nur Lesen (Listen abfragen)  (c) Lesen + Schreiben | `registerApiMetadata(SERVICE_KEY, { capabilities: [...] })` mit `ApiCapability`-Einträgen pro Aktion; URL-Parameter `:id` müssen im `requestSchema` als Property vorkommen |
| 8 | Greift deine App auf Daten anderer efa-apps zu (Kalender, Mail, Chat, ZBV, …)? | (a) Nein  (b) Mehrfach-Auswahl aus installierten Apps  (c) Eigene Liste | Service-Keys in `docs/intake.md §8`; `resolveService(...)` + `serviceClient.call(...)` in `backend/src/services/`-Stubs; **niemals** hardcoded Hosts |
| 9 | In welchen Sprachen soll die App verfügbar sein? | (a) Nur Deutsch (Empfehlung für interne Apps)  (b) Deutsch + Englisch  (c) Mehr | `frontend/src/locales/{de,…}/common.json` + `initI18n(['de','en'])`; im Backend `loadLocales()` falls Texte zurückgegeben werden |

### Bedingte Fragen (4) — nur bei Heuristik-Treffer stellen

Stell die Frage automatisch, wenn die App-Beschreibung eines der Trigger-Wörter
enthält. Sonst „↪ übersprungen" lassen und beim Implementieren der jeweiligen
Funktion noch einmal nachfragen.

| # | Frage | Trigger-Wörter in der Beschreibung | Ableitung |
|---|---|---|---|
| 10 | Sollen Belege oder Dokumente per OCR ausgelesen werden? | „Beleg", „Rechnung", „Scan", „PDF", „Dokument" | `serviceClient.call('converge_ai', ...)` auf den OCR-Endpoint; Upload-Route-Stub |
| 11 | Soll die App eigenes Wissen für KI-Antworten bereitstellen (RAG / Wissens-Silo)? | „Anleitung", „FAQ", „Wissen", „Suche" | `converge_ai` Silo-Anlage beim Start; Embedding-/Such-Aufrufe |
| 12 | Soll der Nutzer per Sprache eingeben können (Voice2Text)? | „Sprache", „Aufnahme", „mobil", „unterwegs" | `converge_ai` Voice2Text-Endpoint; Mikrofon-Button im Frontend |
| 13 | Soll die App planmäßig im Hintergrund laufen (z.B. nächtlicher Reminder, wöchentlicher Report)? *(geplant, BACKLOG)* | „täglich", „wöchentlich", „Erinnerung", „Report" | TODO ins README + intake.md mit Hinweis „kommt später ins SDK (`@efa-one/sdk` `jobs`, BACKLOG)" |

### Was NICHT abgefragt wird (immer automatisch im Template)

- Auth (JWT-Validierung, Cookie-Exchange, `requireAuth`/`requireAdmin`)
- Health-Endpoints (`/health`, `/api/health`)
- OpenAPI-Endpoint `/api/openapi.json` (Discovery-Vertrag)
- Service-Registry-Eintrag (automatisch über Tile-Anlage)
- IPC-Grundgerüst (`CONVERGE_GO_BACK`, `CONVERGE_DECLARE_APP_INFO`)
- Pflicht-`reportEvent` nach jeder DB-Schreiboperation — laut Doku verbindlich;
  Frage 3 verfeinert nur, **was** geloggt wird, nicht **ob**
- Standard-Permissions `.default` und `.admin` (automatisch via Tile)
- Build-Pflicht, Network-Setup, Cookie-Namen — fest verdrahtet
- **Stack-Variante (Standard 3-Container/PostgreSQL vs. Single-Container/SQLite):** wird im
  `/new-app`-Pre-Intake einmalig festgelegt (siehe Abschnitt „Stack-Varianten" oben) und
  bestimmt Compose-/Dockerfile-/Schema-Auswahl. Danach nicht mehr Teil des fachlichen Katalogs.

### Definition of Done für den Intake

Eine App ist „fachlich vollständig" wenn:

- alle 9 Pflichtfragen in `docs/intake.md` Status ≥ `✅ beantwortet` haben
- bedingte Fragen 10–13 entweder beantwortet oder als „↪ übersprungen" markiert sind
- `registerPermissions(...)` in `backend/src/index.ts` Frage 1 reflektiert
- `x-converge.default_permissions` in `routes/openapi.ts` synchron zu Frage 1 ist
- bei Frage 2 ≠ (a): `restrictToOwner`-Helper bzw. äquivalenter `owner_id`-Filter
  in jeder SELECT-Route der App existiert
- bei Frage 4 = (b)/(c): `logAudit`-Hooks vorhanden
- bei Frage 5 ≠ (c): `sendNotification`-Hooks in passenden Routen
- bei Frage 6 ≠ (a): `sendMail`-Aufruf vorhanden
- bei Frage 7 ≠ (a): `registerApiMetadata` mit ≥ 1 Capability + Schema in OpenAPI
- bei Frage 8 ≠ (a): `serviceDiscovery`-Lookups vorhanden
- Frage 9: `locales/{de,…}/common.json` angelegt
- bei bedingten 10–12 = ja: `CONVERGE_AI_*`-Env-Vars in `.env.example` ergänzt + Stub-Routen

> **User-Eingabevorlage:** Wenn der User selbst die fachliche Beschreibung
> strukturiert liefern will, verweise ihn auf `docs/BUSINESS_PROMPT_TEMPLATE.md`.
> Dort steht die Copy/Paste-Vorlage. `intake.md` ist die Antwort-Persistenz auf
> deiner Seite — `BUSINESS_PROMPT_TEMPLATE.md` ist die Eingabe-Vorlage auf
> User-Seite.

## Where to add business logic

| What | Where |
|---|---|
| New API routes | `backend/src/routes/` |
| New DB tables | `backend/src/db/schema.sql` (below the divider) |
| New pages | `frontend/src/pages/` |
| Shared types | `backend/src/types.ts` / `frontend/src/types.ts` |

### Audit & Reporting accompany every business logic change

Every route that creates, updates, or deletes data must emit reporting/audit calls after the DB write succeeds.
These calls are **mandatory** – they feed the efa-one dashboard reporting-db and compliance audit trail.
Never await them on the critical path. Never skip them.

| Action type | Required call | Timing |
|---|---|---|
| Create / update / delete any entity | `reportEvent('entity.verb', { id, ...context }, req.user?.convergeId)` | After successful DB write |
| User-facing action (export, submit, approve, reject) | `reportActivity('verb', 'entity', req.user?.convergeId)` | After action completes |
| Measured operation (batch, file processing, sync) | `reportMetric('name_ms', elapsed, { ...dims })` | After operation |
| Permission-relevant / compliance event | `logAudit('entity.verb', { targetId, ...context }, req.cookies?.app_session)` | After action |
| Errors with business context | `reportLog('error', 'message', { ...context })` | In catch block |

**Event naming:** `noun.verb` lowercase — e.g. `order.created`, `export.started`, `approval.rejected`.

`reportActivity`'s `userId` is **mandatory in practice** — the kernel silently drops the
entry if it's missing or doesn't resolve to a real Converge user (`user_activity.user_id`
is `NOT NULL`). `reportEvent`'s `userId` is optional; omit it only for system-triggered
events with no acting user. Always pass the platform user id (`req.user?.convergeId`),
**never** `req.user?.sub` (that's the app-local id and won't resolve against the kernel's
`users` table) and never a raw session cookie/token.

```ts
import { reportEvent, reportActivity, reportMetric, reportLog } from '@efa-one/sdk/backend/reporting';
import { logAudit } from '@efa-one/sdk/backend/audit';

// After a successful DB insert:
reportEvent('item.created', { itemId: result.id }, req.user?.convergeId);

// After a user-triggered export:
reportActivity('export', 'items', req.user?.convergeId);
```

Both clients are fire-and-forget. If `REPORTING_URL` / `AUDIT_URL` is not set, calls are silent no-ops — no try/catch needed around them.

## UI components

Das efa-one-Design-System-Kit kommt aus dem SDK: **`@efa-one/sdk/frontend/ui`**
(nicht mehr als vendored Kopie im App-Repo). So propagieren Fixes/Features am Kit
per SDK-Version-Bump in alle Apps.

```tsx
import { Button, Badge, Dialog, DropdownMenu, Tooltip, EmptyState, Skeleton, RecordDialog, Alert, DataTable } from '@efa-one/sdk/frontend/ui';
```

**Einmal pro App** die Begleit-Styles importieren (liefert die `.badge`/`.skeleton`-
Klassen + Shimmer-Keyframes) — im Template steht das bereits in `main.tsx`:

```tsx
import '@efa-one/sdk/frontend/ui/styles.css';
```

Voraussetzung im Consumer (liefert das Scaffold mit): die Design-Tokens
(`--color-*`, `--border-radius-*`, aus `converge-tokens.css`, kernel-runtime-
überschrieben) + das Tailwind-Radius-Mapping (`tailwind.config.js`).

| Component | When to use |
|---|---|
| `Button` | All buttons — variants: `primary`, `secondary`, `danger`, `ghost`. Pass `loading` for spinner. |
| `Badge` | Status labels — variants: `success`, `warning`, `danger`, `neutral`. |
| `Alert` | Fehler-/Status-**Banner** in Formularen/Dialogen — variants: `error`, `success`, `warning`, `info`; `onDismiss` für „×". Nie handgerollt (Kontrast-Falle, siehe Regel unten). |
| `Dialog` | Confirmations, forms in modal. Always use for destructive actions. Breite über `size` (`sm`…`5xl`, Default `md`) — nicht per `className` überschreiben. **Höhe** ist auf `90vh` gedeckelt: der Body scrollt, Header und Footer stehen fest — Formulare dürfen also beliebig lang werden, der Speichern-Button bleibt erreichbar. Ein Banner, das beim Scrollen sichtbar bleiben muss (Fehler/Validierung), gehört in den `banner`-Slot, **nicht** in `children`. |
| `RecordDialog` | **Pflicht** für Detail-Ansichten von Listen-Einträgen (siehe „Detail-Dialog-Pattern" weiter unten). |
| `DropdownMenu` | Context menus, "more" menus (MoreHorizontal icon). |
| `Tooltip` | Hints on icon-only buttons. |
| `EmptyState` | Every list/table that can have zero items. |
| `Skeleton` | Initial data loading — not for button submit states (use `Button loading` instead). |
| `DataTable` | **Pflicht** für jede Liste/Tabelle (siehe „Listen-Verhalten" weiter unten). |

**Icons:** import from `frontend/src/lib/icons.ts` for the curated set, or directly from `lucide-react`.
Sizes: `w-4 h-4` inline, `w-5 h-5` standalone. Never use other icon libraries.

**Rules:**
- No fully-styled component libraries (MUI, Ant Design, Chakra, shadcn)
- All colors via `var(--color-*)` — never hardcoded hex values
- Destructive actions always behind a `Dialog` confirmation
- **Fehler-/Validierungsbanner immer über `Alert` (nie handgerollt).** Zwei
  Pflichtregeln (Details: `app-development-specs/DESIGN_SYSTEM.md` → „Zustände →
  Fehler-/Validierungsbanner"): **(1) lesbarer Kontrast** — nie Text in der
  Flächen-Farbe; **niemals** `bg-[var(--color-danger)] bg-opacity-10` (die
  Opacity wirkt auf Arbitrary-Farben nicht → Rot-auf-Rot). **(2) sichtbar am Ort
  der Aktion** — das Banner sitzt oben im Body, **außerhalb** des scrollenden
  Bereichs (`shrink-0`), damit es beim Klick auf einen weiter unten liegenden
  Submit-Button sichtbar ist. Dismissbar („×") + beim erneuten Validieren
  `setError('')`. `noValidate` am `<form>`, damit alle Fehler durch dasselbe
  Banner laufen (nicht die native Browser-Bubble).
- **Leicht abgerundete Ecken.** Das efa-one-Design nutzt dezent weiche Kanten. Der Radius kommt ausschließlich aus den CSS-Variablen `--border-radius-sm|md|lg` (aktuell einheitlich 3px), die in `tailwind.config.js` als `rounded-sm|md|lg` (plus `rounded` = md) verdrahtet sind. Nutze diese Utilities: Buttons/Inputs/Dropdowns → `rounded-md`, Cards/Panels/Modals → `rounded-lg`, Badges/Tags → `rounded-sm`. `rounded-none` nur für bewusst eckige Sonderfälle, `rounded-full` für echte Kreise (Spinner/Avatare/Status-Dots). **Niemals** `rounded-xl|2xl|3xl` oder fixe `rounded-[Npx]`-Arbitraries — sie umgehen die CSS-Variable (die einzige Stellschraube) und brechen das Design.

## Sprache & Umlaute (Pflicht für deutschsprachige Apps)

Deutsche Umlaute (**ä, ö, ü, ß** inkl. scharfes ß) müssen in allen user-facing Strings als echte Unicode-Zeichen geschrieben werden — **nicht** als Umschreibungen `ae`, `oe`, `ue`, `ss`.

Das gilt für:
- UI-Labels, Button-Texte, Dialog-Titel, Beschreibungen, Platzhalter
- Fehlermeldungen und Hinweistexte (auch Backend-Responses und `alert()`-Texte)
- Kommentare in deutscher Sprache
- LLM-System-Prompts und User-Prompts
- README-/Doku-Texte

**Beispiele:**
- ✅ „Schließen", „Größe", „Änderung", „Müssen", „Straße"
- ❌ „Schliessen", „Groesse", „Aenderung", „Muessen", „Strasse"

**Ausnahmen** (hier `ae/oe/ue/ss` zulässig):
- Variablennamen, Funktionsnamen, Property-Keys (`aenderungsgrund`, `var_groesse`)
- CSS-Klassen, URL-Pfade, technische Identifier
- Dateinamen im Dateisystem
- Tag-/Slug-Normalisierung (siehe `helpers/normalize.ts`-Pattern)

**Häufige Verstöße bei Claude:** „Schliessen" statt „Schließen", „muessen" in Hinweistexten, „Aenderung" in Toast-Messages. Vor jedem User-facing String ein Kontroll-Blick.

## Page-Layout — zentrierte Container (Pflicht)

Alle Form-/Settings-/Detail-Sub-Pages werden **zentriert**. `max-w-*` ohne `mx-auto` ist der häufigste Copy-Paste-Fehler beim Schreiben neuer Pages aus diesem Template.

**Pflicht-Pattern:**

```tsx
<div className="p-6 max-w-3xl mx-auto space-y-4">
  {/* Settings-Sub-Page / Formular / Detail-Inhalt */}
</div>
```

| Page-Typ | Empfohlene Max-Breite | Anmerkung |
|---|---|---|
| Settings-Sub-Page, einfaches Formular | `max-w-3xl` (768 px) | Standard für Konfigurationsmasken |
| Komplexes mehrspaltiges Formular | `max-w-4xl` (896 px) | z. B. Detail-Form mit Side-by-Side-Inputs |
| Listen-/Detail-Hauptseite mit Sidebars | `max-w-[100rem] mx-auto` oder voll | Sidebars stellen die Strukturierung |

`max-w-3xl` alleine erzeugt einen 768 px-Block am linken Bildschirmrand — auf großen Displays sieht das unfertig aus und ist ein Design-Bruch. **`mx-auto` ist nicht optional.**

**Vor dem Commit kurz prüfen:**

```bash
grep -rEn "className=\"[^\"]*max-w-[^\"]*\"" frontend/src/pages \
  | grep -v "mx-auto" \
  | grep -v "ListPage\|DetailPage"   # Hauptseiten mit Sidebars sind Ausnahmen
```

Treffer ohne `mx-auto` sind in 95 % der Fälle Schlampigkeit.

Verbindliche Quelle: `system/converge-kernel/app-development-specs/DESIGN_SYSTEM.md` (Abschnitt „Page-Layout — zentrierte Container").

## Kein App-Header — Titel/Status/Aktionen gehören in den Footer (Pflicht)

Der **efa-one-Kernel liefert bereits eine Header-Leiste** (App-Name, Hilfe-/Settings-Icon,
Chat, Benachrichtigungen, Benutzer) **inklusive Zurück-Navigation** (`CONVERGE_GO_BACK`).
Eine App darf **keine eigene seitenweite Header-/Titelleiste** rendern — sonst stehen zwei
Header und zwei Zurück-Pfeile untereinander.

**Verboten** (außer der User verlangt es ausdrücklich):
- Eine sticky/top `<header>`-Leiste mit App-Titel, Statusanzeige und primären Aktionen.
- Ein eigener „Zurück"-Button/Pfeil (der Kernel macht das über `CONVERGE_GO_BACK`).
- Eine `<h1>` mit dem App-Namen (der Kernel zeigt ihn schon).

**Stattdessen:** Seiten-Titel/-Status und primäre Aktionen (Speichern, Abschließen,
Export, „+ Neu", Aktualisieren …) in einen **fixierten Footer** unten. Muster:
`apps/converge-kaution` `KautionFooter.tsx` bzw. `apps/converge-geoskript`
`ReportFooter.tsx`.

**Layout-Gerüst (Content scrollt, Footer bleibt):**

```tsx
<div className="flex flex-col h-full">
  <div className="flex-1 overflow-auto">
    <div className="p-6 max-w-[100rem] mx-auto">{/* Inhalt */}</div>
  </div>
  <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3 flex items-center justify-between gap-4">
    <div>{/* Titel + Status-Badge + Hinweis */}</div>
    <div className="flex items-center gap-2">{/* primäre Aktionen */}</div>
  </footer>
</div>
```

**Ausnahme:** `RecordDialog`-Modals haben weiterhin ihren eigenen Titel im Modal-Kopf —
das ist **kein** seitenweiter Header und bleibt erlaubt. Nur ein expliziter User-Wunsch
(„mach mir hier einen Header") rechtfertigt eine eigene Kopfleiste.

## Detail-Dialog-Pattern (Pflicht für CRUD-Listen)

Jede Liste, deren Einträge bearbeitet werden können, **muss** dieses einheitliche
Read-/Edit-Verhalten implementieren. Die Komponente `RecordDialog` aus
`components/ui/` kapselt es bereits.

**UX-Vertrag:**

1. **Klick auf eine Listen-Zeile** → öffnet einen Dialog im **Read-Modus** mit
   den Werten als Label-Wert-Liste (read-only). Kein direkter Sprung in einen Editor.
2. **Stift-Icon (Pencil)** im Read-Dialog (oben rechts im Body **und** als
   „Bearbeiten"-Button im Footer) → wechselt denselben Dialog in den **Edit-Modus**.
3. **„+"-Button** über der Liste → öffnet den Dialog direkt im **Create-Modus**.
4. Aktions-Spalte rechts in der Zeile enthält **nur** destruktive/Sonder-Aktionen
   (Trash, Health-Refresh). Edit ist **kein Icon in der Zeile**, sondern erfolgt
   immer über Klick → Read → Stift. `e.stopPropagation()` für Sonder-Buttons.

**Warum:**

- Verhindert versehentliche Edits durch Mis-Clicks.
- Macht Werte überall einsehbar, auch wenn der User keine Edit-Permission hat.
- Eine einzige Modal-Komponente pro Eintrag — kein Wechsel zwischen Detail-Page
  und Edit-Page, der den Listen-Scroll verliert.

**Verwendung (`RecordDialog`):**

```tsx
import { RecordDialog } from '@efa-one/sdk/frontend/ui';

const [open, setOpen] = useState<{ id: string; item?: Item } | null>(null);
const [form, setForm] = useState<Partial<Item>>({});
const [saving, setSaving] = useState(false);

// Liste:
{items.map((it) => (
  <div
    key={it.id}
    onClick={() => { setForm(it); setOpen({ id: it.id, item: it }); }}
    className="cursor-pointer hover:bg-[var(--color-surface-raised)] ..."
  >
    {/* Spalten */}
    <button
      onClick={(e) => { e.stopPropagation(); handleDelete(it.id); }}
      title="Löschen"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  </div>
))}

<button onClick={() => { setForm({}); setOpen({ id: 'new' }); }}>
  <Plus className="w-4 h-4" />Neu
</button>

<RecordDialog
  open={open}
  onOpenChange={setOpen}
  title={open?.item?.name ?? 'Neuer Eintrag'}
  saving={saving}
  saveDisabled={!form.name}
  onSave={async (mode) => {
    setSaving(true);
    try {
      if (mode === 'create') {
        await apiFetch('/api/items', { method: 'POST', body: JSON.stringify(form) });
      } else {
        await apiFetch(`/api/items/${open!.id}`, { method: 'PATCH', body: JSON.stringify(form) });
      }
      setOpen(null);
      reload();
    } finally { setSaving(false); }
  }}
  readContent={
    <dl className="space-y-3">
      <div className="grid grid-cols-[140px_1fr] gap-3">
        <dt className="text-xs text-[var(--color-text-muted)]">Name</dt>
        <dd className="text-sm">{open?.item?.name ?? '–'}</dd>
      </div>
      {/* … weitere Felder */}
    </dl>
  }
  editContent={
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-[var(--color-text-muted)] mb-1">Name</label>
        <input
          value={form.name ?? ''}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full px-3 py-2 border border-[var(--color-border)] bg-[var(--color-surface)] text-sm"
        />
      </div>
      {/* … weitere Inputs */}
    </div>
  }
/>
```

**Boolean-Felder (z. B. `is_default`):**
- Read: als „Ja"/„Nein" anzeigen
- Edit: als **Checkbox** (`<input type="checkbox">`), niemals als Text-Input
- Beim Submit: **immer** mitsenden (auch `false`), damit der User einen Default
  deaktivieren kann.

**API-Keys / Passwörter:**
- Read: als „gesetzt: Ja/Nein" oder Maskierung — niemals den Klartext-Wert
  zurückgeben (Backend gibt ihn nicht zurück).
- Edit: leeres Feld bedeutet „behalten", neuer Wert überschreibt.
- Im Edit-Layout den Hinweis „leer lassen, um zu behalten" mit anzeigen.

**Validierungs-/Speicherfehler:** das `error`-Prop von `RecordDialog` nutzen —
das Banner wird lesbar und **oben, außerhalb des Scrolls** gerendert (sichtbar,
egal wie weit unten der Speichern-Button steht). Beim erneuten Speichern
`setError('')` setzen; optional `onErrorDismiss` fürs „×".

```tsx
const [error, setError] = useState('');

<RecordDialog
  /* … */
  error={error}
  onErrorDismiss={() => setError('')}
  onSave={async (mode) => {
    setError('');
    if (!form.name?.trim()) { setError('Name ist erforderlich'); return; }
    try { /* POST/PATCH */ } catch (e) { setError('Speichern fehlgeschlagen'); }
  }}
/>
```

Fehler **nie** als weggescrolltes Element oben im `editContent` und **nie** mit
`bg-[var(--color-danger)] bg-opacity-10` (Rot-auf-Rot) rendern — siehe Regel unter
„UI components".

## Listen-Verhalten (Pflicht)

Jede Liste/Tabelle innerhalb einer efa-app **muss** den folgenden
einheitlichen UX-Vertrag erfüllen — **ohne Ausnahme**.

Die zentrale `DataTable` kommt aus dem SDK — **`@efa-one/sdk/frontend/ui`**
(kein vendored `components/ui/DataTable.tsx` + `hooks/useViewPreferences.ts` mehr;
Fixes/Features propagieren per SDK-Version-Bump in alle Apps):

```tsx
import { DataTable, type ColumnDef } from '@efa-one/sdk/frontend/ui';
import { createViewPreferencesClient } from '@efa-one/sdk/frontend/viewPreferences';
import { getApiBase } from '../convergeApi';

// Persistenz-Adapter EINMAL erzeugen (stabil halten, nicht pro Render):
const viewPrefs = createViewPreferencesClient({ apiBase: getApiBase });

<DataTable
  listId="items.list"
  rows={rows}
  columns={columns}
  rowKey={(r) => r.id}
  persistence={viewPrefs}   // ohne diese Prop: Ansicht rein In-Memory
/>
```

Die Ansicht (Spalten/Sort/Filter/Gruppierung) persistiert der injizierte
`persistence`-Adapter. Der Standard-Client spricht den plattformweiten Endpoint
`GET/PUT/DELETE /api/view-preferences/:listId`. Backend-seitig braucht jede
verwendende App daher:
- DB-Tabelle `{app}_view_preferences` in `schema.sql`
- Route `routes/viewPreferences.ts` mit GET/PUT/DELETE `/api/view-preferences/:listId`

als 1:1-Vorlage siehe
[`apps/converge-textbausteine/backend/src/routes/viewPreferences.ts`](../../apps/converge-textbausteine/backend/src/routes/viewPreferences.ts)
und das Tabellen-DDL im Backend-`schema.sql` derselben App. (Ohne
`persistence`-Prop läuft die DataTable auch ohne dieses Backend — dann nur nicht
persistent.)

**Verzicht ist kein Default mehr.** Wer eine neue Liste schreibt und den
Vertrag nicht erfüllt, baut sie noch einmal — das ist explizit beschlossen,
nachdem mehrere Apps inkonsistente Listen produziert haben.

**UX-Vertrag (sechs Punkte):**

1. **Auswahl-Spalte links:** Checkbox je Zeile + Master-Checkbox im Header
   (alle/keine). Markierte Zeile bekommt eine Theme-Hintergrundfarbe
   (CSS-Variable `--color-primary` mit geringer Opazität, bleibt im Hover/Focus
   erkennbar).
2. **Bulk-Aktionen:** Aktionen, die **keine pro-Item-Eingabe** brauchen
   (z. B. Löschen, Aktivieren, Tag setzen mit globalem Wert), wirken auf die
   markierten Zeilen. Bulk-Bar erscheint, sobald ≥ 1 Item markiert ist.
   Destruktive Bulk-Aktionen behalten den **Bestätigungsdialog** — „ohne
   Dialog" meint hier „ohne pro-Item-Eingabe", nicht „ohne Bestätigung".
3. **Spalten-Header als Trigger:** Klick auf eine Spalten-Überschrift öffnet
   ein Radix Popover/DropdownMenu mit:
   - Sortieren aufsteigend
   - Sortieren absteigend
   - Filtern → öffnet einen Spalten-Filter-Dialog (typabhängig:
     Text-Match, Zahl-Range, Datum-Range, Bool, Enum-Multi-Select)
   - Spalte ausblenden
4. **Zahnrad oben rechts:** `Settings`-Icon öffnet ein Popover mit dem
   **Spalten-Inventar** — alle Spalten inkl. ausgeblendeter, als
   Checkboxes umschaltbar; Reihenfolge zunächst per Up/Down-Icons
   (Drag-Reorder optional, Phase 2).
5. **Benutzer-persistierte Ansicht:** Spalten-Sichtbarkeit, -Reihenfolge,
   aktive Sortierung und aktive Filter werden **pro Liste pro User**
   persistiert. Persistenz **App-lokal in der App-DB** über die Tabelle
   `{app}_view_preferences` und den injizierten `persistence`-Adapter der
   `DataTable` (`createViewPreferencesClient` aus
   `@efa-one/sdk/frontend/viewPreferences`). Keine zentrale Kernel-Tabelle,
   keine `localStorage`-Persistenz.
6. **Default-Ansicht + „Zurücksetzen":** Jede Liste deklariert ihre
   Default-Konfiguration im Code. Ein „Zurücksetzen"-Button im
   Zahnrad-Popover stellt die Default-Ansicht wieder her **und** löscht
   den persistierten Eintrag für diese `list_id` aus `view_preferences`.

7. **Mobil (≤ 640px) automatisch als Karten:** Die `DataTable` erkennt die
   Mobil-Schwelle selbst (`useIsMobile`, `max-width: 640px` = Tailwind `sm`) und
   rendert dann statt des Spalten-Grids je Zeile eine **gestapelte Label/Wert-Karte**;
   die Grid-Kopfzeile weicht einer kompakten Toolbar („Alle" + Zahnrad). Die
   Spaltenauswahl wirkt weiter — ausgeblendete Spalten erscheinen auch in der Karte
   nicht. **Apps müssen dafür nichts tun** und dürfen den Zweig nicht nachbauen:
   kein eigenes `useIsMobile ? <Cards/> : <DataTable/>`. Wer `width`-Angaben an
   Spalten vergibt, plant nur den Desktop — mobil sind sie wirkungslos.
   Der Hook ist zusätzlich als `useIsMobile` aus `@efa-one/sdk/frontend/ui`
   exportiert; App-lokale Kopien davon sind abzulösen, damit die Schwelle
   plattformweit an einer Stelle steht.

**Pflichtfeld pro Liste:** stabile `list_id` (z. B. `'invoices.list'`,
`'users.list'`) als Schlüssel für `view_preferences`. Niemals zufällige
oder UI-Pfad-abhängige IDs verwenden — sonst verlieren User ihre Ansicht
bei Refactorings.

**Backend-Mindestanforderung** für jede App mit Listen:

- DB-Tabelle `{app}_view_preferences (user_id UUID, list_id VARCHAR, prefs JSONB, updated_at, tenant, PRIMARY KEY(user_id, list_id))`
- Routen `GET/PUT/DELETE /api/view-preferences/:listId`

**Frontend-Mindestanforderung:**

- Spalten als `ColumnDef[]` mit stabilen `id`s deklarieren (Werte werden persistiert)
- `DataTable` aus `@efa-one/sdk/frontend/ui` mit stabiler `listId` verwenden
- `persistence={createViewPreferencesClient({ apiBase: getApiBase })}` für die
  benutzer-persistierte Ansicht (Sortier-/Filter-/Ausblenden-Popover + Zahnrad-
  Spalten-Inventar + Zurücksetzen liefert die Komponente bereits)

## Compose-Allowlist des Kernels (verbindlich)

Der Kernel-Deployer extrahiert `docker-compose.yml` aus deinem Backend-Image und schreibt
sie auf die Host-VPS — er hält dabei `docker.sock`. Seit dem Umbau von Deny- auf Allowlist
(Sicherheits-Audit 26.08.2026, Funde #04, #14–#20) wird die Compose vor dem Schreiben mit
`docker compose config` normalisiert und gegen eine **Allowlist** geprüft: **alles, was
nicht ausdrücklich erlaubt ist, lehnt der Deploy ab** — mit 400 statt mit einem halb
aufgesetzten Stack. Dasselbe Gate greift beim Restart eines bestehenden Stacks.

**Erlaubte Top-Level-Schlüssel:** `services`, `networks`, `volumes` (plus `x-…`).
Nicht erlaubt sind u. a. `secrets`, `configs`, `include`, `version` — und **`name`**:
der Projektname folgt dem Stack-Verzeichnis.

**Erlaubte Service-Schlüssel:** `image` (Pflicht!), `build`, `command`, `entrypoint`,
`environment`, `env_file`, `expose`, `ports`, `volumes`, `tmpfs`, `networks`, `depends_on`,
`restart`, `healthcheck`, `init`, `read_only`, `stop_grace_period`, `labels`, `profiles`,
`container_name`, `working_dir`, `hostname`, `cap_drop`, `security_opt`, `mem_limit`,
`cpus`, `pids_limit`, `shm_size`, `logging`.

**Nicht erlaubt** (Auswahl): `privileged`, `cap_add`, `devices`, `network_mode`, `pid`,
`ipc`, `userns_mode`, `cgroup_parent`, `sysctls`, `ulimits`, `user`, `group_add`,
`extra_hosts`, `dns`, `secrets`, `configs`, `extends`, `volumes_from`, `runtime`.

Zusätzliche Wert-Regeln, an denen man in der Praxis hängenbleibt:

| Regel | Warum |
|---|---|
| **Jeder** Service braucht ein `image:` — `build:` allein reicht nicht | ein Service ohne `image` passiert die Registry-Allowlist nie; der Deployer fährt `up --no-build`, dein `build:`-Block ist auf dem Host also ohnehin inert |
| `build.context` muss im Stack-Verzeichnis liegen, `dockerfile_inline` ist verboten | der Kontext würde die `.env` mit den Plattform-Secrets mit-tarren |
| `ports:` nur am Service **`frontend`**, höchstens **einer** im ganzen Stack, Host-Port ≥ 1024, **`host_ip` muss `127.0.0.1` sein** | alles andere umginge den Gateway (Caller-Auth, Provenance-Token, Permissions). Der Host-Port ist für `appType: internal` ohnehin unbenutzt — die Kachel lädt `/apps/{key}/`. Ohne `host_ip` veröffentlicht Docker auf `0.0.0.0` und legt seine DNAT-Regeln vor die Host-Firewall (ufw wird von den DOCKER-iptables-Ketten umgangen) — der Port wäre direkt aus dem Internet erreichbar (Fund #15, Stufe P2) |
| Bind-Mounts nur **innerhalb** des Stack-Verzeichnisses (kein `../`, kein absoluter Pfad), nicht auf `.env`/`docker-compose.yml` | `../.secrets` ist der Master-Vault mit `JWT_PRIVATE_KEY` |
| Benannte Volumes müssen top-level deklariert sein und dürfen dort **nur** `name`/`labels` tragen | `driver_opts: {type: none, device: /, o: bind}` mountet Host-`/` |
| `env_file:` nur auf Pfade im Stack-Verzeichnis (praktisch `.env`), keine Variablen darin | sonst liest Compose einen beliebigen Host-Pfad und inlined ihn nach `environment:` |
| `security_opt:` nur `no-new-privileges:true` und `seccomp=./<relativ>` | `unconfined` ist ausschließlich dem Service `sandbox` vorbehalten (bubblewrap) |
| `converge-net` ist das einzige erlaubte externe Netz; Aliase dürfen keine Plattform-Namen sein | ein Alias `converge-access-backend` finge fremde S2S-Aufrufe ab |
| `container_name` muss mit dem Projektnamen (= `serviceKey`) beginnen | sonst beansprucht die App den Namen eines Plattform-Containers |

Geprüft wird das **interpolierte** Dokument: `privileged: ${PRIV:-true}`, `<<:`-Merge-Keys
und `!override`-Tags helfen also nicht. Sidecar-Dateien, die die Compose relativ
referenziert, gehören nach `stack-files/` (werden pfadtreu ins Stack-Verzeichnis
gespiegelt). Verbindliche Quelle: `apps/converge-kernel/backend/src/services/composePolicy.ts`.

## Network rules (do not change)

**Standard-Stack (3 Container):**
- `database` service: only on `app-internal`, **never** `converge-net`
- `frontend` service: darf als **einziger** Service ein `ports:`-Mapping haben — höchstens eines im ganzen Stack, Host-Port ≥ 1024, gebunden an `127.0.0.1` (`"127.0.0.1:${FRONTEND_PORT}:8080"`). Der Kernel lehnt jeden anderen veröffentlichten Port sowie jede andere Bindeadresse ab (siehe „Compose-Allowlist des Kernels")
- `backend` service: `expose:` only (no host port needed)
- Build context in `docker-compose.yml`: repo root (so one context sees both `backend/` + `frontend/` package*.json + src; `@efa-one/sdk` comes via `npm ci`)

**Single-Container-Stack:**
- Genau **ein** Service, der **`backend` heißen muss** (sonst findet die Kernel-Discovery
  ihn nicht — sie sucht das Label `com.docker.compose.service=backend` bzw. Port 3001).
- `expose: "3001"` only, im `converge-net` mit app-spezifischem Alias. **Kein** `ports:`-Mapping
  nötig — das Gateway routet `/apps/{serviceKey}/` intern via Docker-DNS auf `:3001`.
- **Kein** `database`-Service, **kein** `app-internal`-Netz (SQLite ist In-Process).
- `SERVE_STATIC=true` ist Pflicht, damit dieser eine Container die SPA mit ausliefert.
- Build context in `docker-compose.single.yml`: repo root (backend + frontend aus einem Kontext; `@efa-one/sdk` kommt via `npm ci`).

### Routing contract for embedded apps (mandatory)

Requests to your app always pass through (Standard-Stack) two proxy hops:

1. efa-one gateway: `/apps/{serviceKey}/...`
2. App frontend nginx: `/api/*`, `/dev/*`, `/health` -> app backend (`:3001`)

Im **Single-Container-Stack** entfällt Hop 2: Das Gateway routet `/apps/{serviceKey}/`
direkt auf den backend-Container (`:3001`), der SPA **und** `/api` selbst bedient. Es gibt
keine `frontend/nginx.conf` zu pflegen. Der relative `getApiBase()`-Pfad (`/apps/{key}/api/...`)
funktioniert in beiden Varianten unverändert.

To avoid cross-app misrouting on shared `converge-net`, never use `proxy_pass http://backend:3001`.

- In `frontend/nginx.conf`, set a unique backend upstream host (template default: `template-backend`).
- In `docker-compose.yml`, add the same host as alias on `backend -> networks -> converge-net -> aliases`.
- When copying this template, replace `template-backend` with your app-specific alias (for example `converge-myapp-backend`) in both files.
- Frontend API calls must stay on relative paths (`/api/...`) and use `getApiBase()`; do not hardcode `/apps/...` in business code.

## Naming-Konventionen

Drei Identifier kommen vor, die unterschiedliche Regeln haben:

| Identifier | Wo | Erlaubt | Beispiel |
|---|---|---|---|
| GitHub-Repo-Name | github.com | Hyphens ok (GitHub-Standard) | `converge-foo-bar` |
| `service_key` / `SERVICE_KEY` (App-Identität in efa-one) | `x-converge`-Block, App-`.env`, Tile | nur `[a-z][a-z0-9_]{1,63}` — **keine Hyphens** | `converge_foo_bar` |
| GHCR-Image-Basename | `ghcr.io/<org>/<basename>-{backend,frontend}` | identisch zu `service_key` | `converge_foo_bar-backend` |

Der mitgelieferte Workflow `.github/workflows/docker-image.yml` normalisiert den
GitHub-Repo-Namen automatisch (Hyphens → Underscores), bevor er ihn als
Image-Namen verwendet. Der Compute-Step macht das transparent — der Repo darf
weiterhin der GitHub-Konvention folgen.

**Wichtig:** `SERVICE_KEY` in der App-`.env`, der `service_key` im
`x-converge`-Block der OpenAPI-Spec und der GHCR-Image-Basename müssen
identisch sein und der Underscore-Form folgen. Hintergrund: der
efa-one-Deployer leitet den `serviceKey` aus dem Image-Namen ab und prüft ihn
gegen `/^[a-z][a-z0-9_]{1,63}$/` — Hyphens werden mit `HTTP 500` abgelehnt.

## Docker build notes

- **DB-Treiber:** `DB_DRIVER` (`postgres` Default | `sqlite`) schaltet `backend/src/db.ts`.
  `backend/src/dbSqlite.ts` ist ein `pg.Pool`-kompatibler SQLite-Adapter; `better-sqlite3`
  ist eine **optionalDependency** (lazy `require`, nur bei `sqlite` geladen) — der
  Postgres-Build/-Runtime braucht es nicht. Schema-Init (`db/init.ts`) wählt das Schema-File
  treiber-abhängig (`schema.sql` vs. `schema.sqlite.sql`).
- **Single-Container (`Dockerfile.single`):** baut Frontend (Vite) + Backend (tsc) und bündelt
  beides in ein Node-Image; die SPA landet unter `/app/public` und wird via `SERVE_STATIC=true`
  von Express ausgeliefert. Das Runtime-Image installiert kurz `python3/make/g++` für die
  native `better-sqlite3`-Kompilierung (Alpine/musl hat keine Prebuilds) und entfernt sie wieder.
- `ENVIRONMENT` in docker-compose.yml is `${ENVIRONMENT:-production}` — set to `development` in `.env` for local dev (enables `/dev/token` route)
- Backend Dockerfile: `rootDir: ".."` in tsconfig means tsc output lands in `dist/backend/src/` (not `dist/src/`). CMD and asset copy paths must use `dist/backend/src/`
- Frontend Dockerfile: uses `npx vite build` directly (not `npm run build`) to skip a redundant `tsc` type-check in the image — Vite bundles the SDK's ESM output from `node_modules` directly
- `.dockerignore` excludes `node_modules`, `dist`, `.env`, `.git` — prevents host `node_modules` from overwriting Docker `npm ci` results
- **`IMAGE_REPOSITORY` (App-`.env`) steuert den GHCR-Pull-Pfad.** Form: `ghcr.io/<owner>/<repo-name>` ohne `-backend`/`-frontend`-Suffix und ohne `:tag`. Entspricht 1:1 dem CI-Output `ghcr.io/${{ github.repository }}` aus `.github/workflows/docker-image.yml`. **Pflicht vor dem ersten Tag-Push** — die Org gehört in den seltensten Fällen `d-w-it-consulting`, meist dem Partner/Kunden. `SERVICE_KEY` (App-Identität in efa-one) und `IMAGE_REPOSITORY` (GH-Repo-Pfad) sind bewusst entkoppelt: ein Kunden-Repo darf `imh_rw5` heißen, während die App in efa-one unter `converge_rw5` läuft.

## Architecture overview

See `docs/ARCHITECTURE.md` for the full auth flow, network topology, and design decisions.
For non-developer requirement intake, use `docs/BUSINESS_PROMPT_TEMPLATE.md`.

## Definition of Done (Cross-App Integrations)

A cross-app implementation is only done when all points below are true:
- All dependent service URLs are resolved via efa-one Registry (`service_key` -> `resolveService`)
- No hardcoded internal service host/port appears in source code
- Intake questions and answers are documented in the feature PR/notes
- Error path includes dependency-unavailable behavior (`status !== 'running'`) with user-facing handling
- Integration tests cover at least: successful resolve, missing service, and non-running service
- If endpoint discovery is required, tests also cover missing `openApiUrl` / missing capability contract as blocker path

## Berechtigungsobjekte

Jede App erhält beim Anlegen der Kachel in efa-one automatisch zwei Standard-Berechtigungsobjekte:

- `{app_key}.default` – Zugriff (Kachel sichtbar, App nutzbar)
- `{app_key}.admin` – Admin-Zugriff (nur für interne/network Apps, nicht für externe Weblinks)

Weitere granulare Berechtigungsobjekte können in efa-one angelegt werden, z. B. `{app_key}.can-export`.
Key-Schema: `{app-slug}.{permission}` – Wahl des Suffix ist frei.

### Dynamische Permission-Registrierung

Apps können eigene Berechtigungsobjekte beim Start automatisch bei efa-one registrieren.
Das ist nützlich, wenn die App neue Berechtigungsebenen einführt (z. B. `readonly`, `can-export`) –
diese erscheinen dann sofort in der efa-one-Rollenverwaltung, ohne dass die Kachel neu angelegt werden muss.

```ts
import { registerPermissions } from '@efa-one/sdk/backend/permissions';

// In startServer(), nach app.listen():
await registerPermissions('myapp', [
  { key: 'readonly',   displayName: 'MyApp – Nur Lesen', level: 1 },
  { key: 'can-export', displayName: 'MyApp – Export',    level: 2 },
]);
```

**Voraussetzung:** `CONVERGE_REGISTRY_URL` muss gesetzt sein und die App muss in der efa-one Service Registry registriert sein.

**Verhalten:**
- Neue Permissions werden angelegt, bestehende aktualisiert
- Von der App nicht mehr gemeldete Custom-Permissions werden automatisch entfernt
- Die built-in `.default` / `.admin` Objekte bleiben immer erhalten
- Fehlgeschlagene Registrierung wird geloggt, blockiert aber nicht den App-Start (fire-and-forget mit Retry)

### Custom Permission Objects (User-erzeugt, zur Laufzeit)

Manche Apps brauchen Berechtigungsobjekte, die der App-Admin **selbst über die App-UI**
anlegen kann — z. B. mandanten-, projekt- oder objektspezifische Permissions wie
`myapp.project_alpha.read`. Solche Custom Permissions sind zur Buildzeit nicht
bekannt und können daher nicht über `registerPermissions()` mitkommen.

Pfad: die App ruft beim Anlegen/Löschen synchron `converge_access` auf.
Die Permission landet als reguläres `permission_object` in der Access-DB und
kann in der Access-UI sofort Rollen zugewiesen werden. Beim Live-Lookup
(`permissionClient`/`permissionCheck`) verhält sie sich identisch zu
Code-Permissions.

```ts
import { createCustomPermission, deleteCustomPermission } from '@efa-one/sdk/backend/customPermissions';

// Anlage via App-UI:
const { id } = await createCustomPermission({
  serviceKey: 'myapp',
  key: 'project_alpha.read',
  displayName: 'MyApp – Projekt Alpha lesen',
});
// id in App-DB referenzieren, damit ein späteres Delete möglich bleibt.

await deleteCustomPermission(id);
```

**Wann verwenden?**
- App-UI erzeugt Berechtigungen zur Laufzeit → `createCustomPermission`
- Permissions stehen im Code fest und ändern sich mit dem Deployment → weiterhin `registerPermissions()`
- Nicht beides für denselben Key — der Cleanup-Algorithmus von
  `registerPermissions()` würde die nicht-gemeldete Custom-Permission im
  nächsten Boot entfernen.

**Wichtig:**
- Create/Delete sind synchron — bei Fehler die UI-Aktion zurückrollen, sonst
  drift't App-DB gegen Access.
- Der `serviceKey` muss der eigene `SERVICE_KEY` sein.
- Doppel-Anlage eines bereits existierenden Keys ist idempotent: Access
  aktualisiert den `displayName` und gibt die existierende ID zurück.

### Permission-Check mit Audit-Hook (optional)

Statt `getUserPermissions()` (Bulk-Lookup) kann eine App den expliziten
Single-Check `checkPermission(convergeId, key)` aus `@efa-one/sdk/backend/permissionCheck.ts`
verwenden. Der Unterschied: wenn der angefragte Key in
`converge_access.permission_objects` nicht existiert, schreibt Access
eigenständig einen `permission.unknown_check`-Eintrag in `converge_audit`.
Damit wird Drift zwischen Code-Checks und konfigurierten Permissions
sichtbar, ohne dass die App selbst etwas zusätzlich loggen muss.

Aus User-Sicht verhält sich die API identisch — `granted=false` deckt sowohl
"User hat keine Berechtigung" als auch "Permission existiert nicht" ab.

```ts
import { checkPermission } from '@efa-one/sdk/backend/permissionCheck';

const granted = await checkPermission(req.user.convergeId, 'myapp.export');
if (!granted) return res.status(403).json({ error: 'Forbidden' });
```

Bestehende Apps müssen nicht migrieren — `permissionClient.getUserPermissions()`
bleibt vollumfänglich funktional und ist der schnellere Bulk-Pfad. Der
Check-Endpoint ist additiv und empfehlenswert für neue Apps, die Drift früh
sichtbar machen wollen.

### JWT-Payload

Der JWT trägt nur Identität (`sub`, `name`) plus i18n/Tenant — keine Permissions.
Permissions werden bei jedem Permission-Check live beim `converge_access`-Service
abgefragt.

```ts
// JWT-Payload (vereinfacht):
{ sub, name, email, language, tenant, iat, exp }
```

### Frontend-Checks

`useConvergeAuth()` lädt die Permissions automatisch beim Token-Exchange und
hält sie als `user.permissions[]` im State. Apps können sie direkt lesen — der
Hook kümmert sich um die Synchronisation.

```ts
const { user } = useConvergeAuth();

// Admin (efa-one-weit) ist eine Permission wie jede andere:
const isAdmin = user?.permissions?.includes('converge-admin') ?? false;

// App-spezifische Permission:
const canExport = user?.permissions?.includes('myapp.can-export') ?? false;
```

Für noch frischere Sichtbarkeits-Checks (z.B. nach einer Rollen-Änderung) kann
`fetchUserPermissions()` aus dem Hook direkt aufgerufen werden.

### Backend-Checks

```ts
import { requireAdminOrPermission, requirePermission, requireAdmin } from '../middleware/auth';

// Standard: Admin (converge-admin) ODER eine der angegebenen App-Permissions:
router.delete('/:id', requireAdminOrPermission('myapp.admin'), handler);
router.get('/items', requireAdminOrPermission('myapp.read', 'myapp.admin'), handler);

// Reine App-Permission (ohne Admin-Bypass, selten):
router.get('/export', requirePermission('myapp.can-export'), handler);

// Nur efa-one-Admin:
router.post('/system', requireAdmin, handler);
```

Jede Middleware löst pro Request einen Live-Lookup beim `converge_access`-Service
aus. Das ist bewusst: Permission-Änderungen wirken sofort, kein 8h-Lag durch
JWT-Caching.

### Verhalten

| Situation | Ergebnis |
|---|---|
| User hat Rolle mit `app.default` | Kachel sichtbar, `app.default` ist im Live-Lookup-Result |
| User hat Rollen mit `app.default` + `app.admin` | Beide Keys werden zurückgegeben |
| User hat keine Rolle mit `app.*` | Kachel unsichtbar |
| User hat Permission `converge-admin` | Sieht alle Kacheln; alle `requireAdminOrPermission` lassen ihn durch |
| Kachel hat kein Berechtigungsobjekt (Altdaten) | Nur für Inhaber von `converge-admin` sichtbar |

## efa-one IPC – Navigation

Die Template-`App.tsx` implementiert das korrekte zweistufige Navigationsprotokoll:

### CONVERGE_GO_BACK (zweistufig – NICHT direkt `sendAtStart` aufrufen)

```
1. App ist auf Unterseite  →  CONVERGE_GO_BACK empfangen  →  navigate('/')
2. App ist bereits auf '/'  →  CONVERGE_GO_BACK empfangen  →  sendAtStart()
```

`sendAtStart()` signalisiert efa-one, das Embedded-View zu schließen und zum Dashboard zurückzukehren.

> **Fehler vermeiden:** `CONVERGE_GO_BACK` mit direktem `sendAtStart()` oder `navigate('/')` + gleichzeitigem `sendAtStart()` zu beantworten schließt die App sofort beim ersten Klick auf den Zurück-Button, egal wo der User steht.

### CONVERGE_DECLARE_SETTINGS – nur für Admins senden

```ts
import { getParentOrigin } from '@efa-one/sdk/frontend/ipc';

// Nur senden wenn der User tatsächlich Zugriff auf Settings hat.
// targetOrigin IMMER getParentOrigin() (nie '*') – nicht an beliebige Embedder broadcasten.
if (isAdmin) {
  window.parent.postMessage({ type: 'CONVERGE_DECLARE_SETTINGS' }, getParentOrigin());
}
```

> **Sicherheitsregel für postMessage (plattformweit):** Auf der **Sende**-Seite
> nie `'*'` als targetOrigin – immer `getParentOrigin()` aus `@efa-one/sdk/frontend/ipc`.
> Auf der **Empfangs**-Seite jeden efa-one-Message-Handler zuerst mit
> `isFromPlatformParent(event)` gaten (`event.source === window.parent`), sonst kann
> ein Sibling-iframe/`window.opener` u. a. `CONVERGE_AUTH` fälschen (Session-Fixation).
> Vollständiger Schutz gegen bösartige *Top-Level*-Einbettung zusätzlich per
> `frame-ancestors`-CSP/`X-Frame-Options` (nginx-Ebene).

Sonst erscheint das Zahnrad-Symbol in der efa-one-Kopfzeile für alle User – führt zum Navigationsirrtum wenn der User in `/settings` landet und sofort wieder weitergeleitet wird.

### CONVERGE_DECLARE_APP_INFO – App-Info für das Kernel-Hilfe-Icon

Der Kernel-Header enthält ein Fragezeichen-Icon, das ein kleines Info-Modal mit **App-Name** und **aktueller Version** öffnet. Damit die Info der eingebetteten App (statt des Kernel-Fallbacks) angezeigt wird, ruft die App beim Start **`registerAppInfo`** auf.

```ts
import { registerAppInfo } from '@efa-one/sdk/frontend/ipc';

// registerAppInfo re-deklariert bei JEDEM CONVERGE_AUTH und taggt die Info mit
// dem serviceKey, den der Kernel sendet. Rückgabe = Unsubscribe (Cleanup).
useEffect(() => registerAppInfo({
  appName: 'My App',
  version: __APP_VERSION__,
}), []);
```

> **Warum nicht `sendDeclareAppInfo`?** Der alte Helper feuert **einmalig** beim Mount
> und trägt **keinen** `serviceKey`. Da alle Apps dieselbe Origin teilen und der Kernel
> den iframe wiederverwendet, kann der Kernel eine solche Deklaration nicht der aktuellen
> App zuordnen — nach einem App-Wechsel (oder Back/Forward/bfcache) blieb im Hilfe-Icon
> die **Version der vorher geöffneten App** stehen. `registerAppInfo` behebt das
> strukturell: es re-deklariert bei jedem `CONVERGE_AUTH` mit dem `serviceKey`, und der
> Kernel akzeptiert nur die zur aktuell geframten App passende. `sendDeclareAppInfo` ist
> **@deprecated** (der Kernel ignoriert seine serviceKey-lose Payload) — neue Apps nutzen
> ausschließlich `registerAppInfo`.

**Pflicht-Setup für die Versionskopplung an den GHCR-Tag:**

- `frontend/vite.config.ts` injiziert `__APP_VERSION__` aus `process.env.APP_VERSION` (Fallback: Git-Tag bzw. `dev`/`unknown`).
- `frontend/Dockerfile`: `ARG APP_VERSION=dev` + `ENV APP_VERSION=$APP_VERSION` vor dem Vite-Build.
- `docker-compose.yml` (frontend-Service): `build.args: { APP_VERSION: ${APP_VERSION:-dev} }`.
- CI/CD reicht den GHCR-Image-Tag als `APP_VERSION` durch.
- `frontend/src/vite-env.d.ts`: `declare const __APP_VERSION__: string;`.

Ohne `registerAppInfo`-Aufruf zeigt das Kernel-Icon weiterhin „efa-one" + Kernel-Version (kein Fehler, nur kein App-spezifischer Inhalt).

## Discovery-Vertrag

efa-one kennt eine neue App nicht, bevor sie im Kernel als Kachel angelegt ist. Statt das manuell zu tun, nutzt der Admin im Kernel den Button "Neue Apps suchen" (Einstellungen → Apps entdecken). Der Scanner:

1. Listet alle laufenden Container im `converge-net`-Netzwerk.
2. Filtert diejenigen heraus, die noch nicht als Tile/Service-Registry-Eintrag existieren.
3. Holt ihre OpenAPI-Spec über `GET /api/openapi.json` (Docker-DNS-intern).
4. Aus dem `x-converge`-Block baut er Tile + Default-Permissions + Service-Registry-Eintrag.

Damit das funktioniert, **muss** jede Template-App `/api/openapi.json` anbieten. Das Template liefert das bereits unter `backend/src/routes/openapi.ts` – beim Anpassen der App nur den `x-converge`-Block und die `paths`-Liste aktuell halten.

### x-converge-Block

```json
{
  "x-converge": {
    "service_key": "myapp",
    "display_name": "My App",
    "suggested_icon": "Package",
    "default_app_type": "internal",
    "default_permissions": [
      { "key": "readonly", "displayName": "Nur Lesen", "level": 1 }
    ]
  }
}
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `service_key` | ja | Eindeutiger Schlüssel, Kleinbuchstaben + Unterstriche. Muss mit `SERVICE_KEY` der App übereinstimmen. |
| `display_name` | ja | Im Dashboard sichtbarer Titel der Kachel. |
| `suggested_icon` | nein | Lucide-Icon-Name. Fallback: `Package`. Admin kann beim Installieren überschreiben. |
| `default_app_type` | nein | `internal` (iframe, Default), `network` (neuer Tab, gleiche Infra), `external` (externes Weblink). |
| `default_permissions` | nein | Liste von Permission-Objekten, die beim Install zusätzlich zu `.default` / `.admin` angelegt werden. |

### Spec aktuell halten

Beim Hinzufügen eigener Routen den `paths`-Block ergänzen (mindestens `summary` + Response-Codes). Damit:
- Der Kernel kann die Spec für Dokumentation / Testing einsehen.
- Der MCP-Agent kann die Endpoints als Tools nutzen (ergänzend zu `registerApiMetadata`).
- Andere Apps können per Service-Client gezielt API-Fähigkeiten abfragen.

## Erwartet / offen aus Kernel

Folgende Module sind auf der BACKLOG fürs `@efa-one/sdk`, aber noch nicht veröffentlicht (weil der Kernel die Gegenstelle noch nicht implementiert hat):

- `jobs` – Job-Registrierung beim zentralen Scheduler
- `eventBus` – Pub/Sub für App-zu-App-Events
- `configClient` – Zentrale Konfigurationsverteilung

Beim Nachziehen kommen sie als neue Subpfade ins `@efa-one/sdk` (`@efa-one/sdk/backend/jobs` etc.) und landen per `npm update` in bestehenden Apps.

> **Bereits implementiert** (also nicht mehr „offen"): `@efa-one/sdk/backend/permissionClient.ts`
> (Live-Lookup beim converge-access-Service, ersetzt JWT-Caching der Permissions —
> siehe BACKLOG-Eintrag „Cookie-Größe reduzieren ✅") und `@efa-one/sdk/backend/notifications.ts`.
