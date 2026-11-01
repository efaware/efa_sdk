import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseDateTimeDe, maskDateTimeInput } from '../src/frontend/ui/dateTimeInput';
import { DateTimeField, dateTimeFieldText, dateTimeFieldError } from '../src/frontend/ui/DateTimeField';

/** Datum + Uhrzeit im Plattformformat statt datetime-local (Browser-Sprache). */
afterEach(() => { vi.unstubAllEnvs(); });

function local(iso: string | null): string | null {
  if (!iso) return iso;
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

describe('parseDateTimeDe', () => {
  it('Datum mit Uhrzeit, mit Komma, ohne Uhrzeit, einstellige Teile', () => {
    const a = parseDateTimeDe('01.11.2026 06:00');
    expect(a.ok && local(a.iso)).toBe('01.11.2026 06:00');
    const b = parseDateTimeDe('01.11.2026, 23:59');
    expect(b.ok && local(b.iso)).toBe('01.11.2026 23:59');
    const c = parseDateTimeDe('1.2.2027');
    expect(c.ok && local(c.iso)).toBe('01.02.2027 00:00');
  });
  it('leer → null, ok', () => {
    expect(parseDateTimeDe('  ')).toEqual({ ok: true, iso: null });
  });
  it('Format, Monat, Tag und Uhrzeit werden geprüft', () => {
    expect(parseDateTimeDe('2026-11-01')).toEqual({ ok: false, error: 'Bitte als TT.MM.JJJJ HH:MM eingeben.' });
    expect(parseDateTimeDe('01.13.2026')).toEqual({ ok: false, error: 'Den Monat gibt es nicht.' });
    expect(parseDateTimeDe('31.02.2026')).toEqual({ ok: false, error: 'Diesen Tag gibt es nicht.' });
    expect(parseDateTimeDe('01.11.2026 24:00')).toEqual({ ok: false, error: 'Die Uhrzeit gibt es nicht.' });
    expect(parseDateTimeDe('01.11.2026 12:60')).toEqual({ ok: false, error: 'Die Uhrzeit gibt es nicht.' });
  });
});

describe('maskDateTimeInput', () => {
  it('setzt Trenner beim Tippen', () => {
    expect(maskDateTimeInput('0')).toBe('0');
    expect(maskDateTimeInput('011')).toBe('01.1');
    expect(maskDateTimeInput('01112')).toBe('01.11.2');
    expect(maskDateTimeInput('011120260')).toBe('01.11.2026 0');
    expect(maskDateTimeInput('01112026060')).toBe('01.11.2026 06:0');
    expect(maskDateTimeInput('0111202606001234')).toBe('01.11.2026 06:00');
    expect(maskDateTimeInput('01.11.2026 06:00')).toBe('01.11.2026 06:00');
    expect(maskDateTimeInput('')).toBe('');
  });
});

describe('DateTimeField', () => {
  it('Text aus ISO ohne Komma, leer bei null', () => {
    expect(dateTimeFieldText(null)).toBe('');
    const iso = new Date(2026, 10, 2, 5, 7).toISOString();
    expect(dateTimeFieldText(iso)).toBe('02.11.2026 05:07');
  });
  it('Fehler: Format, Pflicht, Mindestzeitpunkt', () => {
    expect(dateTimeFieldError('xx')).toBe('Bitte als TT.MM.JJJJ HH:MM eingeben.');
    expect(dateTimeFieldError('', { required: true })).toBe('Bitte Datum und Uhrzeit eingeben.');
    expect(dateTimeFieldError('')).toBeNull();
    const min = new Date(2026, 10, 1, 12, 0).toISOString();
    expect(dateTimeFieldError('01.11.2026 11:00', { min })).toBe('Frühestens 01.11.2026, 12:00.');
    expect(dateTimeFieldError('01.11.2026 13:00', { min })).toBeNull();
  });
  it('rendert Textfeld mit Platzhalter, Label, Hinweis und Marker', () => {
    const html = renderToStaticMarkup(createElement(DateTimeField, { value: null, onChange: () => {}, label: 'Start', hint: 'Leer = sofort', id: 'f1' }));
    expect(html).toContain('data-efa-field="datetime"');
    expect(html).toContain('<label for="f1"');
    expect(html).toContain('placeholder="TT.MM.JJJJ HH:MM"');
    expect(html).toContain('aria-describedby="f1-hint"');
    expect(html).toContain('Leer = sofort');
    expect(html).not.toContain('aria-invalid');
  });
  it('ohne Label und Hinweis, mit Wert', () => {
    const iso = new Date(2026, 10, 2, 5, 7).toISOString();
    const html = renderToStaticMarkup(createElement(DateTimeField, { value: iso, onChange: () => {} }));
    expect(html).toContain('value="02.11.2026 05:07"');
    expect(html).not.toContain('<label');
  });
});
