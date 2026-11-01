import { describe, it, expect, vi } from 'vitest';
import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/** Rückfrage statt window.confirm. Dialog als Stub (Radix rendert im SSR keine Portals). */
const dialogProps: Array<Record<string, unknown>> = [];
vi.mock('../src/frontend/ui/Dialog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/frontend/ui/Dialog')>();
  return {
    ...actual,
    Dialog: (props: Record<string, unknown>) => {
      dialogProps.push(props);
      return createElement('div', null, props.children as never);
    },
  };
});
const { ConfirmDialog } = await import('../src/frontend/ui/ConfirmDialog');

function render(extra: Record<string, unknown> = {}) {
  const html = renderToStaticMarkup(
    createElement(ConfirmDialog, { open: true, title: 'Server deaktivieren?', onConfirm: () => {}, onCancel: () => {}, ...extra } as never),
  );
  return { html, props: dialogProps[dialogProps.length - 1] };
}
function buttons(props: Record<string, unknown>): ReactElement<Record<string, unknown>>[] {
  const footer = props.footer as ReactElement<{ children: ReactElement<Record<string, unknown>>[] }>;
  return footer.props.children.filter(isValidElement);
}

describe('ConfirmDialog', () => {
  it('schmal, Titel, Text, Marker; destruktiv: rot und Fokus auf Abbrechen', () => {
    const { html, props } = render({ description: 'Er ist danach nicht erreichbar.' });
    expect(props).toMatchObject({ size: 'sm', title: 'Server deaktivieren?', initialFocus: 'cancel', dataAttributes: { 'data-efa-dialog': 'confirm' } });
    expect(html).toContain('Er ist danach nicht erreichbar.');
    const [cancel, confirm] = buttons(props);
    expect(cancel.props['data-efa-action']).toBe('cancel');
    expect(confirm.props).toMatchObject({ variant: 'danger', 'data-efa-action': 'confirm', children: 'Bestätigen' });
  });

  it('primary: blauer Knopf, Fokus darauf, eigene Beschriftungen und Marker', () => {
    const { props } = render({ variant: 'primary', labels: { cancel: 'Nein', confirm: 'Ja, weiter' }, confirmAction: 'go', dataAttributes: { 'data-efa-dialog': 'x' } });
    const [cancel, confirm] = buttons(props);
    expect(props.initialFocus).toBe('primary');
    expect(props.dataAttributes).toEqual({ 'data-efa-dialog': 'x' });
    expect(cancel.props.children).toBe('Nein');
    expect(confirm.props).toMatchObject({ variant: 'primary', 'data-efa-action': 'go', children: 'Ja, weiter' });
  });

  it('ohne Text kein leerer Absatz', () => {
    expect(render().html).not.toContain('<p');
    expect(render({ description: '' }).html).not.toContain('<p');
  });

  it('busy sperrt, Fehler als Banner, Knöpfe und Schließen rufen die Handler', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { props } = render({ busy: true, error: 'Klappt nicht', onConfirm, onCancel });
    expect(props.banner).toBeTruthy();
    const [cancel, confirm] = buttons(props);
    expect(cancel.props.disabled).toBe(true);
    expect(confirm.props.loading).toBe(true);
    (cancel.props.onClick as () => void)();
    (confirm.props.onClick as () => void)();
    (props.onOpenChange as (o: boolean) => void)(true);
    (props.onOpenChange as (o: boolean) => void)(false);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
