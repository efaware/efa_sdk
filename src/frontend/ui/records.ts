/**
 * Ablauf einer Records-Liste ohne React: laden, anlegen, ändern, löschen.
 *
 * `useRecords` (gleicher Ordner) ist die React-Hülle darum. Der Ablauf liegt
 * bewusst hier und nicht in jeder App: wer ihn frei verdrahtet, vertut sich leicht
 * (z. B. bricht `save()` bei `{ id: 'new' }` ab und der Anlegen-Dialog speichert
 * nie). TypeScript sieht solche Fehler nicht, darum gibt es den Ablauf nur einmal,
 * getestet, im SDK.
 *
 * Backend-Vertrag (Standard-REST, wie in der App-Vorlage):
 *   GET    <endpoint>        → 200 JSON-Array
 *   POST   <endpoint>        → 201/200 (Body egal)
 *   PUT    <endpoint>/:id    → 200 (oder PATCH, siehe `updateMethod`)
 *   DELETE <endpoint>/:id    → 204/200
 *   Fehler                   → 4xx/5xx mit `{ "error": "<lesbare Meldung>" }`
 */

export type RecordsSaveMode = 'create' | 'edit';
export type RecordsDialogMode = 'read' | 'edit' | 'create';

export interface RecordsOptions<T, F> {
  /** Pfad der Liste, z. B. `/api/items`. Einzelne Einträge: `<endpoint>/<id>`. */
  endpoint: string;
  /**
   * Gateway-Basis der App: `getApiBase` aus `convergeApi.ts`. Pflicht, weil ohne sie
   * jede Anfrage an die Plattform statt an die App ginge. Als Funktion übergeben, die
   * Basis steht erst nach dem Auth-Exchange fest. Lokal ohne Gateway: `''`.
   */
  apiBase: string | (() => string);
  /** Leeres Formular für „Anlegen“. */
  emptyForm: () => F;
  /** Formular aus einem bestehenden Eintrag (Lesen/Bearbeiten). */
  toForm: (row: T) => F;
  /** Request-Body aus dem Formular. Ohne Angabe wird das Formular gesendet. */
  toPayload?: (form: F) => unknown;
  /** Pflichtfelder: solange eines leer ist, bleibt „Erstellen“/„Speichern“ gesperrt. */
  required?: ReadonlyArray<keyof F>;
  /** Weitere Prüfung vor dem Senden. Meldung = Fehlerbanner, es wird nichts gesendet. */
  validate?: (form: F, mode: RecordsSaveMode) => string | null | undefined;
  /** ID eines Eintrags. Ohne Angabe `row.id`. */
  getId?: (row: T) => string;
  /**
   * Darf die Person Einträge ändern? Ohne Angabe `true`. `false` → Dialog nur lesend
   * (kein Stift), z. B. `editable: can(user, 'write')`.
   */
  editable?: boolean;
  /**
   * In welchem Modus ein Klick auf einen Eintrag den Dialog öffnet. `'read'` (Vorgabe):
   * erst lesen, Stift → bearbeiten. `'edit'`: direkt im Formular, sofern `editable`;
   * ohne Schreibrecht immer lesend.
   */
  openIn?: 'read' | 'edit';
  /** Methode zum Ändern. Ohne Angabe `PUT`. */
  updateMethod?: 'PUT' | 'PATCH';
  /** Fetch-Implementierung (Tests). Ohne Angabe globales `fetch`. */
  fetchImpl?: typeof fetch;
}

export interface RecordsState<T, F> {
  rows: T[];
  /** Nur beim ersten Laden `true`; danach bleibt die Liste beim Neuladen stehen. */
  loading: boolean;
  loadError: string;
  /** Steuerobjekt für `RecordDialog`: `null` zu, `{ id: 'new' }` anlegen, sonst Eintrag. */
  open: { id: string; item?: T } | null;
  /** Modus des Dialogs (für `RecordDialog.mode`). */
  mode: RecordsDialogMode;
  form: F;
  saving: boolean;
  saveError: string;
  deleteTarget: T | null;
  deleting: boolean;
  deleteError: string;
}

