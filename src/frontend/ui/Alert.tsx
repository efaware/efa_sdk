import React, { useState } from 'react';
import { X } from 'lucide-react';

export type AlertVariant = 'error' | 'success' | 'warning' | 'info';

interface AlertProps {
  /** Farbschema. Default: `error`. */
  variant?: AlertVariant;
  /** Meldungstext (oder beliebiger Inhalt). */
  children: React.ReactNode;
  /**
   * Gesteuertes Schließen: Das „×" ruft diesen Callback, der Aufrufer blendet das
   * Banner aus (z. B. `setError('')`). Ohne `onDismiss` blendet sich das Banner
   * selbst aus und erscheint wieder, sobald sich ein Text-Inhalt ändert.
   */
  onDismiss?: () => void;
  /**
   * Zeigt oben rechts ein „×" zum Schließen. Default: `true` — jedes Banner ist
   * wegklickbar. `false` nur für Hinweise, die stehen bleiben müssen.
   */
  dismissible?: boolean;
  className?: string;
}

/**
 * Schlüssel, an dem ein selbst geschlossenes Banner „wiedererkannt" wird: Text
 * und Zahlen direkt, sonst `null` (dann bleibt es zu, bis es neu eingehängt wird).
 */
export function alertContentKey(children: React.ReactNode): string | null {
  return typeof children === 'string' || typeof children === 'number' ? String(children) : null;
}

/**
 * Ein ungesteuertes Banner ist ausgeblendet, solange es für genau diesen Inhalt
 * geschlossen wurde. Neuer Text → wieder sichtbar.
 */
export function isAlertHidden(dismissedKey: string | null | undefined, contentKey: string | null): boolean {
  return dismissedKey !== undefined && dismissedKey === contentKey;
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
export function Alert({ variant = 'error', children, onDismiss, dismissible = true, className = '' }: AlertProps) {
  // `undefined` = nie geschlossen. Nur ohne `onDismiss` relevant.
  const [dismissedKey, setDismissedKey] = useState<string | null | undefined>(undefined);
  const contentKey = alertContentKey(children);
  if (!onDismiss && isAlertHidden(dismissedKey, contentKey)) return null;

  return (
    <div
      role="alert"
      className={`shrink-0 flex items-start gap-2 border rounded-md px-4 py-3 text-sm font-medium alert-${variant} ${className}`}
    >
      <span className="flex-1 min-w-0">{children}</span>
      {dismissible && (
        <button
          type="button"
          onClick={onDismiss ?? (() => setDismissedKey(contentKey))}
          aria-label="Meldung schließen"
          className="shrink-0 -mr-1 p-0.5 rounded hover:bg-current/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
