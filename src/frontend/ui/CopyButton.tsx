import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';

/**
 * Text in die Zwischenablage. Fällt auf `execCommand('copy')` zurück, wenn die
 * Clipboard-API fehlt oder im iframe nicht erlaubt ist. `true` bei Erfolg.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* weiter mit dem Rückfall */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export interface CopyButtonProps {
  /** Zu kopierender Text; als Funktion erst beim Klick ermittelt. */
  value: string | (() => string);
  /** Beschriftung bzw. `aria-label`. Default „Kopieren“. */
  label?: string;
  /** Beschriftung sichtbar neben dem Symbol. */
  showLabel?: boolean;
  onCopied?: () => void;
  className?: string;
}

/** Symbol-Button „Kopieren“ mit Bestätigung (Haken) für IDs, Schlüssel, Links. */
export function CopyButton({ value, label = 'Kopieren', showLabel = false, onCopied, className = '' }: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  async function onClick() {
    const ok = await copyText(typeof value === 'function' ? value() : value);
    setState(ok ? 'copied' : 'failed');
    if (ok) onCopied?.();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  }

  const Icon = state === 'copied' ? Check : state === 'failed' ? X : Copy;
  const status = state === 'copied' ? 'Kopiert' : state === 'failed' ? 'Kopieren nicht möglich' : '';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={showLabel ? undefined : label}
      title={status || label}
      className={`inline-flex items-center gap-1.5 rounded-sm p-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${className}`}
    >
      <Icon
        aria-hidden="true"
        className={`w-3.5 h-3.5 ${state === 'copied' ? 'signal-text-success' : state === 'failed' ? 'signal-text-danger' : ''}`}
      />
      {showLabel && <span>{label}</span>}
      <span className="sr-only" aria-live="polite">{status}</span>
    </button>
  );
}
