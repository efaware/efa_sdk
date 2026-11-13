import { describe, it, expect } from 'vitest';
import { assignRef, nextEnabledKey } from '../src/frontend/ui/roving';

describe('nextEnabledKey', () => {
  const items = [{ key: 'a' }, { key: 'b', disabled: true }, { key: 'c' }];
  it('waagerecht: Pfeile, Pos1, Ende, gesperrte überspringen', () => {
    expect(nextEnabledKey(items, 'a', 'ArrowRight')).toBe('c');
    expect(nextEnabledKey(items, 'c', 'ArrowRight')).toBe('a');
    expect(nextEnabledKey(items, 'a', 'ArrowLeft')).toBe('c');
    expect(nextEnabledKey(items, 'c', 'Home')).toBe('a');
    expect(nextEnabledKey(items, 'a', 'End')).toBe('c');
    expect(nextEnabledKey(items, 'x', 'ArrowRight')).toBe('a');
    expect(nextEnabledKey(items, 'x', 'ArrowLeft')).toBe('c');
  });
  it('senkrecht nur mit vertical', () => {
    expect(nextEnabledKey(items, 'a', 'ArrowDown')).toBeNull();
    expect(nextEnabledKey(items, 'a', 'ArrowDown', { vertical: true })).toBe('c');
    expect(nextEnabledKey(items, 'a', 'ArrowUp', { vertical: true })).toBe('c');
    expect(nextEnabledKey(items, 'a', 'Enter')).toBeNull();
    expect(nextEnabledKey([{ key: 'z', disabled: true }], 'z', 'Home')).toBeNull();
  });
});

describe('assignRef', () => {
  it('setzt Funktions- und Objekt-Refs, ignoriert null', () => {
    let got: unknown;
    assignRef((v: unknown) => { got = v; }, 1);
    expect(got).toBe(1);
    const obj = { current: null as number | null };
    assignRef(obj, 2);
    expect(obj.current).toBe(2);
    expect(() => assignRef(null, 3)).not.toThrow();
  });
});
