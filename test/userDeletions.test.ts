import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// onUserDeleted: Tombstones gelöschter Benutzer abholen und an die App geben.
// Gemockt wird nur der Gateway-Client.
const serviceCallMock = vi.fn();
vi.mock('../src/backend/serviceClient', () => ({
  serviceClient: { call: (...args: unknown[]) => serviceCallMock(...args) },
}));

import { onUserDeleted, type UserDeletionSync } from '../src/backend/userDeletions';

const page = (ids: string[], next: string, hasMore = false) => ({
  items: ids.map((userId, i) => ({ seq: String(i + 1), userId, deletedAt: '2026-11-11T10:00:00Z' })),
  next,
  hasMore,
  retentionDays: 90,
});

let sync: UserDeletionSync | undefined;

beforeEach(() => {
  serviceCallMock.mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  sync?.stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('onUserDeleted', () => {
  it('holt ab seq 0 über converge_access und gibt die IDs ohne Dubletten weiter', async () => {
    serviceCallMock.mockResolvedValueOnce(page(['u1', 'u2', 'u1'], '3'));
    const handler = vi.fn();
    sync = onUserDeleted(handler, { initialDelayMs: 60_000 });

    await expect(sync.runOnce()).resolves.toBe(2);
    expect(serviceCallMock).toHaveBeenCalledWith(
      'converge_access', 'GET', '/api/internal/user-deletions?after=0&limit=500', undefined, { timeoutMs: 15_000 },
    );
    expect(handler).toHaveBeenCalledWith(['u1', 'u2']);
  });

  it('blättert bei hasMore und setzt den nächsten Lauf beim Cursor fort', async () => {
    serviceCallMock
      .mockResolvedValueOnce(page(['u1'], '1', true))
      .mockResolvedValueOnce(page(['u2'], '2'))
      .mockResolvedValueOnce(page([], '2'));
    const handler = vi.fn();
    sync = onUserDeleted(handler, { initialDelayMs: 60_000, pageSize: 1 });

    await sync.runOnce();
    expect(handler.mock.calls).toEqual([[['u1']], [['u2']]]);
    await sync.runOnce();
    expect(serviceCallMock.mock.calls[2][2]).toBe('/api/internal/user-deletions?after=2&limit=1');
    expect(handler).toHaveBeenCalledTimes(2); // leere Seite → kein Aufruf
  });

  it('rückt den Cursor nicht vor, wenn der Handler wirft', async () => {
    serviceCallMock.mockResolvedValue(page(['u1'], '7'));
    const handler = vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce(undefined);
    sync = onUserDeleted(handler, { initialDelayMs: 60_000 });

    await expect(sync.runOnce()).resolves.toBe(0);
    await sync.runOnce();
    expect(serviceCallMock.mock.calls[1][2]).toBe('/api/internal/user-deletions?after=0&limit=500');
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('übersteht einen alten Kernel (404) und unerwartete Antworten', async () => {
    serviceCallMock
      .mockRejectedValueOnce(Object.assign(new Error('Not found'), { status: 404 }))
      .mockResolvedValueOnce({ foo: 1 })
      .mockResolvedValueOnce(page(['u1'], '1'));
    const handler = vi.fn();
    sync = onUserDeleted(handler, { initialDelayMs: 60_000 });

    await expect(sync.runOnce()).resolves.toBe(0);
    await expect(sync.runOnce()).resolves.toBe(0);
    await expect(sync.runOnce()).resolves.toBe(1);
    expect(handler).toHaveBeenCalledWith(['u1']);
  });

  it('teilt sich einen laufenden Abgleich statt parallel zu laufen', async () => {
    let release!: (v: unknown) => void;
    serviceCallMock.mockReturnValueOnce(new Promise((r) => { release = r; }));
    sync = onUserDeleted(vi.fn(), { initialDelayMs: 60_000 });
    const a = sync.runOnce();
    const b = sync.runOnce();
    expect(a).toBe(b);
    release(page([], '0'));
    await a;
    expect(serviceCallMock).toHaveBeenCalledTimes(1);
  });

  it('startet nach initialDelayMs und läuft dann im Intervall', async () => {
    vi.useFakeTimers();
    serviceCallMock.mockResolvedValue(page([], '0'));
    sync = onUserDeleted(vi.fn(), { initialDelayMs: 1_000, intervalMs: 20_000 });
    expect(serviceCallMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(serviceCallMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(serviceCallMock).toHaveBeenCalledTimes(2);
    sync.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(serviceCallMock).toHaveBeenCalledTimes(2);
  });
});
