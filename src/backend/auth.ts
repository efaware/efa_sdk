import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { getUserPermissions } from './permissionClient';
import { getSessionStatus } from './sessionStatusClient';
import { isPlatformAdmin, isPlatformAdminPermission } from './platformAdmin';
import {
  assertProvenanceOptions,
  verifyServiceProvenance,
  SERVICE_KEY_RE,
  type ProvenanceGuardOptions,
} from './serviceProvenance';

export type { ProvenanceGuardOptions } from './serviceProvenance';

// Plattformweite JWT-Claims (Finding #9). Muss identisch zum Kernel
// (`backend/src/jwtClaims.ts`) sein — dort signiert, hier verifiziert. Bewusst
// ein fixer String (kein Env), damit Signierer und Prüfer nicht auseinanderdriften.
const JWT_ISSUER = 'converge';
const JWT_AUDIENCE = 'converge';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string;             // Converge user UUID
  name: string;            // Eindeutiger Username (ZBV: users.name UNIQUE NOT NULL)
  email: string | null;
  language?: string;
  tenant: string;
  iat: number;
  exp: number;
  forcePasswordChange?: boolean;
  /** Token-ID. Jedes Kernel-Token trägt eine; Grundlage der Sitzungs-Entwertung. */
  jti?: string;
}

export interface SessionPayload {
  sub: string;        // app_users.id (UUID)
  convergeId: string; // app_users.converge_id (= JwtPayload.sub)
  name: string;       // Eindeutiger Username
  email: string | null;
  language?: string;
  tenant: string;
  /**
   * `jti` des eingetauschten Kernel-Tokens (seit 1.17.0, efa-Task #137).
   * `requireAuth` fragt damit bei jedem Request den Live-Status der
   * Kernel-Sitzung ab. Eine Sitzung ohne dieses Feld stammt von einem älteren
   * SDK und wird mit 401 abgewiesen.
   *
   * Optional getypt, obwohl jede vom Exchange ausgestellte Sitzung beide Felder
   * trägt: Apps bauen `SessionPayload` auch selbst — für Service-Aufrufe (z. B.
   * efa-ai `middleware/serviceAuth.ts`) und in Test-Factories. Pflichtfelder
   * hätten dort jeden Bump auf 1.17 zum Compile-Fehler gemacht. Durchgesetzt
   * wird zur Laufzeit in `requireAuth`.
   */
  kernelJti?: string;
  /** `iat` des eingetauschten Kernel-Tokens in Sekunden (seit 1.17.0). */
  kernelIat?: number;
}

/** Format-Grenzen wie im Kernel-Endpoint `GET /api/internal/sessions/:jti/status`. */
const KERNEL_JTI_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const KERNEL_SUB_RE = /^[A-Za-z0-9._:@-]{1,128}$/;

