# Fachlicher Intake — {app_name}

Diese Datei dokumentiert die fachlichen Entscheidungen für diese App. Sie wird beim Anlegen der App durch `/new-app` initialisiert und beim ersten Implementieren der Business-Logik vervollständigt.

Beim Bearbeiten der App liest Claude diese Datei, BEVOR er Code schreibt — beantwortete Fragen werden nicht erneut gestellt; offene Fragen werden vor dem ersten Code-Diff geklärt.

| Feld | Wert |
|---|---|
| Erstellt | {YYYY-MM-DD} |
| Beantwortet von | {user_email} |
| Template-Version | 1.15.0 |

> **Status-Kürzel:**
> ⏳ offen — Frage steht aus
> ✅ beantwortet — Fachliche Antwort liegt vor
> 🔧 im Code umgesetzt — Code-Stub / Hook ist platziert
> ↪ übersprungen — Funktion bewusst nicht genutzt

---

## Grundsatzfrage

### 0. Werkzeug oder Verwaltung
**Frage:** Soll sich die App etwas merken? (a) Werkzeug: Eingabe rein, Ergebnis raus, danach ist nichts mehr da. (b) Verwaltung: Übersicht aller Einträge, Klick öffnet die Einzelheiten, ändern und löschen möglich. (c) Werkzeug mit Verlauf: erledigt etwas sofort, zeigt aber später, was es wann mit welchem Ergebnis getan hat.

> Muss vom User **ausdrücklich** gewählt werden — Claude empfiehlt und begründet, entscheidet aber nicht. Erklärung und Warnzeichen: `CLAUDE.md` → „Frage 0".

- Status: ⏳ offen
- Antwort:
- Begründung (warum diese Form, welche Warnzeichen besprochen wurden):
- Dinge, die die App sich merkt (nur bei b/c):

  | Ding | Was dazugehört | Hängt zusammen mit |
  |---|---|---|
  | | | |

- Ableitung:
  - (a): eine Seite Eingabe/Ergebnis, keine Fachtabellen
  - (b): je Ding Tabelle in `schema.sql`, Routen, Übersicht als `DataTable`, Einzelansicht per `RecordDialog`
  - (c): Vorgangs-Tabelle + Verlaufsübersicht als `DataTable`, Einzelansicht nur lesend

---

## Pflichtfragen

### 1. Berechtigungsstufen
**Frage:** Wer darf in der App was? Beschreibe die Rollen aus Sicht der Mitarbeiter.

- Status: ⏳ offen
- Antwort:
- Ableitung:
  - `registerPermissions(...)` in `backend/src/index.ts`
  - `requireAdminOrPermission(...)` auf den entsprechenden Routen
  - `x-converge.default_permissions` in `routes/openapi.ts` synchron halten

### 2. Datensichtbarkeit (alle vs. user-spezifisch)
**Frage:** Sehen alle Benutzer dieselben Daten, oder soll jeder Mitarbeiter nur seine eigenen Datensätze sehen?

- Status: ⏳ offen
- Antwort:
- Ableitung:
  - `owner_id`-Filter in `WHERE`-Klauseln aller SELECT-Routen
  - bei „eigene + geteilte": zusätzliche `record_shares`-Tabelle in `schema.sql`
  - bei „rollenabhängig": `canSeeAll`-Permission-Check vor dem Filter
  - zentral als `restrictToOwner(req, query)`-Helper in `backend/src/db/scope.ts`

### 3. Kennzahlen / Vorgänge fürs Dashboard
**Frage:** Welche Vorgänge in der App sollen im efa-one-Dashboard als Kennzahlen sichtbar werden?

- Status: ⏳ offen
- Antwort:
- Ableitung:
  - `reportEvent('entity.verb', ...)` nach erfolgreicher Schreiboperation
  - `reportActivity('verb', ...)` für nutzersichtbare Aktionen
  - `reportMetric('name_ms', elapsed, ...)` für gemessene Vorgänge

### 4. Revisionssichere Protokollierung (Audit)
**Frage:** Welche Vorgänge müssen revisionssicher protokolliert werden?

