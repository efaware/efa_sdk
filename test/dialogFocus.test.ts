import { describe, it, expect } from 'vitest';
import { pickInitialFocus } from '../src/frontend/ui/Dialog';

/** Fokus beim Öffnen: erstes Feld, sonst Primärknopf; Rückfragen auf Abbrechen; nie das X. */
function area(field: unknown, buttons: unknown[]) {
  return { querySelector: () => field, querySelectorAll: () => buttons };
}

describe('pickInitialFocus', () => {
  const cancel = { name: 'cancel' };
  const save = { name: 'save' };
  const field = { name: 'field' };

  it('first-field: erstes Feld im Body', () => {
    expect(pickInitialFocus('first-field', area(field, []), area(null, [cancel, save]))).toBe(field);
  });
  it('first-field ohne Feld: Primärknopf (letzter)', () => {
    expect(pickInitialFocus('first-field', area(null, []), area(null, [cancel, save]))).toBe(save);
    expect(pickInitialFocus('first-field', null, area(null, [cancel, save]))).toBe(save);
  });
  it('primary und cancel', () => {
    expect(pickInitialFocus('primary', area(field, []), area(null, [cancel, save]))).toBe(save);
    expect(pickInitialFocus('cancel', area(field, []), area(null, [cancel, save]))).toBe(cancel);
  });
  it('close oder keine Knöpfe: Radix entscheidet', () => {
    expect(pickInitialFocus('close', area(field, []), area(null, [cancel]))).toBeNull();
    expect(pickInitialFocus('primary', null, area(null, []))).toBeNull();
    expect(pickInitialFocus('primary', null, null)).toBeNull();
  });
});
