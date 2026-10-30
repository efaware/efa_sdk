/**
 * Erzeugt `frontend/ui/REFERENCE.md`: die kompakte API-Referenz des ui-Kits für
 * Coding-Agenten (efa studio legt sie als `.efa/sdk-ui.md` in jeden Arbeitsbereich).
 *
 * Warum generiert: Agenten haben sonst die kompilierten Quellen in `node_modules`
 * gelesen — mehrfach, je Lauf zehntausende Token, die in jedem weiteren Modellaufruf
 * mitlaufen. Die Referenz entsteht aus den ausgelieferten `.d.ts` samt JSDoc und passt
 * damit immer zur installierten Version.
 *
 * Inhalt: nur, was der Barrel `frontend/ui/index.d.ts` exportiert, plus die lokalen
 * Typen, auf die diese Exporte verweisen (z. B. `ButtonProps`). Interne Helfer, die ein
 * Modul nur für Tests exportiert (`buildRenderItems` in DataTable), bleiben draußen.
 *
 * Agenten lesen nur den Abschnitt, den sie brauchen (Inhaltsverzeichnis oben, ein
 * Abschnitt je Modul). Alles Gelesene läuft in jedem weiteren Modellaufruf mit.
 *
 * GATE: Ist ein Abschnitt größer als MAX_SECTION_BYTES oder die ganze Datei größer als
 * MAX_BYTES, bricht der Build ab. Wächst sie, JSDoc kürzen oder die Grenze bewusst
 * anheben.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const UI_DIR = 'frontend/ui';
const BARREL = path.join(UI_DIR, 'index.d.ts');
const HEAD = 'src/frontend/ui/REFERENCE.head.md';
const OUT = path.join(UI_DIR, 'REFERENCE.md');
const MAX_BYTES = 32 * 1024;
const MAX_SECTION_BYTES = 6 * 1024;

/** Reihenfolge der Abschnitte: das Listen-Muster zuerst. Neue Module hängen hinten an. */
const ORDER = [
  'useRecords',
  'records',
  'RecordDialog',
  'ConfirmDeleteDialog',
  'DataTable',
  'Dialog',
  'Button',
  'Input',
  'Switch',
  'Alert',
  'Badge',
  'EmptyState',
  'Skeleton',
  'Tooltip',
  'DropdownMenu',
  'tableExport',
  'useIsMobile',
];

function parse(file) {
  return ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
}

/** Barrel → Modulpfad (relativ zu UI_DIR, ohne Endung) → exportierte Namen (`'*'` = alle). */
function barrelModules() {
  const sf = parse(BARREL);
  const modules = new Map();
  for (const st of sf.statements) {
    if (!ts.isExportDeclaration(st) || !st.moduleSpecifier) continue;
    const spec = st.moduleSpecifier.text.replace(/\.js$/, '');
    const names = modules.get(spec) ?? new Set();
    if (!st.exportClause || ts.isNamespaceExport(st.exportClause)) names.add('*');
    else for (const el of st.exportClause.elements) names.add((el.propertyName ?? el.name).text);
    modules.set(spec, names);
  }
  return modules;
}

function declaredNames(st) {
  if (ts.isVariableStatement(st)) return st.declarationList.declarations.map((d) => d.name.getText());
  return st.name ? [st.name.getText()] : [];
}

