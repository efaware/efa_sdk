import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRecordsController, requiredFilled, type RecordsOptions } from '../src/frontend/ui/records';

/**
 * Ablauf der Records-Liste (`useRecords`). Anlass: ein vom Modell geschriebenes
 * `save()` brach bei `{ id: 'new' }` ab, der Anlegen-Dialog schickte nie etwas ab.
 * Diese Tests halten fest, dass jede Aktion genau die passende Anfrage auslöst.
 */

interface Item {
  id: string;
  name: string;
  note: string | null;
}
interface ItemForm {
  name: string;
  note: string;
}

type Call = { url: string; method: string; body: unknown; credentials?: RequestCredentials };

function json(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new Error('kein Body');
      return body;
    },
  } as unknown as Response;
}

function setup(over: Partial<RecordsOptions<Item, ItemForm>> = {}, routes?: (c: Call) => Response | Promise<Response>) {
  let rows: Item[] = [{ id: 'a1', name: 'Alpha', note: null }];
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    const call: Call = {
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      credentials: init?.credentials,
    };
    calls.push(call);
    if (routes) return routes(call);
    if (call.method === 'GET') return json(200, rows);
    if (call.method === 'POST') {
      const created = { id: 'b2', ...(call.body as ItemForm), note: null };
      rows = [...rows, created];
      return json(201, created);
    }
    if (call.method === 'PUT' || call.method === 'PATCH') return json(200, { id: 'a1', ...(call.body as object) });
    if (call.method === 'DELETE') {
      rows = rows.filter((r) => !call.url.endsWith(`/${r.id}`));
      return json(204);
    }
    return json(404, { error: 'nicht gefunden' });
  });
  const c = createRecordsController<Item, ItemForm>({
    endpoint: '/api/items',
    apiBase: () => '/apps/demo',
    emptyForm: () => ({ name: '', note: '' }),
    toForm: (r) => ({ name: r.name, note: r.note ?? '' }),
    required: ['name'],
    fetchImpl: fetchImpl as unknown as typeof fetch,
    ...over,
  });
  return { c, calls, fetchImpl };
}

