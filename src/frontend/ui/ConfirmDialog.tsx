import React from 'react';
import { Dialog } from './Dialog.js';
import { Button } from './Button.js';
import { Alert } from './Alert.js';

export interface ConfirmDialogProps {
  open: boolean;
  /** Die Frage, z. B. „Server deaktivieren?“. */
  title: string;
  /** Was danach passiert. */
  description?: React.ReactNode;
  /** `danger` (Vorgabe) oder `primary`. */
  variant?: 'danger' | 'primary';
  /** Sperrt beide Knöpfe, Spinner rechts. */
  busy?: boolean;
  error?: string;
  onErrorDismiss?: () => void;
  onConfirm(): void | Promise<void>;
  onCancel(): void;
  labels?: { cancel?: string; confirm?: string };
  /** `data-efa-action` des Bestätigen-Knopfs (Vorgabe `confirm`). */
  confirmAction?: string;
  dataAttributes?: Record<`data-${string}`, string | undefined>;
}

/** Rückfrage statt `window.confirm`: schmal, Abbrechen links, Bestätigen rechts. */
export function ConfirmDialog({
  open,
  title,
  description,
  variant = 'danger',
  busy,
  error,
  onErrorDismiss,
  onConfirm,
  onCancel,
  labels,
  confirmAction = 'confirm',
  dataAttributes = { 'data-efa-dialog': 'confirm' },
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!o) onCancel(); }}
      title={title}
      size="sm"
      // Bei Destruktivem auf „Abbrechen“, damit Enter nichts auslöst.
      initialFocus={variant === 'danger' ? 'cancel' : 'primary'}
      dataAttributes={dataAttributes}
      banner={error ? <Alert variant="error" onDismiss={onErrorDismiss}>{error}</Alert> : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={!!busy} data-efa-action="cancel">
            {labels?.cancel ?? 'Abbrechen'}
          </Button>
          <Button variant={variant} onClick={() => void onConfirm()} loading={!!busy} data-efa-action={confirmAction}>
            {labels?.confirm ?? 'Bestätigen'}
          </Button>
        </>
      }
    >
      {description !== undefined && description !== null && description !== '' && (
        <p className="text-sm text-[var(--color-text-secondary)]">{description}</p>
      )}
    </Dialog>
  );
}
