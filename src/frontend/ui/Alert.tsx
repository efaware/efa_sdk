import React from 'react';
import { X } from 'lucide-react';

export type AlertVariant = 'error' | 'success' | 'warning' | 'info';

interface AlertProps {
  /** Farbschema. Default: `error`. */
  variant?: AlertVariant;
  /** Meldungstext (oder beliebiger Inhalt). */
  children: React.ReactNode;
  /**
   * Wenn gesetzt, erscheint rechts ein „×"-Button, der diesen Callback aufruft.
   * Ohne `onDismiss` ist das Banner nicht manuell schließbar.
   */
  onDismiss?: () => void;
  className?: string;
}

// Farben kommen aus `styles.css` (`.alert-<variant>`): 10-%-Tönung der
// Signalfarbe als Fläche, reine Signalfarbe als Rahmen und die AA-taugliche
// `--color-<ton>-text`-Variante als Schrift. So ist der Text IMMER lesbar — nie
// „Text in derselben Farbe wie die Fläche" und nie die reine Signalfarbe auf
// hellem Grund (< 4,5 : 1). Niemals `bg-opacity-*`/`border-opacity-*` auf eine
// `bg-[var(--…)]`-Arbitrary anwenden: diese Utilities wirken dort nicht, die
// Fläche bleibt vollflächig → Rot-auf-Rot.

/**
 * Fehler-/Status-Banner für Formulare und Dialoge.
 *
 * WICHTIG zur Platzierung: In einem scrollenden Formular/Dialog gehört das Banner
 * an das obere Ende des Bodys **außerhalb des scrollenden Bereichs** (z. B. als
 * `shrink-0`-Kind vor dem `overflow-y-auto`-Container). Sonst scrollt es weg und
 * ist beim Klick auf einen Submit-Button, der weiter unten liegt, nicht sichtbar.
 * Beim erneuten Validieren `setError('')` setzen, damit alte Meldungen verschwinden.
 */
export function Alert({ variant = 'error', children, onDismiss, className = '' }: AlertProps) {
  return (
    <div
      role="alert"
      className={`shrink-0 flex items-start gap-2 border rounded-md px-4 py-3 text-sm font-medium alert-${variant} ${className}`}
    >
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Meldung schließen"
          className="shrink-0 -mr-1 p-0.5 rounded hover:bg-current/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
