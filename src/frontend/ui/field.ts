import { createContext, useContext } from 'react';

/**
 * Gemeinsame Grundlage der Eingabefelder (Input, Textarea, Select, SearchInput,
 * Combobox, FileDropzone): ein Klassen-Satz für das Aussehen und der Kontext von
 * `FormField`, über den ein Feld `id`, Beschreibung, Fehler- und Pflichtzustand erbt.
 */

/** Aussehen aller Textfelder; `invalid` färbt Rahmen und Fokusring rot. */
export function fieldClassName(invalid?: boolean): string {
  const state = invalid
    ? 'border-[var(--color-danger)] focus:ring-[var(--color-danger)]'
    : 'border-[var(--color-border)] focus:ring-[var(--color-primary)] focus:border-transparent';
  return `w-full px-3 py-2 border rounded-sm text-sm bg-[var(--color-surface)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] transition-colors focus:outline-none focus:ring-2 disabled:opacity-60 disabled:cursor-not-allowed [&:is(input,textarea):read-only]:bg-[var(--color-surface-raised)] ${state}`;
}

export interface FormFieldContextValue {
  /** id des Steuerelements (Input, Select …); die Beschriftung zeigt per `for` darauf. */
  id: string;
  /** id der Beschriftung, für Gruppen (`aria-labelledby`). */
  labelId: string;
  /** ids von Hinweis und Fehler, für `aria-describedby`. */
  describedBy?: string;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
}

export const FormFieldContext = createContext<FormFieldContextValue | null>(null);

/** Der umgebende `FormField`, sonst `null`. */
export function useFormField(): FormFieldContextValue | null {
  return useContext(FormFieldContext);
}

/** Verbindet zwei `aria-describedby`-Listen. */
export function joinIds(...ids: Array<string | undefined | null | false>): string | undefined {
  const joined = ids.filter(Boolean).join(' ');
  return joined || undefined;
}

export interface FieldControlInput {
  id?: string;
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
  'aria-describedby'?: string;
}

export interface FieldControlProps {
  id?: string;
  required?: boolean;
  disabled?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

/**
 * Attribute eines Steuerelements aus seinen eigenen Props und dem `FormField`-Kontext.
 * Eigene Props gewinnen, `aria-describedby` wird zusammengeführt.
 */
export function resolveFieldControl(props: FieldControlInput, ctx: FormFieldContextValue | null): FieldControlProps {
  const invalid = props.invalid ?? ctx?.invalid ?? false;
  return {
    id: props.id ?? ctx?.id,
    required: props.required ?? (ctx?.required || undefined),
    disabled: props.disabled ?? (ctx?.disabled || undefined),
    'aria-describedby': joinIds(props['aria-describedby'], ctx?.describedBy),
    'aria-invalid': invalid ? true : undefined,
  };
}
