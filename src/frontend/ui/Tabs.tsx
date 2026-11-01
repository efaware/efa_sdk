import React, { useEffect, useRef } from 'react';

export interface TabItem<K extends string = string> {
  key: K;
  label: string;
  icon?: React.ElementType;
  badge?: number | string;
  /** `danger` für Fehlerzahlen, sonst neutral. */
  badgeTone?: 'danger' | 'neutral';
  disabled?: boolean;
}

export interface TabsProps<K extends string = string> {
  items: TabItem<K>[];
  value: K;
  onChange(key: K): void;
  /** Name der Reiterleiste für Screenreader, z. B. „Silo“. */
  ariaLabel: string;
  /** Vorgabe: aus `ariaLabel`. */
  idPrefix?: string;
  className?: string;
}

export function tabId(prefix: string, key: string): string {
  return `${prefix}-tab-${key}`;
}
export function tabPanelId(prefix: string, key: string): string {
  return `${prefix}-panel-${key}`;
}

/** ID-Präfix aus dem Anzeigenamen. */
export function tabIdPrefix(ariaLabel: string): string {
  const slug = ariaLabel.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `efa-tabs-${slug || 'x'}`;
}

/** Nächster Reiter für Pfeil/Pos1/Ende, gesperrte übersprungen; sonst `null`. */
export function nextTabKey<K extends string>(items: TabItem<K>[], current: K, key: string): K | null {
  const enabled = items.filter((t) => !t.disabled);
  if (enabled.length === 0) return null;
  if (key === 'Home') return enabled[0].key;
  if (key === 'End') return enabled[enabled.length - 1].key;
  if (key !== 'ArrowRight' && key !== 'ArrowLeft') return null;
  const idx = enabled.findIndex((t) => t.key === current);
  const step = key === 'ArrowRight' ? 1 : -1;
  const start = idx === -1 ? (step === 1 ? -1 : 0) : idx;
  return enabled[(start + step + enabled.length) % enabled.length].key;
}

/** Reiterleiste für Detailseiten; Pfeiltasten wechseln, Inhalt über `TabPanel`. */
export function Tabs<K extends string>({ items, value, onChange, ariaLabel, idPrefix, className = '' }: TabsProps<K>) {
  const prefix = idPrefix ?? tabIdPrefix(ariaLabel);
  const refs = useRef<Partial<Record<string, HTMLButtonElement | null>>>({});

  // Nur beim Wechsel, nicht beim ersten Rendern: sonst scrollt die Seite zur Leiste.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    refs.current[value]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [value]);

  function onKeyDown(e: React.KeyboardEvent) {
    const next = nextTabKey(items, value, e.key);
    if (next === null) return;
    e.preventDefault();
    onChange(next);
    refs.current[next]?.focus();
  }

  return (
    <div className={`relative border-b border-[var(--color-border)] ${className}`} data-efa-tabs={prefix}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((t) => {
          const Icon = t.icon;
          const active = t.key === value;
          return (
            <button
              key={t.key}
              ref={(el) => { refs.current[t.key] = el; }}
              type="button"
              role="tab"
              id={tabId(prefix, t.key)}
              aria-selected={active}
              aria-controls={tabPanelId(prefix, t.key)}
              tabIndex={active ? 0 : -1}
              disabled={t.disabled}
              data-efa-tab={t.key}
              onClick={() => onChange(t.key)}
              className={`shrink-0 whitespace-nowrap flex items-center gap-2 px-3 py-2.5 text-sm border-b-2 -mb-px transition-colors disabled:opacity-50 ${
                active
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)] font-medium'
                  : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {Icon && <Icon className="w-4 h-4 shrink-0" aria-hidden />}
              {t.label}
              {t.badge !== undefined && t.badge !== null && t.badge !== '' && (
                <span
                  className={`text-[10px] leading-none px-1.5 py-0.5 rounded-full ${
                    t.badgeTone === 'danger'
                      ? 'bg-[var(--color-danger)] text-white'
                      : 'bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)]'
                  }`}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {/* Fade-Kante: zeigt mobil, dass rechts noch Reiter liegen. */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 sm:hidden"
        style={{ background: 'linear-gradient(to right, transparent, var(--color-background))' }}
      />
    </div>
  );
}

export interface TabPanelProps {
  /** Schlüssel dieses Panels und aktiver Reiter. */
  tabKey: string;
  value: string;
  /** Wie bei `Tabs` (`tabIdPrefix(ariaLabel)`). */
  idPrefix: string;
  /** Inaktiv nur ausblenden statt entfernen. */
  keepMounted?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function TabPanel({ tabKey, value, idPrefix, keepMounted = false, children, className = '' }: TabPanelProps) {
  const active = tabKey === value;
  if (!active && !keepMounted) return null;
  return (
    <div
      role="tabpanel"
      id={tabPanelId(idPrefix, tabKey)}
      aria-labelledby={tabId(idPrefix, tabKey)}
      hidden={!active}
      tabIndex={0}
      className={className}
    >
      {children}
    </div>
  );
}
