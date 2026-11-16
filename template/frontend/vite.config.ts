import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';

function getAppVersion(mode: string): string {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try {
    return execSync('git describe --tags --abbrev=0', { cwd: __dirname }).toString().trim();
  } catch {
    return mode === 'development' ? 'dev' : 'unknown';
  }
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react()],
  build: {
    // Lizenztexte + Copyright der gebündelten Pakete (MIT/BSD/Apache/EPL verlangen
    // sie bei der Weitergabe); landet in dist/ und damit im Frontend-Image.
    license: { fileName: 'THIRD-PARTY-NOTICES.md' },
  },
  define: {
    __APP_VERSION__: JSON.stringify(getAppVersion(mode)),
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/dev': 'http://localhost:3001',
    },
  },
}));
