/**
 * Postbuild für den Frontend-Build (ESM).
 *
 * 1. `frontend/package.json` mit `{"type":"module"}` schreiben — sonst behandelt Node
 *    die Dateien als CJS (Root-`package.json` steht auf `"type": "commonjs"`).
 * 2. Begleit-CSS des ui-Kits ins Build-Verzeichnis kopieren.
 * 3. GATE: sicherstellen, dass jeder relative Import-Specifier im Output vollständig
 *    spezifiziert ist (`'./Button.js'`, nicht `'./Button'`).
 *
 *    Warum das ein hartes Gate ist: `tsc` schreibt Specifier NIE um, sie kommen 1:1 aus
 *    der Quelle. Extensionslose Specifier lösen Vite/Rollup zwar auf, Nodes ESM-Resolver
 *    aber nicht — und Vitest externalisiert `node_modules`-Pakete mit `type:module` an
 *    genau diesen Resolver. Ein Rückfall würde also die komplette Frontend-Testsuite
 *    jeder konsumierenden App mit ERR_MODULE_NOT_FOUND killen. Der Lauf hängt an
 *    `build:frontend` und damit auch an `prepublishOnly` — greift also vor jedem Publish.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const OUT_DIR = 'frontend';

// --- 1 + 2: Artefakte ---------------------------------------------------------
fs.writeFileSync(path.join(OUT_DIR, 'package.json'), JSON.stringify({ type: 'module' }));
fs.copyFileSync('src/frontend/ui/styles.css', path.join(OUT_DIR, 'ui/styles.css'));

// --- 3: Gate ------------------------------------------------------------------
const ALLOWED_EXT = ['.js', '.mjs', '.cjs', '.json', '.css'];

/**
 * Alle Import-Specifier einer Datei (`from '…'`, `import('…')`, Side-Effect-`import '…'`,
 * `require`, `/// <reference path>`). Der TypeScript-Präprozessor überspringt Kommentare — seit die JSDoc im
 * Output bleibt (`removeComments: false`), stehen dort Beispiel-Imports, die kein Gate
 * auslösen dürfen.
 */
function relativeSpecifiers(source) {
  const info = ts.preProcessFile(source, true, true);
  return [...info.importedFiles, ...info.referencedFiles]
    .map((f) => f.fileName)
    .filter((name) => name.startsWith('./') || name.startsWith('../'));
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.d.ts')) yield full;
  }
}

const offenders = [];
for (const file of walk(OUT_DIR)) {
  const source = fs.readFileSync(file, 'utf8');
  for (const specifier of relativeSpecifiers(source)) {
    if (!ALLOWED_EXT.some((ext) => specifier.endsWith(ext))) {
      offenders.push(`${file}: '${specifier}'`);
    }
  }
}

if (offenders.length > 0) {
  console.error(
    `\nBuild abgebrochen: ${offenders.length} relative Import-Specifier ohne Datei-Endung im ` +
      `${OUT_DIR}/-Output.\nNode kann sie nicht auflösen (ERR_MODULE_NOT_FOUND in jeder ` +
      `konsumierenden App).\nFix: die Endung in der QUELLE ergänzen — './Button' -> './Button.js'.\n`,
  );
  for (const offender of offenders) console.error(`  ${offender}`);
  process.exit(1);
}

console.log(`postbuild-frontend: OK (${OUT_DIR}/package.json, ui/styles.css, Specifier-Gate)`);
