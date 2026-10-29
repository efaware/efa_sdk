import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { RecordDialogProps } from './RecordDialog.js';
import type { ConfirmDeleteDialogProps } from './ConfirmDeleteDialog.js';
import {
  createRecordsController,
  requiredFilled,
  type RecordsController,
  type RecordsOptions,
  type RecordsState,
} from './records.js';

export interface UseRecordsResult<T, F> {
  rows: T[];
  loading: boolean;
  /** Fehler beim Laden der Liste ('' = keiner). */
  loadError: string;
  /** Für `<Alert onDismiss={…}>` am Ladefehler. */
  dismissLoadError(): void;
  reload(): Promise<void>;

  /** Formularwerte des offenen Dialogs. */
  form: F;
  setForm(next: F | ((prev: F) => F)): void;
  setField<K extends keyof F>(key: K, value: F[K]): void;

  /** Eintrag im Dialog (`null` beim Anlegen oder wenn zu). */
  current: T | null;
  /** Dialog „Anlegen“ öffnen. */
  openCreate(): void;
  /** Eintrag im Lesemodus öffnen (Stift → Bearbeiten). Für `DataTable.onRowClick`. */
  openRecord(row: T): void;
  close(): void;

  /** In `RecordDialog` spreizen: `<RecordDialog {...records.dialogProps} title=… readContent=… editContent=… />`. */
  dialogProps: Pick<
    RecordDialogProps,
    'open' | 'onOpenChange' | 'onSave' | 'saving' | 'saveDisabled' | 'error' | 'onErrorDismiss'
  >;

  /** Löschen anfragen (öffnet die Bestätigung). */
  requestDelete(row: T): void;
  /** Eintrag, dessen Löschen gerade bestätigt wird. */
  deleteTarget: T | null;
  /** In `ConfirmDeleteDialog` spreizen: `<ConfirmDeleteDialog {...records.deleteDialogProps} itemName=… />`. */
  deleteDialogProps: Pick<
    ConfirmDeleteDialogProps,
    'open' | 'deleting' | 'error' | 'onConfirm' | 'onCancel' | 'onErrorDismiss'
  >;
}

/**
 * Fertiger Ablauf für Records-Apps: Liste laden, „+“ legt an, Klick öffnet zum
 * Lesen, Stift bearbeitet, Löschen mit Bestätigung. Die App liefert nur Spalten,
 * Formularfelder und die Abbildung Eintrag ↔ Formular.
 *
 * ```tsx
 * const records = useRecords<Item, ItemForm>({
 *   endpoint: '/api/items',
 *   apiBase: getApiBase,
 *   emptyForm: () => ({ name: '' }),
 *   toForm: (item) => ({ name: item.name }),
 *   required: ['name'],
 * });
 *
 * <Button onClick={records.openCreate}>Neu</Button>
 * <DataTable rows={records.rows} onRowClick={records.openRecord} … />
 * <RecordDialog
 *   {...records.dialogProps}
 *   title={records.current?.name ?? 'Neuer Eintrag'}
 *   readContent={…}
 *   editContent={<Input value={records.form.name} onChange={(e) => records.setField('name', e.target.value)} />}
 * />
 * <ConfirmDeleteDialog {...records.deleteDialogProps} itemName={records.deleteTarget?.name} />
 * ```
 *
 * Die Liste wird beim ersten Rendern geladen und nach jedem Speichern/Löschen neu.
 * Optionen dürfen sich je Rendern ändern (Callbacks werden immer aktuell genutzt);
 * ein neuer `endpoint` lädt die Liste neu.
 */
export function useRecords<T, F>(options: RecordsOptions<T, F>): UseRecordsResult<T, F> {
  const [controller] = useState<RecordsController<T, F>>(() => createRecordsController(options));

  // Vor dem Laden-Effekt: der Controller sieht immer die Optionen dieses Renderns.
  useEffect(() => {
    controller.setOptions(options);
  });

  useEffect(() => {
    void controller.load();
  }, [controller, options.endpoint]);

  const state: RecordsState<T, F> = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const complete = requiredFilled(state.form, options.required);

  return useMemo<UseRecordsResult<T, F>>(
    () => ({
      rows: state.rows,
      loading: state.loading,
      loadError: state.loadError,
      dismissLoadError: controller.dismissLoadError,
      reload: controller.load,
      form: state.form,
      setForm: controller.setForm,
      setField: controller.setField,
      current: state.open?.item ?? null,
      openCreate: controller.openCreate,
      openRecord: controller.openRecord,
      close: controller.close,
      dialogProps: {
        open: state.open,
        onOpenChange: (next) => {
          if (!next) controller.close();
        },
        onSave: controller.save,
        saving: state.saving,
        saveDisabled: !complete,
        error: state.saveError,
        onErrorDismiss: controller.dismissSaveError,
      },
      requestDelete: controller.requestDelete,
      deleteTarget: state.deleteTarget,
      deleteDialogProps: {
        open: state.deleteTarget !== null,
        deleting: state.deleting,
        error: state.deleteError,
        onConfirm: controller.confirmDelete,
        onCancel: controller.cancelDelete,
        onErrorDismiss: controller.dismissDeleteError,
      },
    }),
    [controller, state, complete],
  );
}
