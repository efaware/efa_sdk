import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  appInfoDeclareFromAuth,
  registerAppInfo,
  subscribeConvergeAuth,
  CONVERGE_AUTH_REQUEST,
  DEFAULT_AUTH_REQUEST_DELAYS_MS,
} from '../src/frontend/ipc';

// Korrelation der App-Info über den serviceKey: eine App re-deklariert bei jedem
// CONVERGE_AUTH und taggt die Deklaration mit dem serviceKey, den der Kernel
// sendet — so kann der Kernel Stale (vorher offene App) von der aktuellen App
// unterscheiden.

describe('appInfoDeclareFromAuth', () => {
  const info = { appName: 'Converge Wetter', version: '1.2.3' };

  it('baut die DECLARE-Nachricht mit serviceKey aus CONVERGE_AUTH', () => {
    expect(appInfoDeclareFromAuth(info, { type: 'CONVERGE_AUTH', serviceKey: 'converge_weather' })).toEqual({
      type: 'CONVERGE_DECLARE_APP_INFO',
      payload: { appName: 'Converge Wetter', version: '1.2.3', serviceKey: 'converge_weather' },
    });
  });

  it('ignoriert Nicht-Auth-Nachrichten', () => {
    expect(appInfoDeclareFromAuth(info, { type: 'CONVERGE_ROUTE_CHANGED', serviceKey: 'x' })).toBeNull();
  });

  it('ignoriert Auth ohne string-serviceKey', () => {
    expect(appInfoDeclareFromAuth(info, { type: 'CONVERGE_AUTH' })).toBeNull();
    expect(appInfoDeclareFromAuth(info, { type: 'CONVERGE_AUTH', serviceKey: 42 })).toBeNull();
    expect(appInfoDeclareFromAuth(info, null)).toBeNull();
  });
});

