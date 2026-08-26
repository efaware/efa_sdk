import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Test- + Coverage-Gate des SDK.
 *
 * `npm test`          → schnelle Suite (alles gemockt, ~1 s, hook-tauglich)
 * `npm run test:coverage` → dieselbe Suite + Coverage-Gate (so läuft die CI)
 *
 * Coverage-Standard: TESTING.md (Meta-Repo) → „Coverage-Ratchet". Zwei Ebenen:
 *  1) Globaler FLOOR knapp unter dem Ist-Stand als reiner Regressions-Schutz. Er ist
 *     niedrig, weil er auch die (noch) ungetesteten Module mitzählt — das SDK hat
 *     Tests bislang nur auf auth/health/ipc/viewPreferences/DataTable/format.
 *  2) Per-Datei-Gates auf genau diesen gezielt getesteten Modulen — hier darf die
 *     Abdeckung nicht zurückfallen.
 *
 * RATCHET: Wenn neue Tests die Abdeckung heben, diese Werte nachziehen — NIE senken.
 */

/**
 * Per-Datei-Gates auf den gezielt getesteten Modulen (jeweils knapp unter dem Ist-Stand).
 *
 * FALLE: Vitest ignoriert einen Schwellen-Key, der auf KEINE Datei matcht, vollkommen
 * still — ein Tippfehler oder eine spätere Umbenennung schaltet das Gate unbemerkt ab
 * und es bleibt für immer grün. Deshalb wird die Existenz jedes Pfads beim Laden der
 * Config geprüft und bei einem toten Key hart abgebrochen.
 */
const perFileThresholds = {
  'src/backend/auth.ts': { lines: 63, statements: 61, functions: 66, branches: 50 },
  'src/backend/health.ts': { lines: 100, statements: 100, functions: 100, branches: 50 },
  'src/frontend/ipc.ts': { lines: 58, statements: 57, functions: 56, branches: 50 },
  'src/frontend/viewPreferences.ts': { lines: 25, statements: 22, functions: 35, branches: 28 },
  'src/frontend/ui/DataTable.tsx': { lines: 15, statements: 15, functions: 9, branches: 9 },
  'src/frontend/format.ts': { lines: 100, statements: 100, functions: 100, branches: 90 },
};

// Die Config wird immer aus dem Paket-Root geladen (npm test läuft dort).
for (const file of Object.keys(perFileThresholds)) {
  if (!existsSync(resolve(process.cwd(), file))) {
    throw new Error(
      `vitest.config.ts: Coverage-Schwelle zeigt auf eine nicht existierende Datei: ${file}. ` +
        'Pfad korrigieren oder Eintrag entfernen — sonst wäre das Gate für dieses Modul still abgeschaltet.',
    );
  }
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      // Reine Re-Export-Barrels tragen keine Logik. ACHTUNG: Vitest matcht
      // exclude-Patterns pfad-unabhängig ('backend/**' würde auch src/backend/**
      // treffen) — deshalb hier ausschließlich vollqualifizierte src-Pfade.
      exclude: ['src/**/index.ts'],
      thresholds: {
        // FLOOR — gemessener Ist-Stand 2026-08-26: L 24.74 / S 23.78 / F 23.60 / B 15.76
        lines: 23,
        statements: 22,
        functions: 22,
        branches: 14,
        ...perFileThresholds,
      },
    },
  },
});
