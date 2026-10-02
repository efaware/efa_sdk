import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';
import { buildTestApp } from '../../../test/helpers/testApp';
import { startTestDb, type TestDb } from '../../../test/helpers/sqliteDb';
import { makeRsaKeypair, makePlatformToken } from '../../../test/factories';

/**
 * Der Token-Exchange ist der Einstiegspunkt jeder App: Plattform-JWT rein,
 * `app_session`-Cookie raus, `app_users`-Zeile automatisch angelegt.
 *
 * Hier laufen bewusst ECHTE Bausteine zusammen — SDK-Router, der SQLite-Adapter
 * aus `dbSqlite.ts` und das ausgelieferte `schema.sqlite.sql`. Genau an dieser
 * Naht bricht der Single-Container-Stack sonst unbemerkt: das SDK schickt
 * PostgreSQL-SQL (`$1`, `NOW()`, `ON CONFLICT … RETURNING`), das erst der
 * Adapter für SQLite übersetzt.
 */

const { poolHolder } = vi.hoisted(() => ({ poolHolder: { value: null as unknown } }));
vi.mock('../../db', () => ({ pool: poolHolder.value }));

const keys = makeRsaKeypair();
let db: TestDb;
let app: express.Express;

const ORIGINAL = {
  JWT_PUBLIC_KEY: process.env.JWT_PUBLIC_KEY,
  APP_SESSION_SECRET: process.env.APP_SESSION_SECRET,
};

beforeAll(async () => {
  process.env.JWT_PUBLIC_KEY = keys.publicKeyB64;
  process.env.APP_SESSION_SECRET = 'test-session-secret';

  db = await startTestDb();
  // Muss VOR dem Import von routes/auth stehen: der Router bekommt den Pool
  // beim Modul-Load übergeben (createExchangeRouter(pool)).
  poolHolder.value = db.pool;
  const authRouter = (await import('../../routes/auth')).default;
  app = buildTestApp('/api/auth', authRouter);
});

beforeEach(async () => {
  await db.truncateAll();
});

afterAll(async () => {
  await db.stop();
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('POST /api/auth/exchange – Abweisung ungültiger Anfragen', () => {
  it('antwortet mit 400, wenn kein Token mitgeschickt wird', async () => {
    // Act
    const res = await request(app).post('/api/auth/exchange').send({});

    // Assert
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'token required' });
  });

  it('antwortet mit 401 bei einem Token, das nicht vom Plattform-Key stammt', async () => {
    // Arrange – anderes Keypair = fremder Aussteller.
    const fremd = makeRsaKeypair();

    // Act
    const res = await request(app)
      .post('/api/auth/exchange')
      .send({ token: makePlatformToken(fremd.privateKeyPem) });

    // Assert
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid or expired platform token/);
  });

  it('antwortet mit 401 bei einem abgelaufenen Token', async () => {
    // Arrange
    const token = makePlatformToken(keys.privateKeyPem, {}, { expiresIn: '-1s' });

    // Act
    const res = await request(app).post('/api/auth/exchange').send({ token });

    // Assert
    expect(res.status).toBe(401);
  });

  it('antwortet mit 401 bei einem Token ohne jti (Sitzung wäre nicht entwertbar)', async () => {
    // Arrange – seit SDK 1.17 (efa #137) Pflicht-Claim jedes Kernel-Tokens.
    const token = makePlatformToken(keys.privateKeyPem, { jti: undefined });

    // Act
    const res = await request(app).post('/api/auth/exchange').send({ token });

    // Assert
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid or expired platform token/);
  });
});

describe('POST /api/auth/exchange – Auto-Provisioning gegen echtes SQLite', () => {
  it('legt beim ersten Login einen app_user an und liefert ihn zurück', async () => {
    // Arrange
    const token = makePlatformToken(keys.privateKeyPem, {
      sub: 'converge-uuid-1',
      name: 'Anna',
      email: 'anna@example.com',
    });

    // Act
    const res = await request(app).post('/api/auth/exchange').send({ token });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      convergeId: 'converge-uuid-1',
      name: 'Anna',
      email: 'anna@example.com',
      tenant: 'default',
    });

    const { rows } = await db.pool.query<{ converge_id: string; last_seen_at: string | null }>(
      'SELECT converge_id, last_seen_at FROM app_users',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].converge_id).toBe('converge-uuid-1');
    expect(rows[0].last_seen_at).not.toBeNull();
  });

  it('setzt den app_session-Cookie httpOnly', async () => {
    // Arrange
    const token = makePlatformToken(keys.privateKeyPem);

    // Act
    const res = await request(app).post('/api/auth/exchange').send({ token });

    // Assert
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('app_session='),
    );
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('legt beim zweiten Login keine zweite Zeile an, sondern aktualisiert die vorhandene', async () => {
    // Arrange
    const ersterToken = makePlatformToken(keys.privateKeyPem, {
      sub: 'converge-uuid-1',
      name: 'Alt',
      email: 'alt@example.com',
    });
    const erste = await request(app).post('/api/auth/exchange').send({ token: ersterToken });

    // Act – gleicher converge-sub, geänderter Name.
    const zweiterToken = makePlatformToken(keys.privateKeyPem, {
      sub: 'converge-uuid-1',
      name: 'Neu',
      email: 'neu@example.com',
    });
    const zweite = await request(app).post('/api/auth/exchange').send({ token: zweiterToken });

    // Assert
    expect(zweite.body.user.id).toBe(erste.body.user.id);
    const { rows } = await db.pool.query<{ name: string; email: string }>(
      'SELECT name, email FROM app_users',
    );
    expect(rows).toEqual([{ name: 'Neu', email: 'neu@example.com' }]);
  });

  it('speichert eine fehlende E-Mail als NULL', async () => {
    // Arrange
    const token = makePlatformToken(keys.privateKeyPem, { sub: 'converge-uuid-2', email: null });

    // Act
    await request(app).post('/api/auth/exchange').send({ token });

    // Assert
    const { rows } = await db.pool.query<{ email: string | null }>('SELECT email FROM app_users');
    expect(rows[0].email).toBeNull();
  });

  it('antwortet mit 500, wenn der Datenbank-Schreibvorgang scheitert', async () => {
    // Arrange – Tabelle kurzzeitig umbenennen statt Pool mocken: so bleibt der
    // echte Fehlerpfad des SDK-Routers erhalten.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    db.pool.exec('ALTER TABLE app_users RENAME TO app_users_weg');
    try {
      // Act
      const res = await request(app)
        .post('/api/auth/exchange')
        .send({ token: makePlatformToken(keys.privateKeyPem) });

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      db.pool.exec('ALTER TABLE app_users_weg RENAME TO app_users');
      errorSpy.mockRestore();
    }
  });
});

describe('POST /api/auth/logout', () => {
  it('löscht den app_session-Cookie und bestätigt mit ok', async () => {
    // Act
    const res = await request(app).post('/api/auth/logout').send({});

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('app_session='),
    );
    expect(cookie).toMatch(/app_session=;/);
  });
});
