import React from 'react';
import { ChevronRight } from 'lucide-react';

export interface CollapsibleProps {
  title: React.ReactNode;
  /** Kurzinfo rechts in der Kopfzeile, auch zugeklappt sichtbar (z. B. „3 Einträge“). */
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  /** Gesteuert; dann `onOpenChange` mitgeben. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** `plain` ohne Rahmen, z. B. „Erweiterte Einstellungen“ in einem Formular. */
  variant?: 'bordered' | 'plain';
  className?: string;
  children: React.ReactNode;
}

/**
 * Auf- und zuklappbarer Abschnitt („Erweitert“, Details, Protokoll). Natives
 * `<details>`: Tastatur und Suche im Browser funktionieren ohne Nachbau. Mehrere
 * untereinander ergeben ein Akkordeon.
 */
export function Collapsible({
  title,
  summary,
  defaultOpen,
  open,
  onOpenChange,
  variant = 'bordered',
  className = '',
  children,
}: CollapsibleProps) {
  const bordered = variant === 'bordered';
  return (
    <details
      open={open ?? defaultOpen}
      onToggle={(e) => {
        const next = (e.currentTarget as HTMLDetailsElement).open;
        if (next !== open) onOpenChange?.(next);
      }}
      className={`group ${bordered ? 'rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]' : ''} ${className}`}
    >
      <summary
        className={`flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-[var(--color-text-primary)] select-none [&::-webkit-details-marker]:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] rounded-sm ${bordered ? 'px-3 py-2.5' : 'py-1.5'}`}
      >
        <ChevronRight aria-hidden="true" className="w-4 h-4 shrink-0 text-[var(--color-text-muted)] transition-transform group-open:rotate-90" />
        <span className="min-w-0">{title}</span>
        {summary && <span className="ml-auto truncate text-xs font-normal text-[var(--color-text-muted)]">{summary}</span>}
      </summary>
      <div className={bordered ? 'px-3 pb-3 pt-1' : 'pt-2 pl-6'}>{children}</div>
    </details>
  );
}
