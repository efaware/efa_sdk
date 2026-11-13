import React, { forwardRef } from 'react';
import { fieldClassName, resolveFieldControl, useFormField } from './field.js';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Fehlerzustand (roter Rahmen, `aria-invalid`). In einem `FormField` mit `error` automatisch. */
  invalid?: boolean;
}

/**
 * Einzeiliges Textfeld. Im `FormField` übernimmt es `id`, Beschreibung, Fehler-,
 * Pflicht- und Sperrzustand. Für Zahlen `type="number"`, für Datum + Uhrzeit
 * `DateTimeField`, für Suchfelder `SearchInput`.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className = '', invalid, id, required, disabled, ...props },
  ref,
) {
  const field = resolveFieldControl(
    { id, invalid, required, disabled, 'aria-describedby': props['aria-describedby'] },
    useFormField(),
  );
  return (
    <input
      ref={ref}
      {...props}
      {...field}
      className={`${fieldClassName(field['aria-invalid'])} ${className}`}
    />
  );
});
