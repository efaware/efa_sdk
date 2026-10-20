import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import express from 'express';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser');
import request from 'supertest';
import type { Response } from 'express';
import {
  requireRegistryKey,
  requireInternalOrAuth,
  requireInternalOrAdminOrPermission,
} from '../src/backend/auth';
import type { AuthRequest } from '../src/backend/auth';
import {
  verifyServiceProvenance,
  resetProvenanceReplayCache,
  provenanceReplayCacheSize,
  PROVENANCE_REPLAY_CACHE_MAX,
} from '../src/backend/serviceProvenance';

// efa #287: Provenance-Guards prüfen seit 1.23 Aufrufer, Alter und Einmaligkeit.

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const getUserPermissionsMock = vi.fn();
vi.mock('../src/backend/permissionClient', () => ({
  getUserPermissions: (...args: unknown[]) => getUserPermissionsMock(...args),
}));
const serviceCallMock = vi.fn();
vi.mock('../src/backend/serviceClient', () => ({
  serviceClient: { call: (...args: unknown[]) => serviceCallMock(...args) },
}));

beforeEach(() => {
  vi.stubEnv('JWT_PUBLIC_KEY', Buffer.from(publicKey).toString('base64'));
  vi.stubEnv('SERVICE_KEY', 'myapp');
  vi.stubEnv('APP_SESSION_SECRET', 'provenance-test-secret-0123456789abcdef');
  resetProvenanceReplayCache();
  getUserPermissionsMock.mockReset();
  serviceCallMock.mockReset();
  serviceCallMock.mockResolvedValue({ active: true });
});

function mint(opts: { sub?: string; aud?: string; iss?: string; jti?: string | null; expiresIn?: number; iat?: number } = {}): string {
  const payload: Record<string, unknown> = {};
  if (opts.iat !== undefined) payload.iat = opts.iat;
  const signOpts: jwt.SignOptions = {
    algorithm: 'RS256',
    issuer: opts.iss ?? 'converge-gateway',
    audience: opts.aud ?? 'myapp',
    subject: opts.sub ?? 'converge_chat',
    expiresIn: opts.expiresIn ?? 60,
  };
  if (opts.jti !== null) signOpts.jwtid = opts.jti ?? crypto.randomUUID();
  return jwt.sign(payload, privateKey, signOpts);
}

function req(token?: string, extra: Record<string, unknown> = {}): AuthRequest {
  return { headers: token ? { 'x-service-token': token } : {}, cookies: {}, ...extra } as unknown as AuthRequest;
}

function mockRes(): Response {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
}

const nowSec = (): number => Math.floor(Date.now() / 1000);

