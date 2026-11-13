import React, { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { fieldClassName, resolveFieldControl, useFormField } from './field.js';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  /** Einträge. Alternativ eigene `<option>`/`<optgroup>` als `children`. */
  options?: SelectOption[];
  /**
   * Leerer erster Eintrag (Wert `""`), z. B. „Bitte wählen“. Bei `required` in der
   * Liste ausgeblendet (aber vorausgewählt, bis gewählt wird), sonst steht er für
   * „keine Auswahl“.
   */
  placeholder?: string;
  /** Fehlerzustand. In einem `FormField` mit `error` automatisch. */
  invalid?: boolean;
  /** Bequemer als `onChange`: liefert direkt den gewählten Wert. */
  onValueChange?: (value: string) => void;
  /** `className` gilt für den Rahmen um das Feld (Breite), nicht für das `<select>`. */
  className?: string;
  children?: React.ReactNode;
}

/**
 * Auswahlliste: natives `<select>` im Stil von `Input`. Für lange Listen mit Suche
 * (Personen, Partner, Modelle) `Combobox`, für 2–5 sichtbare Optionen `SegmentedControl`
 * oder `RadioGroup`.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, placeholder, invalid, onValueChange, onChange, className = '', children, id, required, disabled, ...props },
  ref,
) {
  const field = resolveFieldControl(
    { id, invalid, required, disabled, 'aria-describedby': props['aria-describedby'] },
    useFormField(),
  );
  return (
    <span className={`relative block ${className}`}>
      <select
        ref={ref}
        {...props}
        {...field}
        onChange={(e) => {
          onChange?.(e);
          onValueChange?.(e.target.value);
        }}
        className={`${fieldClassName(field['aria-invalid'])} appearance-none pr-9 cursor-pointer`}
      >
        {placeholder !== undefined && (
          // `hidden` statt `disabled`: ein gesperrter erster Eintrag würde in einem
          // ungesteuerten Select übersprungen und die erste echte Option vorausgewählt.
          <option value="" hidden={Boolean(field.required)}>{placeholder}</option>
        )}
        {options?.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
        ))}
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]"
      />
    </span>
  );
});
