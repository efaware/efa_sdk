import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Tabs, TabPanel, nextTabKey, tabIdPrefix, tabId, tabPanelId, type TabItem } from '../src/frontend/ui/Tabs';

/** Reiterleiste für Detailseiten: ARIA-Verknüpfung, Tastatur, Badges, Test-Markierungen. */
const ITEMS: TabItem<'docs' | 'sources' | 'settings' | 'log'>[] = [
  { key: 'docs', label: 'Dokumente', badge: 9 },
  { key: 'sources', label: 'Quellen', badge: 2, badgeTone: 'danger' },
  { key: 'settings', label: 'Einstellungen', disabled: true },
  { key: 'log', label: 'Protokoll' },
];

function render(value: 'docs' | 'sources' | 'settings' | 'log' = 'docs', extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(createElement(Tabs, { items: ITEMS, value, onChange: () => {}, ariaLabel: 'Silo', ...extra } as never));
}

describe('Tabs', () => {
  it('tablist mit Namen, je Reiter role=tab, aktiver mit aria-selected und tabIndex 0', () => {
    const html = render('sources');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Silo"');
    expect(html.match(/role="tab"/g)?.length).toBe(4);
    expect(html).toMatch(/aria-selected="true"[^>]*tabindex="0"[^>]*data-efa-tab="sources"/);
    expect(html).toMatch(/aria-selected="false"[^>]*tabindex="-1"[^>]*data-efa-tab="docs"/);
  });

  it('Reiter und Panel verweisen aufeinander, Präfix aus dem Namen', () => {
    const html = render();
    expect(html).toContain(`id="${tabId('efa-tabs-silo', 'docs')}"`);
    expect(html).toContain(`aria-controls="${tabPanelId('efa-tabs-silo', 'docs')}"`);
    expect(html).toContain('data-efa-tabs="efa-tabs-silo"');
    expect(render('docs', { idPrefix: 'x' })).toContain('id="x-tab-docs"');
  });

  it('Badges: Zahl im Reiter, Fehlerton rot, gesperrter Reiter disabled', () => {
    const html = render();
    expect(html).toMatch(/Dokumente<span[^>]*>9<\/span>/);
    expect(html).toMatch(/bg-\[var\(--color-danger\)\][^>]*>2<\/span>/);
    expect(html).toMatch(/disabled=""[^>]*data-efa-tab="settings"/);
  });

  it('Icon wird vor dem Text gerendert', () => {
    const Icon = (p: Record<string, unknown>) => createElement('svg', { 'data-icon': 'x', ...p });
    const html = renderToStaticMarkup(createElement(Tabs, { items: [{ key: 'a', label: 'A', icon: Icon }], value: 'a', onChange: () => {}, ariaLabel: 'X' } as never));
    expect(html).toMatch(/<svg data-icon="x"[^>]*aria-hidden="true"[^>]*><\/svg>A/);
  });
});

describe('tabIdPrefix', () => {
  it('Kleinbuchstaben und Bindestriche, Umlaute zerlegt, leer → x', () => {
    expect(tabIdPrefix('Agent Konfiguration')).toBe('efa-tabs-agent-konfiguration');
    expect(tabIdPrefix('Übersicht')).toBe('efa-tabs-ubersicht');
    expect(tabIdPrefix('—')).toBe('efa-tabs-x');
  });
});

describe('nextTabKey', () => {
  it('Pfeile mit Umlauf, gesperrte übersprungen', () => {
    expect(nextTabKey(ITEMS, 'docs', 'ArrowRight')).toBe('sources');
    expect(nextTabKey(ITEMS, 'sources', 'ArrowRight')).toBe('log');
    expect(nextTabKey(ITEMS, 'log', 'ArrowRight')).toBe('docs');
    expect(nextTabKey(ITEMS, 'docs', 'ArrowLeft')).toBe('log');
  });
  it('Pos1/Ende, unbekannte Taste null, aktueller gesperrt/unbekannt startet am Rand', () => {
    expect(nextTabKey(ITEMS, 'log', 'Home')).toBe('docs');
    expect(nextTabKey(ITEMS, 'docs', 'End')).toBe('log');
    expect(nextTabKey(ITEMS, 'docs', 'Enter')).toBeNull();
    expect(nextTabKey(ITEMS, 'settings', 'ArrowRight')).toBe('docs');
    expect(nextTabKey(ITEMS, 'settings', 'ArrowLeft')).toBe('log');
  });
  it('alle gesperrt → null', () => {
    expect(nextTabKey([{ key: 'a', label: 'A', disabled: true }], 'a', 'Home')).toBeNull();
  });
});

describe('TabPanel', () => {
  it('aktiv: tabpanel mit Verweis auf den Reiter', () => {
    const html = renderToStaticMarkup(createElement(TabPanel, { tabKey: 'docs', value: 'docs', idPrefix: 'p', children: 'Inhalt' }));
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('id="p-panel-docs"');
    expect(html).toContain('aria-labelledby="p-tab-docs"');
    expect(html).not.toContain('hidden');
  });
  it('inaktiv: nichts, mit keepMounted versteckt gerendert', () => {
    expect(renderToStaticMarkup(createElement(TabPanel, { tabKey: 'a', value: 'b', idPrefix: 'p', children: 'X' }))).toBe('');
    expect(renderToStaticMarkup(createElement(TabPanel, { tabKey: 'a', value: 'b', idPrefix: 'p', keepMounted: true, children: 'X' }))).toContain('hidden=""');
  });
});

void vi;
