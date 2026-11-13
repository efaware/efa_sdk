import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { OVERLAY_ATTR, hideFromTopLayer, showInTopLayer } from './overlay.js';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Default `success`. */
  variant?: ToastVariant;
  /** Anzeigedauer in ms; `0` = bleibt bis zum Schließen. Default 5 s, Fehler 8 s. */
  duration?: number;
  /** Eine Aktion in der Meldung, z. B. „Rückgängig“. */
  action?: { label: string; onClick: () => void };
}

export interface ToastApi {
  /** Zeigt eine Meldung; ein String ist der Titel. Liefert die id. */
  toast: (options: ToastOptions | string) => string;
  dismiss: (id: string) => void;
}

type ToastEntry = ToastOptions & { id: string; variant: ToastVariant; duration: number };

/** Höchstens so viele Meldungen gleichzeitig; ältere fallen weg. */
export const MAX_TOASTS = 4;

/** Normalisiert die Optionen eines Aufrufs (Default-Variante und -Dauer). */
export function toToastEntry(id: string, options: ToastOptions | string): ToastEntry {
  const o = typeof options === 'string' ? { title: options } : options;
  const variant = o.variant ?? 'success';
  return { ...o, id, variant, duration: o.duration ?? (variant === 'error' ? 8000 : 5000) };
}

const ToastContext = createContext<ToastApi | null>(null);

const noop: ToastApi = {
  toast: () => {
    console.warn('useToast: kein <ToastProvider> um die App – Meldung nicht angezeigt.');
    return '';
  },
  dismiss: () => {},
};

/** Meldungen anzeigen. Braucht einmal `<ToastProvider>` um die App. */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? noop;
}

const ICON = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info } as const;

function ToastItem({ entry, paused, onClose }: { entry: ToastEntry; paused: boolean; onClose: () => void }) {
  const remaining = useRef(entry.duration);
  const started = useRef(0);
  useEffect(() => {
    if (entry.duration === 0 || paused) return;
    started.current = Date.now();
    const t = setTimeout(onClose, remaining.current);
    return () => {
      clearTimeout(t);
      remaining.current -= Date.now() - started.current;
    };
  }, [paused, entry.duration, onClose]);

  const Icon = ICON[entry.variant];
  return (
    <div role={entry.variant === 'error' ? 'alert' : 'status'} className={`toast toast-${entry.variant}`}>
      <Icon aria-hidden="true" className={`mt-0.5 w-4 h-4 shrink-0 signal-text-${entry.variant === 'error' ? 'danger' : entry.variant === 'info' ? 'primary' : entry.variant}`} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[var(--color-text-primary)]">{entry.title}</div>
        {entry.description && <div className="mt-0.5 text-xs text-[var(--color-text-secondary)]">{entry.description}</div>}
        {entry.action && (
          <button
            type="button"
            onClick={() => {
              entry.action?.onClick();
              onClose();
            }}
            className="mt-1.5 text-xs font-medium signal-text-primary hover:underline"
          >
            {entry.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Meldung schließen"
        onClick={onClose}
        className="shrink-0 rounded-sm p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-raised)]"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Kurze Rückmeldungen nach einer Aktion („Gespeichert“, „Link kopiert“), unten rechts,
 * auch über offenen Dialogen. Für Fehler, die der Benutzer im Formular beheben muss,
 * weiter `Alert` am Ort der Aktion.
 *
 * ```tsx
 * <ToastProvider><App /></ToastProvider>
 * const { toast } = useToast();
 * toast('Gespeichert');
 * toast({ variant: 'error', title: 'Nicht gespeichert', description: err.message });
 * ```
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const regionRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  const dismiss = useCallback((id: string) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const toast = useCallback((options: ToastOptions | string) => {
    const id = `toast-${++seq.current}`;
    setToasts((list) => [...list, toToastEntry(id, options)].slice(-MAX_TOASTS));
    return id;
  }, []);
  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  const visible = toasts.length > 0;
  useIsoLayoutEffect(() => {
    const el = regionRef.current;
    if (!visible) return;
    showInTopLayer(el);
    return () => hideFromTopLayer(el);
  }, [visible]);
  useEffect(() => {
    if (!visible) setPaused(false);
  }, [visible]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Portal an <body>: Ein modaler Radix-Dialog setzt beim Öffnen alles außer
          seinem Portal auf aria-hidden; im App-Baum würden Toasts dann nicht vorgelesen. */}
      {visible && typeof document !== 'undefined' && createPortal(
        <div
          ref={regionRef}
          role="region"
          aria-label="Meldungen"
          {...{ popover: 'manual', [OVERLAY_ATTR]: '' }}
          className="toast-region"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          {toasts.map((t) => (
            <ToastItem key={t.id} entry={t} paused={paused} onClose={() => dismiss(t.id)} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
