import React, { useId } from 'react';

/**
 * Schalter für Ein/Aus-Werte („Aktiv", „Widget anzeigen", „Benachrichtigungen").
 *
 * Wann Schalter, wann Checkbox:
 * - **Schalter** für jede boolesche Einstellung in der UI. Die Änderung ist ein
 *   Zustand („an"/„aus"), keine Auswahl.
 * - **Checkbox** nur für (a) die Auswahl von Zeilen/Einträgen in Listen
 *   (Mehrfachauswahl, Bulk-Aktionen — macht die `DataTable` selbst) und (b) eine
 *   Bestätigung, die der Benutzer aktiv abgibt („Ich habe gelesen …", „Ich stimme zu").
 *
 * Bewusst ohne Radix: ein nativer `<button role="switch">` bringt Tastatur
 * (Leertaste/Enter), Fokus und `disabled` mit und erspart Apps eine weitere
 * Peer-Dependency. Farben kommen aus `styles.css` (`.switch*`), damit sie auch
 * greifen, wenn die App-Tailwind das SDK nicht scannt.
 */

export type SwitchTone = 'primary' | 'danger';

export interface SwitchControlProps {
  id?: string;
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  /** `danger` für Schalter, deren „an" eine Einschränkung ist (z. B. „Konto gesperrt"). */
  tone?: SwitchTone;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

/** Nur der Schalter selbst — für Zeilen, die ihre Beschriftung selbst bauen (dann `aria-label` setzen). */
export function SwitchControl({
  id,
  checked,
  onCheckedChange,
  disabled = false,
  tone = 'primary',
  className = '',
  ...aria
}: SwitchControlProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      data-state={checked ? 'checked' : 'unchecked'}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={`switch switch-${tone} ${className}`}
      {...aria}
    >
      <span className="switch-thumb" aria-hidden="true" />
    </button>
  );
}

export interface SwitchProps extends Omit<SwitchControlProps, 'aria-label' | 'aria-labelledby' | 'aria-describedby' | 'className'> {
  /** Beschriftung rechts neben dem Schalter; ein Klick darauf schaltet um. */
  label: React.ReactNode;
  /** Erläuterung unter der Beschriftung (wird per `aria-describedby` vorgelesen). */
  description?: React.ReactNode;
  /** Tooltip, z. B. warum der Schalter gesperrt ist. */
  title?: string;
  className?: string;
}

/** Schalter mit Beschriftung rechts daneben und optionaler Erläuterung. */
export function Switch({ label, description, title, className = '', id, ...control }: SwitchProps) {
  const autoId = useId();
  const switchId = id ?? `switch-${autoId}`;
  const descId = description ? `${switchId}-desc` : undefined;
  return (
    <div className={`flex items-start gap-3 ${className}`} title={title}>
      <span className="pt-0.5 flex">
        <SwitchControl id={switchId} aria-describedby={descId} {...control} />
      </span>
      <span className="min-w-0">
        <label
          htmlFor={switchId}
          className={`block text-sm text-[var(--color-text-primary)] ${control.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
        >
          {label}
        </label>
        {description && (
          <span id={descId} className="block text-xs text-[var(--color-text-muted)] mt-0.5">
            {description}
          </span>
        )}
      </span>
    </div>
  );
}
