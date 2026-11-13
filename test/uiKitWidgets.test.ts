import { describe, it, expect } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  computeFloatingPosition,
  escapeOwnedByControl,
  guardDialogEscape,
  guardDialogOutside,
  isInsideOverlay,
  showInTopLayer,
  hideFromTopLayer,
} from '../src/frontend/ui/overlay';
import { Combobox, filterOptions, moveActive, normalizeSearch } from '../src/frontend/ui/Combobox';
import { FileDropzone, formatFileSize, matchesAccept, validateFiles } from '../src/frontend/ui/FileDropzone';
import { MAX_TOASTS, ToastProvider, toToastEntry, useToast } from '../src/frontend/ui/Toast';
import { Popover } from '../src/frontend/ui/Popover';
import { Spinner } from '../src/frontend/ui/Spinner';
import { Progress, progressPercent } from '../src/frontend/ui/Progress';
import { Card } from '../src/frontend/ui/Card';
import { Avatar, initialsOf } from '../src/frontend/ui/Avatar';
import { CopyButton } from '../src/frontend/ui/CopyButton';
import { Collapsible } from '../src/frontend/ui/Collapsible';
import { Breadcrumb } from '../src/frontend/ui/Breadcrumb';
import { Pagination, pageItems } from '../src/frontend/ui/Pagination';
import { Separator, Kbd } from '../src/frontend/ui/Separator';
import { FormField } from '../src/frontend/ui/FormField';

// Locker getippt: Komponenten mit Pflicht-`children` bekommen sie als drittes Argument.
const h = createElement as unknown as (type: unknown, props?: unknown, ...children: unknown[]) => ReactElement;
const html = (el: ReactElement) => renderToStaticMarkup(el);

/** Minimales Element mit `closest`, wie es die Wächter brauchen. */
const fakeEl = (match: (sel: string) => boolean) => ({ closest: (sel: string) => (match(sel) ? {} : null) });

describe('overlay', () => {
  it('escapeOwnedByControl / isInsideOverlay prüfen die Markierungen', () => {
    expect(escapeOwnedByControl(fakeEl((s) => s === '[data-efa-escape="active"]') as never)).toBe(true);
    expect(escapeOwnedByControl(fakeEl(() => false) as never)).toBe(false);
    expect(escapeOwnedByControl(null)).toBe(false);
    expect(isInsideOverlay(fakeEl((s) => s === '[data-efa-overlay]') as never)).toBe(true);
    expect(isInsideOverlay({} as never)).toBe(false);
  });

  it('guardDialogOutside verhindert das Schließen nur für Overlays', () => {
    let prevented = 0;
    const e = (target: unknown) => ({ target: target as EventTarget, preventDefault: () => { prevented++; } });
    guardDialogOutside(e(fakeEl((s) => s === '[data-efa-overlay]')));
    guardDialogOutside(e(fakeEl(() => false)));
    expect(prevented).toBe(1);
  });

  it('guardDialogEscape schaut auf das fokussierte Element', () => {
    const g = globalThis as { document?: unknown };
    const before = g.document;
    let prevented = false;
    g.document = { activeElement: fakeEl((s) => s.includes('data-efa-escape')) };
    guardDialogEscape({ preventDefault: () => { prevented = true; } });
    expect(prevented).toBe(true);
    prevented = false;
    g.document = { activeElement: fakeEl(() => false) };
    guardDialogEscape({ preventDefault: () => { prevented = true; } });
    expect(prevented).toBe(false);
    g.document = before;
  });

  it('showInTopLayer / hideFromTopLayer rufen die Popover-API nur bei Bedarf', () => {
    const calls: string[] = [];
    let open = false;
    const el = {
      matches: () => open,
      showPopover: () => { calls.push('show'); open = true; },
      hidePopover: () => { calls.push('hide'); open = false; },
    } as unknown as HTMLElement;
    showInTopLayer(el);
    showInTopLayer(el);
    hideFromTopLayer(el);
    hideFromTopLayer(el);
    expect(calls).toEqual(['show', 'hide']);
    // Ohne Popover-API (alter Browser) und ohne Element: still nichts tun.
    expect(() => showInTopLayer({ matches: () => false } as unknown as HTMLElement)).not.toThrow();
    expect(() => hideFromTopLayer(null)).not.toThrow();
    // Fehler der API (nicht verbunden) werden geschluckt.
    const broken = { matches: () => { throw new Error('x'); }, showPopover() {}, hidePopover() {} } as unknown as HTMLElement;
    expect(() => showInTopLayer(broken)).not.toThrow();
    expect(() => hideFromTopLayer(broken)).not.toThrow();
  });

  it('computeFloatingPosition: side=top bleibt oben oder klappt nach unten', () => {
    const vp2 = { width: 1000, height: 800 };
    expect(computeFloatingPosition({ top: 500, left: 0, width: 100, height: 20 }, { width: 100, height: 100 }, vp2, { side: 'top' }).side).toBe('top');
    expect(computeFloatingPosition({ top: 50, left: 0, width: 100, height: 20 }, { width: 100, height: 100 }, vp2, { side: 'top' }).side).toBe('bottom');
  });

  const vp = { width: 1000, height: 800 };
  it('computeFloatingPosition legt unter den Anker und klappt bei Platzmangel nach oben', () => {
    const below = computeFloatingPosition({ top: 100, left: 50, width: 200, height: 30 }, { width: 200, height: 150 }, vp);
    expect(below).toMatchObject({ top: 134, left: 50, side: 'bottom' });
    const flipped = computeFloatingPosition({ top: 700, left: 50, width: 200, height: 30 }, { width: 200, height: 300 }, vp);
    expect(flipped.side).toBe('top');
    expect(flipped.top).toBe(700 - 4 - 300);
  });

  it('computeFloatingPosition bleibt waagerecht im Fenster und richtet end/center aus', () => {
    expect(computeFloatingPosition({ top: 0, left: 950, width: 40, height: 20 }, { width: 200, height: 50 }, vp).left).toBe(792);
    expect(computeFloatingPosition({ top: 0, left: 2, width: 40, height: 20 }, { width: 200, height: 50 }, vp, { align: 'end' }).left).toBe(8);
    expect(computeFloatingPosition({ top: 0, left: 400, width: 200, height: 20 }, { width: 100, height: 50 }, vp, { align: 'center' }).left).toBe(450);
  });

  it('computeFloatingPosition begrenzt die Höhe auf den freien Platz', () => {
    const pos = computeFloatingPosition({ top: 300, left: 0, width: 100, height: 20 }, { width: 100, height: 2000 }, vp);
    expect(pos.side).toBe('bottom');
    expect(pos.maxHeight).toBe(800 - 320 - 4 - 8);
  });
});