export interface AuthRequest extends Request {
  user?: SessionPayload;
  /**
   * Aufrufender Service (`sub` des verifizierten Provenance-Tokens, seit 1.23).
   * Gesetzt von `requireRegistryKey` und den `requireInternalOr*`-Guards, wenn
   * der Request über den Gateway von einem Service kam; sonst `undefined`.
   */
  callerService?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getPlatformPublicKey(): string {
  const s = process.env.JWT_PUBLIC_KEY;
  if (!s) throw new Error('JWT_PUBLIC_KEY environment variable is required');
  return Buffer.from(s, 'base64').toString('utf8');
}

function getSessionSecret(): string {
  const s = process.env.APP_SESSION_SECRET;
  if (!s) throw new Error('APP_SESSION_SECRET environment variable is required');
  return s;
}

/** Mindestlänge des `APP_SESSION_SECRET` in Byte (HS256-Schlüssel = Hash-Breite). */
export const APP_SESSION_SECRET_MIN_BYTES = 32;

/**
 * Bekannte Platzhalter aus `.env.example`-Dateien. Wer einen davon als Secret
 * fährt, signiert seine Sitzungen mit einem öffentlich bekannten Schlüssel.
 */
const SESSION_SECRET_PLACEHOLDER_PREFIXES = ['changeme', 'change-me', 'change_me', 'please_change', 'replace_me', 'your-'];
const SESSION_SECRET_PLACEHOLDERS = new Set(['secret', 'password', 'test', 'dev', 'development', 'app_session_secret']);

function isTruthyEnv(value: string | undefined): boolean {
  return !!value && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export type SessionSecretVerdict =
  | { ok: true }
  | { ok: false; level: 'error' | 'warn'; reason: 'missing' | 'placeholder' | 'too_short'; message: string };

/**
 * Prüft `APP_SESSION_SECRET` (efa #290). Rein, ohne Seiteneffekte.
 *
 * Das Secret ist die einzige Schranke gegen gefälschte App-Sitzungen: der
 * Sitzungsstatus beim Kernel kennt nur `jti`s, die es gibt, und eine
 * erfundene `jti` gilt dort als aktiv. Deshalb:
 *
 *  - fehlt → Fehler (wie bisher, nur jetzt beim Start statt beim ersten Request),
 *  - bekannter Platzhalter → Fehler; eine efaTech-Instanz hat nie einen, der
 *    Deployer erzeugt das Secret selbst (`randomSecret(32)`),
 *  - kürzer als 32 Byte → **Warnung** ab Werk, Fehler mit
 *    `APP_SESSION_SECRET_STRICT=true`. Bestandsinstanzen mit einem kurzen, aber
 *    geheimen Wert sollen durch ein SDK-Minor nicht ausfallen; das Template
 *    setzt den Schalter für neue Apps, ein späterer Major macht ihn zur Vorgabe.
 */
export function checkSessionSecret(secret: string | undefined): SessionSecretVerdict {
  if (!secret) {
    return { ok: false, level: 'error', reason: 'missing', message: 'APP_SESSION_SECRET ist nicht gesetzt. Erzeugen mit: openssl rand -hex 32' };
  }
  const lower = secret.trim().toLowerCase();
  if (SESSION_SECRET_PLACEHOLDERS.has(lower) || SESSION_SECRET_PLACEHOLDER_PREFIXES.some((p) => lower.startsWith(p))) {
    return {
      ok: false,
      level: 'error',
      reason: 'placeholder',
      message: 'APP_SESSION_SECRET ist ein Platzhalter aus einer Beispiel-Konfiguration. Echten Wert setzen: openssl rand -hex 32',
    };
  }
  const bytes = Buffer.byteLength(secret, 'utf8');
  if (bytes < APP_SESSION_SECRET_MIN_BYTES) {
    return {
      ok: false,
      level: isTruthyEnv(process.env.APP_SESSION_SECRET_STRICT) ? 'error' : 'warn',
      reason: 'too_short',
      message: `APP_SESSION_SECRET ist ${bytes} Byte lang, verlangt sind mindestens ${APP_SESSION_SECRET_MIN_BYTES}. Neu erzeugen mit: openssl rand -hex 32`,
    };
  }
  return { ok: true };
}

/**
 * Bricht den Start ab, wenn `APP_SESSION_SECRET` fehlt, ein Platzhalter ist oder
 * (im Strengmodus) zu kurz ist; warnt sonst bei einem zu kurzen Wert.
 * `createExchangeRouter` ruft das beim Aufbau der Routen auf — jede App, die den
 * Exchange mountet, ist damit abgedeckt.
 */
export function assertSessionSecret(): void {
  const verdict = checkSessionSecret(process.env.APP_SESSION_SECRET);
  if (verdict.ok) return;
  if (verdict.level === 'error') throw new Error(verdict.message);
  console.warn(JSON.stringify({ level: 'warn', msg: verdict.message, reason: verdict.reason }));
}

function getCookieName(): string {
  return process.env.APP_SESSION_COOKIE_NAME || 'app_session';
}

/**
 * Pfad des Sitzungs-Cookies (efa #286).
 *
 * Alle Apps liegen unter derselben Origin (`/apps/<serviceKey>/` hinter dem
 * Gateway). Mit `path=/` schickt der Browser das Cookie jeder App an **jede**
 * App — eine fremde App sieht damit die Sitzungen aller anderen, und Apps mit dem
 * generischen Namen `app_session` überschreiben sich gegenseitig. Seit 1.23 liegt
 * das Cookie deshalb auf dem eigenen Präfix:
 *
 *  1. `APP_SESSION_COOKIE_PATH`, wenn gesetzt (muss mit `/` beginnen),
 *  2. `/` bei `ENVIRONMENT=development` — lokaler Betrieb ohne Gateway
 *     (Vite-Proxy auf `/api`, `/dev/token`), dort gibt es kein Präfix,
 *  3. `/apps/<SERVICE_KEY>/`,
 *  4. `/`, wenn `SERVICE_KEY` fehlt oder kein gültiger Service-Key ist.
 *
 * Die App-Backends selbst sehen den Präfix nicht (der Gateway schreibt ihn weg);
 * das ändert nichts, der Pfad wirkt nur im Browser. Der Gateway-Sitzungs-Tausch
 * liest nur `name=wert` aus dem `Set-Cookie` und ist vom Pfad unberührt.
 */
export function getSessionCookiePath(): string {
  const explicit = process.env.APP_SESSION_COOKIE_PATH?.trim();
  if (explicit) return explicit;
  if (process.env.ENVIRONMENT === 'development') return '/';
  const serviceKey = process.env.SERVICE_KEY;
  if (serviceKey && SERVICE_KEY_RE.test(serviceKey)) return `/apps/${serviceKey}/`;
  return '/';
}

function assertSessionCookiePath(): void {
  const path = getSessionCookiePath();
  // `;`/`,`/Leerraum würden das Set-Cookie-Attribut aufbrechen.
  if (!path.startsWith('/') || /[;,\s]/.test(path)) {
    throw new Error(`APP_SESSION_COOKIE_PATH ungültig: ${JSON.stringify(path)} (muss mit / beginnen, ohne ; , oder Leerzeichen)`);
  }
}

function isSecureCookie(): boolean {
  // secure-Flag (Finding #7): explizites COOKIE_SECURE gewinnt, sonst automatisch
  // in Produktion an. Verhindert, dass der app_session-Cookie in Prod über HTTP
  // ausgeliefert wird, wenn COOKIE_SECURE vergessen wurde.
  return process.env.COOKIE_SECURE
    ? ['1', 'true', 'yes', 'on'].includes(process.env.COOKIE_SECURE.toLowerCase())
    : process.env.NODE_ENV === 'production';
}

function setSessionCookie(res: Response, token: string, maxAgeMs: number): void {
  // sameSite:'lax' blockt Cross-Site-POST-Cookies (CSRF-Grundschutz).
  res.cookie(getCookieName(), token, {
    httpOnly: true,
    sameSite: 'lax',
    // So lange wie das eingetauschte Kernel-Token (efa-Task #137) — nicht mehr
    // pauschal 8 h ab Exchange.
    maxAge: maxAgeMs,
    secure: isSecureCookie(),
    path: getSessionCookiePath(),
  });
}

/**
 * Übergang `path=/` → `path=/apps/<key>/` (seit 1.23): ein vor dem Update
 * ausgestelltes Cookie liegt noch auf `/`. Es bliebe bis zu seinem Ablauf
 * (höchstens 8 h) neben dem neuen liegen und ginge weiter an jede App. Der
 * Exchange löscht es deshalb aktiv, sobald der Browser eins mitschickt.
 *
 * Zwei gleichnamige Cookies stören die App in der Zwischenzeit nicht: der
 * Browser schickt das mit dem längeren Pfad zuerst (RFC 6265, 5.4), und
 * `cookie-parser` nimmt das erste. Gelöscht wird nach dem Setzen des neuen
 * Cookies, damit es im `Set-Cookie` vorne steht — der Gateway-Tausch liest nur
 * das erste (er schickt aber ohnehin kein Cookie mit, löst das Löschen also nie aus).
 */
function clearLegacySessionCookie(req: Request, res: Response): void {
  if (getSessionCookiePath() === '/') return;
  if (req.cookies?.[getCookieName()] === undefined) return;
  res.clearCookie(getCookieName(), { httpOnly: true, sameSite: 'lax', secure: isSecureCookie(), path: '/' });
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * requireAuth – reads the httpOnly app_session cookie (signed with APP_SESSION_SECRET)
 * and checks the underlying kernel session live (efa-Task #137).
 *
 * Ablauf:
 *   1. HS256-Verify des Cookies (Signatur + eigenes `exp`).
 *   2. Sitzung ohne `kernelJti`/`kernelIat` (ausgestellt von SDK < 1.17) → 401.
 *      Die App bekommt beim nächsten CONVERGE_AUTH (iframe-Neuladen) eine neue.
 *   3. Live-Status beim Kernel (`sessionStatusClient.ts`, Cache 30 s):
 *      entwertet → 401 `Session revoked`; Lookup fehlgeschlagen → 503
 *      `Session service unavailable` (fail-closed, wie `requirePermission`).
 *   4. Erst dann `req.user` setzen und `next()`.
 *
 * Asynchron: `next()` wird erst nach dem Lookup aufgerufen. Die Signatur
 * `(req, res, next)` bleibt, darauf aufbauende Guards rufen `requireAuth` wie
 * bisher im Callback-Stil auf.
 */
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const token: string | undefined = req.cookies?.[getCookieName()];
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  let payload: SessionPayload & { exp?: number };
  try {
    // Algorithmus-Pin (Finding #9): app_session ist HS256 (symmetrisch). Ohne Pin
    // würde jwt.verify jeden im Token deklarierten Algorithmus akzeptieren — inkl.
    // RS/ES-„alg-confusion". Der Cookie wird nur gegen sich selbst validiert.
    payload = jwt.verify(token, getSessionSecret(), { algorithms: ['HS256'] }) as SessionPayload & { exp?: number };
  } catch {
    res.status(401).json({ error: 'Session invalid or expired' });
    return;
  }
  const { kernelJti, kernelIat, exp } = payload;
  if (typeof kernelJti !== 'string' || !kernelJti || typeof kernelIat !== 'number' || typeof exp !== 'number') {
    // Alt-Sitzung (vor SDK 1.17): an keine Kernel-Sitzung gebunden, also nicht
    // entwertbar. Kein Fallback — die App tauscht beim nächsten CONVERGE_AUTH neu.
    res.status(401).json({ error: 'Session invalid or expired' });
    return;
  }
  const verified = payload;
  getSessionStatus({
    convergeId: verified.convergeId,
    jti: kernelJti,
    iat: kernelIat,
    exp,
  }).then(
    (status) => {
      if (!status.active) {
        res.status(401).json({ error: 'Session revoked' });
        return;
      }
      req.user = verified;
      next();
    },
    (err: unknown) => {
      console.error(JSON.stringify({ level: 'error', msg: 'requireAuth: session status lookup failed', err: String(err) }));
      res.status(503).json({ error: 'Session service unavailable' });
    },
  );
}

/**
 * requireAdmin – requireAuth + Live-Lookup gegen converge_access.
 * Erlaubt nur Plattform-Admins: Permission `efa-all` (bzw. im Übergang bis
 * Q1-2027 der Alt-Key `converge-admin`, siehe `platformAdmin.ts`).
 */
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    getUserPermissions(req.user!.convergeId)
      .then((keys) => {
        if (!isPlatformAdmin(keys)) {
          res.status(403).json({ error: 'Admin access required' });
          return;
        }
        next();
      })
      .catch((err) => {
        console.error(JSON.stringify({ level: 'error', msg: 'requireAdmin: permission lookup failed', err: String(err) }));
        res.status(503).json({ error: 'Permission service unavailable' });
      });
  });
}

