import React from 'react';
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbItem {
  label: React.ReactNode;
  /** Ziel, z. B. `#/bp/` (HashRouter). */
  href?: string;
  /** Statt `href`, z. B. `navigate('/bp/')`. */
  onClick?: () => void;
}

export interface BreadcrumbProps {
  /** Vom Allgemeinen zum Konkreten; der letzte Eintrag ist die aktuelle Seite. */
  items: BreadcrumbItem[];
  className?: string;
}

/**
 * Pfad über Detailseiten: „Geschäftspartner › 0000010100“. Der letzte Eintrag ist
 * die aktuelle Seite und kein Link.
 */
export function Breadcrumb({ items, className = '' }: BreadcrumbProps) {
  const link = 'rounded-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]';
  return (
    <nav aria-label="Pfad" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-1.5 min-w-0">
              {i > 0 && <ChevronRight aria-hidden="true" className="w-3.5 h-3.5 shrink-0 text-[var(--color-text-muted)]" />}
              {last ? (
                <span aria-current="page" className="truncate font-medium text-[var(--color-text-primary)]">{item.label}</span>
              ) : item.href ? (
                <a href={item.href} onClick={item.onClick} className={link}>{item.label}</a>
              ) : item.onClick ? (
                <button type="button" onClick={item.onClick} className={link}>{item.label}</button>
              ) : (
                <span className="text-[var(--color-text-secondary)]">{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
