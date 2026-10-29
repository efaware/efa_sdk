import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DataTable, type ColumnDef } from '../src/frontend/ui/DataTable';

/**
 * Radien der kleinen Bedienelemente. efa-studio-Apps setzen weiche Ecken
 * (`--border-radius-md: 12px`); nimmt die DataTable dafür den md-Token, wird
 * die 16×16-Box im Mehrfach-Filter zum Kreis und jedes Filter-Feld zur Pille.
 * Kleine Elemente nehmen daher nur `--border-radius-sm`, die Box ist auf 4 px
 * gedeckelt.
 */

interface Row { id: string; name: string }
const columns: ColumnDef<Row>[] = [{ id: 'name', label: 'Name', accessor: (r) => r.name }];
const rows: Row[] = [{ id: 'a', name: 'Alice' }];

describe('DataTable – Radien kleiner Bedienelemente', () => {
  it('Kopf-Knöpfe und Zieh-Griff nehmen den kleinsten Token', () => {
    const html = renderToStaticMarkup(
      createElement(DataTable<Row, string>, {
        listId: 'radius-test',
        rows,
        columns,
        rowKey: (r: Row) => r.id,
      }),
    );
    expect(html).toContain('border-radius:var(--border-radius-sm)');
    expect(html).not.toMatch(/--border-radius-(md|lg|xl)/);
  });

  // Filter-Felder, Mehrfach-Filter-Box und Icon-Knöpfe stecken in Dropdowns und
  // erscheinen nicht im statischen Markup — daher zusätzlich die Quelle prüfen.
  it('nutzt im Quelltext keinen größeren Radius-Token als sm', () => {
    const src = readFileSync(resolve(__dirname, '../src/frontend/ui/DataTable.tsx'), 'utf8');
    expect(src).not.toMatch(/var\(--border-radius-(md|lg|xl)\)/);
    expect(src).toContain("'min(var(--border-radius-sm), 4px)'");
  });
});