function isExported(st) {
  return !!st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

/** JSDoc-Blöcke vor einer Anweisung (an der ersten Anweisung zuerst der Modulkopf). */
function leadingJsDocs(sf, st) {
  const ranges = ts.getLeadingCommentRanges(sf.text, st.getFullStart()) ?? [];
  return ranges.map((r) => sf.text.slice(r.pos, r.end)).filter((c) => c.startsWith('/**'));
}

/**
 * Modulkopf auf den ersten Absatz kürzen, wenn er lang ist: dort stehen meist
 * Umsetzungsdetails für Menschen (Mobil-Layout, Scrollleisten), die ein Agent für die
 * Nutzung nicht braucht. Was er braucht, steht an den Props.
 */
const MAX_HEADER_CHARS = 700;
function shortHeader(doc) {
  if (doc.length <= MAX_HEADER_CHARS) return doc;
  const lines = doc.split('\n');
  const end = lines.findIndex((l, i) => i > 0 && /^\s*\*\s*$/.test(l));
  const kept = end === -1 ? lines.slice(0, 4) : lines.slice(0, end);
  return `${kept.join('\n')}\n */`;
}

/** Deklaration kompakt: ohne `export`/`declare`, Einrückung 2 statt 4 Leerzeichen. */
function compact(text) {
  return text
    .replace(/^export declare /gm, '')
    .replace(/^export /gm, '')
    .replace(/^declare /gm, '')
    .replace(/^( {4})+/gm, (m) => ' '.repeat(m.length / 2));
}

function moduleSection(spec, wanted) {
  const file = path.join(UI_DIR, `${spec}.d.ts`);
  const sf = parse(file);
  const all = wanted.has('*');
  const candidates = sf.statements.filter(
    (st) => !ts.isImportDeclaration(st) && !ts.isExportDeclaration(st) && !ts.isExportAssignment(st),
  );

  // Exporte aus dem Barrel; danach lokale Typen nachziehen, auf die sie verweisen.
  const included = new Set(
    candidates.filter((st) => isExported(st) && (all || declaredNames(st).some((n) => wanted.has(n)))),
  );
  let grew = true;
  while (grew) {
    grew = false;
    const text = [...included].map((st) => st.getText()).join('\n');
    // Auch exportierte Typen, die der Barrel nicht nennt, sobald ein Export sie braucht
    // (sonst stünde z. B. `labels?: XLabels` ohne Definition da). Interne Helfer wie
    // `buildRenderItems` referenziert kein Export, sie bleiben draußen.
    for (const st of candidates) {
      if (included.has(st)) continue;
      if (declaredNames(st).some((n) => new RegExp(`\\b${n}\\b`).test(text))) {
        included.add(st);
        grew = true;
      }
    }
  }
  if (included.size === 0) return null;

  const parts = [];
  // Modulkopf, der am (weggelassenen) Import hängt — z. B. die Nutzung von DropdownMenu.
  const first = sf.statements[0];
  if (first && !included.has(first)) {
    const [header] = leadingJsDocs(sf, first);
    if (header) parts.push(shortHeader(header));
  }
  for (const st of candidates) {
    if (!included.has(st)) continue;
    // Ohne Imports hängt der Modulkopf an der ersten Anweisung: nur ihn kürzen, die
    // eigene JSDoc der Anweisung (letzter Block) bleibt vollständig.
    const docs = leadingJsDocs(sf, st);
    if (st === first && docs.length > 0) docs[0] = shortHeader(docs[0]);
    const doc = docs.join('\n');
    parts.push(compact(`${doc ? `${doc}\n` : ''}${st.getText()}`));
  }
  const title = path.basename(spec);
  const names = all
    ? [`${title}.*`]
    : candidates.filter((st) => included.has(st) && isExported(st)).flatMap(declaredNames);
  return { title, names, text: `## ${title}\n\n\`\`\`ts\n${parts.join('\n')}\n\`\`\`\n` };
}

function buildReference() {
  const modules = barrelModules();
  const rank = (spec) => {
    const i = ORDER.indexOf(path.basename(spec));
    return i === -1 ? ORDER.length : i;
  };
  const specs = [...modules.keys()].sort((a, b) => rank(a) - rank(b));
  const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
  const head = fs.readFileSync(HEAD, 'utf8').replace('{{VERSION}}', version).trimEnd();
  const sections = specs.map((s) => moduleSection(s, modules.get(s))).filter(Boolean);
  const toc = sections.map((s) => `- \`${s.title}\`: ${s.names.map((n) => `\`${n}\``).join(', ')}`).join('\n');
  return { sections, text: `${head}\n\n## Contents\n\n${toc}\n\n${sections.map((s) => s.text).join('\n')}` };
}

const { sections, text } = buildReference();
const bytes = Buffer.byteLength(text, 'utf8');
const tooBig = sections
  .map((s) => [s.title, Buffer.byteLength(s.text, 'utf8')])
  .filter(([, n]) => n > MAX_SECTION_BYTES)
  .map(([t, n]) => `Abschnitt ${t}: ${n} Byte (Grenze ${MAX_SECTION_BYTES})`);
if (bytes > MAX_BYTES) tooBig.push(`ganze Datei: ${bytes} Byte (Grenze ${MAX_BYTES})`);
if (tooBig.length > 0) {
  console.error(
    `\nBuild abgebrochen: ${OUT} zu groß.\n  ${tooBig.join('\n  ')}\n` +
      'Agenten lesen sie bei jedem Bau-Lauf — JSDoc im ui-Kit kürzen oder die Grenze bewusst anheben.\n',
  );
  process.exit(1);
}
fs.writeFileSync(OUT, text);
console.log(`ui-reference: OK (${OUT}, ${bytes} Byte)`);
