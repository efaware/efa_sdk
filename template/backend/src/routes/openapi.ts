import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /api/openapi.json
 *
 * Öffentlich erreichbarer OpenAPI-3-Vertrag dieser App. Wird vom Converge-Kernel
 * im Discovery-Flow konsumiert ("Neue Apps suchen"): aus dem x-converge-Block
 * werden Tile, Default-Permissions und App-Typ automatisch angelegt.
 *
 * Beim Erweitern der App: eigene Endpoints und Schemas unter `paths` ergänzen,
 * x-converge aktuell halten (service_key, displayName, suggestedIcon, default_permissions).
 */
router.get('/', (_req: Request, res: Response) => {
  const serviceKey = process.env.SERVICE_KEY ?? 'template_app';
  const appName = process.env.APP_NAME ?? 'Template App';

  res.json({
    openapi: '3.0.3',
    info: {
      title: appName,
      description: 'Kurzbeschreibung dieser App (1-2 Sätze, was die App tut).',
      version: '1.0.0',
    },
    'x-converge': {
      service_key: serviceKey,
      display_name: appName,
      suggested_icon: 'Package',
      default_app_type: 'internal',
      default_permissions: [
        // Rein informativ: der Kernel legt hieraus nichts an (automatisch nur .default),
        // angelegt wird über registerPermissions() in backend/src/index.ts.
        // Format: { key, displayName, level } – key ohne service-Prefix.
        // INTAKE: docs/intake.md §1 — synchron zu backend/src/index.ts:registerPermissions().
        // { key: 'readonly', displayName: 'Nur Lesen', level: 1 },
      ],
    },
    paths: {
      '/health': {
        get: {
          summary: 'Liveness-Check',
          responses: { '200': { description: 'App läuft' } },
        },
      },
      '/api/auth/exchange': {
        post: {
          summary: 'Converge JWT gegen app_session-Cookie tauschen',
          responses: {
            '200': { description: 'Session-Cookie gesetzt' },
            '401': { description: 'Ungültiger Token' },
          },
        },
      },
      // App-eigene Endpoints hier ergänzen.
    },
  });
});

export default router;