/**
 * requirePermission – requireAuth + Live-Lookup gegen converge_access.
 * Erlaubt User mit dem angegebenen Permission-Key. `efa-all` ist KEIN Bypass —
 * für Admin-Bypass siehe requireAdminOrPermission.
 *
 * Sonderfall: Wird ausdrücklich die oberste Berechtigung verlangt
 * (`requirePermission('efa-all')` bzw. Alt-Aufrufe mit `'converge-admin'`),
 * gelten beide Keys als gleichwertig — sonst bräche ein Aufruf je nach
 * Kernel-Stand (vor/nach efa_kernel#98 bzw. nach dem Wegfall des Alias).
 * TODO(Q1-2027): entfällt mit dem Alt-Key, siehe `platformAdmin.ts`.
 */
export function requirePermission(permission: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    requireAuth(req, res, () => {
      getUserPermissions(req.user!.convergeId)
        .then((keys) => {
          const granted = isPlatformAdminPermission(permission)
            ? isPlatformAdmin(keys)
            : keys.includes(permission);
          if (!granted) {
            res.status(403).json({ error: `Permission required: ${permission}` });
            return;
          }
          next();
        })
        .catch((err) => {
          console.error(JSON.stringify({ level: 'error', msg: 'requirePermission: permission lookup failed', err: String(err) }));
          res.status(503).json({ error: 'Permission service unavailable' });
        });
    });
  };
}

