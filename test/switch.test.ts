import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Switch, SwitchControl } from '../src/frontend/ui/Switch';

/**
 * Schalter für Ein/Aus-Werte: nativer `<button role="switch">` mit `aria-checked`,
 * Beschriftung per `<label for>`, Erläuterung per `aria-describedby`.
 */

const control = (props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(SwitchControl, props as never));

describe('SwitchControl', () => {
  it('rendert role="switch" mit aria-checked und data-state', () => {
    const on = control({ checked: true, 'aria-label': 'Aktiv' });
    expect(on).toContain('role="switch"');
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain('data-state="checked"');
    expect(on).toContain('aria-label="Aktiv"');
    expect(on).toContain('type="button"');

    const off = control({ checked: false });
    expect(off).toContain('aria-checked="false"');
    expect(off).toContain('data-state="unchecked"');
  });

  it('setzt die Ton-Klasse, Default primary', () => {
    expect(control({ checked: true })).toContain('switch-primary');
    expect(control({ checked: true, tone: 'danger' })).toContain('switch-danger');
  });

  it('meldet beim Klick den umgekehrten Wert', () => {
    const onCheckedChange = vi.fn();
    const el = SwitchControl({ checked: false, onCheckedChange }) as ReactElement<{ onClick: () => void }>;
    el.props.onClick();
    expect(onCheckedChange).toHaveBeenCalledWith(true);

    const el2 = SwitchControl({ checked: true, onCheckedChange }) as ReactElement<{ onClick: () => void }>;
    el2.props.onClick();
    expect(onCheckedChange).toHaveBeenLastCalledWith(false);
  });

  it('liefert mit name ein verstecktes Feld, auch für false', () => {
    expect(control({ checked: true, name: 'active' })).toContain('<input type="hidden" name="active" value="true"/>');
    expect(control({ checked: false, name: 'active' })).toContain('<input type="hidden" name="active" value="false"/>');
    expect(control({ checked: false })).not.toContain('type="hidden"');
  });

  it('übernimmt disabled', () => {
    expect(control({ checked: false, disabled: true })).toContain('disabled=""');
  });
});

describe('Switch', () => {
  const render = (props: Record<string, unknown>) =>
    renderToStaticMarkup(createElement(Switch, props as never));

  it('verknüpft Beschriftung und Schalter über die id', () => {
    const html = render({ id: 'notify', checked: true, label: 'Benachrichtigungen' });
    expect(html).toContain('id="notify"');
    expect(html).toContain('for="notify"');
    expect(html).toContain('Benachrichtigungen');
  });

  it('erzeugt ohne id eine eigene und verknüpft trotzdem', () => {
    const html = render({ checked: false, label: 'Aktiv' });
    const id = /role="switch" id="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`for="${id}"`);
  });

  it('hängt die Erläuterung per aria-describedby an', () => {
    const html = render({ id: 'x', checked: false, label: 'Extern', description: 'Nur für Gäste' });
    expect(html).toContain('aria-describedby="x-desc"');
    expect(html).toContain('id="x-desc"');
    expect(html).toContain('Nur für Gäste');
  });

  it('ohne Erläuterung kein aria-describedby', () => {
    expect(render({ checked: false, label: 'Aktiv' })).not.toContain('aria-describedby');
  });
});

/**
 * WCAG 1.4.11 (3 : 1) für den Aus-Zustand: Spur gegen Fläche und weißer Knopf
 * gegen Spur, gerechnet mit dem Mischanteil aus styles.css und den Built-in-Themes
 * des Kernels (apps/efa-kernel ThemeContext.tsx, Stand 28.10.2026).
 */
describe('Switch – Kontrast Aus-Zustand (styles.css)', () => {
  const css = readFileSync(resolve(__dirname, '../src/frontend/ui/styles.css'), 'utf8');
  const share = Number(
    /\.switch \{[^}]*background: color-mix\(in srgb, var\(--color-text-primary\) (\d+)%, var\(--color-border\)\)/.exec(css)?.[1],
  ) / 100;

  type RGB = [number, number, number];
  const hex = (h: string): RGB => [0, 2, 4].map((i) => parseInt(h.slice(1 + i, 3 + i), 16) / 255) as RGB;
  const mix = (a: RGB, b: RGB, p: number): RGB => a.map((c, i) => c * p + b[i] * (1 - p)) as RGB;
  const lum = ([r, g, b]: RGB) => {
    const l = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * l(r) + 0.7152 * l(g) + 0.0722 * l(b);
  };
  const contrast = (a: RGB, b: RGB) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  const THEMES: Record<string, { surface: string; surfaceRaised: string; border: string; textPrimary: string }> = {
    'standard-light': { surface: '#ffffff', surfaceRaised: '#eef1f7', border: '#d0d5e0', textPrimary: '#1a2744' },
    'standard-dark': { surface: '#252526', surfaceRaised: '#2d2d30', border: '#3e3e42', textPrimary: '#f1f5f9' },
    elanis: { surface: '#ffffff', surfaceRaised: '#eef2f7', border: '#d4dae3', textPrimary: '#0d1a2d' },
    'imh-standard': { surface: '#ffffff', surfaceRaised: '#eef0f8', border: '#d0d4e8', textPrimary: '#0f0f0f' },
  };

  it('liest den Mischanteil aus styles.css', () => {
    expect(share).toBeGreaterThan(0);
  });

  for (const [name, t] of Object.entries(THEMES)) {
    it(`${name}: Spur und Knopf ≥ 3 : 1`, () => {
      const track = mix(hex(t.textPrimary), hex(t.border), share);
      const pairs: Record<string, number> = {
        'Spur/surface': contrast(track, hex(t.surface)),
        'Spur/surface-raised': contrast(track, hex(t.surfaceRaised)),
        'Knopf/Spur': contrast(hex('#ffffff'), track),
      };
      for (const [pair, ratio] of Object.entries(pairs)) {
        expect(ratio, `${name} ${pair}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
      }
    });
  }
});
