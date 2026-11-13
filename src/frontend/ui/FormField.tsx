import React, { useId } from 'react';
import { FormFieldContext, joinIds, type FormFieldContextValue } from './field.js';

export interface FormFieldProps {
  /** Beschriftung über dem Feld. */
  label: React.ReactNode;
  /** Hinweis unter dem Feld (Format, Beispiel). Bleibt auch bei Fehler sichtbar. */
  hint?: React.ReactNode;
  /** Fehlertext; markiert das Feld rot und wird vorgelesen. */
  error?: React.ReactNode;
  /** Pflichtfeld: roter Stern an der Beschriftung, `required` am Feld. */
  required?: boolean;
  /** Sperrt das Feld darin. */
  disabled?: boolean;
  /** id des Feldes; ohne wird eine erzeugt. */
  id?: string;
  /**
   * `group` für mehrere Steuerelemente unter einer Beschriftung (`RadioGroup`,
   * `CheckboxGroup`, mehrere Felder): die Beschriftung benennt dann die Gruppe.
   */
  as?: 'field' | 'group';
  className?: string;
  children: React.ReactNode;
}

/**
 * Beschriftetes Formularfeld: Beschriftung, Feld, Hinweis und Fehler.
 *
 * Die Felder des Kits darin (`Input`, `Textarea`, `Select`, `Combobox`, `SearchInput`,
 * `FileDropzone`, `RadioGroup`, `CheckboxGroup`) übernehmen `id`, `aria-describedby`,
 * `aria-invalid`, `required` und `disabled` selbst. Nichts doppelt setzen.
 *
 * ```tsx
 * <FormField label="E-Mail" required error={errors.email} hint="Für Benachrichtigungen">
 *   <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
 * </FormField>
 * ```
 */
export function FormField({
  label,
  hint,
  error,
  required = false,
  disabled = false,
  id,
  as = 'field',
  className = '',
  children,
}: FormFieldProps) {
  const autoId = useId();
  const fieldId = id ?? `field-${autoId}`;
  const labelId = `${fieldId}-label`;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const invalid = Boolean(error);
  const ctx: FormFieldContextValue = {
    id: fieldId,
    labelId,
    describedBy: joinIds(hintId, errorId),
    invalid,
    required,
    disabled,
  };

  const labelContent = (
    <>
      {label}
      {required && <span className="signal-text-danger ml-0.5" aria-hidden="true">*</span>}
    </>
  );
  const labelClass = `text-sm font-medium text-[var(--color-text-secondary)] ${disabled ? 'opacity-60' : ''}`;

  return (
    <FormFieldContext.Provider value={ctx}>
      <div className={`flex flex-col gap-1.5 min-w-0 ${className}`}>
        {as === 'group' ? (
          <div id={labelId} className={labelClass}>{labelContent}</div>
        ) : (
          <label id={labelId} htmlFor={fieldId} className={labelClass}>{labelContent}</label>
        )}
        {children}
        {hint && <p id={hintId} className="text-xs text-[var(--color-text-muted)]">{hint}</p>}
        {error && <p id={errorId} className="text-xs signal-text-danger">{error}</p>}
      </div>
    </FormFieldContext.Provider>
  );
}

export interface FormSectionProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** Zwischenüberschrift für eine Gruppe von Feldern in einem Formular oder Reiter. */
export function FormSection({ title, description, className = '', children }: FormSectionProps) {
  return (
    <section className={`flex flex-col gap-4 ${className}`}>
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
        {description && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{description}</p>}
      </div>
      {children}
    </section>
  );
}