describe('createRecordsController', () => {
  it('lädt die Liste über apiBase + endpoint mit Cookie', async () => {
    const { c, calls } = setup();
    expect(c.getState().loading).toBe(true);
    await c.load();
    expect(calls[0]).toMatchObject({ url: '/apps/demo/api/items', method: 'GET', credentials: 'include' });
    expect(c.getState()).toMatchObject({ loading: false, loadError: '', rows: [{ id: 'a1' }] });
  });

  it('Anlegen schickt POST und lädt danach neu', async () => {
    const { c, calls } = setup();
    await c.load();
    c.openCreate();
    expect(c.getState().open).toEqual({ id: 'new' });
    c.setField('name', 'Beta');
    await c.save('create');
    const post = calls.find((x) => x.method === 'POST');
    expect(post).toEqual({ url: '/apps/demo/api/items', method: 'POST', body: { name: 'Beta', note: '' }, credentials: 'include' });
    expect(c.getState().open).toBeNull();
    expect(c.getState().rows.map((r) => r.id)).toEqual(['a1', 'b2']);
    expect(calls.filter((x) => x.method === 'GET')).toHaveLength(2);
  });

  it('Ändern schickt PUT auf /:id, PATCH auf Wunsch, mit toPayload', async () => {
    const { c, calls } = setup({ toPayload: (f) => ({ name: f.name.trim(), note: f.note || null }) });
    await c.load();
    c.openRecord(c.getState().rows[0]);
    expect(c.getState().form).toEqual({ name: 'Alpha', note: '' });
    c.setForm((f) => ({ ...f, name: ' Alpha 2 ' }));
    await c.save('edit');
    expect(calls.find((x) => x.method === 'PUT')).toMatchObject({ url: '/apps/demo/api/items/a1', body: { name: 'Alpha 2', note: null } });

    const p = setup({ updateMethod: 'PATCH', getId: (r) => `x-${r.id}` });
    await p.c.load();
    p.c.openRecord(p.c.getState().rows[0]);
    await p.c.save('edit');
    expect(p.calls.find((x) => x.method === 'PATCH')?.url).toBe('/apps/demo/api/items/x-a1');
  });

  it('Pflichtfelder und validate verhindern die Anfrage und zeigen eine Meldung', async () => {
    const { c, calls } = setup({ validate: (f) => (f.name.length > 3 ? 'Name zu lang' : null) });
    await c.load();
    c.openCreate();
    expect(c.isComplete()).toBe(false);
    await c.save('create');
    expect(c.getState().saveError).toBe('Bitte alle Pflichtfelder ausfüllen.');
    c.setField('name', 'Langer Name');
    await c.save('create');
    expect(c.getState().saveError).toBe('Name zu lang');
    expect(calls.some((x) => x.method === 'POST')).toBe(false);
    expect(c.getState().open).toEqual({ id: 'new' });
    c.dismissSaveError();
    expect(c.getState().saveError).toBe('');
  });

  it('Serverfehler: Meldung aus { error }, sonst mit Status; Dialog bleibt offen', async () => {
    const { c } = setup({}, (x) => (x.method === 'GET' ? json(200, []) : json(400, { error: 'Titel ist erforderlich.' })));
    await c.load();
    c.openCreate();
    c.setField('name', 'X');
    await c.save('create');
    expect(c.getState()).toMatchObject({ saving: false, saveError: 'Titel ist erforderlich.', open: { id: 'new' } });

    const s = setup({}, (x) => (x.method === 'GET' ? json(200, []) : json(500)));
    await s.c.load();
    s.c.openCreate();
    s.c.setField('name', 'X');
    await s.c.save('create');
    expect(s.c.getState().saveError).toBe('Speichern fehlgeschlagen (HTTP 500)');
  });

  it('Server nicht erreichbar wird gemeldet (Laden und Speichern)', async () => {
    const { c } = setup({}, () => {
      throw new TypeError('fetch failed');
    });
    await c.load();
    expect(c.getState()).toMatchObject({ loading: false, loadError: 'Server nicht erreichbar' });
    c.openCreate();
    c.setField('name', 'X');
    await c.save('create');
    expect(c.getState().saveError).toBe('Server nicht erreichbar');
  });

  it('Ladefehler: Meldung, und eine Nicht-Liste wird abgelehnt', async () => {
    const a = setup({}, () => json(503, { error: 'Permission service unavailable' }));
    await a.c.load();
    expect(a.c.getState().loadError).toBe('Permission service unavailable');
    a.c.dismissLoadError();
    expect(a.c.getState().loadError).toBe('');
    const b = setup({}, () => json(200, { rows: [] }));
    await b.c.load();
    expect(b.c.getState().loadError).toContain('keine Liste');
  });

  it('eine ältere Ladeantwort überschreibt keine neuere', async () => {
    let resolveFirst!: (r: Response) => void;
    let n = 0;
    const { c } = setup({}, () => {
      n += 1;
      if (n === 1) return new Promise<Response>((r) => (resolveFirst = r));
      return json(200, [{ id: 'neu', name: 'Neu', note: null }]);
    });
    const first = c.load();
    await c.load();
    resolveFirst(json(200, [{ id: 'alt', name: 'Alt', note: null }]));
    await first;
    expect(c.getState().rows.map((r) => r.id)).toEqual(['neu']);
  });

  it('Löschen: erst bestätigen, dann DELETE, offener Dialog des Eintrags schließt', async () => {
    const { c, calls } = setup();
    await c.load();
    const row = c.getState().rows[0];
    c.openRecord(row);
    c.requestDelete(row);
    expect(calls.some((x) => x.method === 'DELETE')).toBe(false);
    expect(c.getState().deleteTarget).toBe(row);
    await c.confirmDelete();
    expect(calls.find((x) => x.method === 'DELETE')?.url).toBe('/apps/demo/api/items/a1');
    expect(c.getState()).toMatchObject({ deleteTarget: null, open: null, rows: [] });
  });

  it('Löschen fehlgeschlagen: Meldung, Bestätigung bleibt; Abbrechen räumt auf', async () => {
    const { c } = setup({}, (x) => (x.method === 'GET' ? json(200, [{ id: 'a1', name: 'A', note: null }]) : json(409, { error: 'Wird noch verwendet' })));
    await c.load();
    c.requestDelete(c.getState().rows[0]);
    await c.confirmDelete();
    expect(c.getState()).toMatchObject({ deleting: false, deleteError: 'Wird noch verwendet' });
    expect(c.getState().deleteTarget).not.toBeNull();
    c.dismissDeleteError();
    expect(c.getState().deleteError).toBe('');
    c.cancelDelete();
    expect(c.getState().deleteTarget).toBeNull();
  });

  it('Modus: Vorgabe erst lesen, Stift → bearbeiten; Anlegen im Anlegen-Modus', async () => {
    const { c } = setup();
    await c.load();
    c.openCreate();
    expect(c.getState().mode).toBe('create');
    c.openRecord(c.getState().rows[0]);
    expect(c.getState().mode).toBe('read');
    c.setMode('edit'); // Stift
    expect(c.getState().mode).toBe('edit');
  });

  it("openIn: 'edit' öffnet direkt im Formular; das Zurücksetzen des Dialogs ändert das nicht", async () => {
    const { c, calls } = setup({ openIn: 'edit', editable: true });
    await c.load();
    c.openRecord(c.getState().rows[0]);
    expect(c.getState().mode).toBe('edit');
    c.setMode('read'); // RecordDialog meldet beim Öffnen 'read'
    expect(c.getState().mode).toBe('edit');
    c.setField('name', 'Neu');
    await c.save('edit');
    expect(calls.find((x) => x.method === 'PUT')?.body).toMatchObject({ name: 'Neu' });
  });

  it('editable: false → nur lesen, kein Wechsel ins Formular, kein PUT', async () => {
    const { c, calls } = setup({ openIn: 'edit', editable: false });
    await c.load();
    c.openRecord(c.getState().rows[0]);
    expect(c.getState().mode).toBe('read');
    c.setMode('edit');
    expect(c.getState().mode).toBe('read');
    await c.save('edit');
    expect(calls.some((x) => x.method === 'PUT')).toBe(false);
    expect(c.getState().saveError).toBe('Keine Berechtigung zum Ändern.');
    c.close();
    c.setMode('edit'); // ohne offenen Eintrag: nichts
    expect(c.getState().mode).toBe('read');
  });

  it('Randfälle: message statt error, Bearbeiten ohne Eintrag, Löschen ohne Netz', async () => {
    const m = setup({}, (x) => (x.method === 'GET' ? json(200, [{ id: 'a1', name: 'A', note: null }]) : json(422, { message: 'Ungültig' })));
    await m.c.load();
    m.c.openRecord(m.c.getState().rows[0]);
    await m.c.save('edit');
    expect(m.c.getState().saveError).toBe('Ungültig');

    // Bearbeiten-Modus für den Anlegen-Dialog (kein Eintrag) sendet nichts.
    m.c.openCreate();
    m.c.setField('name', 'X');
    await m.c.save('edit');
    expect(m.c.getState().saveError).toBe('Kein Eintrag zum Speichern geöffnet.');

    let n = 0;
    const d = setup({}, () => {
      n += 1;
      if (n === 1) return json(200, [{ id: 'a1', name: 'A', note: null }]);
      throw new TypeError('fetch failed');
    });
    await d.c.load();
    d.c.requestDelete(d.c.getState().rows[0]);
    await d.c.confirmDelete();
    expect(d.c.getState()).toMatchObject({ deleting: false, deleteError: 'Server nicht erreichbar' });
  });

  it('Eintrag ohne ID wird sichtbar gemeldet statt still zu werfen', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { c, calls } = setup({}, () => json(200, [{ name: 'ohne', note: null }]));
    await c.load();
    const row = c.getState().rows[0];
    c.openRecord(row);
    expect(c.getState()).toMatchObject({ open: null, loadError: expect.stringContaining('getId') });
    c.requestDelete(row);
    await c.confirmDelete();
    expect(c.getState().deleteError).toContain('getId');
    expect(calls.some((x) => x.method === 'DELETE')).toBe(false);
    err.mockRestore();
  });

  it('Neuladen nach dem Speichern zeigt keinen Ladezustand (Tabelle bleibt stehen)', async () => {
    const { c } = setup();
    const seen: boolean[] = [];
    c.subscribe(() => seen.push(c.getState().loading));
    await c.load();
    seen.length = 0;
    c.openCreate();
    c.setField('name', 'Beta');
    await c.save('create');
    expect(seen).not.toContain(true);
    expect(c.getState().rows).toHaveLength(2);
  });

  it('ein inzwischen geöffneter anderer Dialog bleibt nach dem Speichern offen', async () => {
    let release!: () => void;
    const { c } = setup({}, (x) => {
      if (x.method === 'GET') return json(200, [{ id: 'a1', name: 'A', note: null }, { id: 'b2', name: 'B', note: null }]);
      return new Promise<Response>((r) => (release = () => r(json(201, {}))));
    });
    await c.load();
    c.openCreate();
    c.setField('name', 'Neu');
    const saving = c.save('create');
    c.openRecord(c.getState().rows[1]);
    release();
    await saving;
    expect(c.getState().open).toMatchObject({ id: 'b2' });
    expect(c.getState().form.name).toBe('B');
  });

  it('eine 200-Antwort ohne JSON wird nicht als „nicht erreichbar“ gemeldet', async () => {
    const { c } = setup({}, () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('<html>'); } }) as unknown as Response);
    await c.load();
    expect(c.getState().loadError).toContain('kein JSON');
  });

  it('benachrichtigt Abonnenten und lässt sie wieder los', async () => {
    const { c } = setup();
    const l = vi.fn();
    const off = c.subscribe(l);
    c.openCreate();
    expect(l).toHaveBeenCalled();
    off();
    l.mockClear();
    c.close();
    expect(l).not.toHaveBeenCalled();
  });

  it('setOptions übernimmt neue Callbacks', async () => {
    const { c, calls } = setup();
    c.setOptions({
      endpoint: '/api/other',
      apiBase: '',
      emptyForm: () => ({ name: 'vorbelegt', note: '' }),
      toForm: (r) => ({ name: r.name, note: '' }),
      fetchImpl: (async (url: string) => {
        calls.push({ url, method: 'GET', body: undefined });
        return json(200, []);
      }) as unknown as typeof fetch,
    });
    c.openCreate();
    expect(c.getState().form.name).toBe('vorbelegt');
    await c.load();
    expect(calls[calls.length - 1].url).toBe('/api/other');
  });
});