describe('Combobox', () => {
  const people = [
    { value: '1', label: 'Jürgen Müller', description: 'jm@firma.de' },
    { value: '2', label: 'Anna Groß', disabled: true },
    { value: '3', label: 'Eduard Dinges' },
  ];

  it('normalizeSearch entfernt Akzente und ß', () => {
    expect(normalizeSearch('  Müller GROẞ ')).toBe('muller gross');
  });

  it('filterOptions sucht in Beschriftung und Beschreibung, alle Wörter', () => {
    expect(filterOptions(people, 'muller').map((o) => o.value)).toEqual(['1']);
    expect(filterOptions(people, 'gross').map((o) => o.value)).toEqual(['2']);
    expect(filterOptions(people, 'firma jürgen').map((o) => o.value)).toEqual(['1']);
    expect(filterOptions(people, '  ')).toHaveLength(3);
  });

  it('moveActive überspringt gesperrte und läuft rundum', () => {
    expect(moveActive(people, 0, 1)).toBe(2);
    expect(moveActive(people, 2, 1)).toBe(0);
    expect(moveActive(people, -1, 1)).toBe(0);
    expect(moveActive(people, 0, -1)).toBe(2);
    expect(moveActive([{ value: 'x', label: 'x', disabled: true }], -1, 1)).toBe(-1);
  });

  it('rendert ein geschlossenes combobox-Feld mit gewählter Beschriftung', () => {
    const out = html(h(Combobox, { options: people, value: '3', onValueChange: () => {}, name: 'owner', 'aria-label': 'Person' }));
    expect(out).toContain('role="combobox"');
    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain('value="Eduard Dinges"');
    expect(out).toContain('<input type="hidden" name="owner" value="3"/>');
    expect(out).toContain('aria-label="Auswahl leeren"');
    expect(out).not.toContain('role="listbox"');
  });

  it('zeigt selectedLabel, wenn der Wert nicht in options steht (Serversuche)', () => {
    const out = html(h(Combobox, { options: [], value: '9', selectedLabel: 'Vorbelegt', onValueChange: () => {}, onSearchChange: () => {}, 'aria-label': 'P' }));
    expect(out).toContain('value="Vorbelegt"');
    expect(html(h(Combobox, { options: [], value: null, selectedLabel: 'X', onValueChange: () => {}, 'aria-label': 'P' }))).toContain('value=""');
  });

  it('erbt im FormField id und Fehler, ohne Leeren bei required', () => {
    const out = html(h(FormField, { id: 'p', label: 'Person', required: true, error: 'fehlt' },
      h(Combobox, { options: people, value: '1', onValueChange: () => {} })));
    expect(out).toContain('id="p"');
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain('aria-required="true"');
    expect(out).not.toContain('Auswahl leeren');
  });
});

