import type React from 'react';

/**
 * Gemeinsame Helfer für Bausteine mit Pfeiltasten-Navigation (Tabs, SegmentedControl)
 * und für Komponenten, die einen weitergereichten `ref` zusätzlich selbst brauchen.
 */

/**
 * Nächster wählbarer Schlüssel für Pfeiltasten, Pos1 und Ende; gesperrte werden
 * übersprungen, am Ende geht es vorn weiter. `null` bei anderen Tasten.
 * `vertical` nimmt Pfeil hoch/runter dazu.
 */
export function nextEnabledKey<K>(
  items: Array<{ key: K; disabled?: boolean }>,
  current: K,
  key: string,
  opts: { vertical?: boolean } = {},
): K | null {
  const enabled = items.filter((t) => !t.disabled);
  if (enabled.length === 0) return null;
  if (key === 'Home') return enabled[0].key;
  if (key === 'End') return enabled[enabled.length - 1].key;
  const forward = key === 'ArrowRight' || (opts.vertical && key === 'ArrowDown');
  const back = key === 'ArrowLeft' || (opts.vertical && key === 'ArrowUp');
  if (!forward && !back) return null;
  const idx = enabled.findIndex((t) => t.key === current);
  const step = forward ? 1 : -1;
  const start = idx === -1 ? (step === 1 ? -1 : 0) : idx;
  return enabled[(start + step + enabled.length) % enabled.length].key;
}

/** Weitergereichten `ref` (Funktion oder Objekt) setzen. */
export function assignRef<T>(ref: React.ForwardedRef<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}
