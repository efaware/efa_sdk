import { describe, it, expect } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SecretInput, SECRET_MASK, secretInputValue } from '../src/frontend/ui/SecretInput';
import { FormField } from '../src/frontend/ui/FormField';

const h = createElement as unknown as (type: unknown, props?: unknown, ...children: unknown[]) => ReactElement;
const html = (el: ReactElement) => renderToStaticMarkup(el);
const noop = () => {};

describe('SecretInput', () => {
  it('gespeichertes Geheimnis: feste Punktreihe, Passwortfeld, ohne Pflicht', () => {
    const out = html(h(SecretInput, { value: '', onValueChange: noop, isSet: true, required: true }));
    expect(SECRET_MASK).toBe('•'.repeat(12));
    expect(out).toContain(`value="${SECRET_MASK}"`);
    expect(out).toContain('type="password"');
    expect(out).toContain('autoComplete="new-password"');
    expect(out).toContain('data-efa-field="secret"');
    expect(out).toContain('data-efa-secret="set"');
    expect(out).not.toContain('required');
  });

  it('kein Geheimnis gespeichert: Feld bleibt leer', () => {
    const out = html(h(SecretInput, { value: '', onValueChange: noop, isSet: false, required: true }));
    expect(out).toContain('value=""');
    expect(out).toContain('data-efa-secret="empty"');
    expect(out).toContain('required');
  });

  it('maskiert: kein name, damit FormData die Punkte nie liest', () => {
    expect(html(h(SecretInput, { value: '', onValueChange: noop, isSet: true, name: 'apiKey' }))).not.toContain('name=');
    expect(html(h(SecretInput, { value: 'neu', onValueChange: noop, isSet: true, name: 'apiKey' }))).toContain('name="apiKey"');
  });

  it('neue Eingabe ersetzt die Punkte', () => {
    const out = html(h(SecretInput, { value: 'sk-neu', onValueChange: noop, isSet: true }));
    expect(out).toContain('value="sk-neu"');
    expect(out).not.toContain('•');
  });

  it('Auge nur bei eigener Eingabe, nie über der Maske', () => {
    const masked = html(h(SecretInput, { value: '', onValueChange: noop, isSet: true }));
    expect(masked).not.toContain('Eingabe anzeigen');
    expect(masked).not.toContain('data-efa-action="reveal"');
    const empty = html(h(SecretInput, { value: '', onValueChange: noop, isSet: false }));
    expect(empty).not.toContain('Eingabe anzeigen');
    const typed = html(h(SecretInput, { value: 'sk-neu', onValueChange: noop, isSet: true }));
    expect(typed).toContain('aria-label="Eingabe anzeigen"');
    expect(typed).toContain('aria-pressed="false"');
    expect(typed).toContain('data-efa-action="reveal"');
    // Aufgedeckt wird erst per Klick: anfangs bleibt es ein Passwortfeld.
    expect(typed).toContain('type="password"');
  });

  it('ohne Auge bei revealable={false} oder deaktiviertem Feld', () => {
    expect(html(h(SecretInput, { value: 'x', onValueChange: noop, isSet: false, revealable: false })))
      .not.toContain('Eingabe anzeigen');
    expect(html(h(SecretInput, { value: 'x', onValueChange: noop, isSet: false, disabled: true })))
      .not.toContain('Eingabe anzeigen');
  });

  it('className gilt für den Rahmen, nicht für das Feld', () => {
    const out = html(h(SecretInput, { value: '', onValueChange: noop, isSet: false, className: 'max-w-md' }));
    expect(out).toMatch(/^<span class="relative block max-w-md">/);
  });

  it('übernimmt id und Fehler aus dem FormField', () => {
    const out = html(h(FormField, { label: 'API-Key', id: 'key', error: 'Fehlt' },
      h(SecretInput, { value: '', onValueChange: noop, isSet: false })));
    expect(out).toContain('id="key"');
    expect(out).toContain('aria-invalid="true"');
  });
});

describe('secretInputValue', () => {
  it('nimmt aus dem maskierten Feld nur die Eingabe', () => {
    expect(secretInputValue('abc', true)).toBe('abc');
    expect(secretInputValue(`${SECRET_MASK}x`, true)).toBe('x');
    expect(secretInputValue(SECRET_MASK.slice(1), true)).toBe('');
  });

  it('lässt Eingaben im offenen Feld unverändert', () => {
    expect(secretInputValue('a•b', false)).toBe('a•b');
  });
});
