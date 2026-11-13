import React, { useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useFormField } from './field.js';
import { nextEnabledKey } from './roving.js';

export interface SegmentedOption<V extends string = string> {
  value: V;
  label: React.ReactNode;
  icon?: LucideIcon;
  disabled?: boolean;
  /** Pflicht, wenn `label` leer ist (nur Icon). */
  'aria-label'?: string;
}

export interface SegmentedControlProps<V extends string = string> {
  options: SegmentedOption<V>[];
  value: V;
  onValueChange: (value: V) => void;
  size?: 'sm' | 'md';
  disabled?: boolean;
  /** Ohne umgebendes `FormField` (`as="group"`) die Auswahl hiermit benennen. */
  'aria-label'?: string;
  className?: string;
}

/** Nächster wählbarer Wert für Pfeiltasten, Home und End; `null` bei anderen Tasten. */
export function nextSegment<V extends string>(options: SegmentedOption<V>[], current: V, key: string): V | null {
  return nextEnabledKey(options.map((o) => ({ key: o.value, disabled: o.disabled })), current, key, { vertical: true });
}

/** Wert, dessen Button per Tab erreichbar ist: die Auswahl, sonst der erste wählbare. */
export function tabbableSegment<V extends string>(options: SegmentedOption<V>[], value: V): V | undefined {
  return options.some((o) => o.value === value && !o.disabled) ? value : options.find((o) => !o.disabled)?.value;
}

/**
 * Umschalter für 2–5 gleichrangige Optionen, die sofort wirken: Ansicht (Liste/Kacheln),
 * Zeitraum (Tag/Woche/Monat), Filter. Kein Ersatz für Reiter (`Tabs`) und nicht für
 * Ein/Aus (`Switch`).
 */
export function SegmentedControl<V extends string = string>({
  options,
  value,
  onValueChange,
  size = 'md',
  disabled = false,
  className = '',
  ...aria
}: SegmentedControlProps<V>) {
  const ctx = useFormField();
  const refs = useRef<Partial<Record<string, HTMLButtonElement | null>>>({});
  const off = disabled || (ctx?.disabled ?? false);
  const tabbable = tabbableSegment(options, value);

  function onKeyDown(e: React.KeyboardEvent) {
    const next = nextSegment(options, value, e.key);
    if (next === null) return;
    e.preventDefault();
    onValueChange(next);
    refs.current[next]?.focus();
  }

  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs gap-1.5' : 'px-3 py-1.5 text-sm gap-2';
  return (
    <div
      role="radiogroup"
      aria-labelledby={aria['aria-label'] ? undefined : ctx?.labelId}
      aria-label={aria['aria-label']}
      aria-describedby={ctx?.describedBy}
      onKeyDown={off ? undefined : onKeyDown}
      className={`inline-flex items-center gap-0.5 p-0.5 rounded-sm border border-[var(--color-border)] bg-[var(--color-surface-raised)] ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            ref={(el) => { refs.current[o.value] = el; }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o['aria-label']}
            data-state={active ? 'checked' : 'unchecked'}
            tabIndex={o.value === tabbable ? 0 : -1}
            disabled={off || o.disabled}
            onClick={() => onValueChange(o.value)}
            className={`inline-flex items-center justify-center rounded-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-50 disabled:cursor-not-allowed ${pad} ${
              active
                ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-sm'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            {Icon && <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} aria-hidden="true" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
