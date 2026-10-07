import { describe, it, expect } from 'vitest';
import {
  buildRenderItems,
  clampColumnWidth,
  defaultPrefsFor,
  formatCellValue,
  gridTemplateFor,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  reorderColumns,
  groupLabelOf,
  DEFAULT_VIEW_VERSION,
  type ColumnDef,
} from '../src/frontend/ui/DataTable';

/**
 * Reine Engine-Funktionen der DataTable — Gruppierungs-/Default-Logik,
 * deterministisch und ohne DOM. (Der Component-Render + der Persistenz-Hook
 * werden app-seitig bzw. beim Template-Build gegen das echte Paket verifiziert.)
 */

interface Row { id: string; name: string; cat: string; secret: string }

const columns: ColumnDef<Row>[] = [
  { id: 'name', label: 'Name', accessor: (r) => r.name },
  { id: 'cat', label: 'Kategorie', accessor: (r) => r.cat },
  { id: 'secret', label: 'Geheim', accessor: (r) => r.secret, defaultVisible: false },
];

const rows: Row[] = [
  { id: 'b', name: 'Bob', cat: 'B', secret: 'shh-b' },
  { id: 'a', name: 'Alice', cat: 'A', secret: 'shh-a' },
];

describe('groupLabelOf', () => {
  it('normalisiert null/Array/String', () => {
    expect(groupLabelOf(null)).toBe('');
    expect(groupLabelOf(['x', 'y'])).toBe('x, y');
    expect(groupLabelOf('  Boden  ')).toBe('Boden');
  });
});

describe('defaultPrefsFor', () => {
  it('leitet Sichtbarkeit + Reihenfolge aus den Columns ab und trägt die Version', () => {
    const p = defaultPrefsFor(columns);
    expect(p.columnVisibility).toEqual({ name: true, cat: true, secret: false });
    expect(p.columnOrder).toEqual(['name', 'cat', 'secret']);
    expect(p.sort).toBeNull();
    expect(p.columnWidths).toEqual({});
    expect(p.version).toBe(DEFAULT_VIEW_VERSION);
  });

  it('übernimmt Overrides', () => {
    const p = defaultPrefsFor(columns, { sort: { columnId: 'name', direction: 'desc' } });
    expect(p.sort).toEqual({ columnId: 'name', direction: 'desc' });
  });
});

describe('buildRenderItems', () => {
  const byId = new Map(columns.map((c) => [c.id, c] as const));

  it('ohne groupBy jede Zeile als row-Item', () => {
    const items = buildRenderItems(rows, [], byId, new Set());
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.kind === 'row')).toBe(true);
  });

  it('mit groupBy: Gruppen-Header, Kinder nur wenn expanded', () => {
    const collapsed = buildRenderItems(rows, ['cat'], byId, new Set());
    expect(collapsed.filter((i) => i.kind === 'group')).toHaveLength(2);
    expect(collapsed.filter((i) => i.kind === 'row')).toHaveLength(0);

    const expanded = buildRenderItems(rows, ['cat'], byId, new Set(['A']));
    const groupA = expanded.find((i) => i.kind === 'group' && i.label === 'A');
    expect(groupA?.expanded).toBe(true);
    expect(expanded.some((i) => i.kind === 'row' && (i.row as Row).name === 'Alice')).toBe(true);
  });

  it('leere Gruppe wird ans Ende sortiert', () => {
    const withEmpty: Row[] = [{ id: 'x', name: 'X', cat: '', secret: '' }, ...rows];
    const items = buildRenderItems(withEmpty, ['cat'], byId, new Set());
    const labels = items.filter((i) => i.kind === 'group').map((i) => i.label);
    expect(labels[labels.length - 1]).toBe('– ohne –');
  });
});

describe('reorderColumns', () => {
  const order = ['a', 'b', 'c', 'd'];

  it('setzt die Quelle vor bzw. hinter das Ziel', () => {
    expect(reorderColumns(order, 'd', 'b', 'before')).toEqual(['a', 'd', 'b', 'c']);
    expect(reorderColumns(order, 'a', 'c', 'after')).toEqual(['b', 'c', 'a', 'd']);
    expect(reorderColumns(order, 'c', 'a', 'before')).toEqual(['c', 'a', 'b', 'd']);
    expect(reorderColumns(order, 'a', 'd', 'after')).toEqual(['b', 'c', 'd', 'a']);
  });

  it('lässt die Reihenfolge bei Selbst-Drop und unbekannten IDs unverändert', () => {
    expect(reorderColumns(order, 'b', 'b', 'after')).toEqual(order);
    expect(reorderColumns(order, 'x', 'b', 'before')).toEqual(order);
    expect(reorderColumns(order, 'b', 'x', 'before')).toEqual(order);
  });

  it('mutiert die Eingabe nicht', () => {
    const copy = [...order];
    reorderColumns(copy, 'd', 'a', 'before');
    expect(copy).toEqual(order);
  });
});

