import React from 'react';

export interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical';
  /** Nur Optik (Default), sonst als Trenner vorgelesen. */
  decorative?: boolean;
  className?: string;
}

/** Trennlinie zwischen Abschnitten oder, senkrecht, zwischen Werkzeugen einer Leiste. */
export function Separator({ orientation = 'horizontal', decorative = true, className = '' }: SeparatorProps) {
  return (
    <div
      role={decorative ? 'none' : 'separator'}
      aria-orientation={decorative || orientation === 'horizontal' ? undefined : 'vertical'}
      className={`shrink-0 bg-[var(--color-border)] ${orientation === 'horizontal' ? 'h-px w-full' : 'w-px self-stretch'} ${className}`}
    />
  );
}

/** Taste oder Tastenkürzel in Hilfetexten, z. B. <Kbd>Strg</Kbd> + <Kbd>K</Kbd>. */
export function Kbd({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={`inline-flex items-center rounded-sm border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-text-secondary)] ${className}`}
    >
      {children}
    </kbd>
  );
}
