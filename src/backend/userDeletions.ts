/**
 * userDeletions.ts – Daten gelöschter Benutzer in der App entfernen.
 *
 * Löscht ein Admin im Kernel einen Benutzer, schreibt der Kernel einen
 * Tombstone (nur UUID und Zeitpunkt). Diese Hilfe holt die Liste ab und ruft den
 * Handler der App mit den Converge-User-UUIDs auf:
 *
 *   GET converge_access /api/internal/user-deletions?after=<seq>
 *   → { items: [{ seq, userId, deletedAt }], next, hasMore, latestSeq, retentionDays }
 *
 * Usage (beim App-Start, nach dem DB-Init):
 *
 *   onUserDeleted(async (convergeIds) => {
 *     await pool.query('DELETE FROM app_users WHERE converge_id = ANY($1::uuid[])', [convergeIds]);
 *   });
 *
 * Verhalten:
 *   - Der erste Lauf startet kurz nach dem Aufruf und holt **alle** Tombstones ab
 *     seq 0, danach alle 10 min nur die neuen. Der Kernel hält sie 90 Tage. Eine
 *     App, die bei der Löschung nicht lief oder aus einer Sicherung kommt, holt
 *     die Löschung so beim nächsten Start nach, ohne eigene Cursor-Tabelle.
 *   - Deshalb muss der Handler **idempotent** sein: Er bekommt dieselben IDs nach
 *     jedem Neustart erneut, auch für Personen, die die App nie kannte.
 *   - Der Cursor rückt erst vor, wenn der Handler ohne Fehler durchlief. Wirft er,
 *     kommt dieselbe Seite beim nächsten Lauf wieder.
 *   - Ein Kernel ohne den Endpoint (404) oder ein Netzfehler sind kein Absturz:
 *     Die Hilfe protokolliert und versucht es beim nächsten Lauf erneut.
 *   - Liegt `latestSeq` unter dem Cursor (Kernel-DB aus einer Sicherung), beginnt
 *     die Hilfe wieder bei 0.
 *   - Läufe überlappen nicht; der Timer hält den Prozess nicht am Leben.
 */

import { serviceClient } from './serviceClient';

/** Erhält die Converge-User-UUIDs gelöschter Benutzer (ohne Dubletten, 1–1000 je Aufruf). */
export type UserDeletedHandler = (convergeIds: string[]) => Promise<void> | void;

export interface UserDeletionOptions {
  /** Abstand der Läufe in ms (Vorgabe 10 min, mindestens 10 s). */
  intervalMs?: number;
  /** Verzögerung des ersten Laufs in ms (Vorgabe 5 s). */
  initialDelayMs?: number;
  /** Seitengröße je Abruf (Vorgabe 500, Kernel deckelt auf 1000). */
  pageSize?: number;
}

export interface UserDeletionSync {
  /** Einen Lauf sofort ausführen; liefert die Zahl der übergebenen IDs. */
  runOnce(): Promise<number>;
  /** Timer anhalten (Tests, geordnetes Herunterfahren). */
  stop(): void;
}

interface DeletionsPage {
  items?: Array<{ seq?: unknown; userId?: unknown }>;
  next?: unknown;
  hasMore?: unknown;
  latestSeq?: unknown;
}

const DEFAULT_INTERVAL_MS = 10 * 60_000;
const MIN_INTERVAL_MS = 10_000;
const DEFAULT_INITIAL_DELAY_MS = 5_000;
const DEFAULT_PAGE_SIZE = 500;
const LOOKUP_TIMEOUT_MS = 15_000;
/** Schutz gegen eine Endlosschleife, falls der Kernel `hasMore` nie zurücknimmt. */
const MAX_PAGES_PER_RUN = 1_000;
const SEQ_REGEX = /^\d{1,18}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function log(level: string, msg: string, extra?: Record<string, unknown>): void {
  console.log(JSON.stringify({ level, msg, timestamp: new Date().toISOString(), ...extra }));
}

/**
 * Registriert den Handler und startet das regelmäßige Abholen. Einmal je Prozess
 * aufrufen; ein zweiter Aufruf startet einen zweiten, unabhängigen Abgleich.
 */
export function onUserDeleted(handler: UserDeletedHandler, options: UserDeletionOptions = {}): UserDeletionSync {
  const intervalMs = Math.max(options.intervalMs ?? DEFAULT_INTERVAL_MS, MIN_INTERVAL_MS);
  const pageSize = Math.min(Math.max(options.pageSize ?? DEFAULT_PAGE_SIZE, 1), 1000);
  let cursor = '0';
  let running: Promise<number> | null = null;
  let stopped = false;
  let warnedMissing = false;

  async function sync(): Promise<number> {
    let total = 0;
    for (let page = 0; page < MAX_PAGES_PER_RUN; page++) {
      const body = await serviceClient.call<DeletionsPage>(
        'converge_access',
        'GET',
        `/api/internal/user-deletions?after=${cursor}&limit=${pageSize}`,
        undefined,
        { timeoutMs: LOOKUP_TIMEOUT_MS },
      );
      if (!body || !Array.isArray(body.items) || typeof body.next !== 'string' || !SEQ_REGEX.test(body.next)) {
        throw new Error('onUserDeleted: unexpected response from converge_access');
      }
      // Kernel-DB aus einer Sicherung zurückgespielt: die Folge beginnt unterhalb des
      // Cursors neu. Dann von vorn holen (der Handler ist idempotent).
      if (typeof body.latestSeq === 'string' && SEQ_REGEX.test(body.latestSeq)
          && BigInt(body.latestSeq) < BigInt(cursor)) {
        log('warn', 'onUserDeleted: Tombstone-Folge des Kernels liegt unter dem Cursor, beginne bei 0', { cursor, latestSeq: body.latestSeq });
        cursor = '0';
        continue;
      }
      // Nur UUIDs: ein fremder Wert ließe einen `::uuid[]`-Handler bei jedem Lauf
      // an derselben Seite scheitern, und der Cursor käme nie weiter.
      const ids = [...new Set(body.items.map((i) => i.userId).filter((id): id is string => typeof id === 'string' && UUID_REGEX.test(id)))];
      if (ids.length > 0) {
        await handler(ids);
        total += ids.length;
      }
      cursor = body.next;
      if (body.hasMore !== true) break;
    }
    return total;
  }

  function runOnce(): Promise<number> {
    if (running) return running;
    running = sync()
      .then((n) => {
        warnedMissing = false;
        if (n > 0) log('info', 'onUserDeleted: Daten gelöschter Benutzer entfernt', { count: n, cursor });
        return n;
      })
      .catch((err: unknown) => {
        const status = (err as { status?: unknown } | null)?.status;
        if (status === 404) {
          // Kernel ohne Endpoint (vor der Personenlöschung): leise weiter versuchen.
          if (!warnedMissing) log('warn', 'onUserDeleted: Kernel liefert noch keine Tombstones (404), nächster Versuch später');
          warnedMissing = true;
        } else {
          log('error', 'onUserDeleted: Lauf fehlgeschlagen, nächster Versuch später', { err: String(err), cursor });
        }
        return 0;
      })
      .finally(() => {
        running = null;
      });
    return running;
  }

  let interval: ReturnType<typeof setInterval> | undefined;
  const first = setTimeout(() => {
    if (stopped) return;
    void runOnce();
    interval = setInterval(() => void runOnce(), intervalMs);
    interval.unref?.();
  }, Math.max(options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS, 0));
  first.unref?.();

  return {
    runOnce,
    stop() {
      stopped = true;
      clearTimeout(first);
      if (interval) clearInterval(interval);
    },
  };
}