describe('clampColumnWidth', () => {
  it('begrenzt auf [MIN, MAX] und rundet', () => {
    expect(clampColumnWidth(10)).toBe(MIN_COLUMN_WIDTH);
    expect(clampColumnWidth(99999)).toBe(MAX_COLUMN_WIDTH);
    expect(clampColumnWidth(150.6)).toBe(151);
    expect(clampColumnWidth(Number.NaN)).toBe(MIN_COLUMN_WIDTH);
  });
});

describe('gridTemplateFor', () => {
  const cols: ColumnDef<Row>[] = [
    { id: 'name', label: 'Name', accessor: (r) => r.name },
    { id: 'cat', label: 'Kategorie', accessor: (r) => r.cat, width: '120px' },
  ];

  it('nimmt ohne gezogene Breiten die Code-Defaults', () => {
    expect(gridTemplateFor(cols, {}, false)).toBe('1fr 120px 40px');
    expect(gridTemplateFor(cols, undefined, true)).toBe('36px 1fr 120px 40px');
  });

  it('gezogene Breite schlägt den Code-Default und wird geklemmt', () => {
    expect(gridTemplateFor(cols, { name: 240, cat: 5 }, false)).toBe(`240px ${MIN_COLUMN_WIDTH}px 40px`);
  });

  it('ignoriert kaputte Werte aus gespeicherten Ansichten', () => {
    const broken = { name: 'breit' as unknown as number, cat: Number.POSITIVE_INFINITY };
    expect(gridTemplateFor(cols, broken, false)).toBe('1fr 120px 40px');
  });
});

describe('Datumsspalten', () => {
  interface Doc { id: string; at: string | null; when?: Date }
  // Mittag UTC: in jeder Browser-Zeitzone derselbe Kalendertag.
  const dateCol: ColumnDef<Doc> = { id: 'at', label: 'Datum', accessor: (r) => r.at, type: 'date' };

  it('zeigt DD.MM.YYYY zweistellig statt 7.10.2026', () => {
    expect(formatCellValue(dateCol, { id: '1', at: '2026-10-07T12:00:00Z' })).toBe('07.10.2026');
  });

  it('datetime hängt die Uhrzeit an', () => {
    const col: ColumnDef<Doc> = { ...dateCol, type: 'datetime' };
    expect(formatCellValue(col, { id: '1', at: '2026-10-07T12:00:00Z' })).toMatch(/^07\.10\.2026, \d{2}:\d{2}$/);
  });

  it('formatiert Date-Werte auch ohne type, leere Werte werden zu „—"', () => {
    const col: ColumnDef<Doc> = { id: 'when', label: 'Wann', accessor: (r) => r.when };
    expect(formatCellValue(col, { id: '1', at: null, when: new Date('2026-03-01T12:00:00Z') })).toBe('01.03.2026');
    expect(formatCellValue(dateCol, { id: '1', at: null })).toBe('—');
  });

  it('lässt Nicht-Datumsspalten unverändert', () => {
    expect(formatCellValue(columns[0], rows[0])).toBe('Bob');
  });

  it('gruppiert nach angezeigtem Tag, chronologisch, Leeres ans Ende', () => {
    const docs: Doc[] = [
      { id: 'a', at: '2026-11-01T12:00:00Z' },
      { id: 'b', at: '2026-10-07T12:00:00Z' },
      { id: 'c', at: null },
      { id: 'd', at: '2026-10-07T13:00:00Z' },
    ];
    const items = buildRenderItems(docs, ['at'], new Map([['at', dateCol]]), new Set());
    expect(items.map((i) => [i.label, i.count])).toEqual([
      ['07.10.2026', 2],
      ['01.11.2026', 1],
      ['– ohne –', 1],
    ]);
  });
});