describe('FileDropzone', () => {
  const file = (name: string, type: string, size: number) => ({ name, type, size }) as unknown as File;

  it('formatFileSize', () => {
    expect(formatFileSize(980)).toBe('980 B');
    expect(formatFileSize(12_700)).toBe('12,4 KB');
    expect(formatFileSize(3 * 1024 * 1024)).toBe('3 MB');
  });

  it('matchesAccept: Endung, MIME, Wildcard, leer', () => {
    expect(matchesAccept(file('a.PDF', '', 1), '.pdf')).toBe(true);
    expect(matchesAccept(file('a.png', 'image/png', 1), 'image/*')).toBe(true);
    expect(matchesAccept(file('a.zip', 'application/zip', 1), 'application/zip, .pdf')).toBe(true);
    expect(matchesAccept(file('a.exe', 'application/x-msdownload', 1), '.pdf,image/*')).toBe(false);
    expect(matchesAccept(file('a.exe', '', 1), undefined)).toBe(true);
  });

  it('validateFiles: Typ, Größe, Anzahl', () => {
    const files = [file('a.pdf', 'application/pdf', 10), file('b.exe', '', 10), file('c.pdf', '', 5000), file('d.pdf', '', 10)];
    const single = validateFiles(files, { accept: '.pdf', maxSize: 1000 });
    expect(single.accepted.map((f) => f.name)).toEqual(['a.pdf']);
    expect(single.rejected.map((r) => r.reason)).toEqual(['type', 'size', 'count']);
    expect(single.rejected[1].message).toBe('c.pdf: größer als 1000 B');
    const multi = validateFiles(files, { accept: '.pdf', maxSize: 1000, multiple: true, maxFiles: 5 });
    expect(multi.accepted.map((f) => f.name)).toEqual(['a.pdf', 'd.pdf']);
  });

  it('rendert ein beschriftetes Dateifeld', () => {
    const out = html(h(FileDropzone, { id: 'up', onFiles: () => {}, accept: '.pdf', multiple: true, hint: 'PDF, höchstens 20 MB' }));
    expect(out).toContain('type="file"');
    expect(out).toContain('for="up"');
    expect(out).toContain('accept=".pdf"');
    expect(out).toContain('multiple=""');
    expect(out).toContain('aria-describedby="up-hint"');
    expect(out).toContain('Dateien hierher ziehen oder auswählen');
  });
});

describe('Toast', () => {
  it('toToastEntry setzt Variante und Dauer', () => {
    expect(toToastEntry('t1', 'Gespeichert')).toMatchObject({ id: 't1', title: 'Gespeichert', variant: 'success', duration: 5000 });
    expect(toToastEntry('t2', { title: 'Fehler', variant: 'error' }).duration).toBe(8000);
    expect(toToastEntry('t3', { title: 'x', duration: 0 }).duration).toBe(0);
    expect(MAX_TOASTS).toBeGreaterThan(1);
  });

  it('ToastProvider rendert ohne Meldungen keinen Bereich; useToast ohne Provider ist harmlos', () => {
    expect(html(h(ToastProvider, null, 'App'))).toBe('App');
    let api: ReturnType<typeof useToast> | null = null;
    const Probe = () => { api = useToast(); return null; };
    html(h(Probe));
    const warn = console.warn;
    console.warn = () => {};
    expect(api!.toast('x')).toBe('');
    console.warn = warn;
  });
});

describe('Popover', () => {
  it('geschlossen nur der Auslöser mit aria-expanded', () => {
    const out = html(h(Popover, { trigger: h('button', { type: 'button' }, 'Filter') }, 'Inhalt'));
    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain('aria-haspopup="dialog"');
    expect(out).not.toContain('Inhalt');
  });

  it('offen mit Inhalt im Top-Layer und Escape-Markierung', () => {
    const out = html(h(Popover, { open: true, trigger: h('button', null, 'Filter'), 'aria-label': 'Filter' }, 'Inhalt'));
    expect(out).toContain('popover="manual"');
    expect(out).toContain('role="dialog"');
    expect(out).toContain('data-efa-escape="active"');
    expect(out).toContain('Inhalt');
  });
});

