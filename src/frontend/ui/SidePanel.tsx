import React from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { guardDialogEscape } from './overlay.js';

export type SidePanelWidth = 'sm' | 'md' | 'lg';

const WIDTH_CLASS: Record<SidePanelWidth, string> = {
  sm: 'md:w-[24rem]',
  md: 'md:w-[32rem]',
  lg: 'md:w-[44rem]',
};

/** Rechts, volle Höhe, unter 768 px volle Breite. */
export function sidePanelClass(width: SidePanelWidth = 'md'): string {
  return `fixed inset-y-0 right-0 z-40 w-full ${WIDTH_CLASS[width]} flex flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right`;
}

/** Klick neben das Panel schließt es nicht. */
export function keepOpenOnOutsideInteraction(e: { preventDefault(): void }): void {
  e.preventDefault();
}

/** Fokus aufs Panel selbst statt aufs X (Dialog-Regel). */
export function focusPanelItself(e: { preventDefault(): void; currentTarget: unknown }): void {
  e.preventDefault();
  (e.currentTarget as { focus?: () => void } | null)?.focus?.();
}

export interface SidePanelProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description?: string;
  children: React.ReactNode;
  banner?: React.ReactNode;
  footer?: React.ReactNode;
  width?: SidePanelWidth;
  dataAttributes?: Record<`data-${string}`, string | undefined>;
}

/** Nicht-modales Panel rechts neben einer Liste; Seite bleibt bedienbar, X/Escape schließen. */
export function SidePanel({ open, onOpenChange, title, description, children, banner, footer, width = 'md', dataAttributes }: SidePanelProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <RadixDialog.Portal>
        <RadixDialog.Content
          data-efa-sidepanel=""
          {...dataAttributes}
          onInteractOutside={keepOpenOnOutsideInteraction}
          onEscapeKeyDown={guardDialogEscape}
          onOpenAutoFocus={focusPanelItself}
          className={sidePanelClass(width)}
        >
          <div className="shrink-0 flex items-start justify-between gap-3 p-5 border-b border-[var(--color-border)]">
            <div className="min-w-0">
              <RadixDialog.Title className="text-base font-semibold text-[var(--color-text-primary)] break-words">{title}</RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="text-sm text-[var(--color-text-muted)] mt-0.5">{description}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close
              aria-label="Schließen"
              className="shrink-0 p-1 rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <X className="w-4 h-4" />
            </RadixDialog.Close>
          </div>
          {banner && <div className="shrink-0 px-5 pt-5">{banner}</div>}
          <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
          {footer && <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--color-border)]">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
