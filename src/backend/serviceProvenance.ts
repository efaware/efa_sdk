/**
 * serviceProvenance.ts – Prüfung des Gateway-Provenance-Tokens (`X-Service-Token`).
 *
 * Der Kernel-Gateway mintet nach erfolgreicher Caller-Auth ein kurzlebiges
 * RS256-Token: `iss='converge-gateway'`, `sub` = aufrufender Service,
 * `aud` = Ziel-Service, 60 s gültig, seit efa_kernel#106 mit `jti`. Es belegt
 * der Ziel-App kryptografisch, dass der Request durch den Gateway von einem
 * authentifizierten Service kam.
 *
 * Bis SDK 1.22 prüften die Guards nur `iss` und `aud`. Damit erreichte jede App
 * mit eigenem Service-Key über den Gateway die internen Routen jeder anderen App
 * (efa #287, Befund 2). Seit 1.23 kommt dazu:
 *
 *  - **Aufrufer** (`sub`): steht als `req.callerService` bereit und lässt sich je
 *    Guard per `allowedCallers` eingrenzen.
 *  - **Alter** (`iat`): höchstens `PROVENANCE_MAX_AGE_SEC` alt, unabhängig vom
 *    `exp`, das der Aussteller setzt.
 *  - **Einmaligkeit** (`jti`): ein Token gilt in dieser App genau einmal. Ein
 *    mitgeschnittenes Token lässt sich im 60-s-Fenster nicht ein zweites Mal
 *    verwenden.
 */
import type { Request } from 'express';
import jwt from 'jsonwebtoken';

export const PROVENANCE_ISSUER = 'converge-gateway';

/**
 * Höchstalter eines Provenance-Tokens. Der Kernel mintet mit 60 s Laufzeit
 * (`PROVENANCE_TTL_SEC`); geprüft wird beim Eintreffen des Requests, nicht an
 * seinem Ende, also gilt das auch für lange Streams.
 */
export const PROVENANCE_MAX_AGE_SEC = 60;

/**
 * Toleranz für `iat`/`exp`/`maxAge`. Kernel und Apps laufen auf demselben Host,
 * eine nennenswerte Uhrabweichung gibt es nicht; die Toleranz fängt nur die
 * Sekundenauflösung von `iat` ab.
 */
const CLOCK_TOLERANCE_SEC = 5;

/** Service-Key-Kontrakt, identisch zum Kernel (`routingSafety.ts`). */
export const SERVICE_KEY_RE = /^[a-z][a-z0-9_]{1,63}$/;

/**
 * Obergrenze der Replay-Liste. Bei 60 s Laufzeit reicht das für über 300
 * S2S-Requests je Sekunde. Wird sie trotzdem erreicht, fallen die ältesten
 * Einträge heraus (Map-Einfügereihenfolge): ein Replay genau dieser Tokens
 * ginge dann für den Rest ihrer Laufzeit wieder durch. Die Alternative,
 * neue Tokens abzuweisen, legte die App unter Last lahm.
 */
export const PROVENANCE_REPLAY_CACHE_MAX = 20_000;

export interface ProvenanceGuardOptions {
  /**
   * Service-Keys, die diese Route aufrufen dürfen (`sub` des Provenance-Tokens).
   * Ohne Angabe: jeder authentifizierte Service (Verhalten bis 1.22).
   *
   * Kernel-Aufrufe tragen `converge_kernel` — u. a. MCP-Werkzeuge, die der
   * Kernel-Agent ausführt (`/api/mcp/execute`), und der Gateway-Sitzungs-Tausch.
   */
  allowedCallers?: readonly string[];
}

export type ProvenanceResult =
  | { ok: true; caller: string }
  /** Kein Token im Request. */
  | { ok: false; reason: 'missing' }
  /** Signatur, `iss`, `aud`, Alter oder `sub` ungültig. */
  | { ok: false; reason: 'invalid' }
  /** Dieselbe `jti` kam schon einmal an. */
  | { ok: false; reason: 'replayed' }
  /** Gültig, aber der Aufrufer steht nicht in `allowedCallers`. */
  | { ok: false; reason: 'caller_not_allowed'; caller: string };

let decodedKey: { b64: string; pem: string } | null = null;

/** `JWT_PUBLIC_KEY` (base64-PEM) dekodiert; gemerkt, solange sich die Env nicht ändert. */
export function getPlatformPublicKey(): string {
  const s = process.env.JWT_PUBLIC_KEY;
  if (!s) throw new Error('JWT_PUBLIC_KEY environment variable is required');
  if (decodedKey?.b64 !== s) decodedKey = { b64: s, pem: Buffer.from(s, 'base64').toString('utf8') };
  return decodedKey.pem;
}

