import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as backend from '../src/backend/platformAdmin';
import * as frontend from '../src/frontend/platformAdmin';
import * as backendBarrel from '../src/backend/index';

// Backend und Frontend tragen je eine Kopie (getrennte rootDirs) — beide müssen
// sich identisch verhalten.
describe.each([
  ['backend', backend],
  ['frontend', frontend],
])('platformAdmin (%s)', (_side, mod) => {
  it('names efa-all as the top permission', () => {
    expect(mod.PLATFORM_ADMIN_PERMISSION).toBe('efa-all');
  });

  it('accepts efa-all and the legacy converge-admin (until Q1-2027)', () => {
    expect([...mod.PLATFORM_ADMIN_PERMISSIONS]).toEqual(['efa-all', 'converge-admin']);
    expect(mod.isPlatformAdmin(['efa-all'])).toBe(true);
    expect(mod.isPlatformAdmin(['converge-admin'])).toBe(true);
    expect(mod.isPlatformAdmin(['myapp.default', 'efa-all', 'converge-admin'])).toBe(true);
  });

  it('rejects everything else', () => {
    expect(mod.isPlatformAdmin([])).toBe(false);
    expect(mod.isPlatformAdmin(null)).toBe(false);
    expect(mod.isPlatformAdmin(undefined)).toBe(false);
    expect(mod.isPlatformAdmin(['myapp.admin', 'efa-all.default', 'EFA-ALL', 'converge-admin '])).toBe(false);
  });

  it('classifies single keys', () => {
    expect(mod.isPlatformAdminPermission('efa-all')).toBe(true);
    expect(mod.isPlatformAdminPermission('converge-admin')).toBe(true);
    expect(mod.isPlatformAdminPermission('myapp.admin')).toBe(false);
  });

  it('keeps the key list immutable', () => {
    expect(Object.isFrozen(mod.PLATFORM_ADMIN_PERMISSIONS)).toBe(true);
  });
});

describe('barrel export', () => {
  it('exposes the helper via @efa-one/sdk/backend', () => {
    expect(backendBarrel.isPlatformAdmin).toBe(backend.isPlatformAdmin);
    expect(backendBarrel.PLATFORM_ADMIN_PERMISSIONS).toBe(backend.PLATFORM_ADMIN_PERMISSIONS);
  });
});

describe('scaffold parity', () => {
  // template/frontend/src/App.tsx führt die Liste lokal, solange das Scaffold auf
  // ein SDK ohne isPlatformAdmin zeigt. Beim Wegfall des Alt-Keys (Q1-2027) darf
  // keine der drei Kopien zurückbleiben.
  it('template App.tsx lists exactly the SDK keys', () => {
    const app = readFileSync(resolve(process.cwd(), 'template/frontend/src/App.tsx'), 'utf8');
    const m = app.match(/const PLATFORM_ADMIN_PERMISSIONS = \[([^\]]*)\]/);
    if (m) {
      const keys = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
      expect(keys).toEqual([...backend.PLATFORM_ADMIN_PERMISSIONS]);
    } else {
      // Liste entfernt → dann muss App.tsx den SDK-Helper nutzen.
      expect(app).toContain('isPlatformAdmin(');
    }
  });
});
