// Flat ESLint-Config für @efa-one/sdk (lean baseline, plattformweiter Stil).
// Läuft mit TypeScript 6.0.x — typescript-eslint unterstützt TS < 6.1.0; unter dem
// nativen TS-7.0-Compiler bricht das Lint-Kommando komplett ab ("does not support TS 7.0").
// Deshalb ist `typescript: 6.0.3` in package.json exakt gepinnt (siehe CLAUDE.md
// „TypeScript-Version") und Dependabot ignoriert dort semver-major.
//
// Prinzip (identisch zu kernel/chat/ai): echte-Bug-Regeln bleiben `error`, Stil-/
// Rausch-Regeln stehen auf `warn` — Warnungen brechen den CI-Gate NICHT, `npm run lint`
// failt nur bei Errors.
//
// WICHTIG zum Verständnis des Umfangs: `tseslint.configs.recommended` enthält den
// `eslint-recommended`-Override, der die klassischen JS-Bug-Regeln (no-const-assign,
// no-dupe-keys, no-unreachable, no-undef …) für TS-Dateien ABSCHALTET — sie sind dort
// Aufgabe von `tsc`. Für src/** ist das korrekt (der typecheck-Gate deckt es ab).
// Für test/ + scripts/ werden die wichtigsten unten gezielt reaktiviert, weil dort
// zusätzlich tsconfig.test.json greift, ESLint aber die einzige Instanz ist, die z. B.
// unerreichbaren Code meldet.
//
// Das SDK vereint Node-Backend (src/backend) und React-Frontend (src/frontend) in EINEM
// Paket, daher eine gemeinsame Config mit einem React-Block für src/frontend.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    // backend/ + frontend/ im Repo-Root sind der GENERIERTE tsc-Output (gitignored,
    // npm-`files`), nicht Quellcode. template/ ist Scaffold für andere Repos und wird
    // dort gelintet, nicht hier.
    ignores: ['backend/**', 'frontend/**', 'coverage/**', 'node_modules/**', 'template/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // TypeScript prüft undefinierte Namen selbst → base-Regel würde Node-/Browser-Globals
      // fälschlich flaggen.
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      // require() ist im commonjs-Backend ein bewusstes Muster (Lazy-/Conditional-Loads).
      '@typescript-eslint/no-require-imports': 'warn',
      // Leeres Interface, das nur einen Supertype erweitert, ist ein gängiges Props-Alias-Muster.
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // test/ + scripts/ werden von keiner Build-tsconfig erfasst (nur von
    // tsconfig.test.json) — die klassischen Bug-Regeln dort wieder scharf stellen.
    files: ['test/**/*.{ts,tsx}', 'scripts/**/*.{mjs,js,ts}'],
    rules: {
      'no-const-assign': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-cond-assign': 'error',
      'no-dupe-args': 'error',
    },
  },
  {
    // React-aware nur für den Frontend-Teil des SDK.
    files: ['src/frontend/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Hook-Regelverstöße sind echte Bugs (error), fehlende Deps nur Hinweis (warn).
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // ── Datums-/Zeit-Anzeige (plattformweite Vorgabe) ─────────────────────────
    // Datum `DD.MM.YYYY`, Zeit `HH:MM` (24 h) — siehe
    // `app-development-specs/DESIGN_SYSTEM.md` → „Datum & Uhrzeit".
    // Die `toLocale*`-APIs sind der Grund, warum vorher drei Schreibweisen
    // nebeneinander standen: `de-DE` ohne Options-Objekt formatiert einstellig
    // („1.9.2026"), `dateStyle:'short'` kürzt das Jahr („01.09.26"), und ganz ohne
    // Locale-Argument entscheidet die Browser-Sprache („9/1/2026").
    // Zahl-Formatierung mit explizitem Locale (`n.toLocaleString('de-DE')`) bleibt
    // erlaubt — geprüft werden nur die Date-only-APIs, der locale-lose Aufruf und
    // der Direktaufruf auf `new Date(...)`.
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='toLocaleDateString']",
          message:
            'Datum über formatDate()/formatDateTime() aus „src/frontend/format.ts“ ausgeben — toLocaleDateString liefert „1.9.2026" statt „01.09.2026".',
        },
        {
          selector: "CallExpression[callee.property.name='toLocaleTimeString']",
          message: 'Uhrzeit über formatTime()/formatDateTime() aus „src/frontend/format.ts“ ausgeben.',
        },
        {
          selector: "CallExpression[callee.property.name='toLocaleString'][arguments.length=0]",
          message:
            'toLocaleString() ohne Locale folgt der Browser-Sprache (→ „9/1/2026"). Datum/Zeit über „src/frontend/format.ts“, Zahlen mit explizitem Locale formatieren.',
        },
        {
          selector:
            "CallExpression[callee.property.name='toLocaleString'][callee.object.type='NewExpression'][callee.object.callee.name='Date']",
          message: 'Datum/Zeit über formatDate()/formatDateTime()/formatTime() aus „src/frontend/format.ts“ ausgeben.',
        },
      ],
    },
  },
);
