/**
 * ipc.ts – postMessage helpers for communication with the Converge parent frame.
 *
 * Converge listens for these messages from embedded apps and reacts accordingly.
 * All functions are no-ops when the app is not embedded in an iframe.
 *
 * Usage:
 *   import { sendAtStart } from '../../template-core/ipc';
 *
 *   // Call when the user navigates to the app's root/start state.
 *   // Converge will show the "back to dashboard" button and reset history.
 *   sendAtStart();
 */

/** Returns true when the app is running inside a Converge iframe. */
function isEmbedded(): boolean {
  try {
    return window.parent !== window;
  } catch {
    return false;
  }
}

/**
 * Signals to Converge that the app has returned to its start/root state.
 * Converge responds by navigating back to the dashboard and resetting its history.
 *
 * Call this whenever the user navigates back to the app's top-level view,
 * e.g. on a back-button handler that reaches the root route.
 */
/**
 * Returns the parent Converge origin for secure postMessage communication.
 * Never returns '*': falls back to the app's own origin if the parent origin
 * cannot be determined (e.g. Firefox has no `ancestorOrigins`). A mismatch then
 * makes the browser silently drop the message — which is the safe failure mode,
 * versus broadcasting to an arbitrary embedder with '*'.
 */
export function getParentOrigin(): string {
  try {
    return window.location.ancestorOrigins?.[0] ?? window.location.origin;
  } catch {
    return window.location.origin;
  }
}

/**
 * Guard for INBOUND postMessage handlers: true only when the message came from
 * the frame that directly embedded us (the Converge kernel).
 *
 * Every `window.addEventListener('message', …)` handler that acts on Converge
 * messages (CONVERGE_AUTH, CONVERGE_GO_BACK, CONVERGE_WIDGET_REFRESH, …) MUST
 * gate on this. Without it, any sibling iframe (e.g. an ad frame) or a
 * `window.opener` on the page can forge those messages — including CONVERGE_AUTH,
 * which carries the login token (session-fixation vector).
 *
 * Note: this stops sibling/opener injection. It does NOT by itself stop a
 * malicious *top-level* page from embedding the app and posting as the parent —
 * that is closed separately by a `frame-ancestors` CSP / X-Frame-Options on the
 * app's own responses (server/nginx layer), not here.
 */
export function isFromPlatformParent(event: MessageEvent): boolean {
  return event.source === window.parent;
}

export function sendAtStart(): void {
  if (!isEmbedded()) return;
  window.parent.postMessage({ type: 'CONVERGE_AT_START' }, getParentOrigin());
}

/**
 * @deprecated Use `registerAppInfo` instead. This fires exactly once and carries
 * no `serviceKey`, so the kernel cannot tell it apart from a stale declaration of
 * a previously open app (all apps share one origin). The kernel ignores payloads
 * without a matching `serviceKey`, so this call no longer sets the header version.
 *
 * Declares the app's identity to Converge so it can be shown in the kernel help modal.
 */
export function sendDeclareAppInfo(payload: { appName: string; version: string }): void {
  if (!isEmbedded()) return;
  window.parent.postMessage(
    { type: 'CONVERGE_DECLARE_APP_INFO', payload },
    getParentOrigin(),
  );
}

/**
 * Builds the outbound CONVERGE_DECLARE_APP_INFO message from an inbound
 * CONVERGE_AUTH message's data, tagging it with the `serviceKey` the kernel sent.
 * Returns null when the data is not a CONVERGE_AUTH carrying a string serviceKey.
 *
 * Pure (no DOM access) so the correlation logic is unit-testable. The kernel
 * accepts the declaration only when this `serviceKey` matches the currently
 * framed tile — which is why re-declaring on every auth (not once at mount) keeps
 * the header correct across app switches, back/forward and bfcache restores.
 */
export function appInfoDeclareFromAuth(
  info: { appName: string; version: string },
  data: unknown,
): { type: 'CONVERGE_DECLARE_APP_INFO'; payload: { appName: string; version: string; serviceKey: string } } | null {
  const d = data as { type?: unknown; serviceKey?: unknown } | null;
  if (!d || d.type !== 'CONVERGE_AUTH' || typeof d.serviceKey !== 'string') return null;
  return {
    type: 'CONVERGE_DECLARE_APP_INFO',
    payload: { appName: info.appName, version: info.version, serviceKey: d.serviceKey },
  };
}

