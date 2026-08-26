/**
 * @efa-one/sdk/frontend/format — plattformweite Datums-/Zeit-Anzeige.
 *
 * **Warum es dieses Modul gibt:** `new Date(x).toLocaleString('de-DE')` liefert
 * **ohne** Options-Objekt das CLDR-„numeric"-Skeleton — also `1.9.2026`, nicht
 * `01.09.2026`. In DACH/EU ist aber die zweistellige Form üblich, und über die
 * Apps hinweg standen bis 2026-08 drei verschiedene Schreibweisen nebeneinander
 * (`1.9.2026`, `01.09.26` via `dateStyle:'short'`, und bei fehlendem Locale-Argument
 * sogar `9/1/2026`, weil dann die Browser-Sprache entscheidet).
 *
 * Verbindliche Vorgabe (siehe `app-development-specs/DESIGN_SYSTEM.md` →
 * „Datum & Uhrzeit"): Datum `DD.MM.YYYY`, Zeit `HH:MM` (24 h), Datum+Zeit
 * `DD.MM.YYYY, HH:MM`. Jede Anzeige eines Zeitstempels — DataTable-Spalte,
 * Detail-Dialog, Badge, Tooltip — geht durch diese Helfer.
 *
 * Verwendung:
 *   import { formatDate, formatDateTime, formatTime, localeForLanguage } from '@efa-one/sdk/frontend/format';
 *
 *   formatDate('2026-09-01T09:05:00Z')                       // "01.09.2026"
 *   formatDateTime(row.createdAt)                            // "01.09.2026, 11:05"
 *   formatDateTime(row.createdAt, { withSeconds: true })     // "01.09.2026, 11:05:00"
 *   formatTime(row.createdAt)                                // "11:05"
 *   formatDate(x, { locale: localeForLanguage(i18n.language) })  // i18n-abhängig
 *
 * Leere/ungültige Werte ergeben `fallback` (Default `'—'`) statt `Invalid Date` —
 * Spalten-Renderer müssen also nicht selbst auf `null` prüfen.
 *
 * **Kein `toLocaleDateString`/`toLocaleTimeString` in App-Code** — die ESLint-Regel
 * `no-restricted-syntax` (kernel/ai/chat + Template) meldet solche Aufrufe als Error.
 */

/** Alles, was sinnvoll als Zeitpunkt hereinkommen kann (ISO-String, Epoch-ms, `Date`). */
export type DateInput = Date | string | number | null | undefined;

export interface DateFormatOptions {
  /** BCP-47-Locale. Default `de-DE` — die Plattform ist deutschsprachig. */
  locale?: string;
  /** IANA-Zeitzone (z. B. `Europe/Berlin`). Default: Zeitzone des Browsers. */
  timeZone?: string;
  /** Anzeige für leere/ungültige Werte. Default `—` (Geviertstrich). */
  fallback?: string;
  /** Sekunden mit ausgeben (nur `formatDateTime`/`formatTime`). Default `false`. */
  withSeconds?: boolean;
}

/** Default-Locale der Plattform. */
export const DEFAULT_DATE_LOCALE = 'de-DE';

/** Default-Anzeige für leere/ungültige Zeitstempel. */
export const DEFAULT_DATE_FALLBACK = '—';

/**
 * i18n-Sprachcode (`de`, `en`, `de-AT`, …) → Locale für die Datumsausgabe.
 * Unbekanntes/leeres Kürzel fällt auf `de-DE` zurück.
 */
export function localeForLanguage(language?: string | null): string {
  const lang = (language ?? '').trim().toLowerCase();
  if (!lang) return DEFAULT_DATE_LOCALE;
  if (lang === 'de' || lang.startsWith('de-')) return DEFAULT_DATE_LOCALE;
  if (lang === 'en' || lang.startsWith('en-')) return 'en-US';
  return language as string;
}

/** `DateInput` → gültiges `Date` oder `null` (leer, unparsbar, `Invalid Date`). */
function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function base(opts?: DateFormatOptions): Intl.DateTimeFormatOptions {
  return opts?.timeZone ? { timeZone: opts.timeZone } : {};
}

function run(value: DateInput, opts: DateFormatOptions | undefined, fmt: Intl.DateTimeFormatOptions): string {
  const d = toDate(value);
  if (!d) return opts?.fallback ?? DEFAULT_DATE_FALLBACK;
  return new Intl.DateTimeFormat(opts?.locale ?? DEFAULT_DATE_LOCALE, { ...base(opts), ...fmt }).format(d);
}

/** Nur das Datum: `01.09.2026`. */
export function formatDate(value: DateInput, opts?: DateFormatOptions): string {
  return run(value, opts, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Nur die Uhrzeit: `11:05` (bzw. `11:05:00` mit `withSeconds`).
 * `hourCycle: 'h23'` erzwingt 24 h auch unter englischem Locale — Zeitstempel in
 * Listen und Logs sollen plattformweit gleich aussehen.
 */
export function formatTime(value: DateInput, opts?: DateFormatOptions): string {
  return run(value, opts, {
    hour: '2-digit',
    minute: '2-digit',
    ...(opts?.withSeconds ? { second: '2-digit' } : {}),
    hourCycle: 'h23',
  });
}

/** Datum + Uhrzeit: `01.09.2026, 11:05` (bzw. `…, 11:05:00` mit `withSeconds`). */
export function formatDateTime(value: DateInput, opts?: DateFormatOptions): string {
  return run(value, opts, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(opts?.withSeconds ? { second: '2-digit' } : {}),
    hourCycle: 'h23',
  });
}

/**
 * Kompakter Zeitstempel für Dateinamen/Exporte: `2026-09-01_11-05-00`.
 * Bewusst ISO-sortierbar (nicht `DD.MM.`) — Dateilisten sollen chronologisch sortieren.
 */
export function formatFileStamp(value: DateInput, opts?: Pick<DateFormatOptions, 'timeZone'>): string {
  const d = toDate(value) ?? new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    ...(opts?.timeZone ? { timeZone: opts.timeZone } : {}),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const p = (type: Intl.DateTimeFormatPartTypes) => parts.find((x) => x.type === type)?.value ?? '';
  return `${p('year')}-${p('month')}-${p('day')}_${p('hour')}-${p('minute')}-${p('second')}`;
}
