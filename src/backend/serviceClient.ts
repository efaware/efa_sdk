/**
 * serviceClient.ts – Zentraler Client für App-zu-App-Kommunikation via Kernel Gateway.
 *
 * Apps sprechen nie direkt miteinander. Jede Kommunikation geht über den
 * Kernel-Gateway-Proxy:
 *
 *   ServiceClient.call('converge_access', 'GET', '/api/roles')
 *   → fetch(CONVERGE_GATEWAY_URL/api/gateway/converge_access/api/roles, { X-Service-Auth-Key })
 *   → Kernel validiert Auth → Kernel proxied → Ziel-App
 *
 * Usage:
 *   import { serviceClient } from '../../template-core/serviceClient';
 *
 *   const users = await serviceClient.call<User[]>('converge_zbv', 'GET', '/api/users');
 *   const role = await serviceClient.call('converge_access', 'POST', '/api/roles', { name: 'Dev' });
 */

function log(level: string, msg: string, extra?: Record<string, unknown>): void {
  console.log(JSON.stringify({ level, msg, timestamp: new Date().toISOString(), ...extra }));
}

export interface ServiceClientOptions {
  /** Kernel Gateway URL (default: CONVERGE_GATEWAY_URL env var) */
  gatewayUrl?: string;
  /** Registry API Key for service-to-service auth (default: SERVICE_AUTH_KEY env var) */
  registryKey?: string;
  /** Custom fetch implementation (for testing) */
  fetchImpl?: typeof fetch;
  /** Retry count (default: 2) */
  retries?: number;
  /** Retry delay in ms (default: 1000) */
  retryDelayMs?: number;
}

/** Optionen je Aufruf. */
export interface ServiceCallOptions {
  /**
   * Obergrenze für den gesamten Aufruf inklusive Wiederholungen (ms). Danach
   * wird der Request abgebrochen (`AbortSignal.timeout`) und der Aufruf wirft
   * einen `ServiceClientError` mit `timedOut: true`. Ohne Angabe: kein Timeout.
   */
  timeoutMs?: number;
}

/**
 * Fehler aus `ServiceClient.call` mit HTTP-Status der Gegenseite. Seit 1.23 eine
 * eigene Klasse, damit die Wiederholungslogik ihn sicher von einem Netzwerkfehler
 * unterscheidet: vorher wurde ein 4xx mit `error`-Text im Body wie ein
 * Netzwerkfehler zweimal wiederholt (efa #290). `message` ist unverändert.
 */
export class ServiceClientError extends Error {
  readonly status: number | null;
  readonly serviceKey: string;
  readonly timedOut: boolean;

  constructor(message: string, serviceKey: string, status: number | null, timedOut = false) {
    super(message);
    this.name = 'ServiceClientError';
    this.serviceKey = serviceKey;
    this.status = status;
    this.timedOut = timedOut;
  }
}

function isAbortError(err: unknown): boolean {
  const name = (err as { name?: unknown } | null)?.name;
  return name === 'AbortError' || name === 'TimeoutError';
}

export class ServiceClient {
  private gatewayUrl: string;
  private registryKey: string;
  private fetchImpl: typeof fetch;
  private retries: number;
  private retryDelay: number;

  constructor(options?: ServiceClientOptions) {
    this.gatewayUrl = (options?.gatewayUrl ?? process.env.CONVERGE_GATEWAY_URL ?? '').replace(/\/$/, '');
    this.registryKey = options?.registryKey ?? process.env.SERVICE_AUTH_KEY ?? '';
    this.fetchImpl = options?.fetchImpl ?? fetch;
    this.retries = options?.retries ?? 2;
    this.retryDelay = options?.retryDelayMs ?? 1_000;
  }

  /**
   * Call another service via the Kernel Gateway.
   *
   * @param serviceKey  Target service key (e.g. 'converge_access')
   * @param method      HTTP method
   * @param path        Target path (e.g. '/api/roles')
   * @param body        Request body (will be JSON-serialized)
   * @returns Parsed JSON response
   */
  async call<T = unknown>(
    serviceKey: string,
    method: string,
    path: string,
    body?: unknown,
    options: ServiceCallOptions = {},
  ): Promise<T> {
    if (!this.gatewayUrl) {
      throw new Error('ServiceClient: CONVERGE_GATEWAY_URL nicht gesetzt');
    }

    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    const url = `${this.gatewayUrl}/api/gateway/${encodeURIComponent(serviceKey)}/${normalizedPath}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (this.registryKey) {
      headers['X-Service-Auth-Key'] = this.registryKey;
    }

    const fetchOptions: RequestInit = { method, headers };
    if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(body);
    }
    if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
      fetchOptions.signal = AbortSignal.timeout(options.timeoutMs);
    }
    const timedOut = (): ServiceClientError =>
      new ServiceClientError(
        `ServiceClient: ${serviceKey} ${method} ${path} → Timeout nach ${options.timeoutMs} ms`,
        serviceKey,
        null,
        true,
      );

    for (let attempt = 1; attempt <= this.retries + 1; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(url, fetchOptions);
      } catch (err) {
        // Abgebrochen (Timeout): nicht wiederholen, die Frist gilt für den ganzen Aufruf.
        if (isAbortError(err) || fetchOptions.signal?.aborted) throw timedOut();
        // Netzwerkfehler → Retry
        if (attempt <= this.retries) {
          log('warn', 'ServiceClient: Netzwerkfehler, Retry', {
            serviceKey, method, path, err: String(err), attempt,
          });
          await new Promise((r) => setTimeout(r, this.retryDelay));
          if (fetchOptions.signal?.aborted) throw timedOut();
          continue;
        }
        throw err;
      }

      if (res.status === 204) {
        return undefined as T;
      }

      if (!res.ok) {
        let errorMessage = `ServiceClient: ${serviceKey} ${method} ${path} → ${res.status}`;
        try {
          const errBody = await res.json() as { error?: string };
          if (errBody.error) errorMessage = errBody.error;
        } catch (err) {
          if (isAbortError(err)) throw timedOut();
          /* sonst: Body kein JSON — Standardtext behalten */
        }

        // Nicht retrybar: 4xx Client-Fehler (die Antwort ist endgültig).
        if (res.status >= 400 && res.status < 500) {
          throw new ServiceClientError(errorMessage, serviceKey, res.status);
        }

        // 5xx: Retry
        if (attempt <= this.retries) {
          log('warn', 'ServiceClient: Retry nach Server-Fehler', {
            serviceKey, method, path, status: res.status, attempt,
          });
          await new Promise((r) => setTimeout(r, this.retryDelay));
          if (fetchOptions.signal?.aborted) throw timedOut();
          continue;
        }
        throw new ServiceClientError(errorMessage, serviceKey, res.status);
      }

      try {
        return await (res.json() as Promise<T>);
      } catch (err) {
        if (isAbortError(err)) throw timedOut();
        throw err;
      }
    }

    throw new Error(`ServiceClient: Alle Versuche fehlgeschlagen für ${serviceKey} ${method} ${path}`);
  }
}

/** Singleton-Instanz mit Default-Konfiguration aus Env-Vars */
export const serviceClient = new ServiceClient();
