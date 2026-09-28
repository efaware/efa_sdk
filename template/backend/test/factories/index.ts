import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { AppUser, SessionPayload } from '../../src/types';

/**
 * Test-Daten-Factories (Plattform-Blueprint-Baustein, siehe TESTING.md).
 *
 * Liefern voll typisierte Domänenobjekte mit sinnvollen Defaults; jeder Aufruf
 * nimmt ein Overrides-Objekt für genau die Felder, um die es im Test geht.
 * Deterministisch — KEIN `Date.now()`, kein `Math.random()`, damit Tests nicht
 * über die Uhr oder den Zufall flackern.
 *
 * Beim Ableiten einer eigenen App: die `example_items`-Factory durch die
 * Factories des echten Datenmodells ersetzen, den Rest so lassen.
 */

let seq = 0;

/** Deterministische, kollisionsfreie ID (für nicht-UUID-Spalten). */
export function nextId(prefix = 'id'): string {
  seq += 1;
  return `${prefix}-${seq.toString().padStart(4, '0')}`;
}

/** Deterministische UUID im v4-Layout — für `id`/`owner_id`-Spalten. */
export function nextUuid(): string {
  seq += 1;
  return `00000000-0000-4000-8000-${seq.toString(16).padStart(12, '0')}`;
}

/** Fixer Zeitpunkt für Zeitstempel-Spalten (keine echte Uhr in Tests). */
export const FIXED_DATE = new Date('2026-01-15T08:30:00.000Z');

/** `app_users`-Zeile, wie sie aus der DB zurückkommt (snake_case, Date-Objekte). */
export function makeAppUser(overrides: Partial<AppUser> = {}): AppUser {
  const n = seq + 1;
  return {
    id: nextUuid(),
    converge_id: `converge-user-${n}`,
    email: `user-${n}@example.com`,
    name: `user-${n}`,
    created_at: FIXED_DATE,
    last_seen_at: null,
    ...overrides,
  };
}

/** Inhalt des `app_session`-Cookies, wie ihn der Exchange ausstellt. */
export function makeSessionPayload(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    sub: nextUuid(),
    convergeId: 'converge-user-1',
    name: 'testuser',
    email: 'testuser@example.com',
    tenant: 'default',
    // Seit SDK 1.17 (efa #137) bindet der Exchange die Sitzung an das Kernel-Token;
    // `requireAuth` weist Sitzungen ohne diese beiden Felder mit 401 ab.
    kernelJti: nextId('kernel-jti'),
    kernelIat: 1_700_000_000,
    ...overrides,
  };
}

export interface ExampleItemRow {
  id: string;
  owner_id: string | null;
  title: string;
}

/** Beispiel-Datensatz aus `example_items` (Platzhalter fürs echte Datenmodell). */
export function makeExampleItem(overrides: Partial<ExampleItemRow> = {}): ExampleItemRow {
  const n = seq + 1;
  return {
    id: nextUuid(),
    owner_id: null,
    title: `Beispiel ${n}`,
    ...overrides,
  };
}

/**
 * RSA-Keypair als PEM und base64-PEM — genau die Form, in der der Kernel
 * `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` per Env an die App durchreicht.
 */
export function makeRsaKeypair(): {
  privateKeyPem: string;
  publicKeyPem: string;
  privateKeyB64: string;
  publicKeyB64: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return {
    privateKeyPem: privateKey,
    publicKeyPem: publicKey,
    privateKeyB64: Buffer.from(privateKey, 'utf8').toString('base64'),
    publicKeyB64: Buffer.from(publicKey, 'utf8').toString('base64'),
  };
}

/**
 * Signiert ein Plattform-JWT (RS256, iss/aud = `converge`), wie es der Kernel
 * ausstellt und `POST /api/auth/exchange` erwartet.
 *
 * Seit SDK 1.17 (efa #137) weist der Exchange Tokens ohne `jti` mit 401 ab — jedes
 * Kernel-Token trägt eine, damit die App-Sitzung entwertbar ist. `iat`/`exp` setzt
 * `jwt.sign` selbst. `{ jti: undefined }` als Claim erzeugt ein Token ohne `jti`.
 */
export function makePlatformToken(
  privateKeyPem: string,
  claims: Record<string, unknown> = {},
  options: jwt.SignOptions = {},
): string {
  return jwt.sign(
    {
      sub: 'converge-user-1',
      name: 'testuser',
      email: 'testuser@example.com',
      tenant: 'default',
      jti: nextId('kernel-jti'),
      ...claims,
    },
    privateKeyPem,
    { algorithm: 'RS256', expiresIn: '1h', issuer: 'converge', audience: 'converge', ...options },
  );
}
