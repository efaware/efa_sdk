import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Alert, alertContentKey, isAlertHidden } from '../src/frontend/ui/Alert';

/**
 * Jedes Banner ist ab Werk wegklickbar („×" oben rechts). Ohne `onDismiss` blendet es
 * sich selbst aus und kommt bei neuem Text wieder; `dismissible={false}` schaltet das „×" ab.
 */

const render = (props: Record<string, unknown>, text = 'Meldung') =>
  renderToStaticMarkup(createElement(Alert, props as never, text));

describe('Alert', () => {
  it('zeigt das „×" auch ohne onDismiss', () => {
    expect(render({})).toContain('aria-label="Meldung schließen"');
    expect(render({ variant: 'success' })).toContain('aria-label="Meldung schließen"');
  });

  it('zeigt das „×" mit onDismiss', () => {
    expect(render({ onDismiss: () => {} })).toContain('aria-label="Meldung schließen"');
  });

  it('dismissible={false} blendet das „×" aus', () => {
    const html = render({ dismissible: false });
    expect(html).toContain('Meldung');
    expect(html).not.toContain('Meldung schließen');
  });
});

describe('Selbst-Ausblenden', () => {
  it('erkennt Text und Zahlen wieder, sonst nicht', () => {
    expect(alertContentKey('Fehler')).toBe('Fehler');
    expect(alertContentKey(42)).toBe('42');
    expect(alertContentKey(createElement('b', null, 'x'))).toBeNull();
  });

  it('bleibt sichtbar, solange nie geschlossen', () => {
    expect(isAlertHidden(undefined, 'Fehler')).toBe(false);
    expect(isAlertHidden(undefined, null)).toBe(false);
  });

  it('bleibt zu für denselben Inhalt, kommt bei neuem Text wieder', () => {
    expect(isAlertHidden('Fehler', 'Fehler')).toBe(true);
    expect(isAlertHidden('Fehler', 'Anderer Fehler')).toBe(false);
  });

  it('bleibt bei nicht vergleichbarem Inhalt zu', () => {
    expect(isAlertHidden(null, null)).toBe(true);
  });
});
