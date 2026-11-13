import React, { useEffect, useState } from 'react';

export type AvatarSize = 'sm' | 'md' | 'lg';

/**
 * Initialen aus einem Namen: „Eduard Dinges“ → „ED“, „Anna-Lena Graf“ → „AG“,
 * „admin“ → „A“, „max@firma.de“ → „M“.
 */
export function initialsOf(name: string | null | undefined): string {
  const base = (name ?? '').split('@')[0].trim();
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  if (parts.length === 1 || base.includes('@')) return first.toUpperCase();
  const last = base.includes(' ') ? base.split(/\s+/).filter(Boolean).slice(-1)[0][0] : parts[parts.length - 1][0];
  return `${first}${last}`.toUpperCase();
}

export interface AvatarProps {
  /** Name der Person; ergibt Initialen und den Text für Screenreader. */
  name: string;
  /** Bild-URL; fällt bei Ladefehler auf Initialen zurück. */
  src?: string | null;
  size?: AvatarSize;
  className?: string;
}

const SIZE: Record<AvatarSize, string> = { sm: 'w-6 h-6 text-[10px]', md: 'w-8 h-8 text-xs', lg: 'w-10 h-10 text-sm' };

/** Rundes Personenbild mit Initialen als Ersatz. */
export function Avatar({ name, src, size = 'md', className = '' }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const showImage = Boolean(src) && !failed;
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-surface-raised)] font-medium text-[var(--color-text-secondary)] select-none ${SIZE[size]} ${className}`}
    >
      {showImage ? (
        <img src={src as string} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{initialsOf(name)}</span>
      )}
    </span>
  );
}
