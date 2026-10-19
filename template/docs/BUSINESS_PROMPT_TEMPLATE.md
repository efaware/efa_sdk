# Business Prompt Template for Non-Developers

Use this template when asking Cursor or Claude Code to implement a new feature/app with this repository.
Focus on business logic. The agent must ask technical follow-up questions where needed.

## Copy/Paste Prompt

```md
Ich beschreibe nur die Fachlogik. Du nutzt das app-template und arbeitest im registry-only Modus.

## Zielprozess
- Was soll der Nutzer fachlich erreichen?
- Wann beginnt/endet der Prozess?

## Soll sich die App etwas merken?
Wähle eine Form und schreib einen Satz, warum:
- [ ] **Werkzeug:** Ich gebe etwas hinein und bekomme sofort ein Ergebnis. Danach muss nichts gespeichert bleiben (z. B. eine Excel-Liste umrechnen).
- [ ] **Verwaltung:** Die App soll sich Dinge merken. Ich will eine Übersicht aller Einträge, einen anklicken, die Einzelheiten sehen, ändern oder löschen (z. B. Aufgaben, Kunden, Geräte).
- [ ] **Werkzeug mit Verlauf:** Die App erledigt etwas sofort, ich will aber später sehen, was sie wann mit welchem Ergebnis getan hat (z. B. Aufgaben, die im ERP angelegt werden).

Wenn Verwaltung oder Verlauf: Welche Dinge soll sich die App merken, und was gehört zu jedem davon?
- <Ding 1>: <was dazugehört>
- <Ding 2>: <was dazugehört>

Tipp: Landet das Ergebnis in einem anderen System, hat etwas einen Zustand (offen/erledigt) oder arbeiten mehrere Personen damit, reicht ein reines Werkzeug fast nie.

## Rollen
- Welche Rollen gibt es (z. B. Sachbearbeitung, Teamleitung)?
- Wer darf was sehen oder auslösen?

## Benötigte Daten aus anderen efa-apps
- Service Keys: <service_key_1>, <service_key_2>, ...
- Welche Felder brauche ich pro Service?
- Nur lesen oder auch schreiben?

## Fachregeln
- Welche Bedingungen/Entscheidungen gelten?
- Welche Pflichtfelder/Validierungen gibt es?

## Fehlerverhalten
- Was soll passieren, wenn ein abhängiger Service nicht verfügbar ist?
- Was soll der Nutzer sehen?

## Audit & Reporting
- Welche fachlichen Aktionen sollen im efa-one-Dashboard sichtbar sein (z. B. „wie viele Exporte pro Tag")?
- Welche Aktionen sind compliance-relevant und müssen im Audit-Log erscheinen (z. B. Rollenänderungen, Datenlöschungen)?
- Gibt es messbare Vorgänge, deren Laufzeit oder Volumen als Metrik erfasst werden soll?

## Akzeptanzkriterien
- Woran erkenne ich, dass die Umsetzung korrekt ist?

Wichtig:
- Stelle mir alle nötigen Rückfragen strukturiert.
- Nutze keine hardcodierten Service-URLs.
- Löse alle Fremdservices über efa-one Registry auf.
- Jede Route, die Daten anlegt, ändert oder löscht, muss reportEvent/logAudit aufrufen.
```

## Minimum information needed before implementation

- Grundform der App (Werkzeug / Verwaltung / Werkzeug mit Verlauf), vom User gewählt
- Bei Verwaltung/Verlauf: die Dinge, die gespeichert werden, mit ihren Angaben
- Confirmed `service_key` list
- Expected data objects/fields per service
- Read/write scope per service
- Dependency error behavior
- Acceptance criteria
- Which actions appear in efa-one reporting-db (analytics)
- Which actions appear in audit log (compliance)
