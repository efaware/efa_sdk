import React from 'react';
import { Loader2 } from 'lucide-react';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps {
  size?: SpinnerSize;
  /** Text für Screenreader; mit `showLabel` auch sichtbar. Default „Wird geladen …“. */
  label?: string;
  showLabel?: boolean;
  className?: string;
}

const SIZE: Record<SpinnerSize, string> = { sm: 'w-3.5 h-3.5', md: 'w-5 h-5', lg: 'w-8 h-8' };

/**
 * Ladeanzeige für Bereiche, deren Form noch unbekannt ist. Für Listen und Karten mit
 * bekannter Form `Skeleton`, für Buttons `Button loading`.
 */
export function Spinner({ size = 'md', label = 'Wird geladen …', showLabel = false, className = '' }: SpinnerProps) {
  return (
    <span role="status" className={`inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)] ${className}`}>
      <Loader2 aria-hidden="true" className={`animate-spin ${SIZE[size]}`} />
      <span className={showLabel ? '' : 'sr-only'}>{label}</span>
    </span>
  );
}