describe('Anzeige', () => {
  it('Spinner hat role=status und unsichtbaren Text', () => {
    const out = html(h(Spinner, {}));
    expect(out).toContain('role="status"');
    expect(out).toContain('sr-only');
    expect(out).toContain('Wird geladen …');
    expect(html(h(Spinner, { showLabel: true, label: 'Lädt' }))).not.toContain('sr-only');
  });

  it('progressPercent klemmt und rundet', () => {
    expect(progressPercent(5, 10)).toBe(50);
    expect(progressPercent(1, 3)).toBe(33.3);
    expect(progressPercent(20, 10)).toBe(100);
    expect(progressPercent(-1)).toBe(0);
    expect(progressPercent(null)).toBeNull();
    expect(progressPercent(5, 0)).toBeNull();
  });

  it('Progress: bestimmt und unbestimmt', () => {
    const out = html(h(Progress, { value: 12, max: 50, label: 'Lizenzen', tone: 'warning' }));
    expect(out).toContain('role="progressbar"');
    expect(out).toContain('aria-valuenow="12"');
    expect(out).toContain('progress-warning');
    expect(out).toContain('width:24%');
    expect(out).toContain('24 %');
    expect(html(h(Progress, {}))).toContain('progress-indeterminate');
    expect(html(h(Progress, { value: 55, max: 50 }))).toContain('aria-valuenow="50"');
  });

  it('Card mit Kopf, Aktion und Fuß', () => {
    const out = html(h(Card, { title: 'Zugang', actions: h('button', null, 'X'), footer: 'F' }, 'Inhalt'));
    expect(out).toContain('<h3');
    expect(out).toContain('border-t');
    expect(out).toContain('Inhalt');
  });

  it('initialsOf', () => {
    expect(initialsOf('Eduard Dinges')).toBe('ED');
    expect(initialsOf('Anna-Lena Graf')).toBe('AG');
    expect(initialsOf('admin')).toBe('A');
    expect(initialsOf('max@firma.de')).toBe('M');
    expect(initialsOf('efa-support')).toBe('ES');
    expect(initialsOf('')).toBe('?');
    expect(initialsOf(null)).toBe('?');
  });

  it('Avatar mit Namen für Screenreader', () => {
    const out = html(h(Avatar, { name: 'Eduard Dinges' }));
    expect(out).toContain('role="img"');
    expect(out).toContain('aria-label="Eduard Dinges"');
    expect(out).toContain('>ED<');
    expect(html(h(Avatar, { name: 'X', src: '/a.png' }))).toContain('src="/a.png"');
  });

  it('CopyButton hat ein aria-label', () => {
    expect(html(h(CopyButton, { value: 'abc' }))).toContain('aria-label="Kopieren"');
    expect(html(h(CopyButton, { value: 'abc', showLabel: true, label: 'ID kopieren' }))).toContain('ID kopieren');
  });

  it('Collapsible ist ein details mit summary', () => {
    const out = html(h(Collapsible, { title: 'Erweitert', summary: '3 Einträge', defaultOpen: true }, 'x'));
    expect(out).toContain('<details open=""');
    expect(out).toContain('<summary');
    expect(out).toContain('3 Einträge');
  });

  it('Breadcrumb: letzter Eintrag ist die aktuelle Seite', () => {
    const out = html(h(Breadcrumb, { items: [{ label: 'Partner', href: '#/bp/' }, { label: 'Ansicht', onClick: () => {} }, { label: '0000010100' }] }));
    expect(out).toContain('aria-label="Pfad"');
    expect(out).toContain('href="#/bp/"');
    expect(out).toContain('<button type="button"');
    expect(out).toContain('aria-current="page"');
  });

  it('pageItems', () => {
    expect(pageItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageItems(1, 20)).toEqual([1, 2, 3, 4, 5, '…', 20]);
    expect(pageItems(10, 20)).toEqual([1, '…', 9, 10, 11, '…', 20]);
    expect(pageItems(19, 20)).toEqual([1, '…', 16, 17, 18, 19, 20]);
    expect(pageItems(1, 0)).toEqual([]);
  });

  it('Pagination zeigt Bereich und aktuelle Seite', () => {
    const out = html(h(Pagination, { page: 2, pageCount: 3, onPageChange: () => {}, total: 120, pageSize: 50 }));
    expect(out).toContain('51–100 von 120');
    expect(out).toContain('aria-current="page"');
    expect(html(h(Pagination, { page: 1, pageCount: 1, onPageChange: () => {} }))).toBe('');
  });

  it('Separator und Kbd', () => {
    expect(html(h(Separator, {}))).toContain('role="none"');
    expect(html(h(Separator, { decorative: false, orientation: 'vertical' }))).toContain('aria-orientation="vertical"');
    expect(html(h(Kbd, null, 'Strg'))).toContain('<kbd');
  });
});
