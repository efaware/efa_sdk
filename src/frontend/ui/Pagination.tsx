import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Seitenzahlen für die Leiste, 1-basiert, mit `'…'` für Lücken. Erste und letzte
 * Seite bleiben immer sichtbar, um die aktuelle Seite je eine Nachbarseite.
 * `pageItems(5, 20)` → `[1, '…', 4, 5, 6, '…', 20]`.
 */
export function pageItems(page: number, pageCount: number): Array<number | '…'> {
  if (pageCount <= 7) return Array.from({ length: Math.max(pageCount, 0) }, (_, i) => i + 1);
  const p = Math.min(Math.max(page, 1), pageCount);
  const from = p <= 4 ? 2 : p >= pageCount - 3 ? pageCount - 4 : p - 1;
  const to = p <= 4 ? 5 : p >= pageCount - 3 ? pageCount - 1 : p + 1;
  const items: Array<number | '…'> = [1];
  if (from > 2) items.push('…');
  for (let i = from; i <= to; i++) items.push(i);
  if (to < pageCount - 1) items.push('…');
  items.push(pageCount);
  return items;
}

export interface PaginationProps {
  /** Aktuelle Seite, 1-basiert. */
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Gesamtzahl der Einträge, für „1–50 von 1.234“. */
  total?: number;
  pageSize?: number;
  className?: string;
}

/**
 * Seitenleiste für Listen, die der Server seitenweise liefert (Protokolle, Verläufe).
 * Die `DataTable` blättert nicht; sie zeigt die Seite, die die App lädt.
 */
export function Pagination({ page, pageCount, onPageChange, total, pageSize, className = '' }: PaginationProps) {
  if (pageCount <= 1 && total === undefined) return null;
  const btn = 'inline-flex min-w-8 h-8 items-center justify-center rounded-sm px-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-40 disabled:cursor-not-allowed';
  const range =
    total !== undefined && pageSize
      ? `${total === 0 ? 0 : ((page - 1) * pageSize + 1).toLocaleString('de-DE')}–${Math.min(page * pageSize, total).toLocaleString('de-DE')} von ${total.toLocaleString('de-DE')}`
      : null;
  return (
    <nav aria-label="Seiten" className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <span className="text-xs text-[var(--color-text-muted)] tabular-nums">{range}</span>
      {pageCount > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Vorherige Seite"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className={`${btn} text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)]`}
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          {pageItems(page, pageCount).map((it, i) =>
            it === '…' ? (
              <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-sm text-[var(--color-text-muted)]">…</span>
            ) : (
              <button
                key={it}
                type="button"
                aria-label={`Seite ${it}`}
                aria-current={it === page ? 'page' : undefined}
                onClick={() => it !== page && onPageChange(it)}
                className={`${btn} tabular-nums ${
                  it === page
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)]'
                }`}
              >
                {it}
              </button>
            ),
          )}
          <button
            type="button"
            aria-label="Nächste Seite"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
            className={`${btn} text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)]`}
          >
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </nav>
  );
}