describe('requiredFilled', () => {
  it('leerer Text, null und leere Liste gelten als leer, 0 und false nicht', () => {
    type F = { a: string; b: number; c: boolean; d: string[] | null };
    expect(requiredFilled<F>({ a: ' ', b: 0, c: false, d: ['x'] }, ['a'])).toBe(false);
    expect(requiredFilled<F>({ a: 'x', b: 0, c: false, d: [] }, ['d'])).toBe(false);
    expect(requiredFilled<F>({ a: 'x', b: 0, c: false, d: null }, ['d'])).toBe(false);
    expect(requiredFilled<F>({ a: 'x', b: 0, c: false, d: ['x'] }, ['a', 'b', 'c', 'd'])).toBe(true);
    expect(requiredFilled<F>({ a: '', b: 0, c: false, d: null }, undefined)).toBe(true);
  });
});

describe('useRecords + RecordDialog (Server-Rendering)', () => {
  it('liefert passende Props: zu, Speichern gesperrt, keine Bestätigung offen', async () => {
    const { useRecords } = await import('../src/frontend/ui/useRecords');
    const seen: Array<ReturnType<typeof useRecords<Item, ItemForm>>> = [];
    function Probe() {
      const r = useRecords<Item, ItemForm>({
        endpoint: '/api/items',
        apiBase: '',
        emptyForm: () => ({ name: '', note: '' }),
        toForm: (x) => ({ name: x.name, note: '' }),
        required: ['name'],
        fetchImpl: (async () => json(200, [])) as unknown as typeof fetch,
      });
      seen.push(r);
      return null;
    }
    renderToStaticMarkup(createElement(Probe));
    const r = seen[0];
    expect(r.loading).toBe(true);
    expect(r.dialogProps).toMatchObject({ open: null, mode: 'read', readOnly: false, saving: false, saveDisabled: true, error: '' });
    expect(r.deleteDialogProps).toMatchObject({ open: false, deleting: false, error: '' });
    expect(r.current).toBeNull();
  });
});
