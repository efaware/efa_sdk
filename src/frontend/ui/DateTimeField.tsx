import React, { useEffect, useId, useState } from 'react';
import { formatDateTime } from '../format.js';
import { maskDateTimeInput, parseDateTimeDe } from './dateTimeInput.js';

export interface DateTimeFieldProps {
  /** ISO-Zeitpunkt oder `null` (leer). */
  value: string | null;
  /** `valid=false` → `iso` ist `null`. */
  onChange(iso: string | null, valid: boolean): void;
  label?: string;
  hint?: React.ReactNode;
  /** Frühester Zeitpunkt (ISO). */
  min?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
}

export function dateTimeFieldText(value: string | null): string {
  if (!value) return '';
  return formatDateTime(value, { fallback: '' }).replace(',', '');
}

export function dateTimeFieldError(text: string, opts: { min?: string; required?: boolean } = {}): string | null {
  const parsed = parseDateTimeDe(text);
  if (!parsed.ok) return parsed.error;
  if (parsed.iso === null) return opts.required ? 'Bitte Datum und Uhrzeit eingeben.' : null;
  if (opts.min && Date.parse(parsed.iso) < Date.parse(opts.min)) {
    return `Frühestens ${formatDateTime(opts.min)}.`;
  }
  return null;
}

/** `TT.MM.JJJJ HH:MM` als Textfeld statt `datetime-local`. */
export function DateTimeField({ value, onChange, label, hint, min, id, disabled, required }: DateTimeFieldProps) {
  const autoId = useId();
  const fieldId = id ?? `efa-dt-${autoId}`;
  const [text, setText] = useState(() => dateTimeFieldText(value));
  const [touched, setTouched] = useState(false);

  // Wert von außen (z. B. nach dem Laden) übernehmen, solange er nicht dem Getippten entspricht.
  useEffect(() => {
    const parsed = parseDateTimeDe(text);
    const current = parsed.ok ? parsed.iso : null;
    if (current !== value) setText(dateTimeFieldText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const error = touched ? dateTimeFieldError(text, { min, required }) : null;

  function handleChange(raw: string) {
    const masked = /[.:\s]/.test(raw) && raw.length < text.length ? raw : maskDateTimeInput(raw);
    setText(masked);
    const parsed = parseDateTimeDe(masked);
    const err = dateTimeFieldError(masked, { min, required });
    onChange(parsed.ok ? parsed.iso : null, err === null);
  }

  return (
    <div data-efa-field="datetime">
      {label && <label htmlFor={fieldId} className="block text-xs text-[var(--color-text-muted)] mb-1">{label}</label>}
      <input
        id={fieldId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="TT.MM.JJJJ HH:MM"
        value={text}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => setTouched(true)}
        className={`w-full px-3 py-2 rounded-md border bg-[var(--color-surface)] text-[var(--color-text-primary)] text-sm tabular-nums ${
          error ? 'border-[var(--color-danger)]' : 'border-[var(--color-border)]'
        }`}
      />
      {error
        ? <p id={`${fieldId}-error`} className="mt-1 text-xs text-[var(--color-danger)]">{error}</p>
        : hint ? <p id={`${fieldId}-hint`} className="mt-1 text-xs text-[var(--color-text-muted)]">{hint}</p> : null}
    </div>
  );
}
