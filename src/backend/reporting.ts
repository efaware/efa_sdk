/**
 * reporting.ts – fire-and-forget reporting client.
 *
 * Sends events, logs, metrics, and user activity to Converge's central reporting.
 * Requires REPORTING_URL env var (the Converge backend reporting ingest endpoint).
 * If REPORTING_URL is not set, all calls are silently skipped.
 * Never blocks, never throws.
 *
 * Auth: service-to-service via X-Service-Auth-Key (SERVICE_AUTH_KEY env var) — wie
 * audit.ts. Der app_session-Bearer (HS256) ist vom Kernel NICHT verifizierbar (er
 * erwartet ausschließlich X-Service-Auth-Key), daher trägt der Registry-Key die
 * Authentifizierung. Weil der Aufruf damit als "intern" gilt, kennt der Kernel den
 * Akteur nicht aus dem Token — für `event`/`activity`-Einträge MUSS die User-Identität
 * (die Converge-Plattform-User-ID, z. B. `req.user?.convergeId`, NICHT die app-lokale
 * `req.user?.sub`) explizit als `userId` mitgegeben werden. Bei `activity`-Einträgen
 * ist `userId` seit dem Kernel-Umstieg auf Service-Provenance PFLICHT — ohne
 * auflösbare userId verwirft der Kernel den Eintrag still (user_activity.user_id ist
 * NOT NULL).
 *
 * Usage:
 *   import { reportEvent, reportLog, reportMetric, reportActivity } from '../reporting';
 *
 *   reportEvent('item.created', { itemId: id }, req.user?.convergeId);
 *   reportLog('info', 'User exported data', { count: rows });
 *   reportMetric('export_duration_ms', elapsed, { format: 'csv' });
 *   reportActivity('export', 'items', req.user?.convergeId);
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type ReportEntry =
  | { type: 'event'; sourceApp: string; appVersion: string; eventType: string; userId?: string; payload?: Record<string, unknown> }
  | { type: 'log'; sourceApp: string; appVersion: string; level: LogLevel; message: string; context?: Record<string, unknown> }
  | { type: 'metric'; sourceApp: string; appVersion: string; metricName: string; value: number; dimensions?: Record<string, unknown> }
  | { type: 'activity'; sourceApp: string; appVersion: string; action: string; userId?: string; resource?: string };

function ingest(entries: ReportEntry[]): void {
  const url = process.env.REPORTING_URL;
  if (!url) return;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const registryKey = process.env.SERVICE_AUTH_KEY;
  if (registryKey) headers['X-Service-Auth-Key'] = registryKey;

  // Fire-and-forget: intentionally not awaited. fetch() only rejects on
  // network-level failure — an HTTP error status (e.g. 401 from a missing/
  // stale SERVICE_AUTH_KEY) resolves normally, so it must be checked
  // explicitly or a broken key goes unnoticed forever (no error, no data).
  fetch(url, { method: 'POST', headers, body: JSON.stringify(entries) })
    .then((res) => {
      if (!res.ok) {
        console.error(
          JSON.stringify({ level: 'error', msg: 'Reporting ingest rejected', status: res.status }),
        );
      }
    })
    .catch((err) => {
      console.error(
        JSON.stringify({ level: 'error', msg: 'Reporting ingest failed', err: String(err) }),
      );
    });
}

const appName = () => process.env.APP_NAME ?? 'app';
// APP_VERSION wird vom Backend-Dockerfile als ENV gesetzt (siehe ARG APP_VERSION
// dort) — entspricht dem GHCR-Image-Tag des Backends. Lokale dev-Builds liefern 'dev'.
// Beim Debugging eines Reporting-Events sieht der Operator damit, gegen welche
// Backend-Version geschrieben wurde — entscheidend nach Rollbacks oder
// gemischten Deployments.
const appVersion = () => process.env.APP_VERSION ?? 'dev';

/** Send a structured event (e.g. "item.created") to Converge reporting. */
export function reportEvent(
  eventType: string,
  payload?: Record<string, unknown>,
  userId?: string,
): void {
  ingest([{ type: 'event', sourceApp: appName(), appVersion: appVersion(), eventType, userId, payload }]);
}

/** Send a structured log line to Converge reporting. */
export function reportLog(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  ingest([{ type: 'log', sourceApp: appName(), appVersion: appVersion(), level, message, context }]);
}

/** Send a numeric metric to Converge reporting. */
export function reportMetric(
  metricName: string,
  value: number,
  dimensions?: Record<string, unknown>,
): void {
  ingest([{ type: 'metric', sourceApp: appName(), appVersion: appVersion(), metricName, value, dimensions }]);
}

/**
 * Send a user activity event to Converge reporting.
 *
 * `userId` is mandatory in practice: the kernel drops the entry silently if
 * it's missing or doesn't resolve to a real user (`user_activity.user_id` is
 * NOT NULL). Warn here so a missing userId is visible in the caller's own
 * logs instead of only showing up as a gap in the reporting dashboard.
 */
export function reportActivity(
  action: string,
  resource?: string,
  userId?: string,
): void {
  if (!userId) {
    console.warn(
      JSON.stringify({ level: 'warn', msg: 'reportActivity without userId — kernel will drop this entry', action }),
    );
  }
  ingest([{ type: 'activity', sourceApp: appName(), appVersion: appVersion(), action, userId, resource }]);
}
