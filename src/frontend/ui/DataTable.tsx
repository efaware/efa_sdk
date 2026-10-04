/**
 * Converge DataTable — die plattformweite Listen-/Tabellen-Komponente.
 *
 * Implementiert den „Listen-Verhalten"-UX-Vertrag verbindlich:
 *
 *   1. Auswahl-Spalte links (Checkbox + Master) — opt-in via `selection`-Prop
 *   2. Bulk-Aktionen via `selection.bulkActions`
 *   3. Spalten-Header-Popover: Sortieren auf/ab, Filtern, Spalte ausblenden
 *   4. Zahnrad oben rechts: Spalten-Inventar mit Sichtbarkeit + Reihenfolge
 *   5. Persistente Ansicht via `useViewPreferences` (Pflicht: stabile `listId`) —
 *      Persistenz wird über die `persistence`-Prop (ViewPreferencesAdapter)
 *      injiziert; ohne Adapter läuft die Ansicht rein In-Memory.
 *   6. Default-Ansicht + „Zurücksetzen"-Button im Zahnrad-Popover
 *
 * Sortierung und Filterung erfolgen clientseitig — für < 1000 Zeilen völlig
 * ausreichend. Bei größeren Datenmengen wäre serverseitige Sortierung/Filterung
 * der nächste Schritt.
 *
 * **Mobil (≤640px, {@link useIsMobile}):** die Grid-Kopfzeile mit den
 * Popover-Triggern passt auf ~330px nicht und ist auf 40px breiten Zellen auch
 * nicht bedienbar. Stattdessen rendert die Tabelle eine kompakte Toolbar
 * („Alle" + Zahnrad) und jede Zeile als gestapelte Label/Wert-Karte. Sortieren
 * und Filtern laufen dort über das Zahnrad bzw. die seiteneigene Filter-Leiste.
 * Der Desktop-Zweig bleibt unverändert; zusätzlich fängt ein
 * `overflow-x-auto`-Container schmale Fenster ab, damit ein zu breites Grid in
 * sich scrollt statt das ganze Dokument seitwärts zu kippen.
 *
 * Die Komponente erwartet die Converge-Design-Tokens (`--color-*`,
 * `--border-radius-*`) im DOM und (für innen genutzte Klassen keine, aber ihre
 * Geschwister `Badge`/`Skeleton`) `@efa-one/sdk/frontend/ui/styles.css`.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as DropdownMenu from './DropdownMenu.js';
import { ChevronDown, ChevronUp, ChevronRight, Settings, EyeOff, Filter, RotateCcw, ArrowUp, ArrowDown, Layers, X } from 'lucide-react';
import { Button } from './Button.js';
import { useViewPreferences, type ViewPreferencesAdapter } from '../viewPreferences.js';
import { useIsMobile } from '../useIsMobile.js';

// Trennzeichen für komposite Gruppen-Keys (Unit Separator — kommt in
// User-Text nicht vor).
const GROUP_KEY_SEP = '\x1f';
const EMPTY_GROUP_LABEL = '– ohne –';

// ─── Typen ────────────────────────────────────────────────────────────────────

export type FilterDef =
  | { type: 'text' }
  | { type: 'multi-select'; options: Array<{ value: string; label: string }> }
  | { type: 'boolean'; labelTrue?: string; labelFalse?: string };

export interface ColumnDef<T> {
  id: string;                            // stabile Spalten-ID (Persistenz-Key)
  label: string;
  accessor: (row: T) => unknown;         // Wert für Sortierung + Default-Filter
  cell?: (row: T) => React.ReactNode;    // Render — Default: String(accessor(row))
  filter?: FilterDef;
  sortable?: boolean;
  width?: string;                        // CSS grid-template-columns Anteil ('1fr', '120px', …)
  defaultVisible?: boolean;              // Default true
}

interface FilterValue {
  // Diskriminierte Union analog zu FilterDef
  text?: string;
  selected?: string[];
  bool?: 'true' | 'false' | null;
}

/** Version der Code-Default-Ansicht. Beim Hochzählen werden alle pro Benutzer
 *  gespeicherten Ansichten mit älterer/fehlender Version einmalig auf den neuen
 *  Standard zurückgesetzt (Gate in useViewPreferences). Start bei 2, weil
 *  Bestands-Blobs kein `version`-Feld tragen (undefined !== 2 → Reset). */
export const DEFAULT_VIEW_VERSION = 2;

