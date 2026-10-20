import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import express from 'express';
import { readCookies } from './helpers-cookies';
import request from 'supertest';
import { resetProvenanceReplayCache } from '../src/backend/serviceProvenance';
import {
  classifyPlatformToken,
  checkSessionSecret,
  assertSessionSecret,
  createExchangeRouter,
  getSessionCookiePath,
} from '../src/backend/auth';

// efa #282 (Exchange-Vorfilter), #286 (Cookie-Pfad), #290 (Secret-Mindestlänge).

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

vi.mock('../src/backend/permissionClient', () => ({ getUserPermissions: vi.fn() }));
vi.mock('../src/backend/serviceClient', () => ({ serviceClient: { call: vi.fn() } }));

const SECRET = 'exchange-test-secret-0123456789abcdef';

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('JWT_PUBLIC_KEY', Buffer.from(publicKey).toString('base64'));
  vi.stubEnv('APP_SESSION_SECRET', SECRET);
  vi.stubEnv('SERVICE_KEY', 'myapp');
  vi.stubEnv('APP_SESSION_COOKIE_NAME', 'myapp_app_session');
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('APP_SESSION_COOKIE_PATH', '');
  vi.stubEnv('APP_SESSION_SECRET_STRICT', '');
  resetProvenanceReplayCache();
});

function provenance(sub = 'converge_kernel', aud = 'myapp'): string {
  return jwt.sign({}, privateKey, {
    algorithm: 'RS256', issuer: 'converge-gateway', audience: aud, subject: sub, expiresIn: 60, jwtid: crypto.randomUUID(),
  });
}

function platformToken(claims: Record<string, unknown> = {}): string {
  return jwt.sign(
    { sub: 'converge-1', name: 'anna', email: 'a@x', tenant: 'default', ...claims },
    privateKey,
    { algorithm: 'RS256', expiresIn: '1h', issuer: 'converge', audience: 'converge', jwtid: 'jti-1' },
  );
}

function app() {
  const a = express();
  a.use(express.json());
  a.use(readCookies);
  a.use('/api/auth', createExchangeRouter({ query: vi.fn().mockResolvedValue({ rows: [{ id: 'app-user-1' }] }) } as never));
  return a;
}

