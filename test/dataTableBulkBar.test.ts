import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DataTable, type ColumnDef } from '../src/frontend/ui/DataTable';

/**
 * Bulk-Bar der DataTable: der eingebaute Knopf leert nur die Markierung und
 * heißt deshalb „Auswahl aufheben“. Apps legen in `bulkActions` häufig ein
 * echtes „Auswahl löschen“ daneben (efa #348) — die beiden dürfen nicht
 * gleich heißen.
 */

interface Row { id: string; name: string }
const columns: ColumnDef<Row>[] = [{ id: 'name', label: 'Name', accessor: (r) => r.name }];
const rows: Row[] = [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }];

function render(selected: Set<string>): string {
  return renderToStaticMarkup(
    createElement(DataTable<Row, string>, {
      listId: 'bulk-bar-test',
      rows,
      columns,
      rowKey: (r: Row) => r.id,
      selection: {
        selected,
        onChange: () => {},
        bulkActions: createElement('button', { type: 'button' }, 'Auswahl löschen'),
      },
    }),
  );
}

describe('DataTable – Bulk-Bar', () => {
  it('beschriftet den Leeren-Knopf mit „Auswahl aufheben“', () => {
    const html = render(new Set(['a']));
    expect(html).toContain('1 ausgewählt');
    expect(html).toContain('Auswahl aufheben');
  });

  it('führt „Auswahl löschen“ nur noch als App-eigene Aktion', () => {
    const html = render(new Set(['a', 'b']));
    expect(html.match(/Auswahl löschen/g)).toHaveLength(1);
  });

  it('zeigt ohne Markierung keine Bulk-Bar', () => {
    const html = render(new Set());
    expect(html).not.toContain('Auswahl aufheben');
    expect(html).not.toContain('ausgewählt');
  });
});
