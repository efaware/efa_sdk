import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ESCAPE_ATTR, FLOATING_STYLE, OVERLAY_ATTR, useFloating, type FloatingAlign, type FloatingSide } from './overlay.js';

export interface PopoverProps {
  /** Auslöser, meist ein `Button`. Ein Klick öffnet und schließt. */
  trigger: React.ReactElement;
  /** Inhalt; als Funktion bekommt er `close`, z. B. für „Übernehmen“. */
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  /** Gesteuert öffnen; sonst verwaltet der Popover das selbst. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: FloatingSide;
  align?: FloatingAlign;
  /** Name des Bereichs für Screenreader, z. B. „Filter“. */
  'aria-label'?: string;
  /** Für Breite und Abstand des Inhalts; Default `w-72 p-4`. */
  className?: string;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Schwebender Bereich an einem Auslöser für kleine Formulare und Zusatzinfos
 * (Filter, Schnelleinstellungen, Details). Für Aktionslisten `DropdownMenu`, für
 * reinen Hinweistext `Tooltip`, für alles mit Speichern `Dialog`.
 *
 * Schließt bei Klick außerhalb und Escape (ein umgebender Dialog bleibt dabei offen).
 * Beim Öffnen springt der Fokus auf das erste Bedienelement, beim Schließen zurück.
 */
export function Popover({
  trigger,
  children,
  open: openProp,
  onOpenChange,
  side = 'bottom',
  align = 'start',
  className = 'w-72 p-4',
  ...aria
}: PopoverProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const anchorRef = useRef<HTMLSpanElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const contentId = `popover-${useId()}`;

  const setOpen = useCallback(
    (next: boolean) => {
      if (openProp === undefined) setOpenState(next);
      onOpenChange?.(next);
    },
    [openProp, onOpenChange],
  );
  const close = useCallback(() => setOpen(false), [setOpen]);
  const closeAndRefocus = useCallback(() => {
    setOpen(false);
    anchorRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, [setOpen]);

  useFloating(open, anchorRef, contentRef, { side, align, onOutside: close });

  useEffect(() => {
    if (!open) return;
    const el = contentRef.current;
    (el?.querySelector<HTMLElement>(FOCUSABLE) ?? el)?.focus();
  }, [open]);

  const triggerEl = React.cloneElement(trigger as React.ReactElement<Record<string, unknown>>, {
    'aria-expanded': open,
    'aria-haspopup': 'dialog',
    'aria-controls': open ? contentId : undefined,
  });

  return (
    <>
      <span
        ref={anchorRef}
        className="inline-flex"
        {...{ [ESCAPE_ATTR]: open ? 'active' : undefined }}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (open && e.key === 'Escape') {
            e.stopPropagation();
            close();
          }
        }}
      >
        {triggerEl}
      </span>
      {open && (
        <div
          ref={contentRef}
          id={contentId}
          role="dialog"
          aria-label={aria['aria-label']}
          tabIndex={-1}
          {...{ popover: 'manual', [OVERLAY_ATTR]: '', [ESCAPE_ATTR]: 'active' }}
          style={FLOATING_STYLE}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              closeAndRefocus();
            }
          }}
          className={`z-50 overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-lg focus:outline-none ${className}`}
        >
          {typeof children === 'function' ? children(closeAndRefocus) : children}
        </div>
      )}
    </>
  );
}