/**
 * requireAdminOrPermission – akzeptiert Plattform-Admins (Permission `efa-all`,
 * im Übergang auch `converge-admin`, siehe `platformAdmin.ts`)
 * ODER User mit mindestens einem der angegebenen Permission-Keys.
 * Standard-Middleware für App-Routen — Admins kommen überall durch.
 */
export function requireAdminOrPermission(...permissionKeys: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    requireAuth(req, res, () => {
      getUserPermissions(req.user!.convergeId)
        .then((keys) => {
          if (isPlatformAdmin(keys)) {
            next();
            return;
          }
          if (permissionKeys.some((k) => keys.includes(k))) {
            next();
            return;
          }
          res.status(403).json({ error: 'Forbidden – missing permission' });
        })
        .catch((err) => {
          console.error(JSON.stringify({ level: 'error', msg: 'requireAdminOrPermission: permission lookup failed', err: String(err) }));
          res.status(503).json({ error: 'Permission service unavailable' });
        });
    });
  };
}

// ─── Service-zu-Service (Gateway-Provenance) ─────────────────────────────────
//
// Der Converge-Gateway mintet nach erfolgreicher Caller-Auth ein kurzlebiges
// RS256-Token (`X-Service-Token`), das kryptografisch beweist, dass der Request
// durch den Gateway von einem authentifizierten Service kam. Prüfung und
// Replay-Schutz: `serviceProvenance.ts`. Ersetzt den vormals geteilten
// REGISTRY_API_KEY-String-Vergleich.

