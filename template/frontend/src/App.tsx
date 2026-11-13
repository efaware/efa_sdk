import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { sendAtStart, registerAppInfo, getParentOrigin, isFromPlatformParent, notifyRouteChange } from '@efa-one/sdk/frontend/ipc';
import { useConvergeAuth } from './hooks/useConvergeAuth';
import DevHeader from '@efa-one/sdk/frontend/DevHeader';
import MainPage from './pages/MainPage';
import SettingsPage from './pages/SettingsPage';
import WidgetPage from './pages/WidgetPage';
import { TooltipProvider, ToastProvider } from '@efa-one/sdk/frontend/ui';
import { isPlatformAdmin } from '@efa-one/sdk/frontend/platformAdmin';

// ─── Inner app (inside HashRouter, so useNavigate works) ─────────────────────

function InnerApp() {
  const { user, isReady, error } = useConvergeAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isEmbedded = window.self !== window.top;

  // Declare app identity (name + build version) to Converge so the kernel help icon
  // can display it. registerAppInfo re-declares on every CONVERGE_AUTH, tagged with the
  // serviceKey the kernel sends, so the header always shows the currently framed app —
  // never a previously opened one. Replace `appName` with THIS app's name (it is the
  // help-icon identity); `__APP_VERSION__` comes from the APP_VERSION Docker build arg
  // (GHCR tag) via vite.config.ts. registerAppInfo returns an unsubscribe for cleanup.
  useEffect(() => registerAppInfo({ appName: 'Template App', version: __APP_VERSION__ }), []);

  // Speaking URLs (mandatory, see CLAUDE.md → „Sprechende URLs"): report every inner
  // route to the kernel. It shows it as `#/app/<serviceKey>/<path>` in its address bar
  // (shareable, bookmarkable, survives F5) and opens the app right there when someone
  // follows the link. HashRouter is required for that: the kernel hands the inner path
  // to the iframe as a hash (`/apps/<serviceKey>/#/<path>`).
  useEffect(() => { notifyRouteChange(location.pathname); }, [location.pathname]);

  // Declare to Converge that this app has a settings page.
  // Only sent once auth is ready and the user is a platform admin — non-admins
  // should never see the settings gear icon in the Converge header.
  // Platform admin = permission `efa-all` (kernel v1.1.0+); until Q1-2027 the kernel
  // also sends the legacy key `converge-admin`. `isPlatformAdmin` accepts both, never
  // compare against the strings yourself.
  const isAdmin = isPlatformAdmin(user?.permissions);
  useEffect(() => {
    if (isAdmin) {
      window.parent.postMessage({ type: 'CONVERGE_DECLARE_SETTINGS' }, getParentOrigin());
    }
  }, [isAdmin]);

  // Handle navigation commands from Converge.
  // CONVERGE_GO_BACK: if already at root, send CONVERGE_AT_START so Converge
  // closes the embedded view and returns to the dashboard. Otherwise navigate
  // back to root within the app (next press will then trigger AT_START).
  useEffect(() => {
    const handler = (event: MessageEvent): void => {
      if (!isFromPlatformParent(event)) return;
      if (event.data?.type === 'CONVERGE_GO_BACK') {
        if (location.pathname === '/') {
          sendAtStart();
        } else {
          navigate('/');
        }
      } else if (event.data?.type === 'CONVERGE_OPEN_SETTINGS') {
        navigate('/settings');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [navigate, location.pathname]);

  if (!isReady) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--color-primary)] border-t-transparent" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-[var(--color-danger)] font-medium">Authentication failed</p>
          <p className="text-[var(--color-text-muted)] text-sm mt-1">{error ?? 'No user session'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {!isEmbedded && (
        <DevHeader
          appName="My App"
          onBack={() => navigate('/')}
          onSettings={() => navigate('/settings')}
        />
      )}
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<MainPage user={user} />} />
          <Route
            path="/settings"
            element={
              isAdmin
                ? <SettingsPage />
                : <Navigate to="/" replace />
            }
          />
          <Route path="/widget" element={<WidgetPage user={user} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

// ─── Root app ─────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <TooltipProvider>
      {/* Short confirmations after an action: `const { toast } = useToast(); toast('Gespeichert');` */}
      <ToastProvider>
        <HashRouter>
          <InnerApp />
        </HashRouter>
      </ToastProvider>
    </TooltipProvider>
  );
}
