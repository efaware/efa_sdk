import { describe, it, expect, vi } from 'vitest';
import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/** Bestätigung vor dem Löschen (Teil von `useRecords`). Dialog als Stub, Radix rendert keine Portals im SSR. */
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
const { ConfirmDeleteDialog } = await import('../src/frontend/ui/ConfirmDeleteDialog');

function render(extra: Record<string, unknown> = {}) {
  const html = renderToStaticMarkup(
    createElement(ConfirmDeleteDialog, { open: true, onConfirm: () => {}, onCancel: () => {}, ...extra } as never),
  );
  return { html, props: dialogProps[dialogProps.length - 1] };
}

function footerButtons(props: Record<string, unknown>): ReactElement<Record<string, unknown>>[] {
  const footer = props.footer as ReactElement<{ children: ReactElement<Record<string, unknown>>[] }>;
  return footer.props.children.filter(isValidElement);
}

describe('ConfirmDeleteDialog', () => {
  it('fragt mit Namen, schmal, Standardtitel', () => {
    const { html, props } = render({ itemName: 'Haufwerk A' });
    expect(html).toContain('„Haufwerk A“ wird endgültig gelöscht.');
    expect(props).toMatchObject({ open: true, title: 'Eintrag löschen?', size: 'sm', banner: undefined });
  });

  it('eigener Titel/Text, ohne Namen ein neutraler Satz', () => {
    expect(render().html).toContain('Der Eintrag wird endgültig gelöscht.');
    const { html, props } = render({ title: 'Probe löschen?', description: 'Weg damit.' });
    expect(props.title).toBe('Probe löschen?');
    expect(html).toContain('Weg damit.');
  });

  it('Fehler als Banner, Buttons rufen Abbrechen/Bestätigen, während Löschen gesperrt', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { props } = render({ error: 'Wird noch verwendet', deleting: true, onConfirm, onCancel });
    expect(props.banner).toBeTruthy();
    const [cancel, confirm] = footerButtons(props);
    expect(cancel.props.disabled).toBe(true);
    expect(confirm.props.loading).toBe(true);
    (cancel.props.onClick as () => void)();
    (confirm.props.onClick as () => void)();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    (props.onOpenChange as (o: boolean) => void)(false);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
