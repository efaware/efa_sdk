import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// efa-Task #137: Live-Status der Kernel-Sitzung mit Cache. Gemockt wird nur der
// Gateway-Client; Zeit über Fake-Timer (Date.now), Promises laufen normal.
const serviceCallMock = vi.fn();
vi.mock('../src/backend/serviceClient', () => ({
  serviceClient: { call: (...args: unknown[]) => serviceCallMock(...args) },
}));

import {
  getSessionStatus,
  clearSessionStatusCache,
  sessionStatusCacheSize,
  type SessionRef,
} from '../src/backend/sessionStatusClient';

const T0 = new Date('2026-09-13T10:00:00Z').getTime();
const T0_SEC = Math.floor(T0 / 1000);

function ref(overrides: Partial<SessionRef> = {}): SessionRef {
  return { convergeId: 'user-1', jti: 'jti-1', iat: T0_SEC - 60, exp: T0_SEC + 3600, ...overrides };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  serviceCallMock.mockReset();
  serviceCallMock.mockResolvedValue({ active: true });
  clearSessionStatusCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getSessionStatus', () => {
  it('calls the kernel endpoint via converge_access with encoded parameters', async () => {
    const status = await getSessionStatus(ref({ jti: 'a:b', convergeId: 'user@x' }));

    expect(status).toEqual({ active: true });
    expect(serviceCallMock).toHaveBeenCalledWith(
      'converge_access',
      'GET',
      `/api/internal/sessions/a%3Ab/status?sub=user%40x&iat=${T0_SEC - 60}`,
    );
  });

  it('caches an active session for 30 s', async () => {
    await getSessionStatus(ref());
    vi.setSystemTime(T0 + 29_999);
    await getSessionStatus(ref());
    expect(serviceCallMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(T0 + 30_001);
    await getSessionStatus(ref());
    expect(serviceCallMock).toHaveBeenCalledTimes(2);
  });

  it('never caches "active" beyond the end of the session', async () => {
    await getSessionStatus(ref({ exp: T0_SEC + 10 }));
    vi.setSystemTime(T0 + 10_001);
    await getSessionStatus(ref({ exp: T0_SEC + 10 }));
    expect(serviceCallMock).toHaveBeenCalledTimes(2);
  });

  it('caches an inactive session until the session ends', async () => {
    serviceCallMock.mockResolvedValue({ active: false, reason: 'session_revoked' });

    expect(await getSessionStatus(ref())).toEqual({ active: false, reason: 'session_revoked' });
    vi.setSystemTime(T0 + 59 * 60 * 1000);
    expect(await getSessionStatus(ref())).toEqual({ active: false, reason: 'session_revoked' });
    expect(serviceCallMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(T0 + 3600 * 1000 + 1);
    await getSessionStatus(ref());
    expect(serviceCallMock).toHaveBeenCalledTimes(2);
  });

  it('keys the cache by jti, sub and iat', async () => {
    await getSessionStatus(ref());
    await getSessionStatus(ref({ jti: 'jti-2' }));
    await getSessionStatus(ref({ convergeId: 'user-2' }));
    await getSessionStatus(ref({ iat: T0_SEC - 1 }));
    expect(serviceCallMock).toHaveBeenCalledTimes(4);
  });

  it('shares one lookup between concurrent calls for the same session', async () => {
    let resolve!: (v: unknown) => void;
    serviceCallMock.mockReturnValue(new Promise((r) => { resolve = r; }));

    const a = getSessionStatus(ref());
    const b = getSessionStatus(ref());
    resolve({ active: true });

    expect(await a).toEqual({ active: true });
    expect(await b).toEqual({ active: true });
    expect(serviceCallMock).toHaveBeenCalledTimes(1);
  });

  it('does not cache failures', async () => {
    serviceCallMock.mockRejectedValueOnce(new Error('gateway down'));

    await expect(getSessionStatus(ref())).rejects.toThrow('gateway down');
    expect(await getSessionStatus(ref())).toEqual({ active: true });
    expect(serviceCallMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['204 / undefined', undefined],
    ['missing active', { reason: 'session_revoked' }],
    ['active as string', { active: 'true' }],
  ])('throws on an unexpected response (%s)', async (_label, body) => {
    serviceCallMock.mockResolvedValue(body);
    await expect(getSessionStatus(ref())).rejects.toThrow(/unexpected response/);
    expect(sessionStatusCacheSize()).toBe(0);
  });

  it('keeps server_restarted and maps an unknown reason to session_revoked', async () => {
    serviceCallMock.mockResolvedValueOnce({ active: false, reason: 'server_restarted' });
    expect(await getSessionStatus(ref())).toEqual({ active: false, reason: 'server_restarted' });

    serviceCallMock.mockResolvedValueOnce({ active: false, reason: 'irgendwas' });
    expect(await getSessionStatus(ref({ jti: 'jti-2' }))).toEqual({ active: false, reason: 'session_revoked' });
  });

  it.each([
    ['empty jti', { jti: '' }],
    ['empty convergeId', { convergeId: '' }],
    ['non-integer iat', { iat: 1.5 }],
    ['missing exp', { exp: Number.NaN }],
  ])('rejects an incomplete reference without a lookup (%s)', async (_label, overrides) => {
    await expect(getSessionStatus(ref(overrides as Partial<SessionRef>))).rejects.toThrow(/required/);
    expect(serviceCallMock).not.toHaveBeenCalled();
  });

  it('does not cache a session that has already ended', async () => {
    await getSessionStatus(ref({ exp: T0_SEC - 1 }));
    expect(sessionStatusCacheSize()).toBe(0);
  });

  it('bounds the cache size (expired first, then oldest)', async () => {
    for (let i = 0; i < 10_050; i++) {
      await getSessionStatus(ref({ jti: `jti-${i}` }));
    }
    expect(sessionStatusCacheSize()).toBe(10_000);

    // Der älteste Eintrag ist verdrängt (neuer Lookup), der jüngste nicht.
    serviceCallMock.mockClear();
    await getSessionStatus(ref({ jti: 'jti-10049' }));
    expect(serviceCallMock).not.toHaveBeenCalled();
    await getSessionStatus(ref({ jti: 'jti-0' }));
    expect(serviceCallMock).toHaveBeenCalledTimes(1);
  });

  it('prunes expired entries before evicting live ones', async () => {
    // 5 000 Einträge mit kurzer Sitzung, danach 5 001 mit langer.
    for (let i = 0; i < 5_000; i++) {
      await getSessionStatus(ref({ jti: `short-${i}`, exp: T0_SEC + 5 }));
    }
    vi.setSystemTime(T0 + 6_000);
    for (let i = 0; i < 5_001; i++) {
      await getSessionStatus(ref({ jti: `long-${i}` }));
    }
    expect(sessionStatusCacheSize()).toBe(5_001);

    serviceCallMock.mockClear();
    await getSessionStatus(ref({ jti: 'long-0' }));
    expect(serviceCallMock).not.toHaveBeenCalled();
  });
});
