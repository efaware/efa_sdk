/**
 * Converge DataTable — die plattformweite Listen-/Tabellen-Komponente.
 *
 * Implementiert den „Listen-Verhalten"-UX-Vertrag verbindlich:
 *
 *   1. Auswahl-Spalte links (Checkbox + Master) — opt-in via `selection`-Prop
 *   2. Bulk-Aktionen via `selection.bulkActions`
 *   3. Spalten-Header-Popover: Sortieren auf/ab, Filtern, Spalte ausblenden
 *   4. Zahnrad oben rechts: Spalten-Inventar mit Sichtbarkeit + Reihenfolge;
 *      zusätzlich lassen sich Spalten in der Kopfzeile am Griff verschieben und
 *      an der rechten Kante in der Breite ziehen (Doppelklick = Standardbreite)
 *   5. Persistente Ansicht via `useViewPreferences` (Pflicht: stabile `listId`),
 *      inkl. Reihenfolge und Spaltenbreiten —
 *      Persistenz wird über die `persistence`-Prop (ViewPreferencesAdapter)
 *      injiziert; ohne Adapter läuft die Ansicht rein In-Memory.
 *   6. Default-Ansicht + „Zurücksetzen"-Button im Zahnrad-Popover
 *
 * **Datumsspalten** deklarieren `type: 'date'` bzw. `'datetime'`: die Tabelle
 * zeigt dann `DD.MM.YYYY` (bzw. `DD.MM.YYYY, HH:MM`) über `formatDate`/
 * `formatDateTime`, sortiert chronologisch, und der Textfilter trifft die
 * angezeigte Schreibweise. `Date`-Werte ohne `type` formatiert sie ebenfalls als
 * Datum. Eigene `cell`-Renderer müssen selbst über `@efa-one/sdk/frontend/format`
 * gehen — nie `toLocaleDateString` (liefert `7.10.2026` statt `07.10.2026`).
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
import React, { useMemo, useRef, useState } from 'react';
import * as DropdownMenu from './DropdownMenu.js';
import { ChevronDown, ChevronUp, ChevronRight, Settings, EyeOff, Filter, RotateCcw, ArrowUp, ArrowDown, Layers, X, GripVertical } from 'lucide-react';
import { Button } from './Button.js';
import { useViewPreferences, type ViewPreferencesAdapter } from '../viewPreferences.js';
import { useIsMobile } from '../useIsMobile.js';
import { formatDate, formatDateTime, type DateInput } from '../format.js';

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
  cell?: (row: T) => React.ReactNode;    // Render — Default: formatCellValue(col, row)
  /** 'date' → DD.MM.YYYY, 'datetime' → DD.MM.YYYY, HH:MM; sortiert chronologisch.
   *  Der accessor liefert dafür ISO-String, Epoch-ms oder `Date`. */
  type?: 'text' | 'date' | 'datetime';
  filter?: FilterDef;
  sortable?: boolean;
  width?: string;                        // CSS grid-template-columns Anteil ('1fr', '120px', …) — Default, bis der User zieht
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
  /** Vom Benutzer gezogene Spaltenbreiten in px. Fehlt eine Spalte, gilt ihr
   *  `width` aus der ColumnDef. Optional, damit gespeicherte Ansichten von vor
   *  dem Feature ohne Versions-Bump (= ohne Reset) weiterlaufen. */
  columnWidths?: Record<string, number>;
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
    columnWidths: {},
    version: DEFAULT_VIEW_VERSION,
    ...(overrides ?? {}),
  };
}

// ─── Zellwerte (Anzeige, Datum) ──────────────────────────────────────────────

function isDateColumn<T>(col: ColumnDef<T>, value: unknown): boolean {
  return col.type === 'date' || col.type === 'datetime' || (col.type == null && value instanceof Date);
}

