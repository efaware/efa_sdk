import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Seitliches Panel: nicht modal, ein Klick in die Seite schließt nicht, rechts
 * mit wählbarer Breite. Radix als Durchreiche (SSR rendert keine Portals).
 */
const rootProps: Array<Record<string, unknown>> = [];
const contentProps: Array<Record<string, unknown>> = [];
vi.mock('@radix-ui/react-dialog', () => {
  const pass = (tag: string) => (p: Record<string, unknown>) => createElement(tag, null, p.children as never);
  return {
    Root: (p: Record<string, unknown>) => { rootProps.push(p); return createElement('div', null, p.children as never); },
    Portal: pass('div'),
    Content: (p: Record<string, unknown>) => { contentProps.push(p); return createElement('section', { className: p.className as string }, p.children as never); },
    Title: pass('h2'),
    Description: pass('p'),
    Close: (p: Record<string, unknown>) => createElement('button', { 'aria-label': p['aria-label'] as string }, p.children as never),
  };
});
const { SidePanel, sidePanelClass, keepOpenOnOutsideInteraction } = await import('../src/frontend/ui/SidePanel');

describe('SidePanel', () => {
  it('nicht modal, Klick daneben verhindert, Marker gesetzt', () => {
    const html = renderToStaticMarkup(createElement(SidePanel, { open: true, onOpenChange: () => {}, title: 'Dokument', description: 'a.pdf', children: 'Text' }));
    expect(rootProps.at(-1)).toMatchObject({ open: true, modal: false });
    const c = contentProps.at(-1)!;
    expect(c.onInteractOutside).toBe(keepOpenOnOutsideInteraction);
    expect(c['data-efa-sidepanel']).toBe('');
    expect(html).toContain('<h2>Dokument</h2>');
    expect(html).toContain('a.pdf');
    expect(html).toContain('aria-label="Schließen"');
    expect(html).toContain('Text');
  });

  it('Banner und Fußzeile nur, wenn übergeben', () => {
    const without = renderToStaticMarkup(createElement(SidePanel, { open: true, onOpenChange: () => {}, title: 'T', children: 'x' }));
    expect(without).not.toContain('border-t');
    const withAll = renderToStaticMarkup(createElement(SidePanel, { open: true, onOpenChange: () => {}, title: 'T', children: 'x', banner: 'B!', footer: 'F!', dataAttributes: { 'data-efa-x': '1' } }));
    expect(withAll).toContain('B!');
    expect(withAll).toContain('F!');
    expect(contentProps.at(-1)!['data-efa-x']).toBe('1');
  });

  it('keepOpenOnOutsideInteraction ruft preventDefault', () => {
    const e = { preventDefault: vi.fn() };
    keepOpenOnOutsideInteraction(e);
    expect(e.preventDefault).toHaveBeenCalledOnce();
  });

  it('Breiten: rechts, volle Höhe, mobil volle Breite', () => {
    expect(sidePanelClass()).toContain('md:w-[32rem]');
    expect(sidePanelClass('sm')).toContain('md:w-[24rem]');
    expect(sidePanelClass('lg')).toContain('md:w-[44rem]');
    expect(sidePanelClass('lg')).toMatch(/fixed inset-y-0 right-0 z-40 w-full/);
  });
});
