# efa-one App Template

Standard-Boilerplate für neue **efa-apps**. Wer eine neue App baut, kopiert dieses
Verzeichnis und passt die Business-Logik an. Die gesamte Infrastruktur (Auth, Discovery,
Audit/Reporting, IPC, i18n) kommt fertig aus dem npm-Paket [`@efa-one/sdk`](https://www.npmjs.com/package/@efa-one/sdk)
— du schreibst nur die App-Logik.

> Dieses Verzeichnis liegt im [`efa-sdk`](https://github.com/efaware/efa_sdk)-Repo.
> Eine App lässt sich **allein daraus** aufsetzen — der `/new-app`-Skill automatisiert die
> Schritte unten nur für Claude-Code-Nutzer, ist aber nicht erforderlich.

## Was die Vorlage liefert

- **Auth:** JWT-Validierung, Token-Exchange, Session-Cookie (`@efa-one/sdk/backend/auth`)
- **Health:** `/health`-Endpoint (`@efa-one/sdk/backend/health`)
- **Audit & Reporting:** fire-and-forget-Clients (`@efa-one/sdk/backend/audit`, `@efa-one/sdk/backend/reporting`)
- **Permissions:** dynamische Registrierung beim App-Start (`@efa-one/sdk/backend/permissions`)
- **Service Discovery & App-zu-App-Calls:** Registry-Lookup, Gateway-Client (`@efa-one/sdk/backend/serviceDiscovery`, `@efa-one/sdk/backend/serviceClient`)
- **i18n:** `@efa-one/sdk/frontend/i18n` (Frontend) + `@efa-one/sdk/backend/i18n-backend` (Backend)
- **IPC:** postMessage-Helper für den efa-one-Parent (`@efa-one/sdk/frontend/ipc`)
- **Docker:** prod-taugliche Stacks für **beide Varianten** (siehe unten)
- **Frontend:** Vite + React + Tailwind, `frontend/src/components/ui/` (vorgefertigte Components)

Das SDK wird **nie geforkt oder lokal gepatcht** — Änderungen daran gehen ins `efa-sdk`-Repo
+ npm-Release, die App zieht sie mit `npm update @efa-one/sdk`.

## Stack-Varianten (eine pro App wählen)

| | Standard-Stack | Single-Container-Stack |
|---|---|---|
| Container | frontend + backend + database (3) | backend (1) |
| Datenbank | PostgreSQL (eigene Instanz) | SQLite-Datei im Volume |
| Compose / Dockerfile | `docker-compose.yml` + `backend/`+`frontend/Dockerfile` | `docker-compose.single.yml` + `Dockerfile.single` |
| Schema | `backend/src/db/schema.sql` | `backend/src/db/schema.sqlite.sql` |
| Wofür | **Stammdaten / komplexe Apps** (System-of-Record, hohe Concurrency, komplexe Queries) | **einfache Apps** (kleines Datenvolumen, einzelne Schreiber, keine DB-Reports) |

Die Plattform verarbeitet beide identisch (Discovery, Gateway-Routing, Auth). Entscheidungsregel
+ technische Details: `CLAUDE.md` → Abschnitt „Stack-Varianten". Im Zweifel PostgreSQL.

## So baust du eine neue App

```bash
git clone https://github.com/efaware/efa_sdk
cp -R efa_sdk/template efa-myapp        # Scaffold herauskopieren
cd efa-myapp && rm -rf .git && git init # frische Git-Historie
npm --prefix backend install
npm --prefix frontend install
```

Danach:

1. In `backend/package.json` + `frontend/package.json` den Namen anpassen; in `docker-compose.yml`
   den `SERVICE_KEY` (Underscore-Form, z. B. `efa_myapp`) und den Backend-Alias setzen.
2. **Fachlicher Intake** (`docs/intake.md`) — die 9 Pflichtfragen + bedarfsweise 4 bedingte
   beantworten. Der vollständige Katalog steht in `CLAUDE.md` → „Fachliche Intake-Fragen";
   `docs/BUSINESS_PROMPT_TEMPLATE.md` ist die Copy/Paste-Eingabevorlage für Fachanwender.
3. Routen unter `backend/src/routes/` schreiben, UI-Seiten unter `frontend/src/pages/`.
4. Berechtigungen registrieren (`registerPermissions()` in `backend/src/index.ts`) — synchron zu `docs/intake.md §1`.
5. API-Capabilities registrieren (`registerApiMetadata()` für MCP-Discovery) — synchron zu `docs/intake.md §7`.
6. **README.md ergänzen** (Pflicht – siehe unten) inkl. Verweis auf `docs/intake.md`.

## Bauen & testen (ohne zusätzliches Tooling)

```bash
# Tests (die Vorlage bringt eine laufende Suite mit — grün ab dem ersten Commit)
npm --prefix backend  test              # schnell, alles gemockt
npm --prefix backend  run test:coverage # dieselbe Suite + Coverage-Gate (so läuft die CI)
npm --prefix frontend test

# Typecheck (Quellen UND Testcode — Vitest transpiliert ohne Typprüfung)
npm --prefix backend run typecheck
npm --prefix backend run typecheck:test

# CI-Gates lokal spiegeln (npm audit + Copyleft-Lizenz-Check, optional Trivy)
./scripts/ci-local.sh

# App als Container starten
docker compose up -d --build
```

Die mitgelieferten Tests sind als **Vorlage** gedacht: `backend/test/helpers/` enthält
die geteilten Bausteine (echte Temp-SQLite, Express-Test-App), `backend/src/__tests__/`
die Fälle. Details und die Ratchet-Regel für die Coverage-Schwellen stehen in `CLAUDE.md`
→ „Tests: die mitgelieferte Basis erweitern, nicht ersetzen".

> **Naming:** Der mitgelieferte CI-Workflow normalisiert deinen GitHub-Repo-Namen automatisch
> zur Image-Convention (Hyphens → Underscores). `service_key` in der OpenAPI-Spec und `SERVICE_KEY`
> in der App-`.env` müssen mit der Underscore-Form übereinstimmen — siehe `CLAUDE.md` → „Naming-Konventionen".

## Berechtigungsobjekte

Beim Anlegen der Kachel werden automatisch erzeugt:

| Key | Beschreibung |
|---|---|
| `{service_key}.default` | Kachel-Sichtbarkeit, App nutzbar (auto-generiert) |
| `{service_key}.admin` | Admin-Zugriff (auto-generiert) |

Eigene Permissions werden über `registerPermissions()` beim App-Start gemeldet:

```ts
import { registerPermissions } from '@efa-one/sdk/backend/permissions';

await registerPermissions('efa_myapp', [
  { key: 'readonly',   displayName: 'MyApp – Nur Lesen', level: 1 },
  { key: 'can-export', displayName: 'MyApp – Export',    level: 2 },
]);
```

## APIs (vom Template bereitgestellt)

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/health` | Liveness-Check |
| POST | `/api/auth/exchange` | efa-one-JWT → App-Session-Cookie |
| POST | `/api/auth/logout` | Session beenden |
| GET | `/api/openapi.json` | OpenAPI-Spec mit `x-converge`-Block (Kernel-Discovery) |

Eigene Routen kommen unter `backend/src/routes/` dazu und müssen nach Implementierung in der App-eigenen README dokumentiert werden.

## Pflicht-Kapitel jeder App-README

Damit andere Agenten und Entwickler die App ohne Codeanalyse verstehen, muss **jede** App-README diese Kapitel haben:

1. **Was die App macht** – kurze Beschreibung
2. **Nutzung** – UI-Flow / API-Konsumenten / besondere Voraussetzungen
3. **Berechtigungsobjekte** – Tabelle aller `{service}.{permission}`-Keys mit Beschreibung
4. **APIs** – Tabelle aller HTTP-Endpunkte (Methode, Pfad, kurze Beschreibung)

Diese README ist zugleich das Muster für die vier Kapitel.

## Pflicht beim Ändern

Wer Endpunkte hinzufügt, entfernt oder Permissions ändert, **muss die App-eigene README aktualisieren** (siehe `CLAUDE.md` im Repo-Root). Stop-Hook und Code-Reviewer prüfen das.
