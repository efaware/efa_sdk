/**
 * Eingabe von Datum und Uhrzeit im Plattformformat `TT.MM.JJJJ HH:MM` (24 h),
 * statt `<input type="datetime-local">`, das je nach Browser-Sprache
 * `mm/dd/yyyy, --:-- --` zeigt. Reine Funktionen, die `DateTimeField` benutzt.
 */

export type DateTimeParseResult =
  | { ok: true; iso: string | null }
  | { ok: false; error: string };

const PATTERN = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[,\s]+(\d{1,2}):(\d{2}))?$/;

/**
 * `01.11.2026 06:00` (auch mit Komma wie in `formatDateTime`, Uhrzeit optional =
 * 00:00) → ISO-Zeitpunkt in der Ortszeit des Browsers. Leer → `iso: null`.
 * Prüft echte Kalendertage (kein 31.02.) und 0–23 / 0–59.
 */
export function parseDateTimeDe(text: string): DateTimeParseResult {
  const t = text.trim();
  if (t === '') return { ok: true, iso: null };
  const m = PATTERN.exec(t);
  if (!m) return { ok: false, error: 'Bitte als TT.MM.JJJJ HH:MM eingeben.' };
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const hour = m[4] !== undefined ? Number(m[4]) : 0;
  const minute = m[5] !== undefined ? Number(m[5]) : 0;
  if (month < 1 || month > 12) return { ok: false, error: 'Den Monat gibt es nicht.' };
  if (hour > 23 || minute > 59) return { ok: false, error: 'Die Uhrzeit gibt es nicht.' };
  const date = new Date(year, month - 1, day, hour, minute);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return { ok: false, error: 'Diesen Tag gibt es nicht.' };
  }
  return { ok: true, iso: date.toISOString() };
}

/**
 * Weiche Maske beim Tippen: aus den Ziffern wird `TT.MM.JJJJ HH:MM`, Punkte,
 * Leerzeichen und Doppelpunkt kommen von selbst. Mehr als 12 Ziffern werden
 * abgeschnitten. Eingaben, die schon Trenner enthalten, bleiben lesbar.
 */
export function maskDateTimeInput(text: string): string {
  // Eingefügtes ISO-Datum (2026-11-02 06:00, 2026-11-02T06:00) umstellen statt zu zerhacken.
  const iso = /^\s*(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/.exec(text);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}${iso[4] !== undefined ? ` ${iso[4]}:${iso[5]}` : ''}`;
  const d = text.replace(/\D/g, '').slice(0, 12);
  const parts = [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8), d.slice(8, 10), d.slice(10, 12)];
  let out = parts[0];
  if (d.length > 2) out += `.${parts[1]}`;
  if (d.length > 4) out += `.${parts[2]}`;
  if (d.length > 8) out += ` ${parts[3]}`;
  if (d.length > 10) out += `:${parts[4]}`;
  return out;
}
