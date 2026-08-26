/**
 * Tests für `src/frontend/format.ts` — die plattformweite Datums-/Zeit-Anzeige.
 *
 * Kern der Suite ist der Regressionsschutz gegen genau den Bug, der das Modul
 * ausgelöst hat: `toLocaleString('de-DE')` ohne Options-Objekt liefert `1.9.2026`
 * statt `01.09.2026`. Die Zusicherung „führende Null bei Tag UND Monat" wird
 * deshalb explizit auf einen einstelligen Tag im einstelligen Monat geprüft.
 *
 * Alle Assertions laufen mit fixer Zeitzone (`Europe/Berlin`), damit die Suite
 * unabhängig von der TZ des Testrechners/CI-Runners ist.
 */
import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatTime,
  formatFileStamp,
  localeForLanguage,
  DEFAULT_DATE_LOCALE,
} from '../src/frontend/format.js';

const TZ = { timeZone: 'Europe/Berlin' };
// 2026-09-01 ist ein einstelliger Tag in einem einstelligen Monat — genau der Fall,
// den das alte `toLocaleString('de-DE')` zu „1.9.2026" verkürzt hat.
const ISO = '2026-09-01T09:05:00Z'; // = 11:05 Ortszeit Berlin (CEST)

describe('formatDate', () => {
  it('gibt DD.MM.YYYY mit führenden Nullen aus', () => {
    expect(formatDate(ISO, TZ)).toBe('01.09.2026');
  });

  it('akzeptiert Date, ISO-String und Epoch-ms gleichwertig', () => {
    const d = new Date(ISO);
    expect(formatDate(d, TZ)).toBe('01.09.2026');
    expect(formatDate(ISO, TZ)).toBe('01.09.2026');
    expect(formatDate(d.getTime(), TZ)).toBe('01.09.2026');
  });

  it('behält das vierstellige Jahr (nicht dateStyle:short → „01.09.26")', () => {
    expect(formatDate(ISO, TZ)).not.toBe('01.09.26');
  });

  it('formatiert unter englischem Locale nach dessen Konvention', () => {
    expect(formatDate(ISO, { ...TZ, locale: 'en-US' })).toBe('09/01/2026');
  });

  it('liefert den Fallback für leere, ungültige und fehlende Werte', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
    expect(formatDate('kein datum')).toBe('—');
    expect(formatDate(null, { fallback: 'nie' })).toBe('nie');
  });
});

describe('formatDateTime', () => {
  it('gibt „DD.MM.YYYY, HH:MM" ohne Sekunden aus', () => {
    expect(formatDateTime(ISO, TZ)).toBe('01.09.2026, 11:05');
  });

  it('nimmt Sekunden nur auf Anforderung dazu', () => {
    expect(formatDateTime(ISO, { ...TZ, withSeconds: true })).toBe('01.09.2026, 11:05:00');
  });

  it('rechnet in die angegebene Zeitzone um', () => {
    expect(formatDateTime(ISO, { timeZone: 'UTC' })).toBe('01.09.2026, 09:05');
  });

  it('bleibt auch unter englischem Locale 24-stündig (kein AM/PM)', () => {
    const out = formatDateTime('2026-09-01T13:05:00Z', { timeZone: 'UTC', locale: 'en-US' });
    expect(out).toContain('13:05');
    expect(out).not.toMatch(/[AP]M/);
  });

  it('liefert den Fallback für ungültige Werte', () => {
    expect(formatDateTime(undefined)).toBe('—');
  });
});

describe('formatTime', () => {
  it('gibt HH:MM aus, mit Sekunden auf Anforderung', () => {
    expect(formatTime(ISO, TZ)).toBe('11:05');
    expect(formatTime(ISO, { ...TZ, withSeconds: true })).toBe('11:05:00');
  });

  it('liefert den Fallback für ungültige Werte', () => {
    expect(formatTime('')).toBe('—');
  });
});

describe('formatFileStamp', () => {
  it('ist ISO-sortierbar und dateinamen-sicher (keine Punkte/Doppelpunkte)', () => {
    const stamp = formatFileStamp(ISO, TZ);
    expect(stamp).toBe('2026-09-01_11-05-00');
    expect(stamp).not.toMatch(/[.:,\s]/);
  });

  it('fällt bei ungültigem Wert auf „jetzt" zurück statt auf „Invalid Date"', () => {
    expect(formatFileStamp('kein datum')).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
  });
});

describe('localeForLanguage', () => {
  it('mappt de/en inkl. Regionalvarianten', () => {
    expect(localeForLanguage('de')).toBe('de-DE');
    expect(localeForLanguage('de-AT')).toBe('de-DE');
    expect(localeForLanguage('en')).toBe('en-US');
    expect(localeForLanguage('EN-GB')).toBe('en-US');
  });

  it('fällt bei leerem Wert auf das Plattform-Default zurück', () => {
    expect(localeForLanguage(undefined)).toBe(DEFAULT_DATE_LOCALE);
    expect(localeForLanguage('')).toBe(DEFAULT_DATE_LOCALE);
  });

  it('reicht unbekannte Sprachen unverändert an Intl durch', () => {
    expect(localeForLanguage('fr-FR')).toBe('fr-FR');
  });
});
