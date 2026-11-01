import React from 'react';
import { ConfirmDialog } from './ConfirmDialog.js';

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
  // Dünner Wrapper auf ConfirmDialog; die Test-Markierungen bleiben genau wie bisher
  // (der Klicktest von efa studio sucht `confirm-delete`).
  return (
    <ConfirmDialog
      open={open}
      title={title ?? 'Eintrag löschen?'}
      description={text}
      variant="danger"
      busy={deleting}
      error={error}
      onErrorDismiss={onErrorDismiss}
      onConfirm={onConfirm}
      onCancel={onCancel}
      labels={{ cancel: labels?.cancel, confirm: labels?.confirm ?? 'Löschen' }}
      confirmAction="confirm-delete"
      dataAttributes={{ 'data-efa-dialog': 'confirm-delete' }}
    />
  );
}
