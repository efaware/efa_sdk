import React, { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { fieldClassName, resolveFieldControl, useFormField } from './field.js';

/** Platzhalter für ein gespeichertes Geheimnis: immer gleich lang, verrät nichts über den Wert. */
export const SECRET_MASK = '•'.repeat(12);

/**
 * Wert nach einer Eingabe in ein maskiertes Feld: die Maskenpunkte fallen weg,
 * übrig bleibt nur, was der Benutzer getippt oder eingefügt hat. Löscht er
 * einen Punkt, ist das Feld leer.
 */
export function secretInputValue(raw: string, masked: boolean): string {
  return masked ? raw.split('\u2022').join('') : raw;
}

export interface SecretInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'defaultValue'> {
  /** Neuer Wert; `''` heißt „nicht geändert“ (das Backend behält das gespeicherte Geheimnis). */
  value: string;
  onValueChange: (value: string) => void;
  /** Ist ein Geheimnis gespeichert (`has_secret`, `apiKeySet` …)? Dann zeigt das leere Feld `SECRET_MASK`. */
  isSet: boolean;
  /** Fehlerzustand (roter Rahmen, `aria-invalid`). In einem `FormField` mit `error` automatisch. */
  invalid?: boolean;
  /**
   * Auge zum Aufdecken der Eingabe (Vorgabe an). Es deckt nur auf, was gerade
   * eingegeben wird: Solange die Maske steht oder das Feld leer ist, gibt es
   * kein Auge, und der gespeicherte Wert kommt ohnehin nie vom Backend.
   */
  revealable?: boolean;
  /** `className` gilt für den Rahmen um das Feld (Breite), wie bei `SearchInput`. */
  className?: string;
}

/**
 * Feld für API-Keys, Passwörter und andere Geheimnisse. Ist eines gespeichert,
 * steht eine feste Zahl Punkte im Feld (`SECRET_MASK`), ohne Hinweis
 * „leer = unverändert“. Fokus markiert die Punkte, Tippen oder Einfügen
 * ersetzt sie; verlässt der Benutzer das Feld leer oder setzt die App `value`
 * nach dem Speichern auf `''` zurück, erscheinen sie wieder.
 * `value` bleibt dabei `''`, bis er etwas eingibt: die App schickt das Feld
 * nur mit, wenn `value` nicht leer ist. Ohne gespeichertes Geheimnis ist das
 * Feld leer. Der Klartext kommt nie vom Backend zurück.
 * Mit Inhalt erscheint rechts ein Auge („Eingabe anzeigen“), das die neue
 * Eingabe aufdeckt; leert der Benutzer das Feld, ist es wieder verdeckt.
 */
export const SecretInput = forwardRef<HTMLInputElement, SecretInputProps>(function SecretInput(
  { value, onValueChange, isSet, className = '', invalid, id, required, disabled, onFocus, onBlur, autoComplete, name, revealable = true, ...props },
  ref,
) {
  const [editing, setEditing] = useState(false);
  const [visible, setVisible] = useState(false);
  const field = resolveFieldControl(
    { id, invalid, required, disabled, 'aria-describedby': props['aria-describedby'] },
    useFormField(),
  );
  const masked = isSet && value === '' && !editing;
  // Das Auge gibt es nur für eine eigene Eingabe, nie für die Maske.
  const canReveal = revealable && !masked && value !== '' && !field.disabled;
  const shown = visible && canReveal;
  if (visible && !canReveal) setVisible(false);
  return (
    <span className={`relative block ${className}`}>
      <input
        ref={ref}
        type={shown ? 'text' : 'password'}
        autoComplete={autoComplete ?? 'new-password'}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        {...props}
        {...field}
        // Ein gespeichertes Geheimnis ist erfüllt, auch wenn `value` leer ist.
        required={masked ? undefined : field.required}
        // Ohne `name`, solange die Maske steht: ein FormData-/nativer Submit darf die Punkte nie als Key mitschicken.
        name={masked ? undefined : name}
        data-efa-field="secret"
        data-efa-secret={isSet ? 'set' : 'empty'}
        value={masked ? SECRET_MASK : value}
        onFocus={(e) => {
          onFocus?.(e);
          if (masked) e.currentTarget.select();
        }}
        onChange={(e) => {
          setEditing(true);
          onValueChange(secretInputValue(e.target.value, masked));
        }}
        onBlur={(e) => {
          onBlur?.(e);
          // Immer zurücksetzen: setzt die App `value` nach dem Speichern auf '', erscheint die Maske wieder.
          setEditing(false);
        }}
        className={`${fieldClassName(field['aria-invalid'])} ${revealable ? 'pr-9' : ''}`}
      />
      {canReveal && (
        <button
          type="button"
          // Fokus im Feld lassen: sonst löst der Klick onBlur aus.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setVisible((v) => !v)}
          aria-label={shown ? 'Eingabe verbergen' : 'Eingabe anzeigen'}
          aria-pressed={shown}
          title={shown ? 'Eingabe verbergen' : 'Eingabe anzeigen'}
          data-efa-action="reveal"
          className="absolute inset-y-0 right-0 flex items-center px-2.5 rounded-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] focus:outline-none focus-visible:text-[var(--color-primary)]"
        >
          {shown ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
        </button>
      )}
    </span>
  );
});