/** Zeitstempel in ms oder `null` (leer/unparsbar) — für die chronologische Sortierung. */
function timeOf(value: unknown): number | null {
  if (value == null || value === '') return null;
  const t = value instanceof Date ? value.getTime() : new Date(value as string | number).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Text, den die Tabelle für eine Zelle ohne eigenen `cell`-Renderer zeigt — und
 * gegen den der Textfilter sucht. Datumsspalten laufen über die Plattform-
 * Formatierer (`DD.MM.YYYY`), leere/ungültige Datumswerte werden zu „—".
 */
export function formatCellValue<T>(col: ColumnDef<T>, row: T): string {
  const v = col.accessor(row);
  if (isDateColumn(col, v)) {
    return col.type === 'datetime' ? formatDateTime(v as DateInput) : formatDate(v as DateInput);
  }
  return String(v ?? '');
}

// ─── Spalten-Reihenfolge + -Breite ───────────────────────────────────────────

/** Untergrenze beim Ziehen: Label + Sortier-Pfeil bleiben gerade noch lesbar. */
export const MIN_COLUMN_WIDTH = 60;
/** Obergrenze, damit ein verrutschter Zug die Tabelle nicht unbenutzbar macht. */
export const MAX_COLUMN_WIDTH = 1600;
/** Schrittweite der Pfeiltasten an der Ziehkante. */
const KEYBOARD_RESIZE_STEP = 16;

export function clampColumnWidth(px: number): number {
  if (!Number.isFinite(px)) return MIN_COLUMN_WIDTH;
  return Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, px)));
}

/**
 * Verschiebt `sourceId` vor bzw. hinter `targetId`. Arbeitet auf der VOLLEN
 * Reihenfolge (inkl. ausgeblendeter Spalten), damit diese ihre Position relativ
 * zu den Nachbarn behalten. Unbekannte IDs oder source === target → unverändert.
 */
export function reorderColumns(
  order: string[],
  sourceId: string,
  targetId: string,
  side: 'before' | 'after',
): string[] {
  if (sourceId === targetId) return order;
  if (!order.includes(sourceId) || !order.includes(targetId)) return order;
  const without = order.filter((id) => id !== sourceId);
  const targetIdx = without.indexOf(targetId);
  without.splice(side === 'before' ? targetIdx : targetIdx + 1, 0, sourceId);
  return without;
}

