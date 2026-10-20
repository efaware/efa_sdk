import { describe, it, expect, vi, afterEach } from 'vitest';
import { ServiceClient, ServiceClientError } from '../src/backend/serviceClient';

// efa #290: 4xx wird nicht wiederholt, Timeouts brechen den ganzen Aufruf ab.

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function client(fetchImpl: typeof fetch, retries = 2): ServiceClient {
  return new ServiceClient({ gatewayUrl: 'http://gw', registryKey: 'k', fetchImpl, retries, retryDelayMs: 1 });
}

afterEach(() => vi.restoreAllMocks());

describe('ServiceClient', () => {
  it('does NOT retry a 4xx with an error text in the body', async () => {
    const fetchImpl = vi.fn(async () => json(403, { error: 'Kein Zugriff' }));
    const err = (await client(fetchImpl as unknown as typeof fetch).call('converge_access', 'GET', '/x').catch((e: unknown) => e)) as ServiceClientError;
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(err).toBeInstanceOf(ServiceClientError);
    expect(err.message).toBe('Kein Zugriff');
    expect(err.status).toBe(403);
    expect(err.serviceKey).toBe('converge_access');
  });

  it('does not retry a 4xx without body either', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 404 }));
    const err = (await client(fetchImpl as unknown as typeof fetch).call('a_b', 'GET', '/x').catch((e: unknown) => e)) as ServiceClientError;
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(err.message).toBe('ServiceClient: a_b GET /x → 404');
  });

  it('retries 5xx and then gives up with the status', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => json(503, { error: 'busy' }));
    const err = (await client(fetchImpl as unknown as typeof fetch).call('a_b', 'GET', '/x').catch((e: unknown) => e)) as ServiceClientError;
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(err).toBeInstanceOf(ServiceClientError);
    expect(err.status).toBe(503);
  });

  it('retries network errors and succeeds on the next attempt', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(json(200, { ok: 1 }));
    await expect(client(fetchImpl as unknown as typeof fetch).call('a_b', 'GET', '/x')).resolves.toEqual({ ok: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rethrows the network error after the last retry', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => { throw new TypeError('fetch failed'); });
    await expect(client(fetchImpl as unknown as typeof fetch, 1).call('a_b', 'GET', '/x')).rejects.toThrow('fetch failed');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('returns undefined on 204', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    await expect(client(fetchImpl as unknown as typeof fetch).call('a_b', 'DELETE', '/x')).resolves.toBeUndefined();
  });

  it('passes an AbortSignal with timeoutMs and does not retry a timeout', async () => {
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason));
    }));
    const err = (await client(fetchImpl as unknown as typeof fetch)
      .call('converge_access', 'GET', '/x', undefined, { timeoutMs: 20 })
      .catch((e: unknown) => e)) as ServiceClientError;
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(err).toBeInstanceOf(ServiceClientError);
    expect(err.timedOut).toBe(true);
    expect(err.message).toContain('Timeout nach 20 ms');
  });

  it('sends no signal without timeoutMs', async () => {
    const fetchImpl = vi.fn(async (_u: string, _i: RequestInit) => json(200, {}));
    await client(fetchImpl as unknown as typeof fetch).call('a_b', 'POST', '/x', { a: 1 });
    expect(fetchImpl.mock.calls[0][1].signal).toBeUndefined();
    expect(fetchImpl.mock.calls[0][1].body).toBe('{"a":1}');
  });
});

describe('permission lookups carry a timeout', () => {
  it('getUserPermissions and checkPermission pass timeoutMs to the service client', async () => {
    vi.resetModules();
    const call = vi.fn().mockResolvedValueOnce({ keys: ['a'] }).mockResolvedValueOnce({ granted: true });
    vi.doMock('../src/backend/serviceClient', () => ({ serviceClient: { call } }));
    const { getUserPermissions, PERMISSION_LOOKUP_TIMEOUT_MS } = await import('../src/backend/permissionClient');
    const { checkPermission } = await import('../src/backend/permissionCheck');

    await expect(getUserPermissions('u1')).resolves.toEqual(['a']);
    await expect(checkPermission('u1', 'k')).resolves.toBe(true);

    expect(PERMISSION_LOOKUP_TIMEOUT_MS).toBe(5_000);
    expect(call.mock.calls[0][4]).toEqual({ timeoutMs: 5_000 });
    expect(call.mock.calls[1][4]).toEqual({ timeoutMs: 5_000 });
    vi.doUnmock('../src/backend/serviceClient');
  });
});