interface ViewPrefs {
  columnVisibility: Record<string, boolean>;
  columnOrder: string[];
  sort: { columnId: string; direction: 'asc' | 'desc' } | null;
  filters: Record<string, FilterValue>;
  /** Hierarchische Gruppierung: Reihenfolge der columnIds bestimmt die Ebenen.
   *  Leerer Array = keine Gruppierung. */
  groupBy: string[];
  /** Schema-Version der Ansicht (siehe DEFAULT_VIEW_VERSION). */
  version?: number;
}

export interface DataTableSelectionProps<K> {
  selected: Set<K>;
  onChange: (next: Set<K>) => void;
  /** Inhalt für die Bulk-Bar (rechts), wird nur gerendert wenn ≥ 1 selected. */
  bulkActions?: React.ReactNode;
}

interface DataTableProps<T, K extends string | number> {
  listId: string;
  rows: T[];
  columns: ColumnDef<T>[];
  rowKey: (row: T) => K;
  onRowClick?: (row: T) => void;
  selection?: DataTableSelectionProps<K>;
  /** Optional überschrieben — Default berechnet sich aus columns. */
  initialPrefs?: Partial<ViewPrefs>;
  /** Footer-Status, z.B. „128 Einträge". */
  footer?: React.ReactNode;
  /**
   * Wenn true, starten neu auftauchende Gruppen ausgeklappt statt zugeklappt
   * (z. B. Vorlagen nach Kategorie gruppiert). Manuelles Zuklappen bleibt
   * erhalten — nur erstmals gesehene Gruppen-Keys werden aufgeklappt.
   */
  groupsDefaultExpanded?: boolean;
  /**
   * Persistenz der Ansicht (Spalten/Sort/Filter/Gruppierung) pro Benutzer und
   * `listId`. Ohne Adapter bleibt die Ansicht In-Memory (kein Backend). Für den
   * Standard-Endpoint: `createViewPreferencesClient()` aus
   * `@efa-one/sdk/frontend/viewPreferences`.
   */
  persistence?: ViewPreferencesAdapter;
}

// ─── Default-Prefs aus den Column-Definitionen ───────────────────────────────

export function defaultPrefsFor<T>(columns: ColumnDef<T>[], overrides?: Partial<ViewPrefs>): ViewPrefs {
  const visibility: Record<string, boolean> = {};
  columns.forEach((c) => { visibility[c.id] = c.defaultVisible !== false; });
  return {
    columnVisibility: visibility,
    columnOrder: columns.map((c) => c.id),
    sort: null,
    filters: {},
    groupBy: [],
    version: DEFAULT_VIEW_VERSION,
    ...(overrides ?? {}),
  };
}

/**
 * Gleicht eine gespeicherte `columnOrder` mit der aktuellen Spaltendefinition ab:
 * unbekannte (entfernte) IDs fallen raus, neu hinzugekommene Spalten werden an ihrer
 * natürlichen Position aus `columns` eingefügt. So erscheint eine später ergänzte
 * Spalte auch in einer alten gespeicherten Ansicht — und am richtigen Platz —, ohne
 * dass dafür DEFAULT_VIEW_VERSION hochgezählt (und damit jede Ansicht verworfen)
 * werden muss.
 */
export function reconcileOrder<T>(columns: ColumnDef<T>[], order: string[]): string[] {
  const known = new Set(columns.map((c) => c.id));
  const result = order.filter((id) => known.has(id));
  const present = new Set(result);
  columns.forEach((c, idx) => {
    if (present.has(c.id)) return;
    result.splice(Math.min(idx, result.length), 0, c.id);
    present.add(c.id);
  });
  return result;
}

// ─── Gruppierung ──────────────────────────────────────────────────────────────

/** Normalisiert einen Accessor-Output zum Gruppierungs-Label (Strings, Arrays joined). */
export function groupLabelOf(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(String).join(', ');
  const s = String(value).trim();
  return s;
}

interface RenderItem<T> {
  kind: 'group' | 'row';
  // Gruppe:
  key?: string;          // composite path
  level?: number;        // 0-based
  label?: string;
  count?: number;
  expanded?: boolean;
  // Zeile:
  row?: T;
}

