import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DataTable, topScrollbarWidth, type ColumnDef } from '../src/frontend/ui/DataTable';

/**
 * Obere Scrollleiste: Ist das Grid breiter als der Container, steht über der
 * Tabelle eine zweite Scrollleiste. Bei langen Listen liegt die untere sonst
 * außerhalb des Bildschirms.
 */

describe('DataTable – obere Scrollleiste', () => {
  it('erscheint nur, wenn das Grid breiter ist als der sichtbare Bereich', () => {
    expect(topScrollbarWidth(1400, 900)).toBe(1400);
    expect(topScrollbarWidth(900, 900)).toBeNull();
    expect(topScrollbarWidth(600, 900)).toBeNull();
  });

  it('ignoriert 1 px Rundung bei Browser-Zoom', () => {
    expect(topScrollbarWidth(901, 900)).toBeNull();
    expect(topScrollbarWidth(902, 900)).toBe(902);
  });

  it('wird ohne Messung (Server-Rendering) nicht gerendert, Rahmen sitzt am Wrapper', () => {
    interface Row { id: string; name: string }
    const columns: ColumnDef<Row>[] = [{ id: 'name', label: 'Name', accessor: (r) => r.name }];
    const html = renderToStaticMarkup(
      createElement(DataTable<Row, string>, {
        listId: 'top-scrollbar-test',
        rows: [{ id: 'a', name: 'Alice' }],
        columns,
        rowKey: (r: Row) => r.id,
      }),
    );
    expect(html).not.toContain('aria-hidden="true" tabindex="-1"');
    expect(html.startsWith('<div class="border border-[var(--color-border)]"><div class="overflow-x-auto"')).toBe(true);
  });
});
