import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useConvergeAuth } from '../../hooks/useConvergeAuth';
import { DEV_THEME } from '../../types';
import type { ConvergeTheme } from '../../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-1',
  convergeId: 'converge-1',
  email: 'test@example.com',
  name: 'Test',
  createdAt: '2026-01-01',
  lastSeenAt: null,
};

const mockPermissions = ['myapp.default', 'efa-all'];

function mockExchangeAndPermissions() {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ user: mockUser }),
  });
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ keys: mockPermissions }),
  });
}

const mockTheme: ConvergeTheme = {
  id: 'test-light',
  mode: 'light',
  colors: {
    primary: '#6366f1',
    primaryHover: '#4f46e5',
    secondary: '#a5b4fc',
    background: '#f8fafc',
    surface: '#ffffff',
    surfaceRaised: '#f1f5f9',
    border: '#e2e8f0',
    textPrimary: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#94a3b8',
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
  },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Embedded mode ──────────────────────────────────────���───────────────────

describe('useConvergeAuth (embedded mode)', () => {
  beforeEach(() => {
    // Simulate being in an iframe
    vi.stubGlobal('self', { name: 'iframe' });
    // window.self !== window.top means embedded
    Object.defineProperty(window, 'self', { value: { name: 'iframe' }, writable: true, configurable: true });
    Object.defineProperty(window, 'top', { value: { name: 'parent' }, writable: true, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(window, 'self', { value: window, writable: true, configurable: true });
    Object.defineProperty(window, 'top', { value: window, writable: true, configurable: true });
  });

  it('starts with isReady=false and waits for postMessage', () => {
    const { result } = renderHook(() => useConvergeAuth());

    expect(result.current.isReady).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('exchanges token on CONVERGE_AUTH message', async () => {
    mockExchangeAndPermissions();

    const { result } = renderHook(() => useConvergeAuth());

    // Simulate Converge sending auth message
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: window.parent,
          data: {
            type: 'CONVERGE_AUTH',
            token: 'test-jwt',
            theme: mockTheme,
            serviceKey: 'myapp',
          },
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.user).toEqual({ ...mockUser, permissions: mockPermissions });
    expect(result.current.theme).toEqual(mockTheme);
    expect(result.current.error).toBeNull();

    expect(fetchMock).toHaveBeenCalledWith('/apps/myapp/api/auth/exchange', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
    }));
    expect(fetchMock).toHaveBeenCalledWith('/apps/myapp/api/auth/permissions', expect.objectContaining({
      credentials: 'include',
    }));
  });

  it('deduplicates multiple CONVERGE_AUTH messages (kernel sends 3x)', async () => {
    mockExchangeAndPermissions();

    const { result } = renderHook(() => useConvergeAuth());

    // Simulate 3 messages (kernel retry pattern: 0ms, 250ms, 800ms)
    act(() => {
      for (let i = 0; i < 3; i++) {
        window.dispatchEvent(
          new MessageEvent('message', {
            source: window.parent,
            data: { type: 'CONVERGE_AUTH', token: 'test-jwt', theme: mockTheme, serviceKey: 'myapp' },
          }),
        );
      }
    });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    // exchangeToken should only have been called once (exchange + permissions = 2 fetches total)
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sets error state when exchange fails', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid token' }),
    });

    const { result } = renderHook(() => useConvergeAuth());

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: window.parent,
          data: { type: 'CONVERGE_AUTH', token: 'bad-jwt', serviceKey: 'myapp' },
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.error).toContain('Invalid token');
  });

  it('ignores CONVERGE_AUTH from a non-parent source (foreign frame / opener)', async () => {
    const { result } = renderHook(() => useConvergeAuth());

    // Ein fremder Absender (Sibling-iframe / window.opener) → MessagePort als
    // Source, der garantiert !== window.parent ist. Der Guard muss das verwerfen.
    const { port1 } = new MessageChannel();
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: port1,
          data: { type: 'CONVERGE_AUTH', token: 'attacker-jwt', theme: mockTheme, serviceKey: 'myapp' },
        }),
      );
    });

    expect(result.current.isReady).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores CONVERGE_AUTH with a malformed serviceKey', async () => {
    const { result } = renderHook(() => useConvergeAuth());

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: window.parent,
          data: { type: 'CONVERGE_AUTH', token: 'jwt', theme: mockTheme, serviceKey: '../evil' },
        }),
      );
    });

    expect(result.current.isReady).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores non-CONVERGE_AUTH messages', async () => {
    const { result } = renderHook(() => useConvergeAuth());

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'SOME_OTHER_MESSAGE' },
        }),
      );
    });

    // Should still not be ready (no auth processed)
    expect(result.current.isReady).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('applies theme colors as CSS custom properties', async () => {
    mockExchangeAndPermissions();

    renderHook(() => useConvergeAuth());

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: window.parent,
          data: { type: 'CONVERGE_AUTH', token: 'jwt', theme: mockTheme, serviceKey: 'myapp' },
        }),
      );
    });

    await waitFor(() => {
      const root = document.documentElement;
      expect(root.style.getPropertyValue('--color-primary')).toBe('#6366f1');
      expect(root.style.getPropertyValue('--color-background')).toBe('#f8fafc');
    });
  });
});

// ─── Dev mode (not embedded) ────────────────────────────────────────────────

describe('useConvergeAuth (dev mode)', () => {
  it('probes /dev/token and authenticates on success', async () => {
    // First call: /dev/token
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: 'dev-jwt' }),
    });
    // Second call: exchange
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: mockUser }),
    });
    // Third call: permissions
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ keys: mockPermissions }),
    });

    const { result } = renderHook(() => useConvergeAuth());

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.user).toEqual({ ...mockUser, permissions: mockPermissions });
    // Uses DEV_THEME as fallback (no theme from postMessage)
    expect(result.current.theme).toEqual(DEV_THEME);

    // /dev/token was called
    expect(fetchMock).toHaveBeenCalledWith('/dev/token');
    // exchange with empty apiBase
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/exchange', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('sets error when /dev/token returns 404 (production mode)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const { result } = renderHook(() => useConvergeAuth());

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.error).toContain('Not running in Converge or dev mode');
  });
});
