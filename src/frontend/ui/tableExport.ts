/**
 * Tabellen-Export der DataTable: CSV (Semikolon) und Excel (.xlsx).
 *
 * Bewusst ohne Dependency: das .xlsx ist ein ZIP im Store-Modus (unkomprimiert)
 * mit den sechs Pflicht-Teilen von SpreadsheetML. Für die Listengrößen der
 * DataTable (< ein paar tausend Zeilen) ist die fehlende Kompression egal, und
 * jede Lib hier landete als Pflicht-Dependency in jeder App.
 *
 * Die Writer kennen keine `ColumnDef` — sie bekommen eine fertige Matrix aus
 * {@link ExportCell}s. Welche Zeilen/Spalten und wie ein Wert aussieht, entscheidet
 * die DataTable (`exportCellOf`).
 */
import { formatDate, formatDateTime } from '../format.js';

export type ExportCell =
  | null
  | string
  | number
  | { date: Date; withTime: boolean };

export interface ExportTable {
  headers: string[];
  rows: ExportCell[][];
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

/** Feldtrenner — deutsches Excel öffnet `;`-CSV per Doppelklick spaltenrichtig. */
export const CSV_SEPARATOR = ';';

/**
 * Text, der mit `=`, `+`, `-`, `@` (oder Tab/CR) beginnt, würde Excel als Formel
 * ausführen (CSV-Injection). Ein vorangestelltes `'` macht ihn zu reinem Text.
 * Gilt nur für Text — echte Zahlen (auch negative) bleiben unangetastet. Preis:
 * Excel zeigt das `'` im CSV mit an („'+49 30 …"); im .xlsx gibt es das Problem
 * nicht, dort ist Text immer Text.
 */
function neutralizeFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function csvField(cell: ExportCell): string {
  let text: string;
  if (cell == null) text = '';
  else if (typeof cell === 'number') text = String(cell).replace('.', ',');
  else if (typeof cell === 'string') text = neutralizeFormula(cell);
  else text = cell.withTime ? formatDateTime(cell.date) : formatDate(cell.date);
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV mit `;`, CRLF und UTF-8-BOM (sonst zeigt Excel Umlaute als `Ã¤`). */
export function toCsv(table: ExportTable): string {
  const lines = [table.headers.map(csvField), ...table.rows.map((r) => r.map(csvField))];
  return '﻿' + lines.map((l) => l.join(CSV_SEPARATOR)).join('\r\n') + '\r\n';
}

// ─── XLSX ─────────────────────────────────────────────────────────────────────

/** Excel-Grenze je Zelle. */
const XLSX_MAX_CELL_CHARS = 32767;

function xmlEscape(text: string): string {
  return text
    // In XML 1.0 verbotene Steuerzeichen (alles < 0x20 außer Tab/LF/CR) — Excel
    // verweigert sonst die ganze Datei.
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 0 → A, 25 → Z, 26 → AA … */
export function columnLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Excel-Seriennummer aus der lokalen Wanduhrzeit — dieselbe Zeit, die
 * `formatDate` in der Tabelle anzeigt (1 = 01.01.1900, Basis 30.12.1899).
 */
export function excelSerial(date: Date, withTime: boolean): number {
  const localMs = Date.UTC(
    date.getFullYear(), date.getMonth(), date.getDate(),
    withTime ? date.getHours() : 0, withTime ? date.getMinutes() : 0, withTime ? date.getSeconds() : 0,
  );
  return localMs / 86_400_000 + 25_569;
}

// Style-Indizes in cellXfs (siehe STYLES_XML).
const STYLE_HEADER = 1;
const STYLE_DATE = 2;
const STYLE_DATETIME = 3;

/**
 * Kopfzeile: fett, hellgrau hinterlegt, dünne graue Rahmen, unten etwas
 * kräftiger. Datenzellen ohne Rahmen — Excel-Gitternetz reicht.
 */
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="dd.mm.yyyy"/><numFmt numFmtId="165" formatCode="dd.mm.yyyy hh:mm"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7E7E7"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="medium"><color rgb="FF808080"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/**
 * Entfernt `ch` an Anfang und Ende. Bewusst ohne `/^x+|x+$/`: die zweite
 * Alternative probiert bei langen `x`-Folgen jede Startposition neu (quadratisch).
 */
export function trimChar(s: string, ch: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && s[start] === ch) start++;
  while (end > start && s[end - 1] === ch) end--;
  return s.slice(start, end);
}

/** Blattname: max. 31 Zeichen, ohne `[]:*?/\`, nicht leer. */
export function sanitizeSheetName(name: string): string {
  const cleaned = trimChar(name.replace(/[[\]:*?/\\]/g, ' '), "'").trim().slice(0, 31).trim();
  return cleaned || 'Export';
}

function textCell(ref: string, text: string, style?: number): string {
  const s = style != null ? ` s="${style}"` : '';
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${xmlEscape(text.slice(0, XLSX_MAX_CELL_CHARS))}</t></is></c>`;
}

function dataCell(ref: string, cell: ExportCell): string {
  if (cell == null) return '';
  if (typeof cell === 'number') return `<c r="${ref}"><v>${cell}</v></c>`;
  if (typeof cell === 'string') return cell === '' ? '' : textCell(ref, cell);
  const serial = excelSerial(cell.date, cell.withTime);
  // Vor dem 01.03.1900 rechnet Excel falsch (1900-Schaltjahr-Bug) bzw. kennt gar
  // kein Datum — dort als Text wie in der Tabelle.
  if (serial < 61) return textCell(ref, cell.withTime ? formatDateTime(cell.date) : formatDate(cell.date));
  return `<c r="${ref}" s="${cell.withTime ? STYLE_DATETIME : STYLE_DATE}"><v>${serial}</v></c>`;
}

/** Ungefähre Anzeige-Breite für die Spaltenbreite (Zeichen). */
function displayLength(cell: ExportCell): number {
  if (cell == null) return 0;
  if (typeof cell === 'number') return String(cell).length;
  if (typeof cell === 'string') return Math.max(...cell.split('\n').map((l) => l.length));
  return cell.withTime ? 16 : 10;
}

function sheetXml(table: ExportTable): string {
  const colCount = Math.max(table.headers.length, 1);
  const lastCol = columnLetter(colCount - 1);
  const lastRow = table.rows.length + 1;

  const widths = table.headers.map((h, ci) => {
    let max = h.length + 3;  // + Platz für den Autofilter-Pfeil
    for (const r of table.rows) max = Math.max(max, displayLength(r[ci] ?? null));
    return Math.min(60, Math.max(8, max + 2));
  });

  const header = `<row r="1">${table.headers.map((h, ci) => textCell(`${columnLetter(ci)}1`, h, STYLE_HEADER)).join('')}</row>`;
  const body = table.rows.map((r, ri) => {
    const rowNo = ri + 2;
    return `<row r="${rowNo}">${r.map((c, ci) => dataCell(`${columnLetter(ci)}${rowNo}`, c)).join('')}</row>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="A1:${lastCol}${lastRow}"/>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
${widths.length > 0 ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : ''}
<sheetData>${header}${body}</sheetData>
${table.headers.length > 0 ? `<autoFilter ref="A1:${lastCol}${lastRow}"/>` : ''}
</worksheet>`;
}

function workbookXml(sheetName: string, table: ExportTable): string {
  const lastCol = columnLetter(Math.max(table.headers.length, 1) - 1);
  const quoted = `'${sheetName.replace(/'/g, "''")}'`;
  const filterName = table.headers.length > 0
    ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${xmlEscape(quoted)}!$A$1:$${lastCol}$${table.rows.length + 1}</definedName></definedNames>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
${filterName}
</workbook>`;
}

/** .xlsx als Bytes: ein Blatt, Kopfzeile fixiert + Autofilter. */
export function toXlsx(table: ExportTable, sheetName = 'Export'): Uint8Array<ArrayBuffer> {
  const name = sanitizeSheetName(sheetName);
  return zipStore([
    { name: '[Content_Types].xml', data: CONTENT_TYPES_XML },
    { name: '_rels/.rels', data: ROOT_RELS_XML },
    { name: 'xl/workbook.xml', data: workbookXml(name, table) },
    { name: 'xl/_rels/workbook.xml.rels', data: WORKBOOK_RELS_XML },
    { name: 'xl/styles.xml', data: STYLES_XML },
    { name: 'xl/worksheets/sheet1.xml', data: sheetXml(table) },
  ]);
}

// ─── ZIP (Store, ohne Kompression) ───────────────────────────────────────────

let crcTable: Uint32Array | null = null;

export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/** Minimaler ZIP-Writer (Methode 0 = Store). Reicht für Office-Container. */
export function zipStore(files: Array<{ name: string; data: string }>): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  // Fester DOS-Zeitstempel (01.01.2026 00:00) — der Inhalt hängt so nur vom Input ab.
  const dosTime = 0;
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const data = enc.encode(f.data);
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034B50, true);  // Local-File-Header
    lv.setUint16(4, 20, true);          // Version needed
    lv.setUint16(6, 0x0800, true);      // Flag: Dateinamen in UTF-8
    lv.setUint16(8, 0, true);           // Methode: Store
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014B50, true);  // Central-Directory-Header
    cv.setUint16(4, 20, true);          // Version made by
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    // 30..41: Extra/Kommentar/Disk/Attribute = 0
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054B50, true);    // End of Central Directory
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + centralSize + end.length);
  let pos = 0;
  for (const part of [...locals, ...centrals, end]) { out.set(part, pos); pos += part.length; }
  return out;
}

// ─── Download ─────────────────────────────────────────────────────────────────

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Löst den Browser-Download aus (läuft auch im App-iframe — das hat kein `sandbox`). */
export function downloadFile(data: BlobPart, fileName: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Erst nach dem Klick-Task freigeben, sonst bricht Safari den Download ab.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