function setCookies(res: request.Response): string[] {
  return (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
}

// ─── classifyPlatformToken ──────────────────────────────────────────────────

describe('classifyPlatformToken', () => {
  const login = { sub: 's', name: 'n', tenant: 'default' };

  it('accepts a login token and the gateway exchange token (gw: app)', () => {
    expect(classifyPlatformToken(login)).toEqual({ ok: true });
    expect(classifyPlatformToken({ ...login, gw: 'app' })).toEqual({ ok: true });
    expect(classifyPlatformToken({ ...login, forcePasswordChange: false })).toEqual({ ok: true });
  });

  it.each([
    ['mcp-delegation (efa-chat)', { purpose: 'mcp-delegation' }],
    ['rag-search with serviceKey (efa-chat RAG)', { purpose: 'rag-search', serviceKey: 'converge_ai' }],
    ['rag-source', { purpose: 'rag-source' }],
    ['mcp-run-as (kernel)', { purpose: 'mcp-run-as' }],
    ['serviceKey without purpose', { serviceKey: 'converge_ai' }],
    ['a non-string purpose', { purpose: 1 }],
    ['gw: kernel (bearer for kernel targets)', { gw: 'kernel' }],
    ['an unknown gw value', { gw: 'other' }],
  ])('rejects %s with 401', (_label, extra) => {
    const v = classifyPlatformToken({ ...login, ...extra });
    expect(v).toMatchObject({ ok: false, status: 401, code: 'delegation_token_not_accepted' });
  });

  it('rejects forcePasswordChange with 403', () => {
    expect(classifyPlatformToken({ ...login, forcePasswordChange: true }))
      .toMatchObject({ ok: false, status: 403, code: 'FORCE_PASSWORD_CHANGE' });
  });

  it.each([['other tenant', 'acme'], ['missing tenant', undefined]])('rejects %s with 403', (_l, tenant) => {
    expect(classifyPlatformToken({ ...login, tenant }))
      .toMatchObject({ ok: false, status: 403, code: 'tenant_not_supported' });
  });

  it('caps the purpose in the error text', () => {
    const v = classifyPlatformToken({ ...login, purpose: 'x'.repeat(500) });
    expect(!v.ok && v.error.length).toBeLessThanOrEqual(130);
  });
});

describe('POST /exchange with the pre-filter', () => {
  it('exchanges a login token (browser path, no provenance needed)', async () => {
    const res = await request(app()).post('/api/auth/exchange').send({ token: platformToken() });
    expect(res.status).toBe(200);
    expect(setCookies(res).some((c) => c.startsWith('myapp_app_session=ey'))).toBe(true);
  });

  it('exchanges a gw: app token only on the gateway call to THIS app (provenance sub=converge_kernel, aud=own key)', async () => {
    const ok = await request(app()).post('/api/auth/exchange')
      .set('X-Service-Token', provenance())
      .send({ token: platformToken({ gw: 'app' }) });
    expect(ok.status).toBe(200);
  });

  it.each([
    ['without provenance (replayed by another app)', undefined],
    ['with provenance for another app', () => provenance('converge_kernel', 'otherapp')],
    ['with provenance from another caller', () => provenance('converge_chat')],
  ])('rejects a gw: app token %s', async (_l, prov) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = request(app()).post('/api/auth/exchange');
    if (prov) r.set('X-Service-Token', prov());
    const res = await r.send({ token: platformToken({ gw: 'app' }) });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('gateway_provenance_required');
    expect(res.headers['set-cookie']).toBeUndefined();
    warn.mockRestore();
  });

  it.each([
    [{ purpose: 'mcp-delegation' }, 401, 'delegation_token_not_accepted'],
    [{ purpose: 'rag-search', serviceKey: 'converge_ai' }, 401, 'delegation_token_not_accepted'],
    [{ gw: 'kernel' }, 401, 'delegation_token_not_accepted'],
    [{ forcePasswordChange: true }, 403, 'FORCE_PASSWORD_CHANGE'],
    [{ tenant: 'acme' }, 403, 'tenant_not_supported'],
  ])('rejects %o without cookie and without provisioning', async (claims, status, code) => {
    const pool = { query: vi.fn() };
    const a = express();
    a.use(express.json());
    a.use(readCookies);
    a.use('/api/auth', createExchangeRouter(pool as never));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await request(a).post('/api/auth/exchange').send({ token: platformToken(claims) });

    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(pool.query).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

// ─── Cookie-Pfad ─────────────────────────────────────────────────────────────

describe('session cookie path', () => {
  it('defaults to /apps/<SERVICE_KEY>/', () => {
    expect(getSessionCookiePath()).toBe('/apps/myapp/');
  });

  it('uses / outside production (npm run dev, no gateway prefix)', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(getSessionCookiePath()).toBe('/');
    vi.stubEnv('NODE_ENV', '');
    expect(getSessionCookiePath()).toBe('/');
  });

  it('ignores ENVIRONMENT=development (older .env.example values on deployed instances)', () => {
    vi.stubEnv('ENVIRONMENT', 'development');
    expect(getSessionCookiePath()).toBe('/apps/myapp/');
  });

  it('APP_SESSION_COOKIE_PATH wins', () => {
    vi.stubEnv('APP_SESSION_COOKIE_PATH', '/custom/');
    expect(getSessionCookiePath()).toBe('/custom/');
    vi.stubEnv('NODE_ENV', 'development');
    expect(getSessionCookiePath()).toBe('/custom/');
  });

  it('falls back to / without a valid SERVICE_KEY', () => {
    vi.stubEnv('SERVICE_KEY', 'Not Valid');
    expect(getSessionCookiePath()).toBe('/');
    vi.stubEnv('SERVICE_KEY', '');
    expect(getSessionCookiePath()).toBe('/');
  });

  it('refuses an invalid APP_SESSION_COOKIE_PATH at startup', () => {
    vi.stubEnv('APP_SESSION_COOKIE_PATH', 'apps/x');
    expect(() => createExchangeRouter({ query: vi.fn() } as never)).toThrow(/APP_SESSION_COOKIE_PATH/);
    vi.stubEnv('APP_SESSION_COOKIE_PATH', '/x; Domain=evil');
    expect(() => createExchangeRouter({ query: vi.fn() } as never)).toThrow(/APP_SESSION_COOKIE_PATH/);
  });

  it('sets the cookie on the app prefix and, without a legacy cookie, nothing else', async () => {
    const res = await request(app()).post('/api/auth/exchange').send({ token: platformToken() });
    const cookies = setCookies(res);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(/^myapp_app_session=ey/);
    expect(cookies[0]).toContain('Path=/apps/myapp/');
    expect(cookies[0]).toContain('HttpOnly');
    expect(cookies[0]).toContain('SameSite=Lax');
  });

  it('clears a legacy path=/ cookie AFTER setting the new one (gateway reads the first)', async () => {
    const res = await request(app())
      .post('/api/auth/exchange')
      .set('Cookie', 'myapp_app_session=old-legacy-value')
      .send({ token: platformToken() });
    const cookies = setCookies(res);
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toMatch(/^myapp_app_session=ey.*Path=\/apps\/myapp\//);
    expect(cookies[1]).toMatch(/^myapp_app_session=;/);
    expect(cookies[1]).toContain('Path=/;');
    expect(cookies[1]).toMatch(/Expires=Thu, 01 Jan 1970/);
    // Was der Kernel-Gateway (exchangeForSession) daraus liest: headers.get() + split(';')[0]
    expect(cookies.join(', ').split(';')[0]).toMatch(/^myapp_app_session=ey/);
  });

  it('does not clear the generic app_session on / (may belong to another, older app)', async () => {
    vi.stubEnv('APP_SESSION_COOKIE_NAME', '');
    const res = await request(app())
      .post('/api/auth/exchange')
      .set('Cookie', 'app_session=other-apps-session')
      .send({ token: platformToken() });
    const cookies = setCookies(res);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(/^app_session=ey.*Path=\/apps\/myapp\//);
    const logout = await request(app()).post('/api/auth/logout');
    expect(setCookies(logout)).toHaveLength(1);
  });

  it('does not clear anything extra when the path is / (development)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const res = await request(app())
      .post('/api/auth/exchange')
      .set('Cookie', 'myapp_app_session=old')
      .send({ token: platformToken() });
    const cookies = setCookies(res);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toContain('Path=/;');
  });

  it('logout clears the cookie on the app prefix and the legacy path', async () => {
    const res = await request(app()).post('/api/auth/logout');
    const cookies = setCookies(res);
    expect(res.status).toBe(200);
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toContain('Path=/apps/myapp/');
    expect(cookies[1]).toContain('Path=/;');
    for (const c of cookies) expect(c).toMatch(/^myapp_app_session=;/);
  });
});

// ─── APP_SESSION_SECRET ──────────────────────────────────────────────────────

describe('APP_SESSION_SECRET check', () => {
  it('accepts 32 bytes and more', () => {
    expect(checkSessionSecret('a'.repeat(32))).toEqual({ ok: true });
    expect(checkSessionSecret(crypto.randomBytes(32).toString('hex'))).toEqual({ ok: true });
  });

  it('missing → error', () => {
    expect(checkSessionSecret('')).toMatchObject({ ok: false, level: 'error', reason: 'missing' });
    expect(checkSessionSecret(undefined)).toMatchObject({ ok: false, level: 'error', reason: 'missing' });
  });

  it.each(['changeme', 'CHANGEME', 'change-me-generate-with-openssl-rand-hex-32', 'secret', 'your-secret-here-please-0123456789'])(
    'placeholder %s → error, even when long',
    (value) => {
      expect(checkSessionSecret(value)).toMatchObject({ ok: false, level: 'error', reason: 'placeholder' });
    },
  );

  it('shorter than 32 bytes → warning by default (existing instances keep running)', () => {
    expect(checkSessionSecret('short-but-random-x9')).toMatchObject({ ok: false, level: 'warn', reason: 'too_short' });
  });

  it('shorter than 32 bytes → error with APP_SESSION_SECRET_STRICT=true', () => {
    vi.stubEnv('APP_SESSION_SECRET_STRICT', 'true');
    expect(checkSessionSecret('short-but-random-x9')).toMatchObject({ ok: false, level: 'error', reason: 'too_short' });
  });

  it('counts bytes, not characters', () => {
    // 16 × „ä“ = 32 Byte UTF-8
    expect(checkSessionSecret('ä'.repeat(16))).toEqual({ ok: true });
  });

  it('createExchangeRouter fails fast in production on a missing secret and names the reason', () => {
    vi.stubEnv('APP_SESSION_SECRET', '');
    expect(() => createExchangeRouter({ query: vi.fn() } as never)).toThrow(/APP_SESSION_SECRET ist nicht gesetzt/);
  });

  it('outside production a missing secret only logs (tests build the router before setting env)', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('APP_SESSION_SECRET', '');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => createExchangeRouter({ query: vi.fn() } as never)).not.toThrow();
    expect(String(err.mock.calls[0][0])).toContain('nicht gesetzt');
    err.mockRestore();
  });

  it('APP_SESSION_SECRET_STRICT=true fails fast also outside production', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('APP_SESSION_SECRET_STRICT', 'true');
    vi.stubEnv('APP_SESSION_SECRET', 'short-but-random-x9');
    expect(() => createExchangeRouter({ query: vi.fn() } as never)).toThrow(/mindestens 32/);
  });

  it('createExchangeRouter fails fast on a placeholder', () => {
    vi.stubEnv('APP_SESSION_SECRET', 'changeme');
    expect(() => createExchangeRouter({ query: vi.fn() } as never)).toThrow(/Platzhalter/);
  });

  it('assertSessionSecret only warns for a short secret', () => {
    vi.stubEnv('APP_SESSION_SECRET', 'short-but-random-x9');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => assertSessionSecret()).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain('mindestens 32');
    warn.mockRestore();
  });
});