/**
 * Registers the app's identity with Converge and keeps it in sync.
 *
 * Call once at app start with the human-readable app name and current build
 * version. It listens for CONVERGE_AUTH from the platform parent and, on every
 * such message, re-declares the app info tagged with the `serviceKey` the kernel
 * sent. Because the kernel re-sends CONVERGE_AUTH on every open (and after
 * back/forward / bfcache restore), the header always reflects the app that is
 * actually framed — never a previously opened one.
 *
 * Returns an unsubscribe function; return it from a mount effect for cleanup.
 * No-op (returns a no-op unsubscribe) when the app is not embedded.
 */
export function registerAppInfo(info: { appName: string; version: string }): () => void {
  if (!isEmbedded()) return () => {};
  const handler = (event: MessageEvent) => {
    if (!isFromPlatformParent(event)) return;
    const message = appInfoDeclareFromAuth(info, event.data);
    if (message) window.parent.postMessage(message, getParentOrigin());
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

/**
 * Asks the Converge kernel to open ANOTHER app (by service_key) in the shell.
 * The kernel opens the target tile — or, if the user does not have it visible,
 * a virtual tile (`/apps/{serviceKey}/`). Access control is preserved: the
 * target app enforces its own permission gates server-side.
 *
 * Example: navigateToApp('converge_textbausteine')
 */
export function navigateToApp(serviceKey: string, options?: { path?: string }): void {
  if (!isEmbedded()) return;
  window.parent.postMessage(
    { type: 'CONVERGE_NAVIGATE_TO_APP', payload: { serviceKey, path: options?.path } },
    getParentOrigin(),
  );
}

/**
 * Notifies the Converge kernel that the embedded app's inner route changed, so
 * the kernel keeps its address-bar URL in sync — enabling shareable deep-links
 * (`#/app/<serviceKey>/<innerPath>`). No-op when not embedded.
 *
 * Call from a router location effect, e.g. with react-router:
 *   const location = useLocation();
 *   useEffect(() => { notifyRouteChange(location.pathname); }, [location.pathname]);
 */
export function notifyRouteChange(path: string): void {
  if (!isEmbedded()) return;
  window.parent.postMessage({ type: 'CONVERGE_ROUTE_CHANGED', path }, getParentOrigin());
}

// ─── Auth-Handshake (CONVERGE_AUTH_REQUEST → CONVERGE_AUTH) ─────────────────

/** Kernel → App: Login-Token + Kontext für den Exchange. */
export const CONVERGE_AUTH = 'CONVERGE_AUTH';

/**
 * App → Kernel: „Ich höre zu, bitte schick das Token." Trägt bewusst keine
 * Felder — der Kernel beantwortet die Anfrage ausschließlich anhand des Frames,
 * aus dem sie kam (`event.source`), und nimmt `serviceKey` aus seinem eigenen
 * Zustand, nie aus der Nachricht.
 */
export const CONVERGE_AUTH_REQUEST = 'CONVERGE_AUTH_REQUEST';

/** Nutzlast von `CONVERGE_AUTH`. `theme` bleibt generisch, jede App typisiert es selbst. */
export interface ConvergeAuthMessage<TTheme = unknown> {
  type: typeof CONVERGE_AUTH;
  token: string;
  serviceKey?: string;
  language?: string;
  theme?: TTheme;
  /** Kernel-Side-Panel-Hinweis (Chat). */
  embed?: boolean;
}

export interface SubscribeConvergeAuthOptions<TTheme = unknown> {
  /**
   * Führt den Token-Exchange aus. `true` = gelungen (weitere `CONVERGE_AUTH`
   * werden ab dann ignoriert), `false` = gescheitert (die nächste Nachricht
   * bekommt eine neue Chance).
   */
  onAuth: (message: ConvergeAuthMessage<TTheme>) => Promise<boolean>;
  /** Kam innerhalb von `timeoutMs` gar kein `CONVERGE_AUTH` an. Feuert höchstens einmal. */
  onTimeout?: () => void;
  /** Zeitpunkte (ms ab Aufruf), zu denen die Anfrage gesendet wird. */
  requestDelaysMs?: readonly number[];
  /** Frist bis `onTimeout`. */
  timeoutMs?: number;
}

export const DEFAULT_AUTH_REQUEST_DELAYS_MS: readonly number[] = [0, 500, 1_000, 2_000, 4_000, 8_000];
export const DEFAULT_AUTH_TIMEOUT_MS = 15_000;

function isAuthMessage(data: unknown): data is ConvergeAuthMessage {
  const d = data as { type?: unknown; token?: unknown } | null;
  return !!d && d.type === CONVERGE_AUTH && typeof d.token === 'string' && d.token !== '';
}

/**
 * Empfängt das Login-Token vom Kernel und stößt den Exchange an.
 *
 * Warum eine Anfrage statt nur zu warten: Der Kernel pusht `CONVERGE_AUTH` in ein
 * festes Zeitfenster (0/250/800 ms + iframe-`onLoad`). Das `onLoad` kommt fast
 * immer VOR dem React-Mount (createRoot rendert asynchron), und braucht die App
 * länger als ~800 ms bis zum Mount — kalter Cache, langsame Leitung —, gingen alle
 * Nachrichten verloren: Dauer-Spinner, bis der Nutzer neu lädt. Deshalb meldet die
 * App sich hier selbst, SOBALD ihr Listener steht, und wiederholt die Anfrage mit
 * Backoff, bis ein Token kommt. Ein Kernel ohne Unterstützung ignoriert die Anfrage;
 * der Push wirkt dann wie bisher.
 *
 * Riegel (aus efa #236 übernommen):
 *   authenticated — ein Exchange ist gelungen; alles Weitere wird ignoriert.
 *   inFlight      — ein Exchange läuft; eintreffende Nachrichten nur merken.
 *   queued        — die zuletzt gemerkte Nachricht; wird nachgeholt, wenn der
 *                   laufende Exchange scheitert.
 *
 * Nicht eingebettet → No-op; den Dev-Modus behandelt die App selbst.
 *
 * @returns Unsubscribe (Listener + Timer weg) — aus dem Mount-Effect zurückgeben.
 */
export function subscribeConvergeAuth<TTheme = unknown>(
  options: SubscribeConvergeAuthOptions<TTheme>,
): () => void {
  if (!isEmbedded()) return () => {};
  const delays = options.requestDelaysMs ?? DEFAULT_AUTH_REQUEST_DELAYS_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_AUTH_TIMEOUT_MS;

  let active = true;
  let received = false;
  let authenticated = false;
  let inFlight = false;
  let queued: ConvergeAuthMessage<TTheme> | null = null;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const clearTimers = (): void => {
    timers.forEach((t) => clearTimeout(t));
    timers.length = 0;
  };

  const start = (message: ConvergeAuthMessage<TTheme>): void => {
    inFlight = true;
    options.onAuth(message).then(
      (ok) => finish(ok),
      () => finish(false),
    );
  };

  const finish = (ok: boolean): void => {
    inFlight = false;
    if (!active) return;
    if (ok) {
      authenticated = true;
      queued = null;
      clearTimers();
      return;
    }
    const next = queued;
    queued = null;
    if (next) start(next);
  };

  const handler = (event: MessageEvent): void => {
    // Herkunft zuerst: das Token nur vom einbettenden Kernel-Frame annehmen.
    if (!isFromPlatformParent(event)) return;
    if (!isAuthMessage(event.data)) return;
    received = true;
    if (authenticated) return;
    const message = event.data as ConvergeAuthMessage<TTheme>;
    if (inFlight) {
      queued = message;
      return;
    }
    start(message);
  };

  const request = (): void => {
    // Die Anfrage soll nur das Token zustellen. Ist eins angekommen, ist ihr Job
    // erledigt — auch wenn der Exchange scheitert: sonst provozierte jeder
    // weitere Termin einen neuen Exchange (bei 401/503 bis zu sechs). Einen
    // gescheiterten Versuch holen Push und `queued` nach, wie bisher (efa #236).
    if (!active || received) return;
    window.parent.postMessage({ type: CONVERGE_AUTH_REQUEST }, getParentOrigin());
  };

  // Listener VOR der ersten Anfrage, sonst könnte die Antwort ihn überholen.
  window.addEventListener('message', handler);
  for (const ms of delays) {
    if (ms <= 0) request();
    else timers.push(setTimeout(request, ms));
  }
  timers.push(
    setTimeout(() => {
      if (active && !received) options.onTimeout?.();
    }, timeoutMs),
  );

  return () => {
    active = false;
    clearTimers();
    window.removeEventListener('message', handler);
  };
}
