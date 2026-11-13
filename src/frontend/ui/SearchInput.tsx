import React, { forwardRef } from 'react';
import { Search, X } from 'lucide-react';
import { fieldClassName, resolveFieldControl, useFormField } from './field.js';
import { ESCAPE_ATTR } from './overlay.js';

export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string;
  onValueChange: (value: string) => void;
  /** Default „Suchen …“. */
  placeholder?: string;
  /** `className` gilt für den Rahmen um das Feld (Breite). */
  className?: string;
}

/**
 * Suchfeld mit Lupe und „×“ zum Leeren; Escape leert ebenfalls (und schließt dabei
 * keinen umgebenden Dialog). Die Suche selbst (lokal filtern, Server fragen,
 * entprellen) macht die App.
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onValueChange, placeholder = 'Suchen …', className = '', onKeyDown, id, required, disabled, ...props },
  ref,
) {
  const field = resolveFieldControl(
    { id, required, disabled, 'aria-describedby': props['aria-describedby'] },
    useFormField(),
  );
  return (
    <span className={`relative block ${className}`}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]"
      />
      <input
        ref={ref}
        type="search"
        {...props}
        {...field}
        {...{ [ESCAPE_ATTR]: value ? 'active' : undefined }}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          // Nicht auf defaultPrevented prüfen: der umgebende Dialog setzt es, um offen zu bleiben.
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            onValueChange('');
          }
        }}
        className={`${fieldClassName(field['aria-invalid'])} pl-9 ${value ? 'pr-9' : ''} [&::-webkit-search-cancel-button]:appearance-none`}
      />
      {value && !field.disabled && (
        <button
          type="button"
          aria-label="Suche leeren"
          onClick={() => onValueChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-raised)]"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}
    </span>
  );
});
