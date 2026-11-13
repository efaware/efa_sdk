import { useCallback, useEffect, useLayoutEffect, type RefObject } from 'react';

/**
 * Grundlage für schwebende Elemente (Popover, Combobox-Liste, Toasts) ohne weitere
 * Abhängigkeit: die native Popover-API legt sie in den Top-Layer. Dort liegen sie
 * über allem, auch über Dialogen, und werden weder von `overflow` noch vom
 * `transform` eines zentrierten Dialogs abgeschnitten oder verschoben.
 *
 * Schwebende Listen bleiben im DOM an ihrem Platz (kein Portal). Ein Radix-Dialog
 * sieht Klicks darin deshalb als „innen“ und Fokus bleibt in seiner Fokusfalle.
 *
 * Zwei Absprachen mit den Dialogen des Kits (`Dialog`, `SidePanel`):
 * - `data-efa-escape="active"` an einem Element mit Fokus heißt: Escape gehört diesem
 *   Steuerelement (offene Liste, gefülltes Suchfeld); der Dialog bleibt offen.
 * - `data-efa-overlay` markiert Elemente außerhalb des Dialogs (Toasts), deren Klick
 *   den Dialog nicht schließen soll.
 */

export const ESCAPE_ATTR = 'data-efa-escape';
export const OVERLAY_ATTR = 'data-efa-overlay';

function asElement(target: EventTarget | null | undefined): Element | null {
  return target && typeof (target as Element).closest === 'function' ? (target as Element) : null;
}

/** Gehört Escape gerade einem Steuerelement des Kits (statt dem umgebenden Dialog)? */
export function escapeOwnedByControl(active: EventTarget | null | undefined): boolean {
  return asElement(active)?.closest(`[${ESCAPE_ATTR}="active"]`) != null;
}

/** Liegt das Ziel in einem schwebenden Element des Kits (Toast, Popover)? */
export function isInsideOverlay(target: EventTarget | null | undefined): boolean {
  return asElement(target)?.closest(`[${OVERLAY_ATTR}]`) != null;
}

/** Handler für Radix `onEscapeKeyDown` der Dialoge des Kits. */
export function guardDialogEscape(e: { preventDefault(): void }): void {
  if (typeof document !== 'undefined' && escapeOwnedByControl(document.activeElement)) e.preventDefault();
}

/** Handler für Radix `onInteractOutside` der Dialoge des Kits. */
export function guardDialogOutside(e: { target: EventTarget | null; preventDefault(): void }): void {
  if (isInsideOverlay(e.target)) e.preventDefault();
}

export type FloatingSide = 'top' | 'bottom';
export type FloatingAlign = 'start' | 'center' | 'end';

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface FloatingPosition {
  top: number;
  left: number;
  side: FloatingSide;
  /** Höchstens so hoch darf das Element werden, damit es im Fenster bleibt. */
  maxHeight: number;
}

const MARGIN = 8;

/**
 * Position eines schwebenden Elements an seinem Anker. Klappt auf die andere Seite,
 * wenn dort mehr Platz ist, und bleibt waagerecht im Fenster.
 */
export function computeFloatingPosition(
  anchor: Rect,
  floating: { width: number; height: number },
  viewport: { width: number; height: number },
  opts: { side?: FloatingSide; align?: FloatingAlign; offset?: number } = {},
): FloatingPosition {
  const { side = 'bottom', align = 'start', offset = 4 } = opts;
  const below = viewport.height - (anchor.top + anchor.height) - offset - MARGIN;
  const above = anchor.top - offset - MARGIN;
  let actual: FloatingSide = side;
  if (side === 'bottom' && floating.height > below && above > below) actual = 'top';
  if (side === 'top' && floating.height > above && below > above) actual = 'bottom';
  const space = actual === 'bottom' ? below : above;
  const height = Math.min(floating.height, Math.max(space, 0));
  const top = actual === 'bottom' ? anchor.top + anchor.height + offset : anchor.top - offset - height;

  let left =
    align === 'start'
      ? anchor.left
      : align === 'end'
        ? anchor.left + anchor.width - floating.width
        : anchor.left + (anchor.width - floating.width) / 2;
  left = Math.min(left, viewport.width - floating.width - MARGIN);
  left = Math.max(left, MARGIN);
  return { top, left, side: actual, maxHeight: Math.max(space, 0) };
}