type Guard = (req: AuthRequest, res: Response, next: NextFunction) => void;

function isMiddlewareCall(res: unknown, next: unknown): res is Response {
  return res !== undefined && typeof next === 'function';
}

function rejectProvenance(res: Response, result: ReturnType<typeof verifyServiceProvenance>): void {
  if (!result.ok && result.reason === 'caller_not_allowed') {
    res.status(403).json({ error: 'Service caller not allowed' });
    return;
  }
  res.status(401).json({ error: 'Service provenance token required' });
}

function registryKeyGuard(options: ProvenanceGuardOptions): Guard {
  return (req, res, next) => {
    const result = verifyServiceProvenance(req, options);
    if (result.ok) {
      next();
      return;
    }
    rejectProvenance(res, result);
  };
}

/**
 * requireRegistryKey – Service-zu-Service-Auth.
 * Schützt /api/internal/*-Endpunkte. Nur Aufrufe mit gültigem
 * Gateway-Provenance-Token (`X-Service-Token`) für diesen Service passieren;
 * der Aufrufer steht danach in `req.callerService`.
 *
 * Zwei Formen:
 *   router.use(requireRegistryKey);                                   // jeder Service
 *   router.use(requireRegistryKey({ allowedCallers: ['converge_chat'] })); // nur diese
 *
 * Ein Aufrufer außerhalb von `allowedCallers` bekommt 403, ein fehlendes,
 * ungültiges, zu altes oder schon verwendetes Token 401.
 */
export function requireRegistryKey(options: ProvenanceGuardOptions): Guard;
export function requireRegistryKey(req: Request, res: Response, next: NextFunction): void;
export function requireRegistryKey(
  reqOrOptions: Request | ProvenanceGuardOptions,
  res?: Response,
  next?: NextFunction,
): Guard | void {
  if (isMiddlewareCall(res, next)) {
    registryKeyGuard({})(reqOrOptions as AuthRequest, res, next as NextFunction);
    return;
  }
  const options = (reqOrOptions ?? {}) as ProvenanceGuardOptions;
  assertProvenanceOptions(options);
  return registryKeyGuard(options);
}

function internalOrAuthGuard(options: ProvenanceGuardOptions): Guard {
  return (req, res, next) => {
    if (verifyServiceProvenance(req, options).ok) {
      next();
      return;
    }
    // Kein (zulässiger) Service-Aufruf: als Benutzer-Request behandeln. Das
    // deckt auch delegierte Aufrufe ab, bei denen der Gateway zusätzlich ein
    // eingetauschtes app_session-Cookie mitschickt — der Benutzer muss dann
    // die Route selbst dürfen.
    requireAuth(req, res, next);
  };
}

