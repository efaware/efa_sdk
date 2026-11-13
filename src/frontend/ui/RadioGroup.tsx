import React, { useId } from 'react';
import { useFormField } from './field.js';
import type { ChoiceOption } from './Checkbox.js';

export interface RadioGroupProps {
  options: ChoiceOption[];
  /** Gewählter Wert; `null` = noch nichts gewählt. */
  value: string | null;
  onValueChange: (value: string) => void;
  /** Formularfeld-Name; ohne wird einer erzeugt (Pfeiltasten brauchen einen gemeinsamen). */
  name?: string;
  orientation?: 'vertical' | 'horizontal';
  disabled?: boolean;
  /** Ohne umgebendes `FormField` (`as="group"`) die Gruppe hiermit benennen. */
  'aria-label'?: string;
  className?: string;
}

/**
 * Einfachauswahl mit sichtbaren Optionen und Erläuterung je Option, z. B. „Wer darf
 * das sehen?“. Natives Radio (Pfeiltasten, Formular). Für kurze Umschalter ohne
 * Erläuterung `SegmentedControl`, für viele Optionen `Select`.
 * Benennung über `<FormField as="group">`.
 */
export function RadioGroup({
  options,
  value,
  onValueChange,
  name,
  orientation = 'vertical',
  disabled,
  className = '',
  ...aria
}: RadioGroupProps) {
  const ctx = useFormField();
  const autoId = useId();
  const groupName = name ?? `radio-${autoId}`;
  const groupDisabled = disabled ?? ctx?.disabled ?? false;
  return (
    <div
      role="radiogroup"
      aria-labelledby={aria['aria-label'] ? undefined : ctx?.labelId}
      aria-label={aria['aria-label']}
      aria-describedby={ctx?.describedBy}
      aria-required={ctx?.required || undefined}
      aria-invalid={ctx?.invalid || undefined}
      className={`flex ${orientation === 'vertical' ? 'flex-col gap-2' : 'flex-wrap gap-x-5 gap-y-2'} ${className}`}
    >
      {options.map((o, i) => {
        const id = `${groupName}-${i}`;
        const descId = o.description ? `${id}-desc` : undefined;
        const off = groupDisabled || o.disabled;
        return (
          <div key={o.value} className="flex items-start gap-2.5">
            <span className="flex pt-0.5">
              <input
                type="radio"
                id={id}
                className="radio"
                name={groupName}
                value={o.value}
                checked={value === o.value}
                onChange={() => onValueChange(o.value)}
                disabled={off}
                aria-describedby={descId}
              />
            </span>
            <span className="min-w-0">
              <label
                htmlFor={id}
                className={`block text-sm text-[var(--color-text-primary)] ${off ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              >
                {o.label}
              </label>
              {o.description && (
                <span id={descId} className="block text-xs text-[var(--color-text-muted)] mt-0.5">{o.description}</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