describe('registerAppInfo', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubEmbeddedWindow() {
    const parent = { postMessage: vi.fn() };
    let handler: ((e: any) => void) | null = null;
    const win: any = {
      parent,
      location: { origin: 'https://app.example', ancestorOrigins: { 0: 'https://kernel.example', length: 1 } },
      addEventListener: vi.fn((type: string, h: any) => {
        if (type === 'message') handler = h;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('window', win);
    return { win, parent, getHandler: () => handler };
  }

  it('re-deklariert mit serviceKey bei CONVERGE_AUTH vom Parent', () => {
    const { parent, getHandler } = stubEmbeddedWindow();
    registerAppInfo({ appName: 'Converge Wetter', version: '1.2.3' });
    getHandler()!({ source: parent, data: { type: 'CONVERGE_AUTH', serviceKey: 'converge_weather' } });
    expect(parent.postMessage).toHaveBeenCalledWith(
      {
        type: 'CONVERGE_DECLARE_APP_INFO',
        payload: { appName: 'Converge Wetter', version: '1.2.3', serviceKey: 'converge_weather' },
      },
      'https://kernel.example',
    );
  });

  it('ignoriert Nachrichten, die nicht vom Platform-Parent stammen', () => {
    const { parent, getHandler } = stubEmbeddedWindow();
    registerAppInfo({ appName: 'Converge Wetter', version: '1.2.3' });
    getHandler()!({ source: { fake: true }, data: { type: 'CONVERGE_AUTH', serviceKey: 'converge_weather' } });
    expect(parent.postMessage).not.toHaveBeenCalled();
  });

  it('Unsubscribe entfernt den Listener', () => {
    const { win, getHandler } = stubEmbeddedWindow();
    const unsub = registerAppInfo({ appName: 'Converge Wetter', version: '1.2.3' });
    unsub();
    expect(win.removeEventListener).toHaveBeenCalledWith('message', getHandler());
  });

  it('ist ein No-op, wenn die App nicht eingebettet ist', () => {
    const self: any = { location: { origin: 'https://app.example' }, addEventListener: vi.fn() };
    self.parent = self; // parent === window → nicht eingebettet
    vi.stubGlobal('window', self);
    const unsub = registerAppInfo({ appName: 'Converge Wetter', version: '1.2.3' });
    expect(self.addEventListener).not.toHaveBeenCalled();
    expect(typeof unsub).toBe('function');
  });
});

// Auth-Handshake: die App fragt das Token aktiv an, statt auf das Zeitfenster
// des Kernel-Pushes (0/250/800 ms + onLoad) angewiesen zu sein.
describe('subscribeConvergeAuth', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function stubEmbeddedWindow() {
    const parent = { postMessage: vi.fn() };
    let handler: ((e: any) => void) | null = null;
    const win: any = {
      parent,
      location: { origin: 'https://kernel.example', ancestorOrigins: { 0: 'https://kernel.example', length: 1 } },
      addEventListener: vi.fn((type: string, h: any) => {
        if (type === 'message') handler = h;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('window', win);
    const auth = (extra: Record<string, unknown> = {}) =>
      handler!({ source: parent, data: { type: 'CONVERGE_AUTH', token: 't1', serviceKey: 'converge_chat', ...extra } });
    const requests = () =>
      parent.postMessage.mock.calls.filter(([m]: any[]) => m?.type === CONVERGE_AUTH_REQUEST).length;
    return { win, parent, auth, requests, getHandler: () => handler };
  }

  /** Lässt die Promise-Kette eines onAuth-Aufrufs durchlaufen. */
  const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

  it('registriert den Listener VOR der ersten Anfrage und fragt sofort an', () => {
    vi.useFakeTimers();
    const { win, parent } = stubEmbeddedWindow();
    subscribeConvergeAuth({ onAuth: vi.fn(async () => true) });
    expect(win.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    const listenerOrder = win.addEventListener.mock.invocationCallOrder[0];
    const requestOrder = parent.postMessage.mock.invocationCallOrder[0];
    expect(listenerOrder).toBeLessThan(requestOrder);
    expect(parent.postMessage).toHaveBeenCalledWith({ type: CONVERGE_AUTH_REQUEST }, 'https://kernel.example');
  });

  it('wiederholt die Anfrage mit Backoff, solange kein Token kommt', () => {
    vi.useFakeTimers();
    const { requests } = stubEmbeddedWindow();
    subscribeConvergeAuth({ onAuth: vi.fn(async () => true) });
    vi.advanceTimersByTime(60_000);
    expect(requests()).toBe(DEFAULT_AUTH_REQUEST_DELAYS_MS.length);
  });

  it('hört nach gelungenem Exchange auf zu fragen und ignoriert weitere Tokens', async () => {
    vi.useFakeTimers();
    const onAuth = vi.fn(async () => true);
    const { auth, requests } = stubEmbeddedWindow();
    subscribeConvergeAuth({ onAuth });
    auth();
    await flush();
    const before = requests();
    vi.advanceTimersByTime(60_000);
    auth();
    await flush();
    expect(requests()).toBe(before);
    expect(onAuth).toHaveBeenCalledTimes(1);
    expect(onAuth).toHaveBeenCalledWith(expect.objectContaining({ token: 't1', serviceKey: 'converge_chat' }));
  });

  it('ignoriert Nachrichten, die nicht vom Platform-Parent stammen', async () => {
    const onAuth = vi.fn(async () => true);
    const { getHandler } = stubEmbeddedWindow();
    subscribeConvergeAuth({ onAuth });
    getHandler()!({ source: { fake: true }, data: { type: 'CONVERGE_AUTH', token: 'evil' } });
    await flush();
    expect(onAuth).not.toHaveBeenCalled();
  });

  it('ignoriert CONVERGE_AUTH ohne Token', async () => {
    const onAuth = vi.fn(async () => true);
    const { parent, getHandler } = stubEmbeddedWindow();
    subscribeConvergeAuth({ onAuth });
    getHandler()!({ source: parent, data: { type: 'CONVERGE_AUTH' } });
    getHandler()!({ source: parent, data: { type: 'CONVERGE_AUTH', token: '' } });
    await flush();
    expect(onAuth).not.toHaveBeenCalled();
  });

  it('merkt sich ein Token während eines laufenden Exchange und holt es bei Fehlschlag nach', async () => {
    let resolveFirst!: (ok: boolean) => void;
    const onAuth = vi
      .fn<(m: any) => Promise<boolean>>()
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockImplementationOnce(async () => true);
    const { auth } = stubEmbeddedWindow();
    subscribeConvergeAuth({ onAuth });
    auth({ token: 't1' });
    auth({ token: 't2' }); // läuft → nur gemerkt
    expect(onAuth).toHaveBeenCalledTimes(1);
    resolveFirst(false);
    await flush();
    expect(onAuth).toHaveBeenCalledTimes(2);
    expect(onAuth.mock.calls[1][0]).toMatchObject({ token: 't2' });
  });

  it('verwirft das gemerkte Token, wenn der laufende Exchange gelingt', async () => {
    let resolveFirst!: (ok: boolean) => void;
    const onAuth = vi.fn<(m: any) => Promise<boolean>>(() => new Promise((r) => { resolveFirst = r; }));
    const { auth } = stubEmbeddedWindow();
    subscribeConvergeAuth({ onAuth });
    auth({ token: 't1' });
    auth({ token: 't2' });
    resolveFirst(true);
    await flush();
    expect(onAuth).toHaveBeenCalledTimes(1);
  });

  it('gibt nach gescheitertem Exchange der nächsten Nachricht eine Chance (auch bei Exception)', async () => {
    const onAuth = vi
      .fn<(m: any) => Promise<boolean>>()
      .mockImplementationOnce(async () => { throw new Error('boom'); })
      .mockImplementationOnce(async () => true);
    const { auth } = stubEmbeddedWindow();
    subscribeConvergeAuth({ onAuth });
    auth();
    await flush();
    auth();
    await flush();
    expect(onAuth).toHaveBeenCalledTimes(2);
  });

  it('fragt nach einem gescheiterten Exchange nicht weiter an (kein Exchange-Sturm bei 401/503)', async () => {
    vi.useFakeTimers();
    const onAuth = vi.fn(async () => false);
    const { auth, requests } = stubEmbeddedWindow();
    subscribeConvergeAuth({ onAuth });
    auth();
    await flush();
    const before = requests();
    vi.advanceTimersByTime(60_000);
    expect(requests()).toBe(before);
    expect(onAuth).toHaveBeenCalledTimes(1);
  });

  it('fragt während eines laufenden Exchange nicht erneut an', async () => {
    vi.useFakeTimers();
    const onAuth = vi.fn<(m: any) => Promise<boolean>>(() => new Promise(() => {}));
    const { auth, requests } = stubEmbeddedWindow();
    subscribeConvergeAuth({ onAuth });
    auth();
    const before = requests();
    vi.advanceTimersByTime(60_000);
    expect(requests()).toBe(before);
  });

  it('meldet einen Timeout genau einmal, wenn gar kein Token kommt', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    stubEmbeddedWindow();
    subscribeConvergeAuth({ onAuth: vi.fn(async () => true), onTimeout, timeoutMs: 5_000 });
    vi.advanceTimersByTime(4_999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('meldet keinen Timeout, wenn ein Token kam — auch wenn der Exchange scheiterte', async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const { auth } = stubEmbeddedWindow();
    subscribeConvergeAuth({ onAuth: vi.fn(async () => false), onTimeout, timeoutMs: 5_000 });
    auth();
    await flush();
    vi.advanceTimersByTime(60_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('Unsubscribe entfernt Listener, stoppt Anfragen und Timeout', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const { win, requests, getHandler } = stubEmbeddedWindow();
    const unsub = subscribeConvergeAuth({ onAuth: vi.fn(async () => true), onTimeout });
    const before = requests();
    unsub();
    vi.advanceTimersByTime(60_000);
    expect(requests()).toBe(before);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(win.removeEventListener).toHaveBeenCalledWith('message', getHandler());
  });

  it('ist ein No-op, wenn die App nicht eingebettet ist', () => {
    const self: any = { location: { origin: 'https://app.example' }, addEventListener: vi.fn(), postMessage: vi.fn() };
    self.parent = self;
    vi.stubGlobal('window', self);
    const unsub = subscribeConvergeAuth({ onAuth: vi.fn(async () => true) });
    expect(self.addEventListener).not.toHaveBeenCalled();
    expect(self.postMessage).not.toHaveBeenCalled();
    expect(typeof unsub).toBe('function');
  });
});
