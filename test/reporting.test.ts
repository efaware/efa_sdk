import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reportEvent, reportActivity } from '../src/backend/reporting';

const REPORTING_URL = 'http://kernel.internal/api/reporting/ingest';
const SERVICE_AUTH_KEY = 'test-service-auth-key';

describe('reporting client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('REPORTING_URL', REPORTING_URL);
    vi.stubEnv('SERVICE_AUTH_KEY', SERVICE_AUTH_KEY);
    vi.stubEnv('APP_NAME', 'test-app');
    vi.stubEnv('APP_VERSION', '9.9.9');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sends X-Service-Auth-Key and never sends Authorization', () => {
    reportEvent('item.created', { itemId: '1' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['X-Service-Auth-Key']).toBe(SERVICE_AUTH_KEY);
    expect(init.headers['Authorization']).toBeUndefined();
  });

  it('forwards userId on activity entries', () => {
    reportActivity('export', 'items', 'converge-user-1');

    const [, init] = fetchMock.mock.calls[0];
    const entries = JSON.parse(init.body);
    expect(entries).toEqual([
      expect.objectContaining({
        type: 'activity',
        action: 'export',
        resource: 'items',
        userId: 'converge-user-1',
      }),
    ]);
  });

  it('forwards userId on event entries', () => {
    reportEvent('item.created', { itemId: '1' }, 'converge-user-1');

    const [, init] = fetchMock.mock.calls[0];
    const entries = JSON.parse(init.body);
    expect(entries[0].userId).toBe('converge-user-1');
  });

  it('does nothing when REPORTING_URL is unset', () => {
    vi.stubEnv('REPORTING_URL', '');

    reportEvent('item.created', {});

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('logs a warning when reportActivity is called without a userId', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    reportActivity('export', 'items');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('reportActivity');
    warnSpy.mockRestore();
  });

  it('does not warn when reportActivity is called with a userId', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    reportActivity('export', 'items', 'converge-user-1');

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('logs an error when the kernel rejects the request', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    reportEvent('item.created', {});
    await Promise.resolve();
    await Promise.resolve();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('Reporting ingest rejected');
    errorSpy.mockRestore();
  });
});
