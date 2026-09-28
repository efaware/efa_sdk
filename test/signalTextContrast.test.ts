import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * WCAG-AA-Gate für Signalfarben als Text (`--color-<ton>-text` in styles.css).
 *
 * Die Text-Tokens entstehen per `color-mix(in srgb, var(--color-<ton>) N%,
 * var(--color-text-primary))`. Dieser Test liest die Anteile N direkt aus der
 * ausgelieferten CSS-Datei und rechnet sie gegen die Built-in-Themes des Kernels
 * (apps/efa-kernel ThemeContext.tsx) und die Scaffold-Defaults nach — auf allen
 * Flächen, auf denen das ui-Kit Signaltext zeigt. Wer einen Anteil anhebt oder ein
 * Theme mit schwächerem Kontrast einführt, bekommt hier Rot statt unlesbarer Badges.
 */

const css = readFileSync(resolve(__dirname, '../src/frontend/ui/styles.css'), 'utf8');

const AA = 4.5;
const TONES = ['danger', 'warning', 'success', 'primary'] as const;
type Tone = (typeof TONES)[number];

interface Palette {
  surface: string;
  background: string;
  surfaceRaised: string;
  textPrimary: string;
  primary: string;
  success: string;
  warning: string;
  danger: string;
}

// Stand apps/efa-kernel/frontend/src/context/ThemeContext.tsx (THEMES), 28.09.2026.
const THEMES: Record<string, Palette> = {
  'standard-light': { primary: '#e87817', background: '#ffffff', surface: '#ffffff', surfaceRaised: '#eef1f7', textPrimary: '#1a2744', success: '#22c55e', warning: '#f59e0b', danger: '#ef4444' },
  'standard-dark':  { primary: '#6366f1', background: '#1e1e1e', surface: '#252526', surfaceRaised: '#2d2d30', textPrimary: '#f1f5f9', success: '#22c55e', warning: '#f59e0b', danger: '#ef4444' },
  elanis:           { primary: '#3db5ab', background: '#f5f7fa', surface: '#ffffff', surfaceRaised: '#eef2f7', textPrimary: '#0d1a2d', success: '#22c55e', warning: '#f59e0b', danger: '#ef4444' },
  'imh-standard':   { primary: '#6fba2c', background: '#dee6d8', surface: '#ffffff', surfaceRaised: '#eef0f8', textPrimary: '#0f0f0f', success: '#6fba2c', warning: '#f59e0b', danger: '#ef4444' },
  // Scaffold-Defaults (template/frontend/src/index.css, außerhalb des Portals)
  'scaffold-light': { primary: '#6366f1', background: '#f8fafc', surface: '#ffffff', surfaceRaised: '#f1f5f9', textPrimary: '#0f172a', success: '#22c55e', warning: '#f59e0b', danger: '#ef4444' },
};

type RGB = [number, number, number];

function hex(h: string): RGB {
  const x = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) / 255) as RGB;
}

/** color-mix(in srgb, a p, b) — lineare Mischung der gamma-codierten Kanäle. */
function mix(a: RGB, b: RGB, p: number): RGB {
  return a.map((c, i) => c * p + b[i] * (1 - p)) as RGB;
}

function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function shareOf(tone: Tone): number {
  const re = new RegExp(
    `--color-${tone}-text:\\s*color-mix\\(in srgb, var\\(--color-${tone}\\) (\\d+)%, var\\(--color-text-primary\\)\\)`,
  );
  const m = css.match(re);
  if (!m) throw new Error(`--color-${tone}-text fehlt oder hat unerwartete Form in styles.css`);
  return Number(m[1]) / 100;
}

/** Flächen, auf denen das ui-Kit Signaltext rendert (inkl. Badge-/Alert-Tönung). */
function backgroundsFor(p: Palette, tone: Tone): Record<string, RGB> {
  const sig = hex(p[tone]);
  return {
    surface: hex(p.surface),
    background: hex(p.background),
    surfaceRaised: hex(p.surfaceRaised),
    'badge-tint-on-surface': mix(sig, hex(p.surface), 0.15),
    'badge-tint-on-raised': mix(sig, hex(p.surfaceRaised), 0.15),
    'alert-tint-on-surface': mix(sig, hex(p.surface), 0.1),
  };
}

describe('Signalfarben als Text – WCAG AA (styles.css)', () => {
  for (const [name, palette] of Object.entries(THEMES)) {
    for (const tone of TONES) {
      it(`${name}: --color-${tone}-text ≥ ${AA} : 1`, () => {
        const text = mix(hex(palette[tone]), hex(palette.textPrimary), shareOf(tone));
        for (const [bgName, bg] of Object.entries(backgroundsFor(palette, tone))) {
          const ratio = contrast(text, bg);
          expect(ratio, `${name} ${tone} auf ${bgName}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(AA);
        }
      });
    }
  }

  it('Befund reproduziert: die reine Signalfarbe als Text fällt in „Standard Light" durch', () => {
    const p = THEMES['standard-light'];
    expect(contrast(hex(p.danger), hex(p.surface))).toBeCloseTo(3.76, 2);
    expect(contrast(hex(p.primary), hex(p.surface))).toBeCloseTo(2.95, 2);
    expect(contrast(hex(p.success), hex(p.surface))).toBeCloseTo(2.28, 2);
    expect(contrast(hex(p.warning), hex(p.surface))).toBeCloseTo(2.15, 2);
  });

  it('Badge- und Alert-Klassen setzen Text nur über die -text-Tokens', () => {
    const blocks = [...css.matchAll(/\.(badge|alert)-(success|warning|danger|error|info)\s*\{([^}]*)\}/g)];
    expect(blocks.length).toBe(7);
    for (const [, kind, variant, body] of blocks) {
      const color = body.match(/(?:^|[\s;])color:\s*([^;]+);/)?.[1];
      expect(color, `.${kind}-${variant}`).toMatch(/^var\(--color-(danger|warning|success|primary)-text\)$/);
    }
  });
});