export function buildRenderItems<T>(
  rows: T[],
  groupBy: string[],
  columnsById: Map<string, ColumnDef<T>>,
  expandedGroups: Set<string>,
): RenderItem<T>[] {
  if (groupBy.length === 0) return rows.map((row) => ({ kind: 'row' as const, row }));

  const out: RenderItem<T>[] = [];

  const recurse = (subset: T[], depth: number, parentKey: string): void => {
    if (depth >= groupBy.length) {
      subset.forEach((row) => out.push({ kind: 'row', row }));
      return;
    }
    const col = columnsById.get(groupBy[depth]);
    if (!col) {
      subset.forEach((row) => out.push({ kind: 'row', row }));
      return;
    }
    // Bucket by label-of-accessor; stabile Reihenfolge: erstes Auftreten.
    const buckets = new Map<string, T[]>();
    for (const r of subset) {
      const lbl = groupLabelOf(col.accessor(r));
      const bucketLabel = lbl || EMPTY_GROUP_LABEL;
      const arr = buckets.get(bucketLabel) ?? [];
      arr.push(r);
      buckets.set(bucketLabel, arr);
    }
    // Empty group ans Ende sortieren, sonst alphabetisch nach Locale.
    const labels = Array.from(buckets.keys()).sort((a, b) => {
      if (a === EMPTY_GROUP_LABEL) return 1;
      if (b === EMPTY_GROUP_LABEL) return -1;
      return a.localeCompare(b, 'de');
    });
    for (const label of labels) {
      const childRows = buckets.get(label)!;
      const key = parentKey ? `${parentKey}${GROUP_KEY_SEP}${label}` : label;
      const expanded = expandedGroups.has(key);
      out.push({
        kind: 'group',
        key,
        level: depth,
        label,
        count: childRows.length,
        expanded,
      });
      if (expanded) recurse(childRows, depth + 1, key);
    }
  };

  recurse(rows, 0, '');
  return out;
}

/** Sammelt ALLE Gruppen-Keys (alle Ebenen), unabhängig vom Aufklapp-Zustand. */
export function collectAllGroupKeys<T>(
  rows: T[],
  groupBy: string[],
  columnsById: Map<string, ColumnDef<T>>,
): string[] {
  const keys: string[] = [];
  const recurse = (subset: T[], depth: number, parentKey: string): void => {
    if (depth >= groupBy.length) return;
    const col = columnsById.get(groupBy[depth]);
    if (!col) return;
    const buckets = new Map<string, T[]>();
    for (const r of subset) {
      const lbl = groupLabelOf(col.accessor(r)) || EMPTY_GROUP_LABEL;
      const arr = buckets.get(lbl) ?? [];
      arr.push(r);
      buckets.set(lbl, arr);
    }
    for (const [label, childRows] of buckets) {
      const key = parentKey ? `${parentKey}${GROUP_KEY_SEP}${label}` : label;
      keys.push(key);
      recurse(childRows, depth + 1, key);
    }
  };
  recurse(rows, 0, '');
  return keys;
}

// ─── Komponente ───────────────────────────────────────────────────────────────