- Status: ⏳ offen
- Antwort:
- Ableitung:
  - `logAudit('entity.verb', { targetId, ...context })` nach den entsprechenden Aktionen

### 5. Push-Benachrichtigungen
**Frage:** Wann sollen Nutzer eine Push-Benachrichtigung in efa-one erhalten?

- Status: ⏳ offen
- Antwort:
- Ableitung:
  - `sendNotification({ userId, type, title, body, link })` aus `@efa-one/sdk/backend/notifications.ts`

### 6. Mailversand
**Frage:** Versendet die App E-Mails nach außen?

- Status: ⏳ offen
- Antwort:
- Ableitung:
  - `sendMail({ to, subject, body_text })` aus `@efa-one/sdk/backend/mail.ts`
  - bei „regelmäßige Reports": Hinweis dass Cron via `@efa-one/sdk` `jobs` (BACKLOG) noch fehlt — vorerst manueller Trigger oder externer Trigger

### 7. KI-Assistent (Aktionen in der App per MCP)
**Frage:** Soll der efa-one-KI-Assistent Aktionen in deiner App ausführen können?

- Status: ⏳ offen
- Antwort:
- Ableitung:
  - `registerApiMetadata(SERVICE_KEY, { capabilities: [...] })` mit pro Aktion einer `ApiCapability`
  - URL-Parameter (`:id`) müssen im `requestSchema` als Property auftauchen

### 8. Cross-App-Abhängigkeiten
**Frage:** Greift deine App auf Daten anderer efa-apps zu (Kalender, Mail, Chat, ZBV, …)?

- Status: ⏳ offen
- Antwort (Service-Keys auflisten):
- Ableitung:
  - `resolveService(serviceKey)` aus `@efa-one/sdk/backend/serviceDiscovery.ts`
  - `serviceClient.call(...)` aus `@efa-one/sdk/backend/serviceClient.ts`
  - Niemals direkte `http://container:port`-URLs in Business-Code

### 9. Sprachen
**Frage:** In welchen Sprachen soll die App verfügbar sein?

- Status: ⏳ offen
- Antwort:
- Ableitung:
  - `frontend/src/locales/{de,…}/common.json` anlegen
  - `initI18n()` in `frontend/src/main.tsx` mit Sprach-Liste
  - `loadLocales()` im Backend, falls Backend-Texte zurückgegeben werden

---

## Bedingte Fragen (nur bei Bedarf)

Diese Fragen werden nur gestellt, wenn die App-Beschreibung darauf hindeutet (Heuristik in CLAUDE.md). Sonst bleiben sie auf „↪ übersprungen".

### 10. OCR (Belege / Dokumente)
**Frage:** Sollen Belege oder Dokumente per OCR ausgelesen werden?

- Status: ↪ übersprungen
- Antwort:
- Ableitung (falls aktiviert):
  - `serviceClient.call('converge_ai', 'POST /api/internal/ocr/extract', ...)`
  - Upload-Route in `backend/src/routes/uploads.ts`

### 11. Wissens-Silos / RAG
**Frage:** Soll die App eigenes Wissen für KI-Antworten bereitstellen?

- Status: ↪ übersprungen
- Antwort:
- Ableitung (falls aktiviert):
  - `converge_ai` Silo-Anlage beim Start
  - `/api/knowledge/silos`-Endpoints

### 12. Voice2Text
**Frage:** Soll der Nutzer per Sprache eingeben können?

- Status: ↪ übersprungen
- Antwort:
- Ableitung (falls aktiviert):
  - `converge_ai` Voice2Text-Endpoint
  - Mikrofon-Button-Hook im Frontend

### 13. Hintergrund-Aufgaben (Cron) — geplant
**Frage:** Soll die App planmäßig im Hintergrund laufen (z.B. nächtlicher Reminder, wöchentlicher Report)?

- Status: ↪ übersprungen (Funktion ist BACKLOG)
- Antwort:
- Ableitung (falls gewünscht):
  - Aktuell als TODO ins README aufnehmen
  - Sobald `@efa-one/sdk` einen `jobs`-Subpfad hat: Job-Registrierung beim App-Start
