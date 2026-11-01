import React from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
  /**
   * Fest stehender Bereich zwischen Header und scrollendem Body — gedacht für
   * Fehler-/Validierungsbanner. Muss sichtbar bleiben, egal wie weit der Body
   * gescrollt ist (Design-System: „Sichtbar am Ort der Aktion"). Ein Banner in
   * `children` würde beim Scrollen wegrutschen.
   */
  banner?: React.ReactNode;
  footer?: React.ReactNode;
  /** Maximale Breite. Ohne Angabe 768 px (`3xl`); kurze Bestätigungen mit `sm`. */
  size?: DialogSize;
  /**
   * `data-*`-Attribute am Dialog-Inhalt. Die SDK-Dialoge setzen hier ihre
   * Test-Markierungen (`data-efa-dialog`, `data-efa-mode`), an denen der Klicktest
   * von efa studio sie erkennt.
   */
  dataAttributes?: Record<`data-${string}`, string | undefined>;
  /** Fokus beim Öffnen: erstes Feld sonst Dialog (Vorgabe), `primary`/`cancel` (Fußzeile), `close` (X). */
  initialFocus?: DialogInitialFocus;
}

export type DialogInitialFocus = 'first-field' | 'primary' | 'cancel' | 'close';

/** Minimal, damit die Auswahl ohne DOM testbar ist. */
interface Queryable {
  querySelectorAll(selector: string): ArrayLike<unknown>;
}

const FIELD_SELECTOR = 'input:not([type=hidden]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled]):not([readonly])';
const BUTTON_SELECTOR = 'button:not([disabled])';

/** Sichtbar und damit fokussierbar (keine `display:none`-Dateifelder, keine zugeklappten Bereiche). */
function isVisible(el: unknown): boolean {
  const e = el as { getClientRects?: () => ArrayLike<unknown> };
  return typeof e.getClientRects !== 'function' || e.getClientRects().length > 0;
}

/** Fokus auf den Dialog selbst (ohne Ring): weder Feld noch X, Enter löst nichts aus. */
export const FOCUS_CONTENT = 'content' as const;

/**
 * Ziel des Fokus beim Öffnen: ein Element, `FOCUS_CONTENT` oder `null` (Radix: das X).
 * `first-field` nimmt das erste sichtbare Feld, sonst den Dialog selbst — nie einen
 * Knopf, denn der letzte ist oft „Löschen“. `primary`/`cancel`: letzter/erster
 * Knopf der Fußzeile.
 */
export function pickInitialFocus(
  mode: DialogInitialFocus,
  body: Queryable | null,
  footer: Queryable | null,
  visible: (el: unknown) => boolean = isVisible,
): unknown {
  if (mode === 'close') return null;
  if (mode === 'first-field') {
    const fields = Array.from(body?.querySelectorAll(FIELD_SELECTOR) ?? []);
    return fields.find(visible) ?? FOCUS_CONTENT;
  }
  const buttons = Array.from(footer?.querySelectorAll(BUTTON_SELECTOR) ?? []).filter(visible);
  if (buttons.length === 0) return FOCUS_CONTENT;
  return mode === 'cancel' ? buttons[0] : buttons[buttons.length - 1];
}

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';

/**
 * Vorgabe 768 px (efa #364). Bis 1.23 war es `md` (448 px): zu schmal für fast
 * jedes Formular, die Apps mussten fast überall selbst `size` setzen.
 */
export const DEFAULT_DIALOG_SIZE: DialogSize = '3xl';

const SIZE_CLASS: Record<DialogSize, string> = {
  sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg',
  xl: 'max-w-xl', '2xl': 'max-w-2xl', '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl', '5xl': 'max-w-5xl',
};

/**
 * Breiten-Klassen des Dialogs. Auf schmalen Bildschirmen volle Breite minus
 * 1 rem Rand je Seite, damit der Dialog nicht an den Fensterrand stößt.
 */
export function dialogWidthClass(size: DialogSize = DEFAULT_DIALOG_SIZE): string {
  return `w-[calc(100%-2rem)] ${SIZE_CLASS[size]}`;
}

export function Dialog({ open, onOpenChange, trigger, title, description, children, banner, footer, size = DEFAULT_DIALOG_SIZE, dataAttributes, initialFocus = 'first-field' }: DialogProps) {
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const footerRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const onOpenAutoFocus = (e: Event) => {
    const target = pickInitialFocus(initialFocus, bodyRef.current, footerRef.current);
    if (target === null) return;
    e.preventDefault();
    (target === FOCUS_CONTENT ? contentRef.current : (target as HTMLElement))?.focus();
  };
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>}

      <RadixDialog.Portal>
        {/* Overlay */}
        <RadixDialog.Overlay className="fixed inset-0 bg-black/40 z-40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        {/*
          Content — höhenbegrenzt und intern scrollend.

          Der Dialog ist vertikal zentriert (`-translate-y-1/2`). Ohne Deckel
          wächst er bei langem Inhalt (lange Formulare, aufklappende Listen,
          viel Text) über den Viewport hinaus: oben rutscht der Titel weg,
          unten der Footer — und damit der Speichern-Button aus dem Fenster.
          Deshalb `max-h-[90vh]` + Spalten-Flex; gescrollt wird ausschließlich
          im Body, Header und Footer bleiben stehen.

          Absichtlich KEIN `flex-1` am Body: in einem höhen-auto Flex-Container
          hätte er mit `flex-basis: 0%` die hypothetische Höhe 0 und der Dialog
          würde auf Header+Footer zusammenfallen. Der Body bleibt inhalts-hoch
          und schrumpft erst am Deckel (`min-h-0` macht das Schrumpfen unter die
          Inhaltshöhe überhaupt möglich).
        */}
        <RadixDialog.Content
          {...dataAttributes}
          ref={contentRef}
          onOpenAutoFocus={onOpenAutoFocus}
          className={`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 ${dialogWidthClass(size)} flex flex-col max-h-[90vh] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95`}
        >
          {/* Header */}
          <div className="shrink-0 flex items-start justify-between p-5 border-b border-[var(--color-border)]">
            <div>
              <RadixDialog.Title className="text-base font-semibold text-[var(--color-text-primary)]">
                {title}
              </RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="text-sm text-[var(--color-text-muted)] mt-0.5">
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close aria-label="Schließen" className="ml-4 p-1 rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-primary)] transition-colors">
              <X className="w-4 h-4" />
            </RadixDialog.Close>
          </div>

          {/* Banner (z. B. Fehler) — bleibt beim Scrollen stehen */}
          {banner && <div className="shrink-0 px-5 pt-5">{banner}</div>}

          {/* Body — der einzige scrollende Bereich */}
          <div ref={bodyRef} className="min-h-0 overflow-y-auto p-5">{children}</div>

          {/* Footer */}
          {footer && (
            <div ref={footerRef} className="shrink-0 flex items-center justify-end gap-2 px-5 pb-5">
              {footer}
            </div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

// Re-export Close for use in footer buttons
export const DialogClose = RadixDialog.Close;