export interface RecordsController<T, F> {
  getState(): RecordsState<T, F>;
  subscribe(listener: () => void): () => void;
  /** Neueste Optionen übernehmen (die Hülle ruft das bei jedem Rendern). */
  setOptions(options: RecordsOptions<T, F>): void;
  load(): Promise<void>;
  dismissLoadError(): void;
  openCreate(): void;
  openRecord(row: T): void;
  close(): void;
  /**
   * Moduswechsel aus dem `RecordDialog` (`onModeChange`). Übernommen wird nur der
   * Wechsel nach `'edit'` (Stift) und nur mit `editable`; das Zurücksetzen des Dialogs
   * beim Öffnen ändert den hier gesetzten Modus nicht.
   */
  setMode(mode: RecordsDialogMode): void;
  setForm(next: F | ((prev: F) => F)): void;
  setField<K extends keyof F>(key: K, value: F[K]): void;
  /** Sind alle Pflichtfelder gefüllt? */
  isComplete(): boolean;
  save(mode: RecordsSaveMode): Promise<void>;
  dismissSaveError(): void;
  requestDelete(row: T): void;
  cancelDelete(): void;
  confirmDelete(): Promise<void>;
  dismissDeleteError(): void;
}

const NEW_ID = 'new';

/** Sind alle Pflichtfelder gefüllt? (Leerer Text, `null`, leere Liste = nicht gefüllt.) */
export function requiredFilled<F>(form: F, required: ReadonlyArray<keyof F> | undefined): boolean {
  return (required ?? []).every((k) => !isEmpty(form[k]));
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Lesbare Meldung aus einer Fehlerantwort (`{ error }`), sonst Rückfall mit Status. */
async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown; message?: unknown };
    if (typeof body?.error === 'string' && body.error.trim()) return body.error;
    if (typeof body?.message === 'string' && body.message.trim()) return body.message;
  } catch {
    /* kein JSON */
  }
  return `${fallback} (HTTP ${res.status})`;
}