/**
 * requireInternalOrAuth – akzeptiert ein gültiges Gateway-Provenance-Token
 * (Service-to-Service) ODER ein gültiges App-Session-JWT.
 *
 * Mit `{ allowedCallers }` zählt der Service-Weg nur für diese Aufrufer; jeder
 * andere Request braucht eine Benutzer-Sitzung.
 */
export function requireInternalOrAuth(options: ProvenanceGuardOptions): Guard;
export function requireInternalOrAuth(req: AuthRequest, res: Response, next: NextFunction): void;
export function requireInternalOrAuth(
  reqOrOptions: AuthRequest | ProvenanceGuardOptions,
  res?: Response,
  next?: NextFunction,
): Guard | void {
  if (isMiddlewareCall(res, next)) {
    internalOrAuthGuard({})(reqOrOptions as AuthRequest, res, next as NextFunction);
    return;
  }
  const options = (reqOrOptions ?? {}) as ProvenanceGuardOptions;
  assertProvenanceOptions(options);
  return internalOrAuthGuard(options);
}

/**
 * requireInternalOrAdminOrPermission – akzeptiert ein Gateway-Provenance-Token,
 * einen Plattform-Admin (`efa-all`, im Übergang auch `converge-admin`) oder eine
 * der angegebenen App-Permissions. Live-Lookup für die User-Variante.
 *
 *   requireInternalOrAdminOrPermission('myapp.read')
 *   requireInternalOrAdminOrPermission({ allowedCallers: ['converge_chat'] }, 'myapp.read')
 */
export function requireInternalOrAdminOrPermission(...permissionKeys: string[]): Guard;
export function requireInternalOrAdminOrPermission(options: ProvenanceGuardOptions, ...permissionKeys: string[]): Guard;
export function requireInternalOrAdminOrPermission(...args: (string | ProvenanceGuardOptions)[]): Guard {
  const options: ProvenanceGuardOptions = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};
  const permissionKeys = args.filter((a): a is string => typeof a === 'string');
  assertProvenanceOptions(options);
  const userGuard = requireAdminOrPermission(...permissionKeys);
  return (req, res, next) => {
    if (verifyServiceProvenance(req, options).ok) {
      next();
      return;
    }
    userGuard(req, res, next);
  };
}

// ─── Exchange-Vorfilter ───────────────────────────────────────────────────────

/** Einzige Tenant-Kennung dieser Plattform (Multi-Tenancy bewusst nicht unterstützt). */
const PLATFORM_TENANT = 'default';

/** Ergebnis der Claim-Prüfung eines eingereichten Plattform-Tokens. */
export type PlatformTokenVerdict =
  /** Reguläres Login- bzw. Gateway-Tausch-Token — der Exchange darf übernehmen. */
  | { ok: true }
  /** Zweckgebundenes Token (Delegation, RAG, Run-as, Kernel-Ziel) — begründet keine Sitzung. */
  | { ok: false; status: 401; error: string; code: 'delegation_token_not_accepted' }
  /** Konto muss erst sein Passwort ändern. */
  | { ok: false; status: 403; error: 'Password change required'; code: 'FORCE_PASSWORD_CHANGE' }
  /** Fremder Tenant — diese Installation kennt nur einen. */
  | { ok: false; status: 403; error: 'tenant_not_supported'; code: 'tenant_not_supported' };

