import React from 'react';

/**
 * SettingsPage – admin-only placeholder for app-specific settings.
 *
 * Only reachable for platform admins — permission `efa-all` (legacy `converge-admin`
 * until Q1-2027) — enforced in App.tsx routing.
 * Add your app-specific settings here.
 */
export default function SettingsPage() {
  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] mb-6">Settings</h1>

      <section>
        <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-1">
          App settings
        </h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Add your app-specific settings here.
        </p>
      </section>
    </div>
  );
}
