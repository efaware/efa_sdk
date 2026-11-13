import React, { forwardRef, useEffect, useId, useRef } from 'react';
import { FormFieldContext, joinIds, useFormField } from './field.js';
import { assignRef } from './roving.js';

/**
 * Checkbox, einzeln oder als Gruppe.
 *
 * Wann Checkbox, wann Schalter (siehe `Switch`): Checkbox für die **Auswahl** von
 * Einträgen (mehrere aus einer Liste, `CheckboxGroup`) und für eine **Bestätigung**,
 * die der Benutzer aktiv gibt („Ich stimme zu“). Jede Ein/Aus-Einstellung ist ein
 * `Switch`. Zeilenauswahl in Tabellen macht die `DataTable` selbst.
 *
 * Natives `<input type="checkbox">` mit `accent-color`: Tastatur, Formular und
 * Screenreader funktionieren ohne Nachbau. Aussehen aus `styles.css` (`.checkbox`).
 */

export interface CheckboxProps {
  id?: string;
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Teilweise ausgewählt (z. B. „Alle“ bei gemischter Auswahl). Bei Klick wird `checked` gemeldet. */
  indeterminate?: boolean;
  disabled?: boolean;
  required?: boolean;
  /** Fehlerzustand, z. B. fehlende Zustimmung. */
  invalid?: boolean;
  /** Beschriftung rechts daneben. Ohne Beschriftung `aria-label` setzen. */
  label?: React.ReactNode;
  /** Erläuterung unter der Beschriftung. */
  description?: React.ReactNode;
  name?: string;
  value?: string;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  {
    id,
    checked,
    onCheckedChange,
    indeterminate = false,
    disabled,
    required,
    invalid,
    label,
    description,
    name,
    value,
    className = '',
    ...aria
  },
  ref,
) {
  // Einzelne Checkbox im FormField (z. B. Zustimmung mit Fehlertext): id, Fehler,
  // Beschreibung, Pflicht und Sperre kommen aus dem Feld. CheckboxGroup blendet den
  // Kontext für ihre Einträge aus, sonst hätten alle dieselbe id.
  const ctx = useFormField();
  const autoId = useId();
  const inputId = id ?? ctx?.id ?? `checkbox-${autoId}`;
  const descId = description ? `${inputId}-desc` : undefined;
  const isInvalid = invalid ?? ctx?.invalid ?? false;
  const isDisabled = disabled ?? (ctx?.disabled || undefined);
  const inner = useRef<HTMLInputElement | null>(null);

  // Bei jedem Rendern: ein Klick löscht `indeterminate` im DOM, auch wenn die Prop gleich bleibt.
  useEffect(() => {
    if (inner.current) inner.current.indeterminate = indeterminate;
  });

  const input = (
    <input
      ref={(el) => {
        inner.current = el;
        assignRef(ref, el);
      }}
      type="checkbox"
      id={inputId}
      className="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      disabled={isDisabled}
      required={required ?? (ctx?.required || undefined)}
      name={name}
      value={value}
      aria-checked={indeterminate ? 'mixed' : undefined}
      aria-invalid={isInvalid ? true : undefined}
      aria-label={aria['aria-label']}
      aria-describedby={joinIds(aria['aria-describedby'], descId, ctx?.describedBy)}
    />
  );
  if (!label) return <span className={`inline-flex ${className}`}>{input}</span>;
  return (
    <div className={`flex items-start gap-2.5 ${className}`}>
      <span className="flex pt-0.5">{input}</span>
      <span className="min-w-0">
        <label
          htmlFor={inputId}
          className={`block text-sm text-[var(--color-text-primary)] ${isDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
        >
          {label}
        </label>
        {description && (
          <span id={descId} className="block text-xs text-[var(--color-text-muted)] mt-0.5">{description}</span>
        )}
      </span>
    </div>
  );
});

export interface ChoiceOption {
  value: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
}

/**
 * Neue Auswahl nach einem Klick: Reihenfolge wie in `options`, Werte, die nicht
 * (mehr) in `options` stehen, bleiben hinten erhalten.
 */
export function toggleChoice(options: ChoiceOption[], selected: string[], value: string, checked: boolean): string[] {
  const set = new Set(selected);
  if (checked) set.add(value);
  else set.delete(value);
  const known = options.map((o) => o.value);
  return [...known.filter((v) => set.has(v)), ...[...set].filter((v) => !known.includes(v))];
}

export interface CheckboxGroupProps {
  options: ChoiceOption[];
  value: string[];
  onValueChange: (value: string[]) => void;
  /** Formularfeld-Name; jede Checkbox trägt ihn mit ihrem Wert. */
  name?: string;
  orientation?: 'vertical' | 'horizontal';
  disabled?: boolean;
  /** Ohne umgebendes `FormField` (`as="group"`) die Gruppe hiermit benennen. */
  'aria-label'?: string;
  className?: string;
}

/** Mehrfachauswahl aus wenigen Einträgen. Benennung über `<FormField as="group">`. */
export function CheckboxGroup({
  options,
  value,
  onValueChange,
  name,
  orientation = 'vertical',
  disabled,
  className = '',
  ...aria
}: CheckboxGroupProps) {
  const ctx = useFormField();
  const groupDisabled = disabled ?? ctx?.disabled ?? false;
  return (
    <div
      role="group"
      aria-labelledby={aria['aria-label'] ? undefined : ctx?.labelId}
      aria-label={aria['aria-label']}
      aria-describedby={ctx?.describedBy}
      className={`flex ${orientation === 'vertical' ? 'flex-col gap-2' : 'flex-wrap gap-x-5 gap-y-2'} ${className}`}
    >
      <FormFieldContext.Provider value={null}>
      {options.map((o) => (
        <Checkbox
          key={o.value}
          checked={value.includes(o.value)}
          onCheckedChange={(c) => onValueChange(toggleChoice(options, value, o.value, c))}
          label={o.label}
          description={o.description}
          disabled={groupDisabled || o.disabled}
          invalid={ctx?.invalid}
          name={name}
          value={o.value}
        />
      ))}
      </FormFieldContext.Provider>
    </div>
  );
}
