import React, { forwardRef, useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, X } from 'lucide-react';
import { fieldClassName, resolveFieldControl, useFormField } from './field.js';
import { ESCAPE_ATTR, FLOATING_STYLE, OVERLAY_ATTR, useFloating } from './overlay.js';
import { assignRef } from './roving.js';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Zweite Zeile, z. B. E-Mail oder Nummer; wird mit durchsucht. */
  description?: string;
  disabled?: boolean;
}

/** Suchtext vergleichbar machen: klein, ohne Akzente, ß → ss („Müller“ findet „muller“). */
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/** Einträge, deren Beschriftung oder Beschreibung alle Wörter der Suche enthält. */
export function filterOptions(options: ComboboxOption[], query: string): ComboboxOption[] {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return options;
  return options.filter((o) => {
    const hay = normalizeSearch(`${o.label} ${o.description ?? ''}`);
    return words.every((w) => hay.includes(w));
  });
}

/** Nächster wählbarer Index in Richtung `delta` (+1/−1), rundum; −1, wenn keiner wählbar ist. */
export function moveActive(options: ComboboxOption[], current: number, delta: 1 | -1): number {
  const n = options.length;
  for (let i = 1; i <= n; i++) {
    const idx = (((current + delta * i) % n) + n) % n;
    if (!options[idx].disabled) return idx;
  }
  return -1;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  /** Gewählter Wert; `null` = nichts gewählt. */
  value: string | null;
  onValueChange: (value: string | null) => void;
  placeholder?: string;
  /** Text, wenn die Suche nichts findet. Default „Keine Treffer“. */
  emptyText?: string;
  /** „×“ zum Leeren der Auswahl. Default an, bei `required` aus. */
  clearable?: boolean;
  /**
   * Suche auf dem Server: wird bei jeder Eingabe gerufen, `options` sind dann schon
   * das Ergebnis und werden nicht mehr lokal gefiltert. Entprellen macht die App.
   */
  onSearchChange?: (query: string) => void;
  /** Zeigt in der Liste einen Ladehinweis (Serversuche). */
  loading?: boolean;
  /**
   * Beschriftung des gewählten Werts, wenn er nicht in `options` steht (Serversuche:
   * vorbelegter Wert vor der ersten Suche). Einmal gewählte Einträge merkt sich die
   * Combobox selbst.
   */
  selectedLabel?: string;
  /** Formularfeld-Name; setzt ein verstecktes Feld mit dem Wert. */
  name?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  'aria-label'?: string;
  /** `className` gilt für den Rahmen um das Feld (Breite). */
  className?: string;
}

/**
 * Auswahl mit Suche für lange Listen (Personen, Partner, Modelle, Silos). Tippen
 * filtert, Pfeiltasten wählen vor, Enter übernimmt, Escape bricht ab. Für kurze
 * Listen ohne Suche `Select`.
 */