/** `grid-template-columns` für Kopfzeile + Zeilen: gezogene Breite vor Code-Default. */
export function gridTemplateFor<T>(
  visibleColumns: ColumnDef<T>[],
  columnWidths: Record<string, number> | undefined,
  hasSelection: boolean,
): string {
  const cols: string[] = [];
  if (hasSelection) cols.push('36px');
  visibleColumns.forEach((c) => {
    const w = columnWidths?.[c.id];
    cols.push(typeof w === 'number' && Number.isFinite(w) ? `${clampColumnWidth(w)}px` : (c.width ?? '1fr'));
  });
  cols.push('40px');  // Zahnrad-Spalte
  return cols.join(' ');
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
    // Datumsspalten gruppieren nach dem angezeigten Tag, nicht nach dem ISO-Rohwert.
    const buckets = new Map<string, T[]>();
    const bucketTime = new Map<string, number | null>();
    let chronological = false;
    for (const r of subset) {
      const raw = col.accessor(r);
      const isDate = isDateColumn(col, raw);
      if (isDate) chronological = true;
      const lbl = isDate ? (timeOf(raw) == null ? '' : formatCellValue(col, r)) : groupLabelOf(raw);
      const bucketLabel = lbl || EMPTY_GROUP_LABEL;
      const arr = buckets.get(bucketLabel) ?? [];
      arr.push(r);
      buckets.set(bucketLabel, arr);
      if (!bucketTime.has(bucketLabel)) bucketTime.set(bucketLabel, isDate ? timeOf(raw) : null);
    }
    // Empty group ans Ende sortieren, sonst alphabetisch nach Locale —
    // Datumsgruppen chronologisch („07.10." vor „01.11.").
    const labels = Array.from(buckets.keys()).sort((a, b) => {
      if (a === EMPTY_GROUP_LABEL) return 1;
      if (b === EMPTY_GROUP_LABEL) return -1;
      if (chronological) return (bucketTime.get(a) ?? 0) - (bucketTime.get(b) ?? 0);
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

// ─── Komponente ───────────────────────────────────────────────────────────────

export function DataTable<T, K extends string | number>({
  listId, rows, columns, rowKey, onRowClick, selection, initialPrefs, footer, persistence,
}: DataTableProps<T, K>): React.ReactElement {
  const defaultPrefs = useMemo(() => defaultPrefsFor(columns, initialPrefs), [columns, initialPrefs]);
  const [prefs, setPrefs, reset] = useViewPreferences<ViewPrefs>(listId, defaultPrefs, persistence);
  // Karten-Reflow statt Grid — siehe Doc-Header.
  const isMobile = useIsMobile();

  // Expanded-Gruppen sind bewusst NICHT in den ViewPrefs — User-Experience-
  // Entscheidung: jeder Besuch der Liste startet mit allen Gruppen zugeklappt.
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
  const columnWidths = prefs.columnWidths ?? {};

  // Spalte, die gerade am Griff gezogen wird, + aktuelle Einfüge-Position.
  const [dragColumnId, setDragColumnId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; side: 'before' | 'after' } | null>(null);
  // Während des Breiten-Ziehens wird das Grid-Template direkt an diesem
  // Container (CSS-Variable) gesetzt — sonst rendert jede Mausbewegung alle Zeilen.
  const containerRef = useRef<HTMLDivElement>(null);

  const visibleColumns = useMemo(() => {
    const byId = new Map(columns.map((c) => [c.id, c] as const));
    return prefs.columnOrder
      .map((id) => byId.get(id))
      .filter((c): c is ColumnDef<T> => Boolean(c) && prefs.columnVisibility[c!.id] !== false);
  }, [columns, prefs.columnOrder, prefs.columnVisibility]);

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
          if (v == null) return false;
          // Datumsspalten: gegen die angezeigte Schreibweise suchen („07.10").
          const text = isDateColumn(col, v) ? formatCellValue(col, r) : String(v);
          return text.toLowerCase().includes(q);
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
          let va = col.accessor(a);
          let vb = col.accessor(b);
          if (isDateColumn(col, va) || isDateColumn(col, vb)) {
            va = timeOf(va);
            vb = timeOf(vb);
          }
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
  const gridTemplate = useMemo(
    () => gridTemplateFor(visibleColumns, columnWidths, !!selection),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selection, visibleColumns, prefs.columnWidths],
  );

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
    const order = [...prefs.columnOrder];
    const idx = order.indexOf(columnId);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= order.length) return;
    [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
    setPrefs({ ...prefs, columnOrder: order });
  };
  const dropColumn = (sourceId: string, targetId: string, side: 'before' | 'after'): void => {
    const order = reorderColumns(prefs.columnOrder, sourceId, targetId, side);
    if (order.join(GROUP_KEY_SEP) !== prefs.columnOrder.join(GROUP_KEY_SEP)) {
      setPrefs({ ...prefs, columnOrder: order });
    }
  };
  /** Live-Vorschau beim Ziehen, ohne React-Render und ohne Persistenz. */
  const previewColumnWidth = (columnId: string, px: number): void => {
    containerRef.current?.style.setProperty(
      '--dt-cols',
      gridTemplateFor(visibleColumns, { ...columnWidths, [columnId]: px }, !!selection),
    );
  };
  const setColumnWidth = (columnId: string, px: number | null): void => {
    const next = { ...columnWidths };
    if (px == null) delete next[columnId];
    else next[columnId] = clampColumnWidth(px);
    setPrefs({ ...prefs, columnWidths: next });
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
    <div
      ref={containerRef}
      className="border border-[var(--color-border)] overflow-x-auto"
      style={{ '--dt-cols': gridTemplate } as React.CSSProperties}
    >
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
          style={{ gridTemplateColumns: 'var(--dt-cols)', background: 'var(--color-surface-raised)' }}
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
              <HeaderCell
                key={col.id}
                columnId={col.id}
                label={col.label}
                dragColumnId={dragColumnId}
                dropSide={dropTarget?.id === col.id ? dropTarget.side : null}
                onDragStart={() => setDragColumnId(col.id)}
                onDragEnd={() => { setDragColumnId(null); setDropTarget(null); }}
                onDragOverSide={(side) => {
                  if (dropTarget?.id !== col.id || dropTarget.side !== side) setDropTarget({ id: col.id, side });
                }}
                onDrop={(sourceId, side) => {
                  dropColumn(sourceId, col.id, side);
                  setDragColumnId(null);
                  setDropTarget(null);
                }}
                onResizePreview={(px) => previewColumnWidth(col.id, px)}
                onResizeCommit={(px) => setColumnWidth(col.id, px)}
                onResizeCancel={() => containerRef.current?.style.setProperty('--dt-cols', gridTemplate)}
                hasCustomWidth={columnWidths[col.id] != null}
              >
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1 min-w-0 px-1 py-0.5 hover:bg-[var(--color-surface)] text-left"
                    style={{ borderRadius: 'var(--border-radius-md)' }}
                  >
                    <span className="min-w-0 truncate">{col.label}</span>
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
                  {columnWidths[col.id] != null && (
                    <DropdownMenu.Item onSelect={() => setColumnWidth(col.id, null)}>
                      <RotateCcw className="w-4 h-4" />Standardbreite
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Item onSelect={() => setColumnVisible(col.id, false)} variant="danger">
                    <EyeOff className="w-4 h-4" />Spalte ausblenden
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
              </HeaderCell>
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
                      {col.cell ? col.cell(row) : formatCellValue(col, row)}
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
                gridTemplateColumns: 'var(--dt-cols)',
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
                  {col.cell ? col.cell(row) : formatCellValue(col, row)}
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

// ─── Kopfzeilen-Zelle: Verschieben (Griff) + Breite (rechte Kante) ──────────

/** MIME-Typ fürs Drag & Drop — fremde Drags (Dateien, Text) ignoriert die Kopfzeile. */
const DRAG_MIME = 'application/x-efa-datatable-column';

/**
 * Hält Hover- und Zieh-Zustand lokal, damit Mausbewegungen in der Kopfzeile
 * nicht die ganze Tabelle neu rendern. Layout bewusst über Inline-Styles:
 * Apps, deren Tailwind das SDK nicht scannt, erzeugen neue Klassen nicht.
 */
function HeaderCell({
  columnId, label, dragColumnId, dropSide, hasCustomWidth,
  onDragStart, onDragEnd, onDragOverSide, onDrop,
  onResizePreview, onResizeCommit, onResizeCancel, children,
}: {
  columnId: string;
  label: string;
  dragColumnId: string | null;
  dropSide: 'before' | 'after' | null;
  hasCustomWidth: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverSide: (side: 'before' | 'after') => void;
  onDrop: (sourceId: string, side: 'before' | 'after') => void;
  onResizePreview: (px: number) => void;
  onResizeCommit: (px: number | null) => void;
  onResizeCancel: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  const cellRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [handleFocused, setHandleFocused] = useState(false);
  const resizeStart = useRef<{ x: number; width: number; last: number } | null>(null);
  // Zeitgeber des verzögerten onDragStart — bricht der Browser den Drag ab,
  // bevor er feuert, darf er den Zustand nicht nachträglich auf „zieht" setzen.
  const dragStartTimer = useRef<number | null>(null);
  const isDragSource = dragColumnId === columnId;

  const sideFor = (clientX: number): 'before' | 'after' => {
    const r = cellRef.current?.getBoundingClientRect();
    return r && clientX < r.left + r.width / 2 ? 'before' : 'after';
  };
  const acceptsDrag = (e: React.DragEvent): boolean =>
    dragColumnId != null && e.dataTransfer.types.includes(DRAG_MIME);

  const currentWidth = (): number => cellRef.current?.getBoundingClientRect().width ?? MIN_COLUMN_WIDTH;

  const handle = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>): void => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const width = currentWidth();
      resizeStart.current = { x: e.clientX, width, last: width };
      setResizing(true);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>): void => {
      const s = resizeStart.current;
      if (!s) return;
      s.last = clampColumnWidth(s.width + e.clientX - s.x);
      onResizePreview(s.last);
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>): void => {
      const s = resizeStart.current;
      if (!s) return;
      resizeStart.current = null;
      setResizing(false);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      // Reiner Klick ohne Bewegung legt keine feste Breite an.
      if (Math.abs(e.clientX - s.x) < 2) { onResizeCancel(); return; }
      onResizeCommit(s.last);
    },
    onPointerCancel: (): void => {
      resizeStart.current = null;
      setResizing(false);
      onResizeCancel();
    },
    onDoubleClick: (e: React.MouseEvent): void => {
      e.stopPropagation();
      if (hasCustomWidth) onResizeCommit(null);
    },
    onKeyDown: (e: React.KeyboardEvent): void => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const delta = e.key === 'ArrowLeft' ? -KEYBOARD_RESIZE_STEP : KEYBOARD_RESIZE_STEP;
      onResizeCommit(clampColumnWidth(currentWidth() + delta));
    },
  };

  const showChrome = hovered || resizing || handleFocused;
  const indicator: React.CSSProperties = {
    position: 'absolute', top: -8, bottom: -8, width: 2,
    background: 'var(--color-primary)', pointerEvents: 'none',
    [dropSide === 'before' ? 'left' : 'right']: -1,
  };

  return (
    <div
      ref={cellRef}
      data-column-id={columnId}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', minWidth: 0,
        opacity: isDragSource ? 0.4 : undefined,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDragOver={(e) => {
        if (!acceptsDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!isDragSource) onDragOverSide(sideFor(e.clientX));
      }}
      onDrop={(e) => {
        if (!acceptsDrag(e)) return;
        e.preventDefault();
        const sourceId = e.dataTransfer.getData(DRAG_MIME);
        if (sourceId) onDrop(sourceId, sideFor(e.clientX));
      }}
    >
      {children}
      {/* Griff rechts in der Zelle statt links vor dem Label: so bleibt die
          Beschriftung bündig mit den Datenzellen, und der Platz rechts neben dem
          (inhaltsbreiten) Trigger ist ohnehin frei. Tastatur: Pfeile im Zahnrad. */}
      <span
        draggable
        aria-hidden
        title="Spalte verschieben"
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_MIME, columnId);
          e.dataTransfer.effectAllowed = 'move';
          if (cellRef.current) e.dataTransfer.setDragImage(cellRef.current, 8, 8);
          // Erst nach dem dragstart-Task umrendern: ändert sich das Quell-Element
          // synchron, bricht Chrome den Drag sofort wieder ab.
          dragStartTimer.current = window.setTimeout(() => {
            dragStartTimer.current = null;
            onDragStart();
          }, 0);
        }}
        onDragEnd={() => {
          if (dragStartTimer.current != null) window.clearTimeout(dragStartTimer.current);
          dragStartTimer.current = null;
          onDragEnd();
        }}
        style={{
          position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
          display: (hovered && !dragColumnId && !resizing) || isDragSource ? 'inline-flex' : 'none',
          padding: 2, cursor: 'grab', zIndex: 1,
          color: 'var(--color-text-muted)',
          background: 'var(--color-surface-raised)',
          borderRadius: 'var(--border-radius-md)',
        }}
      >
        <GripVertical style={{ width: 12, height: 12 }} />
      </span>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Breite der Spalte ${label} ändern`}
        tabIndex={0}
        title="Ziehen: Breite ändern · Doppelklick: Standardbreite"
        {...handle}
        onFocus={() => setHandleFocused(true)}
        onBlur={() => setHandleFocused(false)}
        style={{
          position: 'absolute', top: -8, bottom: -8, right: -4, width: 8,
          cursor: 'col-resize', touchAction: 'none', zIndex: 2, outline: 'none',
          display: 'flex', justifyContent: 'center',
        }}
      >
        <span
          style={{
            width: 2, height: '100%',
            background: resizing || handleFocused ? 'var(--color-primary)' : 'var(--color-border)',
            opacity: showChrome ? 1 : 0,
            transition: 'opacity 120ms',
          }}
        />
      </div>
      {dropSide && <span style={indicator} />}
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
    return prefs.columnOrder.map((id) => byId.get(id)).filter(Boolean) as ColumnDef<T>[];
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
