import React from 'react';
import { Dialog } from './Dialog.js';
import { Button } from './Button.js';
import { Alert } from './Alert.js';

export interface ConfirmDeleteDialogProps {
  open: boolean;
  /** Bezeichnung des Eintrags, erscheint in der Frage. */
  itemName?: string;
  /** Titel. Ohne Angabe „Eintrag löschen?“. */
  title?: string;
  /** Erläuterung. Ohne Angabe „„<itemName>“ wird endgültig gelöscht.“ */
  description?: string;
  deleting?: boolean;
  /** Fehler beim Löschen, erscheint als Banner. */
  error?: string;
  onErrorDismiss?: () => void;
  onConfirm(): void | Promise<void>;
  onCancel(): void;
  labels?: { cancel?: string; confirm?: string };
}

/**
 * Bestätigung vor dem Löschen. Passt zu `useRecords` (`deleteDialogProps`),
 * funktioniert aber auch allein.
 */
export function ConfirmDeleteDialog({
  open,
  itemName,
  title,
  description,
  deleting,
  error,
  onErrorDismiss,
  onConfirm,
  onCancel,
  labels,
}: ConfirmDeleteDialogProps) {
  const text = description ?? (itemName ? `„${itemName}“ wird endgültig gelöscht.` : 'Der Eintrag wird endgültig gelöscht.');
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
      title={title ?? 'Eintrag löschen?'}
      size="sm"
      banner={error ? <Alert variant="error" onDismiss={onErrorDismiss}>{error}</Alert> : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={!!deleting}>
            {labels?.cancel ?? 'Abbrechen'}
          </Button>
          <Button variant="danger" onClick={() => void onConfirm()} loading={!!deleting}>
            {labels?.confirm ?? 'Löschen'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--color-text-secondary)]">{text}</p>
    </Dialog>
  );
}
