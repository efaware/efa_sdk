import { describe, it, expect } from 'vitest';
import { pickInitialFocus, FOCUS_CONTENT } from '../src/frontend/ui/Dialog';

/**
 * Fokus beim Öffnen: erstes sichtbares Feld, sonst der Dialog selbst (nie ein Knopf,
 * der letzte ist oft „Löschen“); Rückfragen auf Abbrechen; nie das X.
 */
function area(items: unknown[]) {
  return { querySelectorAll: () => items };
}
const shown = (el: unknown) => !(el as { hidden?: boolean }).hidden;

describe('pickInitialFocus', () => {
  const cancel = { name: 'cancel' };
  const del = { name: 'löschen' };
  const field = { name: 'field' };
  const hiddenFile = { name: 'file', hidden: true };

  it('first-field: erstes sichtbare Feld, versteckte übersprungen', () => {
    expect(pickInitialFocus('first-field', area([hiddenFile, field]), area([cancel, del]), shown)).toBe(field);
  });
  it('first-field ohne Feld: der Dialog selbst, nicht „Löschen“', () => {
    expect(pickInitialFocus('first-field', area([hiddenFile]), area([cancel, del]), shown)).toBe(FOCUS_CONTENT);
    expect(pickInitialFocus('first-field', null, area([cancel, del]), shown)).toBe(FOCUS_CONTENT);
  });
  it('primary und cancel, nur sichtbare Knöpfe', () => {
    expect(pickInitialFocus('primary', null, area([cancel, del]), shown)).toBe(del);
    expect(pickInitialFocus('cancel', null, area([{ hidden: true }, cancel, del]), shown)).toBe(cancel);
  });
  it('ohne Knöpfe der Dialog selbst; close: Radix (das X)', () => {
    expect(pickInitialFocus('primary', null, area([]), shown)).toBe(FOCUS_CONTENT);
    expect(pickInitialFocus('cancel', null, null, shown)).toBe(FOCUS_CONTENT);
    expect(pickInitialFocus('close', area([field]), area([cancel]), shown)).toBeNull();
  });
  it('Standard-Sichtbarkeit: getClientRects leer = unsichtbar, ohne Funktion = sichtbar', () => {
    const invisible = { getClientRects: () => [] };
    const visible = { getClientRects: () => [{}] };
    expect(pickInitialFocus('first-field', area([invisible, visible]), null)).toBe(visible);
    expect(pickInitialFocus('first-field', area([{ plain: true }]), null)).toEqual({ plain: true });
  });
});
