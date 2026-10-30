import { describe, it, expect, vi } from 'vitest';
import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Test-Markierungen für den Klicktest von efa studio (`data-efa-*`). Der Klicktest
 * findet daran Dialog, Modus, Speichern/Bearbeiten/Löschen und Listenzeilen; fehlt
 * eine, überspringt er den Listenablauf still. Dialog als Stub (Radix rendert im SSR
 * keine Portals).
 */
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
const { RecordDialog } = await import('../src/frontend/ui/RecordDialog');
const { ConfirmDeleteDialog } = await import('../src/frontend/ui/ConfirmDeleteDialog');

type El = ReactElement<Record<string, unknown>>;

/** Alle Elemente im Footer, auch die in `DialogClose asChild` steckenden Buttons. */
function footerActions(props: Record<string, unknown>): string[] {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!isValidElement(node)) return;
    const p = (node as El).props;
    if (typeof p['data-efa-action'] === 'string') out.push(p['data-efa-action'] as string);
    walk(p.children);
  };
  walk(props.footer);
  return out;
}

function renderRecord(extra: Record<string, unknown>) {
  renderToStaticMarkup(
    createElement(RecordDialog, {
      onOpenChange: () => {},
      title: 'T',
      readContent: 'lesen',
      editContent: 'bearbeiten',
      onSave: () => {},
      ...extra,
    } as never),
  );
  return dialogProps[dialogProps.length - 1];
}

describe('Test-Markierungen', () => {
  it('RecordDialog beim Anlegen: Dialog, Modus, Abbrechen + Speichern', () => {
    const props = renderRecord({ open: { id: 'new' } });
    expect(props.dataAttributes).toEqual({ 'data-efa-dialog': 'record', 'data-efa-mode': 'create' });
    expect(footerActions(props)).toEqual(['cancel', 'save']);
  });

  it('RecordDialog im Lesemodus: Schließen + Bearbeiten, ohne Recht nur Schließen', () => {
    const props = renderRecord({ open: { id: 'a1' }, mode: 'read' });
    expect(props.dataAttributes).toMatchObject({ 'data-efa-mode': 'read' });
    expect(footerActions(props)).toEqual(['close', 'edit']);
    expect(footerActions(renderRecord({ open: { id: 'a1' }, mode: 'read', readOnly: true }))).toEqual(['close']);
  });

  it('RecordDialog im Bearbeiten-Modus', () => {
    const props = renderRecord({ open: { id: 'a1' }, mode: 'edit' });
    expect(props.dataAttributes).toMatchObject({ 'data-efa-mode': 'edit' });
    expect(footerActions(props)).toEqual(['cancel', 'save']);
  });

  it('ConfirmDeleteDialog: Dialog und Bestätigen', () => {
    renderToStaticMarkup(createElement(ConfirmDeleteDialog, { open: true, onConfirm: () => {}, onCancel: () => {} } as never));
    const props = dialogProps[dialogProps.length - 1];
    expect(props.dataAttributes).toEqual({ 'data-efa-dialog': 'confirm-delete' });
    expect(footerActions(props)).toEqual(['cancel', 'confirm-delete']);
  });
});
