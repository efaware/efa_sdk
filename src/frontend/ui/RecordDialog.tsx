import React, { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Dialog, DialogClose } from './Dialog.js';
import { Button } from './Button.js';
import { Alert } from './Alert.js';

export type RecordDialogMode = 'read' | 'edit' | 'create';

interface RecordDialogProps {
  /**
   * Steuerung von außen: `null` = Dialog zu, `{ id: 'new' }` = Create,
   * `{ id: <uuid>, item }` = Read/Edit für bestehenden Eintrag.
   */
  open: { id: string; item?: any } | null;
  onOpenChange(open: { id: string; item?: any } | null): void;

  /**
   * Initial-Modus beim Öffnen. Default:
   *   - id === 'new'  → 'create'
   *   - sonst         → 'read'
   * Modus wird intern gehalten, kann aber per `mode`/`onModeChange` von
   * außen kontrolliert werden.
   */
  mode?: RecordDialogMode;
  onModeChange?(mode: RecordDialogMode): void;

  /** Titel im Header. Bei `mode === 'read'` typischerweise der Item-Name. */
  title: string;

  /**
   * Inhalt für den Read-Modus. Wird mit einem Stift-Icon oben rechts versehen,
   * das in den Edit-Modus wechselt.
   */
  readContent: React.ReactNode;

  /** Inhalt für den Edit-/Create-Modus. Eigene Form-Felder. */
  editContent: React.ReactNode;

  /** Speichert den aktuellen Edit-/Create-State. Schließt den Dialog bei Erfolg. */
  onSave(mode: 'edit' | 'create'): Promise<void> | void;

  /** Wird beim Speichern als Loading-Indicator am Submit-Button gesetzt. */
  saving?: boolean;

  /** Disabled-Logik für den Submit-Button (z. B. Pflichtfelder leer). */
  saveDisabled?: boolean;

  /**
   * Validierungs-/Speicherfehler. Wird im Edit-/Create-Modus als lesbares
   * `Alert`-Banner im **fest stehenden Banner-Slot** des Dialogs gerendert — also
   * dort sichtbar, egal wie weit unten der Submit-Button steht. Beim erneuten
   * Speichern zurücksetzen (`setError('')`), damit alte Meldungen verschwinden.
   */
  error?: string;
  /** Wenn gesetzt, bekommt das Fehler-Banner ein „×" zum manuellen Schließen. */
  onErrorDismiss?: () => void;

  /** Custom-Labels für Footer-Buttons (Default: Schließen / Abbrechen / Speichern / Erstellen). */
  labels?: {
    close?: string;
    cancel?: string;
    save?: string;
    create?: string;
    edit?: string;
  };
}

/**
 * Standard-Detail-Dialog für CRUD-Listen in Converge-Apps.
 *
 * UX-Vertrag (Pflicht für alle Detail-Ansichten):
 *   1. Klick auf Listen-Eintrag → Dialog öffnet im Read-Modus.
 *   2. Stift-Icon (Pencil) im Header oder Footer-Button "Bearbeiten" → wechselt zu Edit.
 *   3. Beim Hinzufügen ("+"-Button) → Dialog öffnet direkt im Create-Modus.
 *
 * Diese Komponente kapselt das Verhalten. Apps liefern nur:
 *   - `readContent`  : Anzeige-Layout (Label-Wert-Liste, Tabs, etc.)
 *   - `editContent`  : Form (Inputs, Selects, Checkboxes)
 *   - `onSave`       : Persistenz (POST/PATCH gegen das eigene Backend)
 */
export function RecordDialog({
  open, onOpenChange,
  mode: controlledMode, onModeChange,
  title, readContent, editContent,
  onSave, saving, saveDisabled,
  error, onErrorDismiss,
  labels,
}: RecordDialogProps) {
  const [internalMode, setInternalMode] = useState<RecordDialogMode>('read');
  const mode = controlledMode ?? internalMode;

  // Modus zurücksetzen, wenn ein anderes Item geöffnet wird
  useEffect(() => {
    if (!open) return;
    const initial: RecordDialogMode = open.id === 'new' ? 'create' : 'read';
    if (controlledMode === undefined) setInternalMode(initial);
    onModeChange?.(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.id]);

  function setMode(next: RecordDialogMode) {
    if (controlledMode === undefined) setInternalMode(next);
    onModeChange?.(next);
  }

  function handleClose() {
    onOpenChange(null);
  }

  async function handleSave() {
    if (mode === 'read') return;
    await onSave(mode);
  }

  const closeLabel  = labels?.close  ?? 'Schließen';
  const cancelLabel = labels?.cancel ?? 'Abbrechen';
  const saveLabel   = labels?.save   ?? 'Speichern';
  const createLabel = labels?.create ?? 'Erstellen';
  const editLabel   = labels?.edit   ?? 'Bearbeiten';

  return (
    <Dialog
      open={open !== null}
      onOpenChange={(o) => { if (!o) handleClose(); }}
      title={title}
      // Banner-Slot statt Body: der Dialog-Body scrollt, ein Fehler dort würde
      // bei langen Formularen aus dem Blick rutschen — genau dann, wenn der
      // Nutzer unten auf „Speichern" drückt.
      banner={mode !== 'read' && error
        ? <Alert variant="error" onDismiss={onErrorDismiss}>{error}</Alert>
        : undefined}
      footer={
        mode === 'read' ? (
          <>
            <DialogClose asChild><Button variant="secondary">{closeLabel}</Button></DialogClose>
            <Button onClick={() => setMode('edit')}>
              <Pencil className="w-4 h-4" />{editLabel}
            </Button>
          </>
        ) : (
          <>
            <DialogClose asChild><Button variant="secondary">{cancelLabel}</Button></DialogClose>
            <Button onClick={handleSave} loading={!!saving} disabled={!!saveDisabled}>
              {mode === 'create' ? createLabel : saveLabel}
            </Button>
          </>
        )
      }
    >
      {mode === 'read' ? (
        <div>
          <div className="flex justify-end mb-2 -mt-1">
            <button
              onClick={() => setMode('edit')}
              className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-primary-text)] hover:bg-[var(--color-surface-raised)] transition-colors"
              title={editLabel}
              aria-label={editLabel}
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>
          {readContent}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {editContent}
        </div>
      )}
    </Dialog>
  );
}
