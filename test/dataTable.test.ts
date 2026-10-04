import { describe, it, expect } from 'vitest';
import {
  buildRenderItems,
  collectAllGroupKeys,
  defaultPrefsFor,
  reconcileOrder,
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

describe('reconcileOrder', () => {
  it('fügt nachträglich ergänzte Spalten an ihrer natürlichen Position in eine alte Ansicht ein', () => {
    // gespeichert, bevor es `cat` gab — und vom Nutzer umsortiert
    expect(reconcileOrder(columns, ['secret', 'name'])).toEqual(['secret', 'cat', 'name']);
  });

  it('lässt entfernte Spalten fallen und behält die Nutzer-Reihenfolge', () => {
    expect(reconcileOrder(columns, ['cat', 'gone', 'name', 'secret'])).toEqual(['cat', 'name', 'secret']);
  });

  it('ist für eine vollständige Reihenfolge die Identität', () => {
    expect(reconcileOrder(columns, ['name', 'cat', 'secret'])).toEqual(['name', 'cat', 'secret']);
  });
});

describe('collectAllGroupKeys', () => {
  const byId = new Map(columns.map((c) => [c.id, c] as const));

  it('liefert alle Gruppen-Keys aller Ebenen unabhängig vom Aufklapp-Zustand', () => {
    const keys = collectAllGroupKeys(rows, ['cat', 'name'], byId);
    expect(keys).toHaveLength(4);
    expect(keys).toEqual(expect.arrayContaining(['A', 'B']));
    // Unterebene ist an den Eltern-Key gebunden
    expect(keys.some((k) => k.startsWith('A') && k.endsWith('Alice') && k !== 'A')).toBe(true);
  });

  it('ohne groupBy keine Keys', () => {
    expect(collectAllGroupKeys(rows, [], byId)).toEqual([]);
  });
});
