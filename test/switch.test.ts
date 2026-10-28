import { describe, it, expect, vi } from 'vitest';
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