/**
 * Prüft die Claims eines bereits verifizierten Plattform-Tokens darauf, ob es
 * eine App-Sitzung begründen darf (efa #282). Rein, ohne Express.
 *
 * Bis 1.22 tauschte der Exchange alles, was mit dem Plattform-Schlüssel signiert
 * war und `iss`/`aud` = `converge` trug — also auch Tokens, die nie ein Login
 * sein sollten. Abgewiesen werden jetzt:
 *
 *  - `serviceKey`-Claim: der RAG-Service-JWT von efa-chat (5 min, geht nur an efa-ai),
 *  - `purpose`-Claim, egal welcher: `mcp-delegation` (efa-chat, 10 min),
 *    `rag-search`/`rag-source`, `mcp-run-as` (Kernel). Seit efa_kernel#86/#106
 *    tauscht der Gateway nicht mehr das eingehende Delegations-Token, sondern
 *    stellt ein eigenes, zweckfreies aus; keine Tokenart mit `purpose` hat am
 *    Exchange noch etwas zu suchen. Es gibt deshalb keine Ausnahmeliste.
 *  - `gw` mit einem anderen Wert als `'app'`: `gw: 'app'` ist genau dieses
 *    Gateway-Tausch-Token (60 s, efa_kernel#106) und bleibt der normale Weg.
 *    `gw: 'kernel'` ist ein Bearer für kernel-native Ziele und erreicht eine App
 *    nie — taucht es hier auf, ist es abgegriffen.
 *  - `forcePasswordChange: true`: der Kernel sperrt solche Konten bis zum
 *    Passwortwechsel (`FORCE_PASSWORD_CHANGE`). Im Browser fängt das schon das
 *    Gateway ab, ein direkter Aufruf im `converge-net` nicht.
 *  - `tenant` ungleich `'default'` (auch fehlend): diese Plattform hat genau
 *    einen Tenant; der Claim wanderte sonst ungeprüft in die Sitzung.
 *
 * `serviceKey` wird vor `purpose` geprüft: der RAG-Service-JWT trägt beides und
 * bleibt so erkennbar, auch wenn eine künftige Signierstelle `purpose` vergisst.
 */
export function classifyPlatformToken(payload: Record<string, unknown>): PlatformTokenVerdict {
  const serviceKey = payload.serviceKey;
  if (serviceKey !== undefined && serviceKey !== null && serviceKey !== '') {
    return { ok: false, status: 401, error: 'Service-Token begründet keine Sitzung', code: 'delegation_token_not_accepted' };
  }
  const purpose = payload.purpose;
  if (purpose !== undefined && purpose !== null && purpose !== '') {
    const label = typeof purpose === 'string' ? purpose.slice(0, 64) : typeof purpose;
    return {
      ok: false,
      status: 401,
      error: `Zweckgebundenes Token (purpose=${label}) begründet keine Sitzung`,
      code: 'delegation_token_not_accepted',
    };
  }
  if (payload.gw !== undefined && payload.gw !== 'app') {
    return { ok: false, status: 401, error: 'Gateway-Token für ein anderes Ziel begründet keine Sitzung', code: 'delegation_token_not_accepted' };
  }
  if (payload.forcePasswordChange === true) {
    return { ok: false, status: 403, error: 'Password change required', code: 'FORCE_PASSWORD_CHANGE' };
  }
  if (payload.tenant !== PLATFORM_TENANT) {
    return { ok: false, status: 403, error: 'tenant_not_supported', code: 'tenant_not_supported' };
  }
  return { ok: true };
}

// ─── Token Exchange Router ────────────────────────────────────────────────────

/**
 * createExchangeRouter – mounts POST /exchange.
 * Register in index.ts as: app.use('/api/auth', createExchangeRouter(pool))
 *
 * Flow:
 *   1. Validates incoming Converge JWT (RS256 via JWT_PUBLIC_KEY)
 *   2. Auto-provisions user in app_users table
 *   3. Issues own session JWT (APP_SESSION_SECRET) as httpOnly cookie
 *   4. Returns { user }
 *
 * Permissions liegen NICHT mehr im Session-JWT — Apps fragen pro Request beim
 * converge_access-Service nach (siehe permissionClient.ts).
 */
