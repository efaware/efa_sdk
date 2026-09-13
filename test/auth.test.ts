import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {
  requireAuth,
  requireAdmin,
  requirePermission,
  requireAdminOrPermission,
  requireInternalOrAuth,
  createExchangeRouter,
} from '../src/backend/auth';
import { clearSessionStatusCache } from '../src/backend/sessionStatusClient';
import type { Response } from 'express';
import type { AuthRequest, SessionPayload } from '../src/backend/auth';
import express from 'express';
import request from 'supertest';

const APP_SESSION_SECRET = 'test-app-session-secret';

const { privateKey: rsaPrivateKey, publicKey: rsaPublicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const JWT_PUBLIC_KEY_B64 = Buffer.from(rsaPublicKey).toString('base64');

const getUserPermissionsMock = vi.fn();
vi.mock('../src/backend/permissionClient', () => ({
  getUserPermissions: (...args: unknown[]) => getUserPermissionsMock(...args),
}));

// Der Live-Status läuft ECHT durch sessionStatusClient (inkl. Cache); gemockt
// wird erst der Gateway-Client darunter.
const serviceCallMock = vi.fn();
vi.mock('../src/backend/serviceClient', () => ({
  serviceClient: { call: (...args: unknown[]) => serviceCallMock(...args) },
}));

const nowSec = (): number => Math.floor(Date.now() / 1000);

beforeEach(() => {
  vi.stubEnv('APP_SESSION_SECRET', APP_SESSION_SECRET);
  vi.stubEnv('JWT_PUBLIC_KEY', JWT_PUBLIC_KEY_B64);
  getUserPermissionsMock.mockReset();
  serviceCallMock.mockReset();
  serviceCallMock.mockResolvedValue({ active: true });
  clearSessionStatusCache();
});

function makeSessionToken(payload: Partial<SessionPayload> = {}): string {
  const defaults: SessionPayload = {
    sub: 'user-123',
    convergeId: 'converge-456',
    name: 'testuser',
    email: 'test@example.com',
    tenant: 'default',
    kernelJti: 'kernel-jti-1',
    kernelIat: nowSec() - 60,
  };
  return jwt.sign({ ...defaults, ...payload }, APP_SESSION_SECRET, { expiresIn: '1h' });
}

function makeConvergeToken(overrides: Record<string, unknown> = {}, options: jwt.SignOptions = {}): string {
  return jwt.sign(
    {
      sub: 'converge-456',
      name: 'testuser',
      email: 'test@example.com',
      tenant: 'default',
      ...overrides,
    },
    rsaPrivateKey,
    // iss/aud müssen zum gehärteten Exchange-Verifier passen (Finding #9).
    { algorithm: 'RS256', expiresIn: '1h', issuer: 'converge', audience: 'converge', jwtid: 'kernel-jti-1', ...options },
  );
}

function mockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    cookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function sessionReq(token = makeSessionToken()): AuthRequest {
  return { cookies: { app_session: token }, headers: {} } as unknown as AuthRequest;
}

// ─── requireAuth ────────────────────────────────────────────────────────────

describe('requireAuth', () => {
  it('returns 401 when no cookie present', () => {
    const req = { cookies: {} } as AuthRequest;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when cookie has invalid token', () => {
    const req = { cookies: { app_session: 'garbage' } } as AuthRequest;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token is expired', () => {
    const expired = jwt.sign(
      { sub: 'x', convergeId: 'y', name: 'x', email: null, tenant: 'default', kernelJti: 'j', kernelIat: 1 },
      APP_SESSION_SECRET,
      { expiresIn: '-1s' },
    );
    const req = { cookies: { app_session: expired } } as AuthRequest;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  // efa-Task #137: eine Sitzung von SDK < 1.17 ist an keine Kernel-Sitzung
  // gebunden und damit nicht entwertbar → abweisen, kein Fallback.
  it('returns 401 for a legacy session without kernelJti — without a status lookup', async () => {
    const legacy = jwt.sign(
      { sub: 'user-123', convergeId: 'converge-456', name: 'testuser', email: null, tenant: 'default' },
      APP_SESSION_SECRET,
      { expiresIn: '1h' },
    );
    const req = sessionReq(legacy);
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);
    await flushAsync();

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(serviceCallMock).not.toHaveBeenCalled();
  });

  it('sets req.user and calls next when the kernel session is active', async () => {
    const kernelIat = nowSec() - 120;
    const req = sessionReq(makeSessionToken({ kernelIat }));
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);
    expect(next).not.toHaveBeenCalled(); // erst nach dem Live-Lookup
    await flushAsync();

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toBeDefined();
    expect(req.user!.convergeId).toBe('converge-456');
    expect(req.user!.name).toBe('testuser');
    expect(req.user!.email).toBe('test@example.com');
    expect(serviceCallMock).toHaveBeenCalledWith(
      'converge_access',
      'GET',
      `/api/internal/sessions/kernel-jti-1/status?sub=converge-456&iat=${kernelIat}`,
    );
  });

  it('returns 401 "Session revoked" when the kernel reports the session as inactive', async () => {
    serviceCallMock.mockResolvedValue({ active: false, reason: 'session_revoked' });
    const req = sessionReq();
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);
    await flushAsync();

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Session revoked' });
    expect(next).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('uses the cache: two requests within 30 s cause a single status lookup', async () => {
    const token = makeSessionToken();
    const next = vi.fn();

    requireAuth(sessionReq(token), mockRes(), next);
    await flushAsync();
    requireAuth(sessionReq(token), mockRes(), next);
    await flushAsync();

    expect(next).toHaveBeenCalledTimes(2);
    expect(serviceCallMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed with 503 when the status lookup fails', async () => {
    serviceCallMock.mockRejectedValue(new Error('gateway down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const req = sessionReq();
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);
    await flushAsync();

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: 'Session service unavailable' });
    expect(next).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('fails closed with 503 on an unexpected status response (e.g. kernel without the endpoint)', async () => {
    serviceCallMock.mockResolvedValue(undefined);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    const next = vi.fn();

    requireAuth(sessionReq(), res, next);
    await flushAsync();

    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// ─── requireAdmin ───────────────────────────────────────────────────────────

describe('requireAdmin', () => {
  it('returns 403 when user lacks converge-admin permission', async () => {
    getUserPermissionsMock.mockResolvedValueOnce(['myapp.default']);
    const req = sessionReq();
    const res = mockRes();
    const next = vi.fn();

    requireAdmin(req, res, next);
    await flushAsync();
    await flushAsync();

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when user has converge-admin permission', async () => {
    getUserPermissionsMock.mockResolvedValueOnce(['converge-admin']);
    const req = sessionReq();
    const res = mockRes();
    const next = vi.fn();

    requireAdmin(req, res, next);
    await flushAsync();
    await flushAsync();

    expect(next).toHaveBeenCalled();
  });

  it('returns 401 for a revoked session without a permission lookup', async () => {
    serviceCallMock.mockResolvedValue({ active: false, reason: 'server_restarted' });
    const res = mockRes();
    const next = vi.fn();

    requireAdmin(sessionReq(), res, next);
    await flushAsync();
    await flushAsync();

    expect(res.status).toHaveBeenCalledWith(401);
    expect(getUserPermissionsMock).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── requirePermission ──────────────────────────────────────────────────────

describe('requirePermission', () => {
  it('returns 403 when user lacks the permission', async () => {
    getUserPermissionsMock.mockResolvedValueOnce(['myapp.default']);
    const req = sessionReq();
    const res = mockRes();
    const next = vi.fn();

    requirePermission('myapp.admin')(req, res, next);
    await flushAsync();
    await flushAsync();

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when user has the permission', async () => {
    getUserPermissionsMock.mockResolvedValueOnce(['myapp.default', 'myapp.admin']);
    const req = sessionReq();
    const res = mockRes();
    const next = vi.fn();

    requirePermission('myapp.admin')(req, res, next);
    await flushAsync();
    await flushAsync();

    expect(next).toHaveBeenCalled();
  });

  it('returns 401 for a revoked session without a permission lookup', async () => {
    serviceCallMock.mockResolvedValue({ active: false, reason: 'session_revoked' });
    const res = mockRes();
    const next = vi.fn();

    requirePermission('myapp.admin')(sessionReq(), res, next);
    await flushAsync();
    await flushAsync();

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Session revoked' });
    expect(getUserPermissionsMock).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── requireAdminOrPermission ───────────────────────────────────────────────

describe('requireAdminOrPermission', () => {
  it('allows admin via converge-admin', async () => {
    getUserPermissionsMock.mockResolvedValueOnce(['converge-admin']);
    const req = sessionReq();
    const res = mockRes();
    const next = vi.fn();

    requireAdminOrPermission('myapp.admin')(req, res, next);
    await flushAsync();
    await flushAsync();

    expect(next).toHaveBeenCalled();
  });

  it('allows user with one of the listed permissions', async () => {
    getUserPermissionsMock.mockResolvedValueOnce(['myapp.write']);
    const req = sessionReq();
    const res = mockRes();
    const next = vi.fn();

    requireAdminOrPermission('myapp.admin', 'myapp.write')(req, res, next);
    await flushAsync();
    await flushAsync();

    expect(next).toHaveBeenCalled();
  });

  it('returns 401 for a revoked session without a permission lookup', async () => {
    serviceCallMock.mockResolvedValue({ active: false, reason: 'session_revoked' });
    const res = mockRes();
    const next = vi.fn();

    requireAdminOrPermission('myapp.admin')(sessionReq(), res, next);
    await flushAsync();
    await flushAsync();

    expect(res.status).toHaveBeenCalledWith(401);
    expect(getUserPermissionsMock).not.toHaveBeenCalled();
  });
});

// ─── requireInternalOrAuth ──────────────────────────────────────────────────

describe('requireInternalOrAuth', () => {
  it('lets a valid gateway provenance token through without a session lookup', () => {
    vi.stubEnv('SERVICE_KEY', 'myapp');
    const provenance = jwt.sign({}, rsaPrivateKey, {
      algorithm: 'RS256', issuer: 'converge-gateway', audience: 'myapp', subject: 'converge_chat', expiresIn: '1m',
    });
    const req = { cookies: {}, headers: { 'x-service-token': provenance } } as unknown as AuthRequest;
    const res = mockRes();
    const next = vi.fn();

    requireInternalOrAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(serviceCallMock).not.toHaveBeenCalled();
  });

  it('falls back to the session check (revoked → 401)', async () => {
    serviceCallMock.mockResolvedValue({ active: false, reason: 'session_revoked' });
    const res = mockRes();
    const next = vi.fn();

    requireInternalOrAuth(sessionReq(), res, next);
    await flushAsync();

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── Token Exchange ─────────────────────────────────────────────────────────

describe('createExchangeRouter', () => {
  function createTestApp(pool: any) {
    const app = express();
    app.use(express.json());
    const cookieParser = require('cookie-parser');
    app.use(cookieParser());
    app.use('/api/auth', createExchangeRouter(pool));
    return app;
  }

  function okPool() {
    return { query: vi.fn().mockResolvedValue({ rows: [{ id: 'app-user-789' }] }) };
  }

  function sessionCookie(res: request.Response): string {
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies).toBeDefined();
    const cookie = cookies.find((c) => c.startsWith('app_session='));
    expect(cookie).toBeDefined();
    return cookie as string;
  }

  it('returns 400 when token is missing', async () => {
    const pool = { query: vi.fn() };
    const app = createTestApp(pool);

    const res = await request(app).post('/api/auth/exchange').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('token required');
  });

  it('returns 401 when converge token is invalid', async () => {
    const pool = { query: vi.fn() };
    const app = createTestApp(pool);

    const res = await request(app).post('/api/auth/exchange').send({ token: 'invalid' });

    expect(res.status).toBe(401);
  });

  it('creates user and returns session on valid converge token', async () => {
    const pool = okPool();
    const app = createTestApp(pool);
    const convergeToken = makeConvergeToken();

    const res = await request(app).post('/api/auth/exchange').send({ token: convergeToken });

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.convergeId).toBe('converge-456');
    expect(res.body.user.name).toBe('testuser');
    // Permissions stehen NICHT im Exchange-Response — Apps fragen sie per Live-Lookup
    expect(res.body.user.permissions).toBeUndefined();

    const cookie = sessionCookie(res);
    expect(cookie).toContain('HttpOnly');

    expect(pool.query).toHaveBeenCalledOnce();
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO app_users');
    expect(sql).toContain('ON CONFLICT');
    expect(params[0]).toBe('converge-456');
    expect(params[2]).toBe('testuser');
  });

  // efa-Task #137: app_session ist an die Kernel-Sitzung gebunden und lebt
  // genau so lange wie das Kernel-Token.
  it('binds the session to the kernel token: kernelJti/kernelIat and exp = kernel exp', async () => {
    const app = createTestApp(okPool());
    const convergeToken = makeConvergeToken({}, { expiresIn: '25m', jwtid: 'kernel-jti-exp' });
    const kernel = jwt.decode(convergeToken) as { iat: number; exp: number };

    const res = await request(app).post('/api/auth/exchange').send({ token: convergeToken });

    expect(res.status).toBe(200);
    const cookie = sessionCookie(res);
    const sessionToken = decodeURIComponent(cookie.split(';')[0].slice('app_session='.length));
    const session = jwt.verify(sessionToken, APP_SESSION_SECRET, { algorithms: ['HS256'] }) as SessionPayload & { exp: number };
    expect(session.kernelJti).toBe('kernel-jti-exp');
    expect(session.kernelIat).toBe(kernel.iat);
    expect(session.exp).toBe(kernel.exp);

    const maxAge = Number(/Max-Age=(\d+)/.exec(cookie)?.[1]);
    expect(maxAge).toBeGreaterThanOrEqual(25 * 60 - 2);
    expect(maxAge).toBeLessThanOrEqual(25 * 60);
  });

  it('returns 401 for a kernel token without jti and provisions nothing', async () => {
    const pool = { query: vi.fn() };
    const app = createTestApp(pool);
    const noJti = jwt.sign(
      { sub: 'converge-456', name: 'testuser', email: null, tenant: 'default' },
      rsaPrivateKey,
      { algorithm: 'RS256', expiresIn: '1h', issuer: 'converge', audience: 'converge' },
    );

    const res = await request(app).post('/api/auth/exchange').send({ token: noJti });

    expect(res.status).toBe(401);
    expect(pool.query).not.toHaveBeenCalled();
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('returns 401 for a jti outside the kernel endpoint format', async () => {
    const pool = { query: vi.fn() };
    const app = createTestApp(pool);

    const res = await request(app)
      .post('/api/auth/exchange')
      .send({ token: makeConvergeToken({}, { jwtid: 'bad jti/../' }) });

    expect(res.status).toBe(401);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('GET /permissions rejects a revoked session with 401 and skips the permission lookup', async () => {
    serviceCallMock.mockResolvedValue({ active: false, reason: 'session_revoked' });
    const app = createTestApp({ query: vi.fn() });

    const res = await request(app)
      .get('/api/auth/permissions')
      .set('Cookie', `app_session=${makeSessionToken()}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Session revoked' });
    expect(getUserPermissionsMock).not.toHaveBeenCalled();
  });

  it('GET /permissions returns keys for an active session', async () => {
    getUserPermissionsMock.mockResolvedValueOnce(['myapp.default']);
    const app = createTestApp({ query: vi.fn() });

    const res = await request(app)
      .get('/api/auth/permissions')
      .set('Cookie', `app_session=${makeSessionToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ keys: ['myapp.default'] });
  });

  it('logout clears cookie', async () => {
    const pool = { query: vi.fn() };
    const app = createTestApp(pool);

    const res = await request(app).post('/api/auth/logout');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
