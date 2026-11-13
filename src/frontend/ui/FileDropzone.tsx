import React, { useId, useState } from 'react';
import { Upload } from 'lucide-react';
import { joinIds, resolveFieldControl, useFormField } from './field.js';

export type FileRejectionReason = 'type' | 'size' | 'count';

export interface FileRejection {
  file: File;
  reason: FileRejectionReason;
  /** Deutscher Text für die Anzeige, z. B. „bericht.exe: Dateityp nicht erlaubt“. */
  message: string;
}

export interface FileRules {
  /** Wie das `accept`-Attribut: `.pdf,image/*,application/zip`. */
  accept?: string;
  /** Höchstgröße je Datei in Byte. */
  maxSize?: number;
  /** Höchstzahl an Dateien je Auswahl; ohne `multiple` immer 1. */
  maxFiles?: number;
  multiple?: boolean;
}

/** Dateigröße lesbar: 980 B, 12,4 KB, 3,1 MB. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toLocaleString('de-DE', { maximumFractionDigits: 1 })} ${units[u]}`;
}

/** Passt die Datei zu `accept` (Endung, MIME-Typ oder `typ/*`)? Leeres `accept` erlaubt alles. */
export function matchesAccept(file: { name: string; type: string }, accept?: string): boolean {
  const rules = (accept ?? '').split(',').map((r) => r.trim().toLowerCase()).filter(Boolean);
  if (rules.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return rules.some((r) => {
    if (r.startsWith('.')) return name.endsWith(r);
    if (r.endsWith('/*')) return type.startsWith(r.slice(0, -1));
    return type === r;
  });
}

/** Teilt eine Auswahl in angenommene und abgelehnte Dateien. */
export function validateFiles(files: File[], rules: FileRules = {}): { accepted: File[]; rejected: FileRejection[] } {
  const accepted: File[] = [];
  const rejected: FileRejection[] = [];
  const limit = rules.multiple ? (rules.maxFiles ?? Infinity) : 1;
  for (const file of files) {
    if (!matchesAccept(file, rules.accept)) {
      rejected.push({ file, reason: 'type', message: `${file.name}: Dateityp nicht erlaubt` });
    } else if (rules.maxSize !== undefined && file.size > rules.maxSize) {
      rejected.push({ file, reason: 'size', message: `${file.name}: größer als ${formatFileSize(rules.maxSize)}` });
    } else if (accepted.length >= limit) {
      rejected.push({ file, reason: 'count', message: `${file.name}: höchstens ${limit} ${limit === 1 ? 'Datei' : 'Dateien'}` });
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected };
}

export interface FileDropzoneProps extends FileRules {
  /** Angenommene Dateien; das Hochladen macht die App. */
  onFiles: (files: File[]) => void;
  /** Abgelehnte Dateien mit Grund; z. B. als `Alert` oder Toast anzeigen. */
  onReject?: (rejections: FileRejection[]) => void;
  /** Haupttext. Default „Dateien hierher ziehen oder auswählen“. */
  label?: React.ReactNode;
  /** Zweite Zeile, z. B. „PDF oder Word, höchstens 20 MB“. */
  hint?: React.ReactNode;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  /** Kompakte Höhe für Formulare. */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Fläche zum Ablegen oder Auswählen von Dateien (Klick, Tastatur, Ziehen). Prüft
 * Dateityp, Größe und Anzahl und meldet nur gültige Dateien an `onFiles`.
 */
export function FileDropzone({
  onFiles,
  onReject,
  accept,
  maxSize,
  maxFiles,
  multiple = false,
  label,
  hint,
  disabled,
  invalid,
  id,
  size = 'md',
  className = '',
}: FileDropzoneProps) {
  const field = resolveFieldControl({ id, invalid, disabled }, useFormField());
  const autoId = useId();
  const inputId = field.id ?? `files-${autoId}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const [dragging, setDragging] = useState(false);

  function take(list: FileList | null) {
    if (!list || field.disabled) return;
    const { accepted, rejected } = validateFiles(Array.from(list), { accept, maxSize, maxFiles, multiple });
    if (accepted.length) onFiles(accepted);
    if (rejected.length) onReject?.(rejected);
  }

  const border = field['aria-invalid']
    ? 'border-[var(--color-danger)]'
    : dragging
      ? 'border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_6%,transparent)]'
      : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)]';
  return (
    <label
      htmlFor={inputId}
      onDragOver={(e) => {
        e.preventDefault();
        if (!field.disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        take(e.dataTransfer.files);
      }}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--color-primary)] ${size === 'sm' ? 'px-4 py-4' : 'px-6 py-8'} ${field.disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${border} ${className}`}
    >
      <input
        id={inputId}
        type="file"
        className="sr-only"
        accept={accept}
        multiple={multiple}
        disabled={field.disabled}
        aria-invalid={field['aria-invalid']}
        aria-describedby={joinIds(hintId, field['aria-describedby'])}
        onChange={(e) => {
          take(e.target.files);
          e.target.value = '';
        }}
      />
      <Upload aria-hidden="true" className="w-5 h-5 text-[var(--color-text-muted)]" />
      <span className="text-sm text-[var(--color-text-primary)]">
        {label ?? (multiple ? 'Dateien hierher ziehen oder auswählen' : 'Datei hierher ziehen oder auswählen')}
      </span>
      {hint && <span id={hintId} className="text-xs text-[var(--color-text-muted)]">{hint}</span>}
    </label>
  );
}