export function DataTable<T, K extends string | number>({
  listId, rows, columns, rowKey, onRowClick, selection, initialPrefs, footer, groupsDefaultExpanded, persistence,
}: DataTableProps<T, K>): React.ReactElement {
  const defaultPrefs = useMemo(() => defaultPrefsFor(columns, initialPrefs), [columns, initialPrefs]);
  const [prefs, setPrefs, reset] = useViewPreferences<ViewPrefs>(listId, defaultPrefs, persistence);
  // Karten-Reflow statt Grid — siehe Doc-Header.
  const isMobile = useIsMobile();

  // Expanded-Gruppen sind bewusst NICHT in den ViewPrefs — User-Experience-
  // Entscheidung: jeder Besuch der Liste startet mit allen Gruppen zugeklappt
  // (außer `groupsDefaultExpanded`, siehe unten).
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string): void => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const columnsById = useMemo(
    () => new Map(columns.map((c) => [c.id, c] as const)),
    [columns],
  );

  // Robustheit: groupBy kann beim Schema-Upgrade fehlen — für alten Cache.
  const groupBy = prefs.groupBy ?? [];

  // Nachträglich ergänzte Spalten in eine evtl. gespeicherte Ansicht einsortieren.
  const effectiveOrder = useMemo(() => reconcileOrder(columns, prefs.columnOrder), [columns, prefs.columnOrder]);

  // Default-aufgeklappte Gruppen: neu auftauchende Keys einmalig aufklappen,
  // ohne manuell zugeklappte Gruppen wieder zu öffnen.
  const seenGroupKeysRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!groupsDefaultExpanded || groupBy.length === 0) return;
    const fresh = collectAllGroupKeys(rows, groupBy, columnsById).filter((k) => !seenGroupKeysRef.current.has(k));
    if (fresh.length === 0) return;
    fresh.forEach((k) => seenGroupKeysRef.current.add(k));
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      fresh.forEach((k) => next.add(k));
      return next;
    });
  }, [groupsDefaultExpanded, rows, groupBy, columnsById]);

  const visibleColumns = useMemo(() => {
    const byId = new Map(columns.map((c) => [c.id, c] as const));
    return effectiveOrder
      .map((id) => byId.get(id))
      .filter((c): c is ColumnDef<T> => Boolean(c) && prefs.columnVisibility[c!.id] !== false);
  }, [columns, effectiveOrder, prefs.columnVisibility]);

  // Sortierung + Filterung clientseitig.
  const sortedFilteredRows = useMemo(() => {
    let out = rows;
    // Filter
    for (const col of columns) {
      const f = prefs.filters[col.id];
      if (!f || !col.filter) continue;
      if (col.filter.type === 'text' && f.text) {
        const q = f.text.toLowerCase();
        out = out.filter((r) => {
          const v = col.accessor(r);
          return v != null && String(v).toLowerCase().includes(q);
        });
      } else if (col.filter.type === 'multi-select' && f.selected && f.selected.length > 0) {
        const set = new Set(f.selected);
        out = out.filter((r) => {
          const v = col.accessor(r);
          if (Array.isArray(v)) return v.some((x) => set.has(String(x)));
          return v != null && set.has(String(v));
        });
      } else if (col.filter.type === 'boolean' && f.bool != null) {
        out = out.filter((r) => String(Boolean(col.accessor(r))) === f.bool);
      }
    }
    // Sort
    if (prefs.sort) {
      const col = columns.find((c) => c.id === prefs.sort!.columnId);
      if (col) {
        const dir = prefs.sort.direction === 'asc' ? 1 : -1;
        out = [...out].sort((a, b) => {
          const va = col.accessor(a);
          const vb = col.accessor(b);
          if (va == null && vb == null) return 0;
          if (va == null) return 1 * dir;
          if (vb == null) return -1 * dir;
          if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
          return String(va).localeCompare(String(vb), 'de') * dir;
        });
      }
    }
    return out;
  }, [rows, columns, prefs.filters, prefs.sort]);

  // ── Selection ────────────────────────────────────────────────────────────
  const allSelected = !!selection && sortedFilteredRows.length > 0
    && sortedFilteredRows.every((r) => selection.selected.has(rowKey(r)));
  const toggleAll = (): void => {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (allSelected) sortedFilteredRows.forEach((r) => next.delete(rowKey(r)));
    else sortedFilteredRows.forEach((r) => next.add(rowKey(r)));
    selection.onChange(next);
  };
  const toggleOne = (key: K): void => {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selection.onChange(next);
  };

  // ── Grid-Template ────────────────────────────────────────────────────────
  const gridTemplate = useMemo(() => {
    const cols: string[] = [];
    if (selection) cols.push('36px');
    visibleColumns.forEach((c) => cols.push(c.width ?? '1fr'));
    cols.push('40px');  // Zahnrad-Spalte
    return cols.join(' ');
  }, [selection, visibleColumns]);

  // ── Handlers (Header-Popover) ────────────────────────────────────────────
  const setSort = (columnId: string, direction: 'asc' | 'desc'): void => {
    setPrefs({ ...prefs, sort: { columnId, direction } });
  };
  const clearSort = (): void => {
    setPrefs({ ...prefs, sort: null });
  };
  const setColumnVisible = (columnId: string, visible: boolean): void => {
    setPrefs({
      ...prefs,
      columnVisibility: { ...prefs.columnVisibility, [columnId]: visible },
    });
  };
  const moveColumn = (columnId: string, dir: -1 | 1): void => {
    const order = [...effectiveOrder];
    const idx = order.indexOf(columnId);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= order.length) return;
    [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
    setPrefs({ ...prefs, columnOrder: order });
  };
  const addGroupBy = (columnId: string): void => {
    if (groupBy.includes(columnId)) return;
    setPrefs({ ...prefs, groupBy: [...groupBy, columnId] });
    // Bei neuer Ebene den Expand-Zustand bewusst NICHT migrieren — alles
    // klappt frisch zu, dann arbeitet der User sich nach unten.
    setExpandedGroups(new Set());
  };
  const removeGroupBy = (columnId: string): void => {
    setPrefs({ ...prefs, groupBy: groupBy.filter((id) => id !== columnId) });
    setExpandedGroups(new Set());
  };
  const moveGroupBy = (columnId: string, dir: -1 | 1): void => {
    const order = [...groupBy];
    const idx = order.indexOf(columnId);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= order.length) return;
    [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
    setPrefs({ ...prefs, groupBy: order });
    setExpandedGroups(new Set());
  };
  const clearGroupBy = (): void => {
    setPrefs({ ...prefs, groupBy: [] });
    setExpandedGroups(new Set());
  };
  const setFilter = (columnId: string, value: FilterValue | undefined): void => {
    const filters = { ...prefs.filters };
    if (value == null || (
      (value.text == null || value.text === '') &&
      (value.selected == null || value.selected.length === 0) &&
      (value.bool == null)
    )) {
      delete filters[columnId];
    } else {
      filters[columnId] = value;
    }
    setPrefs({ ...prefs, filters });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  // Zahnrad (Spalten-/Gruppen-Konfiguration) — mobil sitzt es in der kompakten
  // Toolbar, sonst in der Grid-Kopfzeile. Einmal gebaut, zweimal platziert.
  const gearButton = (
    <ColumnInventoryButton
      columns={columns}
      prefs={prefs}
      setColumnVisible={setColumnVisible}
      moveColumn={moveColumn}
      reset={reset}
      groupBy={groupBy}
      addGroupBy={addGroupBy}
      removeGroupBy={removeGroupBy}
      moveGroupBy={moveGroupBy}
      clearGroupBy={clearGroupBy}
    />
  );

  return (
    // overflow-x-auto: ein zu breites Grid scrollt IN SICH statt das ganze
    // Dokument seitwärts zu kippen (zusammen mit `min-w-min` an den Grid-Zeilen).
    <div className="border border-[var(--color-border)] overflow-x-auto">
      {/* Bulk-Bar */}
      {selection && selection.selected.size > 0 && (
        <div
          className="flex items-center gap-2 px-3 py-2 text-sm border-b border-[var(--color-border)]"
          style={{ background: 'var(--color-surface-raised)' }}
        >
          <span>{selection.selected.size} ausgewählt</span>
          <button
            type="button"
            className="text-xs underline text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            onClick={() => selection.onChange(new Set())}
          >
            Auswahl löschen
          </button>
          <div className="flex-1" />
          {selection.bulkActions}
        </div>
      )}

      {/* Mobil-Toolbar: die breite Spalten-Kopfzeile passt nicht und wäre auf
          40px-Zellen ohnehin nicht bedienbar — stattdessen „Alle auswählen"
          (falls Selection) + Zahnrad (Spalten/Gruppieren/Sortieren/Reset). */}
      {isMobile ? (
        <div
          className="flex items-center gap-3 px-3 py-2 text-xs font-medium border-b border-[var(--color-border)]"
          style={{ background: 'var(--color-surface-raised)' }}
        >
          {selection && (
            <label className="flex items-center gap-2 py-2 pr-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-5 h-5"
                checked={allSelected}
                onChange={toggleAll}
                aria-label="Alle auswählen"
              />
              <span className="text-[var(--color-text-muted)]">Alle</span>
            </label>
          )}
          <div className="flex-1" />
          {gearButton}
        </div>
      ) : (
        /* Header (Desktop) */
        <div
          className="grid items-center min-w-min px-3 py-2 text-xs font-medium border-b border-[var(--color-border)]"
          style={{ gridTemplateColumns: gridTemplate, background: 'var(--color-surface-raised)' }}
        >
          {selection && (
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              aria-label="Alle auswählen"
            />
          )}
          {visibleColumns.map((col) => {
            const activeSort = prefs.sort?.columnId === col.id ? prefs.sort.direction : null;
            const filterValue = prefs.filters[col.id];
            const isFiltered = filterValue != null;
            return (
              <DropdownMenu.Root key={col.id}>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1 px-1 py-0.5 hover:bg-[var(--color-surface)] text-left"
                    style={{ borderRadius: 'var(--border-radius-md)' }}
                  >
                    <span>{col.label}</span>
                    {activeSort === 'asc' && <ChevronUp className="w-3 h-3" />}
                    {activeSort === 'desc' && <ChevronDown className="w-3 h-3" />}
                    {isFiltered && <Filter className="w-3 h-3 signal-text-primary" />}
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content className="min-w-[220px] p-1">
                  {col.sortable !== false && (
                    <>
                      <DropdownMenu.Item onSelect={() => setSort(col.id, 'asc')}>
                        <ArrowUp className="w-4 h-4" />Sortieren A→Z
                      </DropdownMenu.Item>
                      <DropdownMenu.Item onSelect={() => setSort(col.id, 'desc')}>
                        <ArrowDown className="w-4 h-4" />Sortieren Z→A
                      </DropdownMenu.Item>
                      {activeSort && (
                        <DropdownMenu.Item onSelect={clearSort}>
                          Sortierung zurücksetzen
                        </DropdownMenu.Item>
                      )}
                      <DropdownMenu.Separator />
                    </>
                  )}
                  {groupBy.includes(col.id) ? (
                    <DropdownMenu.Item onSelect={() => removeGroupBy(col.id)}>
                      <Layers className="w-4 h-4" />Gruppierung aufheben
                    </DropdownMenu.Item>
                  ) : (
                    <DropdownMenu.Item onSelect={() => addGroupBy(col.id)}>
                      <Layers className="w-4 h-4" />Nach dieser Spalte gruppieren
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Separator />
                  {col.filter && (
                    <FilterEditor
                      column={col}
                      value={filterValue}
                      onChange={(v) => setFilter(col.id, v)}
                    />
                  )}
                  <DropdownMenu.Item onSelect={() => setColumnVisible(col.id, false)} variant="danger">
                    <EyeOff className="w-4 h-4" />Spalte ausblenden
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            );
          })}
          {/* Zahnrad-Spalte: Spalten-Inventar + Gruppieren-Sektion */}
          {gearButton}
        </div>
      )}

      {/* Rows (ggf. gruppiert) */}
      {sortedFilteredRows.length === 0 ? (
        <div className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">
          Keine Einträge
        </div>
      ) : (
        buildRenderItems(sortedFilteredRows, groupBy, columnsById, expandedGroups).map((item, idx) => {
          if (item.kind === 'group') {
            const level = item.level ?? 0;
            const groupColLabel = columnsById.get(groupBy[level])?.label ?? '';
            return (
              <div
                key={`g:${item.key}`}
                className="px-3 py-1.5 text-xs border-b border-[var(--color-border)] cursor-pointer select-none hover:bg-[var(--color-surface-raised)]"
                style={{
                  background: 'var(--color-surface-raised)',
                  paddingLeft: 12 + level * 18,
                }}
                onClick={() => toggleGroup(item.key!)}
                title={item.expanded ? 'Gruppe einklappen' : 'Gruppe ausklappen'}
              >
                <div className="flex items-center gap-2">
                  {item.expanded
                    ? <ChevronDown className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                    : <ChevronRight className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />}
                  <span className="text-[var(--color-text-muted)] uppercase text-[10px]">{groupColLabel}</span>
                  <span className="font-medium text-[var(--color-text-primary)]">{item.label}</span>
                  <span className="text-[var(--color-text-muted)]">({item.count})</span>
                </div>
              </div>
            );
          }
          const row = item.row!;
          const key = rowKey(row);
          const isChecked = selection?.selected.has(key) ?? false;
          // Indentation der Daten-Rows passend zur letzten Gruppen-Ebene.
          const rowIndent = groupBy.length > 0 ? 12 + groupBy.length * 18 : undefined;

          // Mobil: Zeile als gestapelte Label/Wert-Karte statt Grid-Zeile. Die
          // Spaltenauswahl (Zahnrad) wirkt weiter — ausgeblendete Spalten
          // erscheinen auch in der Karte nicht.
          if (isMobile) {
            return (
              <div
                key={`r:${String(key)}:${idx}`}
                className={`flex flex-col gap-1.5 px-3 py-3 border-b border-[var(--color-border)] ${onRowClick ? 'cursor-pointer hover:bg-[var(--color-surface-raised)]' : ''}`}
                style={{ background: isChecked ? 'rgba(99,102,241,0.07)' : undefined, paddingLeft: rowIndent }}
                onClick={() => onRowClick?.(row)}
              >
                {selection && (
                  <label
                    className="flex items-center gap-2 self-start py-1 pr-2 cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      className="w-5 h-5"
                      checked={isChecked}
                      onChange={() => toggleOne(key)}
                      aria-label="Zeile auswählen"
                    />
                    <span className="text-xs text-[var(--color-text-muted)]">Auswählen</span>
                  </label>
                )}
                {visibleColumns.map((col) => (
                  <div key={col.id} className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                      {col.label}
                    </span>
                    <div className="min-w-0 break-words text-sm">
                      {col.cell ? col.cell(row) : String(col.accessor(row) ?? '')}
                    </div>
                  </div>
                ))}
              </div>
            );
          }

          return (
            <div
              key={`r:${String(key)}:${idx}`}
              className={`grid items-center min-w-min px-3 py-2 text-sm border-b border-[var(--color-border)] ${onRowClick ? 'cursor-pointer hover:bg-[var(--color-surface-raised)]' : ''}`}
              style={{
                gridTemplateColumns: gridTemplate,
                background: isChecked ? 'rgba(99,102,241,0.07)' : undefined,
                paddingLeft: rowIndent,
              }}
              onClick={() => onRowClick?.(row)}
            >
              {selection && (
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleOne(key)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Zeile auswählen"
                />
              )}
              {visibleColumns.map((col) => (
                <div key={col.id} className="min-w-0 truncate">
                  {col.cell ? col.cell(row) : String(col.accessor(row) ?? '')}
                </div>
              ))}
              <div />
            </div>
          );
        })
      )}

      {footer && (
        <div className="px-3 py-2 text-xs text-[var(--color-text-muted)] border-t border-[var(--color-border)]">
          {footer}
        </div>
      )}
    </div>
  );
}

// ─── Filter-Editor (typabhängig) ─────────────────────────────────────────────

function FilterEditor<T>({
  column, value, onChange,
}: {
  column: ColumnDef<T>;
  value: FilterValue | undefined;
  onChange: (v: FilterValue | undefined) => void;
}): React.ReactElement | null {
  if (!column.filter) return null;
  const f = column.filter;

  if (f.type === 'text') {
    return (
      <div className="px-2 py-1.5 space-y-1">
        <label className="block text-xs text-[var(--color-text-muted)]">Enthält</label>
        <input
          type="text"
          value={value?.text ?? ''}
          onChange={(e) => onChange({ text: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className="w-full px-2 py-1 text-xs border border-[var(--color-border)] bg-[var(--color-surface)]"
          style={{ borderRadius: 'var(--border-radius-md)' }}
        />
        {value?.text && (
          <button
            type="button"
            className="text-xs underline text-[var(--color-text-muted)]"
            onClick={() => onChange(undefined)}
          >
            Filter entfernen
          </button>
        )}
      </div>
    );
  }

  if (f.type === 'multi-select') {
    const selected = new Set(value?.selected ?? []);
    return (
      <div className="px-2 py-1.5 space-y-1 max-h-[300px] overflow-auto">
        <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onChange(undefined); }}
            className="hover:text-[var(--color-text-primary)] underline"
          >
            Alle
          </button>
          <span>{selected.size > 0 ? `${selected.size} aktiv` : ''}</span>
        </div>
        {f.options.map((opt) => {
          const checked = selected.has(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                const next = new Set(selected);
                if (checked) next.delete(opt.value);
                else next.add(opt.value);
                onChange(next.size === 0 ? undefined : { selected: Array.from(next) });
              }}
              className="flex items-center gap-2 w-full px-1 py-1 text-left text-xs hover:bg-[var(--color-surface-raised)]"
            >
              <span
                className="inline-flex items-center justify-center w-4 h-4 border"
                style={{
                  borderColor: 'var(--color-border)',
                  background: checked ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: 'white',
                  borderRadius: 'var(--border-radius-md)',
                  fontSize: 10,
                }}
              >
                {checked ? '✓' : ''}
              </span>
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (f.type === 'boolean') {
    return (
      <div className="px-2 py-1.5 space-y-1">
        <label className="block text-xs text-[var(--color-text-muted)]">Filter</label>
        <select
          value={value?.bool ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === '' ? undefined : { bool: v as 'true' | 'false' });
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-full px-2 py-1 text-xs border border-[var(--color-border)] bg-[var(--color-surface)]"
          style={{ borderRadius: 'var(--border-radius-md)' }}
        >
          <option value="">– alle –</option>
          <option value="true">{f.labelTrue ?? 'Ja'}</option>
          <option value="false">{f.labelFalse ?? 'Nein'}</option>
        </select>
      </div>
    );
  }

  return null;
}

// ─── Spalten-Inventar (Zahnrad) ──────────────────────────────────────────────

function ColumnInventoryButton<T>({
  columns, prefs, setColumnVisible, moveColumn, reset,
  groupBy, addGroupBy, removeGroupBy, moveGroupBy, clearGroupBy,
}: {
  columns: ColumnDef<T>[];
  prefs: ViewPrefs;
  setColumnVisible: (id: string, v: boolean) => void;
  moveColumn: (id: string, dir: -1 | 1) => void;
  reset: () => Promise<void>;
  groupBy: string[];
  addGroupBy: (id: string) => void;
  removeGroupBy: (id: string) => void;
  moveGroupBy: (id: string, dir: -1 | 1) => void;
  clearGroupBy: () => void;
}): React.ReactElement {
  const groupableCandidates = columns.filter((c) => !groupBy.includes(c.id));
  const [open, setOpen] = useState(false);
  const orderedColumns = useMemo(() => {
    const byId = new Map(columns.map((c) => [c.id, c] as const));
    return reconcileOrder(columns, prefs.columnOrder).map((id) => byId.get(id)).filter(Boolean) as ColumnDef<T>[];
  }, [columns, prefs.columnOrder]);

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="p-2.5 sm:p-1 hover:bg-[var(--color-surface)] text-[var(--color-text-muted)] justify-self-end"
          title="Spalten konfigurieren"
          style={{ borderRadius: 'var(--border-radius-md)' }}
        >
          <Settings className="w-4 h-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content className="min-w-[260px] p-2">
        {/* Gruppieren-Sektion: aktive Ebenen mit Reihenfolge + Hinzufügen-Dropdown. */}
        <div className="text-xs font-semibold mb-2 text-[var(--color-text-muted)] uppercase">Gruppieren nach</div>
        {groupBy.length === 0 ? (
          <div className="text-xs text-[var(--color-text-muted)] italic px-1 mb-2">
            Keine Gruppierung aktiv.
          </div>
        ) : (
          <div className="mb-2 space-y-1" onClick={(e) => e.stopPropagation()}>
            {groupBy.map((id, idx) => {
              const col = columns.find((c) => c.id === id);
              return (
                <div key={id} className="flex items-center gap-2 px-1 py-1 text-xs">
                  <span className="text-[var(--color-text-muted)] w-4">{idx + 1}.</span>
                  <span className="flex-1 truncate">{col?.label ?? id}</span>
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveGroupBy(id, -1)}
                    className="p-2 sm:p-0.5 disabled:opacity-30 hover:bg-[var(--color-surface-raised)]"
                    title="Ebene hoch"
                    style={{ borderRadius: 'var(--border-radius-md)' }}
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === groupBy.length - 1}
                    onClick={() => moveGroupBy(id, 1)}
                    className="p-2 sm:p-0.5 disabled:opacity-30 hover:bg-[var(--color-surface-raised)]"
                    title="Ebene runter"
                    style={{ borderRadius: 'var(--border-radius-md)' }}
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeGroupBy(id)}
                    className="p-2 sm:p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                    title="Diese Ebene entfernen"
                    style={{ borderRadius: 'var(--border-radius-md)' }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              onClick={clearGroupBy}
              className="text-xs underline text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] px-1"
            >
              Alle aufheben
            </button>
          </div>
        )}
        {groupableCandidates.length > 0 && (
          <div
            className="mb-2 flex items-center gap-2 px-1"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-xs text-[var(--color-text-muted)]">Ebene hinzufügen:</span>
            <select
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value;
                if (v) addGroupBy(v);
                e.target.value = '';
              }}
              className="flex-1 px-1 py-0.5 text-xs border border-[var(--color-border)] bg-[var(--color-surface)]"
              style={{ borderRadius: 'var(--border-radius-md)' }}
            >
              <option value="">– wählen –</option>
              {groupableCandidates.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
        )}
        <div className="border-t border-[var(--color-border)] mb-2" />

        <div className="text-xs font-semibold mb-2 text-[var(--color-text-muted)] uppercase">Spalten</div>
        {orderedColumns.map((col, idx) => {
          const visible = prefs.columnVisibility[col.id] !== false;
          return (
            <div
              key={col.id}
              className="flex items-center gap-2 px-1 py-1 text-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={visible}
                onChange={() => setColumnVisible(col.id, !visible)}
                aria-label={`Spalte ${col.label} ${visible ? 'ausblenden' : 'einblenden'}`}
              />
              <span className="flex-1 text-xs">{col.label}</span>
              <button
                type="button"
                disabled={idx === 0}
                onClick={() => moveColumn(col.id, -1)}
                className="p-2 sm:p-0.5 disabled:opacity-30 hover:bg-[var(--color-surface-raised)]"
                title="Nach oben"
                style={{ borderRadius: 'var(--border-radius-md)' }}
              >
                <ArrowUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                disabled={idx === orderedColumns.length - 1}
                onClick={() => moveColumn(col.id, 1)}
                className="p-2 sm:p-0.5 disabled:opacity-30 hover:bg-[var(--color-surface-raised)]"
                title="Nach unten"
                style={{ borderRadius: 'var(--border-radius-md)' }}
              >
                <ArrowDown className="w-3 h-3" />
              </button>
            </div>
          );
        })}
        <div className="border-t border-[var(--color-border)] mt-2 pt-2">
          <Button
            variant="ghost"
            onClick={() => { reset(); setOpen(false); }}
          >
            <RotateCcw className="w-4 h-4" />Zurücksetzen
          </Button>
        </div>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