export const Combobox = forwardRef<HTMLInputElement, ComboboxProps>(function Combobox(
  {
    options,
    value,
    onValueChange,
    placeholder,
    emptyText = 'Keine Treffer',
    clearable,
    onSearchChange,
    loading = false,
    selectedLabel,
    name,
    id,
    disabled,
    required,
    invalid,
    className = '',
    ...aria
  },
  ref,
) {
  const field = resolveFieldControl({ id, invalid, required, disabled }, useFormField());
  const autoId = useId();
  const inputId = field.id ?? `combobox-${autoId}`;
  const listId = `${inputId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Gewählten Eintrag merken: bei Serversuche fehlt er in späteren `options`.
  const lastSelected = useRef<ComboboxOption | null>(null);
  const found = options.find((o) => o.value === value) ?? null;
  if (found) lastSelected.current = found;
  const displayLabel =
    value === null ? '' : (found?.label ?? (lastSelected.current?.value === value ? lastSelected.current.label : selectedLabel ?? ''));
  const shown = onSearchChange ? options : filterOptions(options, query ?? '');
  const canClear = (clearable ?? !field.required) && value !== null && !field.disabled;

  const close = useCallback(() => {
    setOpen(false);
    setQuery(null);
    setActive(-1);
  }, []);

  useFloating(open, anchorRef, listRef, { matchWidth: true, onOutside: close });

  useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active, listId]);

  function openList() {
    if (field.disabled || open) return;
    setOpen(true);
    const idx = shown.findIndex((o) => o.value === value);
    setActive(idx >= 0 ? idx : moveActive(shown, -1, 1));
  }

  function choose(option: ComboboxOption) {
    if (option.disabled) return;
    lastSelected.current = option;
    onValueChange(option.value);
    close();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault();
        if (!open) return openList();
        if (shown.length) setActive(moveActive(shown, active, e.key === 'ArrowDown' ? 1 : -1));
        return;
      }
      case 'Home':
      case 'End':
        if (!open || !shown.length) return;
        e.preventDefault();
        setActive(e.key === 'Home' ? moveActive(shown, -1, 1) : moveActive(shown, shown.length, -1));
        return;
      case 'Enter':
        if (!open) return;
        e.preventDefault();
        if (active >= 0 && shown[active]) choose(shown[active]);
        return;
      case 'Escape':
        if (!open) return;
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      case 'Tab':
        if (open) close();
    }
  }

  return (
    <span ref={anchorRef} className={`relative block ${className}`}>
      <input
        ref={(el) => {
          inputRef.current = el;
          assignRef(ref, el);
        }}
        id={inputId}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-label={aria['aria-label']}
        aria-describedby={field['aria-describedby']}
        aria-invalid={field['aria-invalid']}
        aria-required={field.required || undefined}
        disabled={field.disabled}
        placeholder={placeholder}
        value={query ?? displayLabel}
        {...{ [ESCAPE_ATTR]: open ? 'active' : undefined }}
        onChange={(e) => {
          setQuery(e.target.value);
          onSearchChange?.(e.target.value);
          if (!open) setOpen(true);
          setActive(0);
        }}
        onClick={openList}
        onKeyDown={onKeyDown}
        onBlur={(e) => {
          if (!anchorRef.current?.contains(e.relatedTarget as Node) && !listRef.current?.contains(e.relatedTarget as Node)) close();
        }}
        className={`${fieldClassName(field['aria-invalid'])} ${canClear ? 'pr-14' : 'pr-9'}`}
      />
      {name && <input type="hidden" name={name} value={value ?? ''} disabled={field.disabled} />}
      <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
        {canClear && (
          <button
            type="button"
            aria-label="Auswahl leeren"
            onClick={() => {
              onValueChange(null);
              inputRef.current?.focus();
            }}
            className="p-1 rounded-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-raised)]"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
        <ChevronDown aria-hidden="true" className="pointer-events-none w-4 h-4 text-[var(--color-text-muted)]" />
      </span>
      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={aria['aria-label']}
          aria-labelledby={aria['aria-label'] ? undefined : inputId}
          {...{ popover: 'manual', [OVERLAY_ATTR]: '' }}
          style={FLOATING_STYLE}
          className="z-50 max-h-64 overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-lg"
        >
          {loading && (
            <div className="flex items-center gap-2 px-2.5 py-2 text-sm text-[var(--color-text-muted)]">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Wird geladen …
            </div>
          )}
          {!loading && shown.length === 0 && (
            <div className="px-2.5 py-2 text-sm text-[var(--color-text-muted)]">{emptyText}</div>
          )}
          {shown.map((o, i) => {
            const isSelected = o.value === value;
            return (
              <div
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={o.disabled || undefined}
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => !o.disabled && setActive(i)}
                onClick={() => choose(o)}
                className={`flex items-start gap-2 rounded-sm px-2.5 py-1.5 text-sm ${
                  o.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                } ${i === active ? 'bg-[var(--color-surface-raised)]' : ''}`}
              >
                <Check
                  aria-hidden="true"
                  className={`mt-0.5 w-4 h-4 shrink-0 signal-text-primary ${isSelected ? '' : 'invisible'}`}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[var(--color-text-primary)]">{o.label}</span>
                  {o.description && (
                    <span className="block truncate text-xs text-[var(--color-text-muted)]">{o.description}</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </span>
  );
});
