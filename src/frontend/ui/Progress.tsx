import React from 'react';

export type ProgressTone = 'primary' | 'success' | 'warning' | 'danger';

/** Anteil in Prozent (0–100, gerundet auf eine Stelle); `null` bei unbekanntem Fortschritt. */
export function progressPercent(value: number | null | undefined, max = 100): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || !(max > 0)) return null;
  return Math.round(Math.min(Math.max(value / max, 0), 1) * 1000) / 10;
}

export interface ProgressProps {
  /** Aktueller Wert; ohne Wert läuft ein unbestimmter Balken. */
  value?: number | null;
  max?: number;
  tone?: ProgressTone;
  /** Beschriftung über dem Balken (auch für Screenreader). */
  label?: React.ReactNode;
  /** Text rechts über dem Balken, z. B. „3 von 10“. Default: Prozentwert, wenn `label` gesetzt ist. */
  valueText?: string;
  className?: string;
}

/**
 * Fortschrittsbalken für Uploads, Importe, Kontingente („12 von 50 Lizenzen“).
 * `tone` färbt nach Bedeutung, z. B. `warning` ab 80 % Verbrauch.
 */
export function Progress({ value, max = 100, tone = 'primary', label, valueText, className = '' }: ProgressProps) {
  const pct = progressPercent(value, max);
  const text = valueText ?? (pct === null ? undefined : `${pct.toLocaleString('de-DE')} %`);
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-[var(--color-text-secondary)]">{label}</span>
          {text && <span className="text-xs text-[var(--color-text-muted)] tabular-nums">{text}</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={pct === null ? undefined : max}
        aria-valuenow={pct === null ? undefined : Math.min(Math.max(value as number, 0), max)}
        aria-valuetext={text}
        aria-label={typeof label === 'string' ? label : undefined}
        className={`progress progress-${tone}`}
      >
        <div
          className={pct === null ? 'progress-bar progress-indeterminate' : 'progress-bar'}
          style={pct === null ? undefined : { width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