describe('verifyServiceProvenance', () => {
  it('accepts a valid token and exposes the caller', () => {
    const r = req(mint());
    expect(verifyServiceProvenance(r)).toEqual({ ok: true, caller: 'converge_chat' });
    expect(r.callerService).toBe('converge_chat');
  });

  it('reports a missing token', () => {
    expect(verifyServiceProvenance(req())).toEqual({ ok: false, reason: 'missing' });
  });

  it.each([
    ['wrong audience', () => mint({ aud: 'otherapp' })],
    ['wrong issuer', () => mint({ iss: 'converge' })],
    ['expired', () => mint({ iat: nowSec() - 200, expiresIn: 10 })],
    ['caller key outside the service-key format', () => mint({ sub: 'Evil/../x' })],
    ['foreign signing key', () => jwt.sign({}, crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey, {
      algorithm: 'RS256', issuer: 'converge-gateway', audience: 'myapp', subject: 'converge_chat', expiresIn: 60,
    })],
  ])('rejects %s', (_label, make) => {
    const r = req(make());
    expect(verifyServiceProvenance(r)).toEqual({ ok: false, reason: 'invalid' });
    expect(r.callerService).toBeUndefined();
  });

  it('rejects a token older than 60 s even if the issuer set a long exp (maxAge)', () => {
    const token = mint({ iat: nowSec() - 120, expiresIn: 3600 });
    expect(verifyServiceProvenance(req(token))).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects any token when SERVICE_KEY is not set', () => {
    vi.stubEnv('SERVICE_KEY', '');
    expect(verifyServiceProvenance(req(mint()))).toEqual({ ok: false, reason: 'invalid' });
  });

  it('accepts a token only once (jti replay protection)', () => {
    const token = mint();
    expect(verifyServiceProvenance(req(token)).ok).toBe(true);
    expect(verifyServiceProvenance(req(token))).toEqual({ ok: false, reason: 'replayed' });
  });

  it('lets several guards in the SAME request see the same token', () => {
    const token = mint();
    const r = req(token);
    expect(verifyServiceProvenance(r).ok).toBe(true);
    expect(verifyServiceProvenance(r).ok).toBe(true);
    // ein anderer Request mit demselben Token bleibt ein Replay
    expect(verifyServiceProvenance(req(token))).toEqual({ ok: false, reason: 'replayed' });
  });

  it('keeps accepting tokens without jti (kernel before efa_kernel#106)', () => {
    const token = mint({ jti: null });
    expect(verifyServiceProvenance(req(token)).ok).toBe(true);
    expect(verifyServiceProvenance(req(token)).ok).toBe(true);
    expect(provenanceReplayCacheSize()).toBe(0);
  });

  it('applies allowedCallers and does not set callerService for a rejected caller', () => {
    const r = req(mint({ sub: 'customer_app' }));
    expect(verifyServiceProvenance(r, { allowedCallers: ['converge_chat'] }))
      .toEqual({ ok: false, reason: 'caller_not_allowed', caller: 'customer_app' });
    expect(r.callerService).toBeUndefined();
  });

  it('bounds the replay list: the oldest entries fall out, newer ones stay single-use', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resetProvenanceReplayCache(3);
    const tokens = [1, 2, 3, 4].map((i) => mint({ jti: `j${i}` }));
    for (const t of tokens) expect(verifyServiceProvenance(req(t)).ok).toBe(true);
    expect(provenanceReplayCacheSize()).toBe(3);
    expect(warn).toHaveBeenCalledOnce();
    // j1 ist verdrängt (bewusst in Kauf genommen), j4 weiterhin einmalig
    expect(verifyServiceProvenance(req(tokens[3]))).toEqual({ ok: false, reason: 'replayed' });
    warn.mockRestore();
  });

  it('sweeps expired entries (in expiry order) on a later request', () => {
    vi.useFakeTimers({ now: new Date('2026-10-21T10:00:00Z') });
    try {
      expect(verifyServiceProvenance(req(mint({ jti: 'old-1' }))).ok).toBe(true);
      expect(verifyServiceProvenance(req(mint({ jti: 'old-2' }))).ok).toBe(true);
      expect(provenanceReplayCacheSize()).toBe(2);
      vi.setSystemTime(new Date('2026-10-21T10:02:00Z'));
      expect(verifyServiceProvenance(req(mint({ jti: 'new-1' }))).ok).toBe(true);
      expect(provenanceReplayCacheSize()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a token with a malformed jti claim', () => {
    const token = jwt.sign({ jti: 42 }, privateKey, {
      algorithm: 'RS256', issuer: 'converge-gateway', audience: 'myapp', subject: 'converge_chat', expiresIn: 60,
    });
    expect(verifyServiceProvenance(req(token))).toEqual({ ok: false, reason: 'invalid' });
  });

  it('default cap is 20 000 entries', () => {
    expect(PROVENANCE_REPLAY_CACHE_MAX).toBe(20_000);
  });
});

describe('requireRegistryKey', () => {
  it('keeps working as plain middleware (any authenticated service)', () => {
    const next = vi.fn();
    const r = req(mint({ sub: 'customer_app' }));
    requireRegistryKey(r, mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
    expect(r.callerService).toBe('customer_app');
  });

  it('returns 401 without token', () => {
    const res = mockRes();
    const next = vi.fn();
    requireRegistryKey(req(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('with allowedCallers: 200 for an allowed caller, 403 for any other', () => {
    const guard = requireRegistryKey({ allowedCallers: ['converge_chat', 'converge_kernel'] });
    const next = vi.fn();
    guard(req(mint({ sub: 'converge_chat' })), mockRes(), next);
    expect(next).toHaveBeenCalledOnce();

    const res = mockRes();
    const next2 = vi.fn();
    guard(req(mint({ sub: 'customer_app' })), res, next2);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Service caller not allowed' });
    expect(next2).not.toHaveBeenCalled();
  });

  it('returns 401 for a replayed token', () => {
    const guard = requireRegistryKey({ allowedCallers: ['converge_chat'] });
    const token = mint();
    guard(req(token), mockRes(), vi.fn());
    const res = mockRes();
    guard(req(token), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('refuses an empty or malformed allowlist at setup time', () => {
    expect(() => requireRegistryKey({ allowedCallers: [] })).toThrow(/mindestens/);
    expect(() => requireRegistryKey({ allowedCallers: ['Not A Key'] })).toThrow(/ungültig/);
  });

  it('works through two stacked routers on the same path (one token, two guards)', async () => {
    const app = express();
    const a = express.Router();
    a.use(requireRegistryKey);
    a.get('/a', (_q, s) => { s.json({ from: 'a' }); });
    const b = express.Router();
    b.use(requireRegistryKey({ allowedCallers: ['converge_chat'] }));
    b.get('/b', (q, s) => { s.json({ from: 'b', caller: (q as AuthRequest).callerService }); });
    app.use('/api/internal', a);
    app.use('/api/internal', b);

    const res = await request(app).get('/api/internal/b').set('X-Service-Token', mint());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ from: 'b', caller: 'converge_chat' });
  });
});

describe('requireInternalOrAuth', () => {
  it('plain middleware still lets any valid service through', () => {
    const next = vi.fn();
    requireInternalOrAuth(req(mint({ sub: 'customer_app' })), mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('with allowedCallers: a foreign caller without session gets 401 from the session check', () => {
    const guard = requireInternalOrAuth({ allowedCallers: ['converge_chat'] });
    const res = mockRes();
    const next = vi.fn();
    guard(req(mint({ sub: 'customer_app' })), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('with allowedCallers: a foreign caller WITH a delegated user session passes as that user', async () => {
    const app = express();
    app.use(cookieParser());
    app.get('/x', requireInternalOrAuth({ allowedCallers: ['converge_chat'] }), (q, s) => {
      const r = q as AuthRequest;
      s.json({ caller: r.callerService ?? null, user: r.user?.convergeId ?? null });
    });
    const session = jwt.sign(
      { sub: 'u1', convergeId: 'c1', name: 'n', email: null, tenant: 'default', kernelJti: 'kj', kernelIat: nowSec() - 5 },
      'provenance-test-secret-0123456789abcdef',
      { expiresIn: '1h' },
    );
    const res = await request(app)
      .get('/x')
      .set('X-Service-Token', mint({ sub: 'customer_app' }))
      .set('Cookie', `app_session=${session}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ caller: null, user: 'c1' });
  });
});

describe('callerService after a rejected allowlist', () => {
  it('is removed again when a later, stricter guard rejects the caller', () => {
    const r = req(mint({ sub: 'customer_app' }));
    requireRegistryKey(r, mockRes(), vi.fn());
    expect(r.callerService).toBe('customer_app');
    const res = mockRes();
    requireInternalOrAuth({ allowedCallers: ['converge_chat'] })(r, res, vi.fn());
    expect(r.callerService).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(401); // Benutzer-Weg ohne Sitzung
  });
});

describe('requireInternalOrAdminOrPermission', () => {
  it('lets an allowed service through without a permission lookup', () => {
    const next = vi.fn();
    requireInternalOrAdminOrPermission({ allowedCallers: ['converge_chat'] }, 'myapp.read')(req(mint()), mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
    expect(getUserPermissionsMock).not.toHaveBeenCalled();
  });

  it('refuses options anywhere but in first position', () => {
    expect(() => requireInternalOrAdminOrPermission('myapp.read', { allowedCallers: ['converge_chat'] } as never)).toThrow(/erstes Argument/);
  });

  it('keeps the variadic form (permission keys only)', () => {
    const next = vi.fn();
    requireInternalOrAdminOrPermission('myapp.read', 'myapp.write')(req(mint({ sub: 'customer_app' })), mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('a foreign service falls back to the user check (no session → 401)', () => {
    const res = mockRes();
    const next = vi.fn();
    requireInternalOrAdminOrPermission({ allowedCallers: ['converge_chat'] }, 'myapp.read')(
      req(mint({ sub: 'customer_app' })), res, next,
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
