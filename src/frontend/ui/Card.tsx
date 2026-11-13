import React from 'react';

export interface CardProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Rechts im Kopf, z. B. ein `Button` oder `DropdownMenu`. */
  actions?: React.ReactNode;
  /** Fußzeile mit Trennlinie, z. B. Speichern. */
  footer?: React.ReactNode;
  /** `none` für Inhalte bis an den Rand (Tabellen, Listen). Default `md`. */
  padding?: 'none' | 'sm' | 'md';
  className?: string;
  children?: React.ReactNode;
}

const PAD = { none: '', sm: 'p-3', md: 'p-4' } as const;

/**
 * Umrandeter Abschnitt einer Seite: Einstellungsblöcke, Kennzahlen, Übersichten auf
 * Detailseiten. Kein Ersatz für `Dialog` oder `SidePanel`.
 */
export function Card({ title, description, actions, footer, padding = 'md', className = '', children }: CardProps) {
  const hasHead = Boolean(title || description || actions);
  return (
    <section className={`rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] ${className}`}>
      {hasHead && (
        <div className={`flex items-start justify-between gap-3 ${padding === 'sm' ? 'px-3 pt-3' : 'px-4 pt-4'} ${children && padding === 'none' ? 'pb-3' : ''}`}>
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>}
            {description && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{description}</p>}
          </div>
          {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children && <div className={`${PAD[padding]} ${hasHead && padding !== 'none' ? 'pt-3' : ''}`}>{children}</div>}
      {footer && (
        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">{footer}</div>
      )}
    </section>
  );
}