/** `1`/`true`/`yes`/`on`, ohne Groß-/Kleinschreibung. */
export function isTruthyEnv(value: string | undefined): boolean {
  return !!value && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

// ─── Replay-Schutz ───────────────────────────────────────────────────────────

/** Verbrauchte `jti` → Ablauf in ms. In-Memory, eine Instanz je App-Prozess. */
const usedJtis = new Map<string, number>();
const SWEEP_INTERVAL_MS = 5_000;
let lastSweep = 0;
let capacityWarned = false;
let replayCacheMax = PROVENANCE_REPLAY_CACHE_MAX;

function consumeJti(jti: string, expSec: number): boolean {
  const now = Date.now();
  // Abgelaufene Einträge höchstens alle 5 s räumen: die Prüfung liegt auf dem
  // Hot-Path jeder internen Route. Ein abgelaufener Eintrag schadet nicht, das
  // Token selbst ist dann ebenfalls abgelaufen.
  // Alle Tokens haben dieselbe Laufzeit, die Map ist also nach Ablauf sortiert
  // (Einfügereihenfolge): beim ersten noch gültigen Eintrag aufhören.
  if (now - lastSweep >= SWEEP_INTERVAL_MS) {
    lastSweep = now;
    for (const [k, exp] of usedJtis) {
      if (exp >= now) break;
      usedJtis.delete(k);
    }
  }
  if (usedJtis.has(jti)) return false;
  while (usedJtis.size >= replayCacheMax) {
    const oldest = usedJtis.keys().next().value as string;
    usedJtis.delete(oldest);
    if (!capacityWarned) {
      capacityWarned = true;
      console.warn(JSON.stringify({
        level: 'warn',
        msg: 'Provenance-Replay-Liste voll – älteste Einträge fallen heraus',
        max: replayCacheMax,
      }));
    }
  }
  usedJtis.set(jti, (expSec + CLOCK_TOLERANCE_SEC) * 1000);
  return true;
}

/** Nur für Tests. `max` setzt die Obergrenze (Vorgabe `PROVENANCE_REPLAY_CACHE_MAX`). */
export function resetProvenanceReplayCache(max: number = PROVENANCE_REPLAY_CACHE_MAX): void {
  usedJtis.clear();
  lastSweep = 0;
  capacityWarned = false;
  replayCacheMax = max;
}

/** Nur für Tests. */
export function provenanceReplayCacheSize(): number {
  return usedJtis.size;
}

// ─── Prüfung ─────────────────────────────────────────────────────────────────

/**
 * Ergebnis der ersten Prüfung im selben Request. Mehrere Guards hintereinander
 * (z. B. zwei Router auf demselben Pfad, jeder mit `router.use(requireRegistryKey)`)
 * dürfen dasselbe Token sehen, ohne dass der zweite es als Replay abweist.
 */
const verifiedInRequest = new WeakMap<Request, { token: string; caller: string }>();

function readToken(req: Request): string | undefined {
  const raw = req.headers?.['x-service-token'];
  const token = Array.isArray(raw) ? raw[0] : raw;
  return typeof token === 'string' && token ? token : undefined;
}

function verifyToken(req: Request): ProvenanceResult {
  const token = readToken(req);
  if (!token) return { ok: false, reason: 'missing' };

  const memo = verifiedInRequest.get(req);
  if (memo && memo.token === token) return { ok: true, caller: memo.caller };

  const audience = process.env.SERVICE_KEY;
  if (!audience) return { ok: false, reason: 'invalid' };

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, getPlatformPublicKey(), {
      algorithms: ['RS256'],
      issuer: PROVENANCE_ISSUER,
      audience,
      maxAge: PROVENANCE_MAX_AGE_SEC,
      clockTolerance: CLOCK_TOLERANCE_SEC,
    }) as jwt.JwtPayload;
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  const caller = payload.sub;
  if (typeof caller !== 'string' || !SERVICE_KEY_RE.test(caller)) return { ok: false, reason: 'invalid' };

  // Einmaligkeit nur, wenn der Kernel eine jti mitgibt (seit efa_kernel#106).
  // Ein älterer Kernel mintet keine — dessen Tokens bleiben im 60-s-Fenster
  // wiederverwendbar wie bis SDK 1.22, statt jeden S2S-Aufruf zu brechen.
  if (payload.jti !== undefined) {
    if (typeof payload.jti !== 'string' || !payload.jti || typeof payload.exp !== 'number') {
      return { ok: false, reason: 'invalid' };
    }
    if (!consumeJti(payload.jti, payload.exp)) return { ok: false, reason: 'replayed' };
  }

  verifiedInRequest.set(req, { token, caller });
  return { ok: true, caller };
}

/**
 * Prüft das Provenance-Token eines Requests. Bei Erfolg (inkl. Allowlist) steht
 * der Aufrufer in `req.callerService`. Rein lesend bis auf den Replay-Eintrag; schreibt keine
 * Antwort.
 */
export function verifyServiceProvenance(req: Request, options: ProvenanceGuardOptions = {}): ProvenanceResult {
  const result = verifyToken(req);
  if (!result.ok) return result;
  if (options.allowedCallers && !options.allowedCallers.includes(result.caller)) {
    // Ein früherer Guard ohne Liste kann es im selben Request schon gesetzt haben.
    delete (req as Request & { callerService?: string }).callerService;
    return { ok: false, reason: 'caller_not_allowed', caller: result.caller };
  }
  // Erst nach der Allowlist: ein Handler darf `req.callerService` als „dieser
  // Request ist als Service-Aufruf zugelassen“ lesen. Ein abgewiesener Aufrufer,
  // der in `requireInternalOrAuth` auf den Benutzer-Weg fällt, trägt es nicht.
  (req as Request & { callerService?: string }).callerService = result.caller;
  return result;
}

/**
 * Wirft bei einer offensichtlich falschen Allowlist schon beim Aufbau der
 * Routen statt erst beim ersten Request.
 */
export function assertProvenanceOptions(options: ProvenanceGuardOptions): void {
  const callers = options.allowedCallers;
  if (callers === undefined) return;
  if (!Array.isArray(callers) || callers.length === 0) {
    throw new Error('allowedCallers: mindestens ein Service-Key angeben (leere Liste sperrt jeden Aufrufer)');
  }
  for (const c of callers) {
    if (typeof c !== 'string' || !SERVICE_KEY_RE.test(c)) {
      throw new Error(`allowedCallers: ungültiger Service-Key ${JSON.stringify(c)}`);
    }
  }
}