export function createExchangeRouter(pool: Pool): Router {
  // Fail-fast beim Start statt beim ersten Login (efa #290, #286).
  assertSessionSecret();
  assertSessionCookiePath();
  const router = Router();

  router.post('/exchange', async (req: Request, res: Response) => {
    const { token } = req.body as { token?: string };
    if (!token) {
      res.status(400).json({ error: 'token required' });
      return;
    }

    let convergePayload: JwtPayload;
    try {
      // Algorithmus + iss/aud pinnen (Finding #9): nur RS256-Tokens, die der
      // Kernel als Converge-Plattform-Token ausgestellt hat, werden akzeptiert.
      convergePayload = jwt.verify(token, getPlatformPublicKey(), {
        algorithms: ['RS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      }) as JwtPayload;
    } catch {
      res.status(401).json({ error: 'Invalid or expired platform token' });
      return;
    }

    // Vorfilter (efa #282): nur Login- und Gateway-Tausch-Tokens begründen eine Sitzung.
    const verdict = classifyPlatformToken(convergePayload as unknown as Record<string, unknown>);
    if (!verdict.ok) {
      console.warn(JSON.stringify({
        level: 'warn',
        msg: 'Token-Exchange abgelehnt',
        code: verdict.code,
        sub: typeof convergePayload.sub === 'string' ? convergePayload.sub : null,
      }));
      res.status(verdict.status).json({ error: verdict.error, code: verdict.code });
      return;
    }

    // Bindung an die Kernel-Sitzung (efa-Task #137): jedes Kernel-Token trägt
    // eine jti — Login/Refresh (`issueToken`) wie der Gateway-Tausch
    // (`issueGatewayExchangeToken`). Ohne sie wäre die App-Sitzung nicht
    // entwertbar. Die Format-Grenzen entsprechen denen des Status-Endpoints;
    // ein Token außerhalb davon würde später bei jedem Request 503 liefern.
    if (
      typeof convergePayload.jti !== 'string' || !KERNEL_JTI_RE.test(convergePayload.jti) ||
      typeof convergePayload.sub !== 'string' || !KERNEL_SUB_RE.test(convergePayload.sub) ||
      !Number.isInteger(convergePayload.iat) || !Number.isInteger(convergePayload.exp)
    ) {
      res.status(401).json({ error: 'Invalid or expired platform token' });
      return;
    }
    // Die App-Sitzung lebt genau so lange wie das Kernel-Token — nicht mehr
    // pauschal 8 h ab Exchange (vorher „Lifetime-Drift": ein spät getauschtes
    // Token ergab eine App-Sitzung, die den Kernel um bis zu 8 h überlebte).
    const remainingSec = convergePayload.exp - Math.floor(Date.now() / 1000);
    if (remainingSec <= 0) {
      res.status(401).json({ error: 'Invalid or expired platform token' });
      return;
    }

    try {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO app_users (converge_id, email, name, last_seen_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (converge_id) DO UPDATE
           SET last_seen_at = NOW(),
               email = EXCLUDED.email,
               name = EXCLUDED.name
         RETURNING id`,
        [
          convergePayload.sub,
          convergePayload.email ?? null,
          convergePayload.name,
        ],
      );

      const appUser = rows[0];

      const sessionPayload: SessionPayload = {
        sub: appUser.id,
        convergeId: convergePayload.sub,
        name: convergePayload.name,
        email: convergePayload.email ?? null,
        language: convergePayload.language,
        tenant: convergePayload.tenant,
        kernelJti: convergePayload.jti,
        kernelIat: convergePayload.iat,
      };

      const sessionToken = jwt.sign(sessionPayload, getSessionSecret(), { algorithm: 'HS256', expiresIn: remainingSec });
      setSessionCookie(res, sessionToken, remainingSec * 1000);
      clearLegacySessionCookie(req, res);

      res.json({
        user: {
          id: appUser.id,
          convergeId: convergePayload.sub,
          name: convergePayload.name,
          email: convergePayload.email ?? null,
          tenant: convergePayload.tenant,
        },
      });
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', msg: 'Exchange error', err: String(err) }));
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/logout', (_req: Request, res: Response) => {
    const opts = { httpOnly: true, sameSite: 'lax' as const, secure: isSecureCookie() };
    res.clearCookie(getCookieName(), { ...opts, path: getSessionCookiePath() });
    // Übergang: ein vor 1.23 ausgestelltes Cookie liegt auf `/`.
    if (getSessionCookiePath() !== '/') res.clearCookie(getCookieName(), { ...opts, path: '/' });
    res.json({ ok: true });
  });

  // Live-Lookup für Frontend-UI-Checks (z.B. Admin-Abzeichen, Settings-Icon).
  // App-Backend-Routen sollen requireAdmin/requirePermission verwenden — die machen
  // ihren eigenen Live-Lookup. Diese Route ist nur für Frontend-UI.
  router.get('/permissions', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const keys = await getUserPermissions(req.user!.convergeId);
      res.json({ keys });
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', msg: 'Permissions lookup failed', err: String(err) }));
      res.status(503).json({ error: 'Permission service unavailable' });
    }
  });

  return router;
}