export function createRecordsController<T, F>(initial: RecordsOptions<T, F>): RecordsController<T, F> {
  let options = initial;
  let state: RecordsState<T, F> = {
    rows: [],
    loading: true,
    loadError: '',
    open: null,
    mode: 'read',
    form: initial.emptyForm(),
    saving: false,
    saveError: '',
    deleteTarget: null,
    deleting: false,
    deleteError: '',
  };
  const listeners = new Set<() => void>();
  let loadSeq = 0;
  let loadedOnce = false;

  function set(patch: Partial<RecordsState<T, F>>): void {
    state = { ...state, ...patch };
    for (const l of listeners) l();
  }

  function base(): string {
    const b = options.apiBase;
    return typeof b === 'function' ? b() : (b ?? '');
  }

  function tryId(row: T): string | null {
    const id = options.getId ? options.getId(row) : (row as { id?: unknown }).id;
    return id === undefined || id === null || String(id) === '' ? null : String(id);
  }

  const NO_ID = 'Eintrag ohne ID: Die Liste liefert kein Feld „id“ (in useRecords getId angeben).';

  function url(id?: string): string {
    const root = `${base()}${options.endpoint}`;
    return id === undefined ? root : `${root.replace(/\/$/, '')}/${encodeURIComponent(id)}`;
  }

  function request(target: string, method: string, body?: unknown): Promise<Response> {
    const f = options.fetchImpl ?? fetch;
    return f(target, {
      method,
      credentials: 'include',
      headers: body === undefined ? { Accept: 'application/json' } : { 'Content-Type': 'application/json', Accept: 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  function isComplete(): boolean {
    return requiredFilled(state.form, options.required);
  }

  async function load(): Promise<void> {
    const seq = ++loadSeq;
    set({ loading: !loadedOnce, loadError: '' });
    try {
      const res = await request(url(), 'GET');
      if (!res.ok) {
        const msg = await errorMessage(res, 'Liste konnte nicht geladen werden');
        if (seq === loadSeq) set({ loading: false, loadError: msg });
        return;
      }
      let data: unknown;
      try {
        data = await res.json();
      } catch {
        if (seq === loadSeq) set({ loading: false, loadError: 'Liste konnte nicht geladen werden (Antwort ist kein JSON, stimmen apiBase und endpoint?)' });
        return;
      }
      if (seq !== loadSeq) return;
      if (!Array.isArray(data)) {
        set({ loading: false, loadError: 'Liste konnte nicht geladen werden (Antwort ist keine Liste)' });
        return;
      }
      loadedOnce = true;
      set({ rows: data as T[], loading: false });
    } catch {
      if (seq === loadSeq) set({ loading: false, loadError: 'Server nicht erreichbar' });
    }
  }

  async function save(mode: RecordsSaveMode): Promise<void> {
    if (state.saving) return;
    const open = state.open;
    if (!open) return;
    if (mode === 'edit' && options.editable === false) return;
    if (!isComplete()) {
      set({ saveError: 'Bitte alle Pflichtfelder ausfüllen.' });
      return;
    }
    const invalid = options.validate?.(state.form, mode);
    if (invalid) {
      set({ saveError: invalid });
      return;
    }
    let target: string;
    let method: string;
    if (mode === 'create') {
      target = url();
      method = 'POST';
    } else {
      const id = open.item ? tryId(open.item) : null;
      if (id === null) {
        set({ saveError: open.item ? NO_ID : 'Kein Eintrag zum Speichern geöffnet.' });
        return;
      }
      target = url(id);
      method = options.updateMethod ?? 'PUT';
    }
    const payload = options.toPayload ? options.toPayload(state.form) : state.form;
    set({ saving: true, saveError: '' });
    try {
      const res = await request(target, method, payload);
      if (!res.ok) {
        set({ saving: false, saveError: await errorMessage(res, 'Speichern fehlgeschlagen') });
        return;
      }
    } catch {
      set({ saving: false, saveError: 'Server nicht erreichbar' });
      return;
    }
    // Nur den Dialog schließen, der gespeichert wurde (inzwischen kann ein anderer offen sein).
    if (state.open === open) set({ saving: false, open: null, form: options.emptyForm() });
    else set({ saving: false });
    await load();
  }

  async function confirmDelete(): Promise<void> {
    const row = state.deleteTarget;
    if (!row || state.deleting) return;
    const id = tryId(row);
    if (id === null) {
      set({ deleteError: NO_ID });
      return;
    }
    set({ deleting: true, deleteError: '' });
    try {
      const res = await request(url(id), 'DELETE');
      if (!res.ok) {
        set({ deleting: false, deleteError: await errorMessage(res, 'Löschen fehlgeschlagen') });
        return;
      }
    } catch {
      set({ deleting: false, deleteError: 'Server nicht erreichbar' });
      return;
    }
    const openItem = state.open?.item;
    const closeDialog = openItem !== undefined && tryId(openItem) === id;
    set({ deleting: false, deleteTarget: null, ...(closeDialog ? { open: null } : {}) });
    await load();
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setOptions(next) {
      options = next;
    },
    load,
    dismissLoadError() {
      set({ loadError: '' });
    },
    openCreate() {
      set({ open: { id: NEW_ID }, mode: 'create', form: options.emptyForm(), saveError: '' });
    },
    openRecord(row) {
      const id = tryId(row);
      if (id === null) {
        // Kein Wurf aus dem Klick-Handler (wäre still): sichtbar als Ladefehler.
        console.error('useRecords: Eintrag ohne ID (getId angeben)', row);
        set({ loadError: NO_ID });
        return;
      }
      const mode: RecordsDialogMode = options.openIn === 'edit' && options.editable !== false ? 'edit' : 'read';
      set({ open: { id, item: row }, mode, form: options.toForm(row), saveError: '' });
    },
    close() {
      set({ open: null, saveError: '' });
    },
    setMode(mode) {
      if (mode !== 'edit' || options.editable === false || !state.open?.item || state.mode === 'edit') return;
      set({ mode: 'edit' });
    },
    setForm(next) {
      const form = typeof next === 'function' ? (next as (prev: F) => F)(state.form) : next;
      set({ form });
    },
    setField(key, value) {
      set({ form: { ...state.form, [key]: value } });
    },
    isComplete,
    save,
    dismissSaveError() {
      set({ saveError: '' });
    },
    requestDelete(row) {
      set({ deleteTarget: row, deleteError: '' });
    },
    cancelDelete() {
      if (state.deleting) return;
      set({ deleteTarget: null, deleteError: '' });
    },
    confirmDelete,
    dismissDeleteError() {
      set({ deleteError: '' });
    },
  };
}
