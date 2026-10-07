import express from 'express';
import cors, { CorsOptions } from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { pool } from './db';
import { initDb } from './db/init';
import { seedDefaults } from './db/seed';
import authRouter from './routes/auth';
import healthRouter from './routes/health';
import openapiRouter from './routes/openapi';
import { registerPermissions } from '@efa-one/sdk/backend/permissions';
import { registerApiMetadata } from '@efa-one/sdk/backend/apiRegistry';

// ─── Structured logging ───────────────────────────────────────────────────────

function log(level: string, msg: string, extra?: Record<string, unknown>): void {
  console.log(JSON.stringify({ level, msg, timestamp: new Date().toISOString(), ...extra }));
}

// ─── App setup ────────────────────────────────────────────────────────────────

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const SERVICE_KEY = process.env.SERVICE_KEY ?? 'template_app';

// CORS: Allowlist über CORS_ORIGINS (kommasepariert). Fallback prod-sicher
// (Finding #7): Produktion ohne CORS_ORIGINS erlaubt keine Cross-Origin-Credentials
// (sonst spiegelt cors jede Origin mit credentials:true zurück). Dev spiegelt weiter.
const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean);
let corsOrigin: CorsOptions['origin'];
if (corsOrigins && corsOrigins.length > 0) {
  corsOrigin = (origin, callback) => {
    if (!origin || corsOrigins.includes(origin)) callback(null, true);
    else callback(new Error('CORS-Origin nicht erlaubt'));
  };
} else if (process.env.NODE_ENV === 'production') {
  console.warn(JSON.stringify({ level: 'warn', msg: 'CORS_ORIGINS nicht gesetzt — Cross-Origin-Credentials in Produktion deaktiviert.' }));
  corsOrigin = false;
} else {
  // Dev ohne CORS_ORIGINS: NUR lokale Entwicklungs-Origins spiegeln. `origin: true`
  // würde jede beliebige Origin mit `credentials: true` zurückspiegeln — für einen
  // Browser-Angreifer ein Freifahrtschein auf die App-Session. Wer in Dev eine andere
  // Origin braucht (LAN-IP, Codespace), setzt CORS_ORIGINS explizit.
  corsOrigin = [/^https?:\/\/localhost(:\d+)?$/, /^https?:\/\/127\.0\.0\.1(:\d+)?$/];
}
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/health', healthRouter);
app.use('/api/openapi.json', openapiRouter);
app.use('/api/auth', authRouter);

// Dev routes – only active when ENVIRONMENT is not 'production'
if (process.env.ENVIRONMENT !== 'production') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const devRouter = require('./routes/dev').default;
  app.use('/dev', devRouter);
  log('warn', 'Dev routes enabled – do not use in production');
}

// ─── Static SPA (Single-Container-Stack) ───────────────────────────────────────
// Im Standard-Stack (3 Container) bedient der Frontend-nginx die SPA — dieser
// Block bleibt dann inaktiv (SERVE_STATIC ungesetzt). Im Single-Container-Stack
// liefert dieses Backend das gebaute Frontend selbst aus (eine Origin für SPA +
// API + /health), damit das Gateway /apps/{serviceKey}/ direkt hierher routen kann.
if (process.env.SERVE_STATIC === 'true') {
  const staticDir = process.env.STATIC_DIR ?? path.join(__dirname, '../../../public');
  const indexHtml = path.join(staticDir, 'index.html');

  app.use(
    express.static(staticDir, {
      index: false, // index.html liefern wir per Fallback (mit no-cache)
      setHeaders: (res, filePath) => {
        // Gehashte Vite-Assets sind unveränderlich; index.html nie cachen.
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );

  // SPA-Fallback: alle GETs außer API/Health/Dev liefern index.html.
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (
      req.path.startsWith('/api') ||
      req.path === '/health' ||
      req.path.startsWith('/health/') ||
      req.path.startsWith('/dev')
    ) {
      return next();
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(indexHtml);
  });

  log('info', 'Static SPA serving enabled', { staticDir });
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

process.on('SIGTERM', async () => {
  log('info', 'SIGTERM received, shutting down gracefully');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  log('info', 'SIGINT received, shutting down gracefully');
  await pool.end();
  process.exit(0);
});

// ─── Start ────────────────────────────────────────────────────────────────────

async function startServer(): Promise<void> {
  try {
    await initDb();
    await seedDefaults();
    app.listen(PORT, async () => {
      log('info', `Server started`, { port: PORT, environment: process.env.ENVIRONMENT ?? 'development' });

      // ── Custom Permissions bei Converge registrieren ─────────────────────
      // Der Kernel legt automatisch nur .default an — jede weitere Permission
      // (auch ein .admin) muss hier gemeldet werden; nicht gemeldete Keys entfernt er.
      // Array leer lassen wenn die App keine feingranularen Permissions braucht.
      // INTAKE: docs/intake.md §1 — Liste muss synchron zu §1 + zu
      //   routes/openapi.ts:x-converge.default_permissions sein.
      await registerPermissions(SERVICE_KEY, [
        // { key: 'readonly',   displayName: 'Nur Lesen', level: 1 },
        // { key: 'can-export', displayName: 'Export',    level: 2 },
      ]);

      // ── API-Capabilities für MCP-Agent registrieren ──────────────────────
      // Jede Capability entspricht einem MCP-Tool. URL-Parameter in endpointPath
      // mit :name-Notation (z.B. '/api/items/:id') – muss auch im requestSchema als Property vorkommen.
      // INTAKE: docs/intake.md §7 — bei §7 = (a) den ganzen Block entfernen.
      await registerApiMetadata(SERVICE_KEY, {
        description: 'Kurzbeschreibung dieser App (1-2 Sätze, was die App tut).',
        capabilities: [
          // {
          //   capabilityKey: 'list_items',
          //   endpointPath: '/api/items',
          //   method: 'GET',
          //   description: 'Alle Items auflisten',
          //   tags: ['items', 'read'],
          // },
        ],
      });
    });
  } catch (err) {
    log('error', 'Failed to start server', { err: String(err) });
    process.exit(1);
  }
}

startServer();
