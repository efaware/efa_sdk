import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, waitFor } from '@testing-library/react';

/**
 * Sprechende URLs: App.tsx läuft im HashRouter und meldet jede innere Route per
 * notifyRouteChange an den Kernel (der sie als #/app/<serviceKey>/<pfad> führt).
 */

// Build-Konstante aus vite.config.ts (im Test nicht gesetzt).
vi.stubGlobal('__APP_VERSION__', 'test');

const notifyRouteChange = vi.fn();

vi.mock('@efa-one/sdk/frontend/ipc', async (orig) => ({
  ...(await orig<typeof import('@efa-one/sdk/frontend/ipc')>()),
  notifyRouteChange: (path: string) => notifyRouteChange(path),
}));

// Auth nicht fertig: die App zeigt nur den Spinner, die Effekte laufen trotzdem.
vi.mock('../hooks/useConvergeAuth', () => ({
  useConvergeAuth: () => ({ user: null, isReady: false, error: null }),
}));

beforeEach(() => { notifyRouteChange.mockReset(); });
afterEach(() => { cleanup(); window.location.hash = ''; });

describe('App – Routenmeldung an den Kernel', () => {
  it('meldet den Pfad aus dem Hash (HashRouter)', async () => {
    window.location.hash = '#/vertrag/V-2026-0042/';
    const { default: App } = await import('../App');
    render(<App />);
    await waitFor(() => expect(notifyRouteChange).toHaveBeenCalledWith('/vertrag/V-2026-0042/'));
  });
});