/** Ältere Browser kennen die Popover-API nicht; dann bleibt das Element normal im Fluss (fixed). */
type PopoverElement = Omit<HTMLElement, 'showPopover' | 'hidePopover'> & {
  showPopover?: () => void;
  hidePopover?: () => void;
};

/** Element in den Top-Layer heben (falls der Browser die Popover-API kann). */
export function showInTopLayer(el: HTMLElement | null): void {
  const p = el as unknown as PopoverElement | null;
  if (!p?.showPopover) return;
  try {
    if (!p.matches(':popover-open')) p.showPopover();
  } catch {
    /* nicht verbunden oder schon offen */
  }
}

/** Gegenstück zu `showInTopLayer`. */
export function hideFromTopLayer(el: HTMLElement | null): void {
  const p = el as unknown as PopoverElement | null;
  if (!p?.hidePopover) return;
  try {
    if (p.matches(':popover-open')) p.hidePopover();
  } catch {
    /* schon zu */
  }
}

/** Grund-Style eines Top-Layer-Elements: setzt die UA-Vorgaben für `[popover]` zurück. */
export const FLOATING_STYLE = { position: 'fixed', inset: 'auto', margin: 0 } as const;

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Hält ein schwebendes Element (gerendert nur, solange `open`) an seinem Anker:
 * Top-Layer, Position, mitlaufen bei Scrollen und Größenänderung, Klick außerhalb.
 */
export function useFloating(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  floatingRef: RefObject<HTMLElement | null>,
  opts: {
    side?: FloatingSide;
    align?: FloatingAlign;
    /** Mindestens so breit wie der Anker (Listen unter Feldern). */
    matchWidth?: boolean;
    onOutside?: () => void;
  } = {},
): void {
  const { side, align, matchWidth, onOutside } = opts;

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const el = floatingRef.current;
    if (!anchor || !el) return;
    const a = anchor.getBoundingClientRect();
    if (matchWidth) el.style.minWidth = `${a.width}px`;
    // Ohne Inline-Grenze messen: offsetHeight ist die Höhe, die das CSS (z. B. `max-h-64`)
    // zulässt. scrollHeight wäre die volle Liste und klappte grundlos nach oben.
    el.style.maxHeight = '';
    const pos = computeFloatingPosition(
      { top: a.top, left: a.left, width: a.width, height: a.height },
      { width: el.offsetWidth, height: el.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
      { side, align },
    );
    // Die CSS-Grenze des Elements (z. B. `max-h-64`) bleibt die Obergrenze; der Inline-Wert
    // würde sie sonst ersetzen.
    const cssMax = parseFloat(getComputedStyle(el).maxHeight);
    el.style.top = `${pos.top}px`;
    el.style.left = `${pos.left}px`;
    el.style.maxHeight = `${Number.isFinite(cssMax) ? Math.min(cssMax, pos.maxHeight) : pos.maxHeight}px`;
    el.dataset.side = pos.side;
  }, [anchorRef, floatingRef, side, align, matchWidth]);

  useIsoLayoutEffect(() => {
    if (!open) return;
    const el = floatingRef.current;
    showInTopLayer(el);
    place();
    const onMove = (e: Event) => {
      // Scrollen in der Liste selbst verschiebt nichts.
      if (e.target instanceof Node && el?.contains(e.target)) return;
      place();
    };
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
      hideFromTopLayer(el);
    };
  }, [open, place, floatingRef]);

  // Inhalt ändert sich (Filter, Laden): neu ausrichten, sobald sich die Größe ändert.
  useEffect(() => {
    const el = floatingRef.current;
    if (!open || !el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => place());
    ro.observe(el);
    if (anchorRef.current) ro.observe(anchorRef.current);
    return () => ro.disconnect();
  }, [open, place, floatingRef, anchorRef]);

  useEffect(() => {
    if (!open || !onOutside) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && (anchorRef.current?.contains(t) || floatingRef.current?.contains(t))) return;
      onOutside();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open, onOutside, anchorRef, floatingRef]);
}
