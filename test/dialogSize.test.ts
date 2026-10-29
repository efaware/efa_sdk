import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Dialog-Breite (efa #364): Die Vorgabe war 448 px (`md`) und damit für fast
 * jedes Formular zu schmal; der RecordDialog konnte gar keine Breite setzen.
 * Neue Vorgabe 768 px (`3xl`), der RecordDialog reicht `size` durch.
 */

// Radix rendert Portals beim Server-Rendering nicht. Den RecordDialog prüfen wir
// deshalb gegen einen Dialog-Stub, der nur die übergebenen Props festhält.
const dialogProps: Array<Record<string, unknown>> = [];
vi.mock('../src/frontend/ui/Dialog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/frontend/ui/Dialog')>();
  return {
    ...actual,
    Dialog: (props: Record<string, unknown>) => {
      dialogProps.push(props);
      return null;
    },
  };
});

const { DEFAULT_DIALOG_SIZE, dialogWidthClass } = await import('../src/frontend/ui/Dialog');
const { RecordDialog } = await import('../src/frontend/ui/RecordDialog');

function renderRecordDialog(extra: Record<string, unknown> = {}) {
  renderToStaticMarkup(
    createElement(RecordDialog, {
      open: { id: 'new' },
      onOpenChange: () => {},
      title: 'Test',
      readContent: null,
      editContent: null,
      onSave: () => {},
      ...extra,
    }),
  );
  return dialogProps[dialogProps.length - 1];
}

describe('Dialog – Breite', () => {
  it('ist ohne Angabe 768 px breit (3xl)', () => {
    expect(DEFAULT_DIALOG_SIZE).toBe('3xl');
    expect(dialogWidthClass()).toContain('max-w-3xl');
    expect(dialogWidthClass()).not.toContain('max-w-md');
  });

  it('nimmt eine ausdrückliche Größe, z. B. sm für Bestätigungen', () => {
    expect(dialogWidthClass('sm')).toContain('max-w-sm');
    expect(dialogWidthClass('5xl')).toContain('max-w-5xl');
  });

  it('lässt auf schmalen Bildschirmen einen Rand zum Fenster', () => {
    expect(dialogWidthClass('sm')).toContain('w-[calc(100%-2rem)]');
    expect(dialogWidthClass('sm')).not.toMatch(/(^| )w-full( |$)/);
  });
});

describe('RecordDialog – Breite', () => {
  beforeEach(() => { dialogProps.length = 0; });

  it('reicht size an den Dialog durch', () => {
    expect(renderRecordDialog({ size: '5xl' }).size).toBe('5xl');
  });

  it('lässt ohne size die Dialog-Vorgabe greifen', () => {
    expect(renderRecordDialog().size).toBeUndefined();
  });
});

describe('RecordDialog – readOnly', () => {
  beforeEach(() => { dialogProps.length = 0; });
  const html = (node: unknown) => renderToStaticMarkup(createElement('div', null, node as never));
  // Footer enthält DialogClose (braucht den echten Dialog) → nur die Elemente zählen.
  const footerParts = (p: Record<string, unknown>) =>
    Children.toArray((p.footer as ReactElement<{ children: ReactNode }>).props.children).filter(isValidElement);

  it('zeigt ohne readOnly Stift und „Bearbeiten“', () => {
    const p = renderRecordDialog({ open: { id: 'a1' }, readContent: 'Inhalt' });
    expect(footerParts(p)).toHaveLength(2);
    expect(html(p.children)).toContain('aria-label="Bearbeiten"');
  });

  it('blendet mit readOnly Stift und „Bearbeiten“ aus, Inhalt bleibt', () => {
    const p = renderRecordDialog({ open: { id: 'a1' }, readContent: 'Inhalt', readOnly: true });
    expect(footerParts(p)).toHaveLength(1);
    expect(html(p.children)).not.toContain('aria-label="Bearbeiten"');
    expect(html(p.children)).toContain('Inhalt');
  });

  it('Anlegen bleibt mit readOnly möglich', () => {
    const p = renderRecordDialog({ open: { id: 'new' }, readOnly: true });
    expect(footerParts(p)).toHaveLength(2);
  });
});
