import { describe, it, expect } from 'vitest';
import { crc32 as nodeCrc32 } from 'node:zlib';
import {
  columnLetter,
  crc32,
  excelSerial,
  sanitizeSheetName,
  trimChar,
  toCsv,
  toXlsx,
  zipStore,
  type ExportTable,
} from '../src/frontend/ui/tableExport';

/** Liest ein Store-ZIP zurück (nur Methode 0 — das schreibt zipStore). */
function unzipStore(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  const out = new Map<string, string>();
  let pos = 0;
  while (view.getUint32(pos, true) === 0x04034B50) {
    expect(view.getUint16(pos + 8, true)).toBe(0);
    const crc = view.getUint32(pos + 14, true);
    const size = view.getUint32(pos + 18, true);
    const nameLen = view.getUint16(pos + 26, true);
    const name = dec.decode(bytes.subarray(pos + 30, pos + 30 + nameLen));
    const data = bytes.subarray(pos + 30 + nameLen, pos + 30 + nameLen + size);
    expect(crc).toBe(nodeCrc32(data));
    out.set(name, dec.decode(data));
    pos += 30 + nameLen + size;
  }
  // Danach Central Directory mit einem Eintrag je Datei, dann EOCD.
  const eocd = bytes.length - 22;
  expect(view.getUint32(eocd, true)).toBe(0x06054B50);
  expect(view.getUint16(eocd + 10, true)).toBe(out.size);
  expect(view.getUint32(eocd + 16, true)).toBe(pos);
  return out;
}

const table: ExportTable = {
  headers: ['Name', 'Betrag', 'Angelegt', 'Notiz'],
  rows: [
    ['Müller; GmbH', 12.5, { date: new Date(2026, 9, 7), withTime: false }, '=HYPERLINK("x")'],
    ['Schmidt', -3, { date: new Date(2026, 9, 7, 11, 5), withTime: true }, 'Zeile 1\nZeile 2 "zitiert"'],
    [null, null, null, ''],
  ],
};

describe('toCsv', () => {
  const csv = toCsv(table);

  it('beginnt mit BOM, trennt mit Semikolon, Zeilen mit CRLF', () => {
    expect(csv.startsWith('﻿Name;Betrag;Angelegt;Notiz\r\n')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('quotet Felder mit Trenner, Anführungszeichen und Zeilenumbruch', () => {
    expect(csv).toContain('"Müller; GmbH"');
    expect(csv).toContain('"Zeile 1\nZeile 2 ""zitiert"""');
  });

  it('Zahlen mit Dezimalkomma, Datumswerte DD.MM.YYYY', () => {
    expect(csv).toContain(';12,5;07.10.2026;');
    expect(csv).toContain(';-3;07.10.2026, 11:05;');
  });

  it('entschärft Formeln in Text, aber nicht negative Zahlen', () => {
    expect(csv).toContain(`;"'=HYPERLINK(""x"")"\r\n`);
    expect(csv).not.toContain(";'-3;");
  });

  it('leere Zellen bleiben leer', () => {
    expect(csv).toContain('\r\n;;;\r\n');
  });
});

describe('toXlsx', () => {
  const files = unzipStore(toXlsx(table, 'Kunden'));
  const sheet = files.get('xl/worksheets/sheet1.xml')!;

  it('enthält alle Pflicht-Teile', () => {
    expect([...files.keys()].sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ]);
  });

  it('Kopfzeile mit Kopf-Style, fixiert und mit Autofilter', () => {
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Name</t></is></c>');
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain('<autoFilter ref="A1:D4"/>');
    expect(files.get('xl/workbook.xml')).toContain('<sheet name="Kunden"');
    expect(files.get('xl/styles.xml')).toContain('<bottom style="medium">');
  });

  it('Zahlen als Zahl, Datum als Seriennummer mit Datumsformat, Text escaped', () => {
    expect(sheet).toContain('<c r="B2"><v>12.5</v></c>');
    expect(sheet).toContain(`<c r="C2" s="2"><v>${excelSerial(new Date(2026, 9, 7), false)}</v></c>`);
    expect(sheet).toMatch(/<c r="C3" s="3"><v>[\d.]+<\/v><\/c>/);
    expect(sheet).toContain('=HYPERLINK(&quot;x&quot;)');
    expect(sheet).toContain('Müller; GmbH');
  });

  it('leere Zellen werden weggelassen', () => {
    expect(sheet).toContain('<row r="4"></row>');
  });

  it('Datum vor 01.03.1900 als Text statt ungültiger Seriennummer', () => {
    const f = unzipStore(toXlsx({ headers: ['A'], rows: [[{ date: new Date(1899, 4, 1), withTime: false }]] }));
    expect(f.get('xl/worksheets/sheet1.xml')).toContain('>01.05.1899<');
    const g = unzipStore(toXlsx({ headers: ['A'], rows: [[{ date: new Date(1899, 4, 1, 8, 30), withTime: true }]] }));
    expect(g.get('xl/worksheets/sheet1.xml')).toContain('>01.05.1899, 08:30<');
  });

  it('entfernt in XML verbotene Steuerzeichen', () => {
    const f = unzipStore(toXlsx({ headers: ['A'], rows: [['a\u0001b']] }));
    expect(f.get('xl/worksheets/sheet1.xml')).toContain('>ab<');
  });
});

describe('Hilfsfunktionen', () => {
  it('columnLetter', () => {
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(25)).toBe('Z');
    expect(columnLetter(26)).toBe('AA');
    expect(columnLetter(701)).toBe('ZZ');
    expect(columnLetter(702)).toBe('AAA');
  });

  it('excelSerial: 07.10.2026 = 46302, Uhrzeit als Bruchteil', () => {
    expect(excelSerial(new Date(2026, 9, 7), false)).toBe(46302);
    expect(excelSerial(new Date(2026, 9, 7, 12, 0), true)).toBe(46302.5);
    expect(excelSerial(new Date(2026, 9, 7, 12, 0), false)).toBe(46302);
  });

  it('trimChar: nur Rand, auch bei langen Folgen linear', () => {
    expect(trimChar("''a'b''", "'")).toBe("a'b");
    expect(trimChar('____', '_')).toBe('');
    const long = '_'.repeat(200_000) + 'x' + '_'.repeat(200_000) + 'y';
    const t0 = Date.now();
    expect(trimChar(long, '_')).toBe(long.slice(200_000));
    expect(Date.now() - t0).toBeLessThan(200);
  });

  it('sanitizeSheetName', () => {
    expect(sanitizeSheetName('a/b:c*d?')).toBe('a b c d');
    expect(sanitizeSheetName('x'.repeat(40))).toHaveLength(31);
    expect(sanitizeSheetName('  ')).toBe('Export');
  });

  it('crc32 stimmt mit zlib überein', () => {
    const data = new TextEncoder().encode('efa-one Tabellen-Export äöü');
    expect(crc32(data)).toBe(nodeCrc32(data));
  });

  it('zipStore: leeres Archiv ist gültig', () => {
    expect(unzipStore(zipStore([])).size).toBe(0);
  });
});
