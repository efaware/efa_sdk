import React, { forwardRef } from 'react';
import { fieldClassName, resolveFieldControl, useFormField } from './field.js';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Fehlerzustand. In einem `FormField` mit `error` automatisch. */
  invalid?: boolean;
  /** Festbreitenschrift, z. B. für JSON, Prompts oder Code. */
  mono?: boolean;
}

/** Mehrzeiliges Textfeld im Stil von `Input`, in der Höhe ziehbar. Default 3 Zeilen. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className = '', invalid, mono = false, rows = 3, id, required, disabled, ...props },
  ref,
) {
  const field = resolveFieldControl(
    { id, invalid, required, disabled, 'aria-describedby': props['aria-describedby'] },
    useFormField(),
  );
  return (
    <textarea
      ref={ref}
      rows={rows}
      {...props}
      {...field}
      className={`${fieldClassName(field['aria-invalid'])} resize-y ${mono ? 'font-mono' : ''} ${className}`}
    />
  );
});
