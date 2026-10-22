import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
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
