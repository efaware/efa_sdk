/**
 * permissionCheck.ts – Server-seitiger Permission-Check gegen converge_access
 * mit Audit-Logging für unbekannte Keys.
 *
 * Im Gegensatz zu permissionClient.ts (Bulk-Lookup aller Permission-Keys eines
 * Users) fragt diese Funktion gezielt eine einzelne Permission ab. Der Vorteil:
 * converge_access weiß, welcher Key geprüft wurde, und kann ihn auditieren
 * wenn er gar nicht in der Permissions-Datenbank existiert (Drift-Erkennung).
 *
 * Aufruf-Vertrag aus Sicht der App:
 *   - granted=true  → User hat die Permission
 *   - granted=false → User hat sie nicht ODER die Permission existiert
 *                     überhaupt nicht in converge_access. Aus Sicherheits-
 *                     gründen wird beides identisch behandelt; der User soll
 *                     nicht erkennen können, ob eine Permission falsch
 *                     konfiguriert oder absichtlich entzogen ist.
 *
 * Audit-Logging passiert serverseitig in converge_access — die rufende App
 * muss nichts weiter tun.
 *
 * Usage in middleware (optional, additiv zu permissionClient.ts):
 *   import { checkPermission } from '../../template-core/permissionCheck';
 *
 *   const granted = await checkPermission(req.user.convergeId, 'myapp.export');
 *   if (!granted) return res.status(403).json({ error: 'Forbidden' });
 *
 * Bestehende Apps können weiterhin getUserPermissions() aus permissionClient.ts
 * verwenden — das ist der schnellere Bulk-Pfad ohne Audit-Hook.
 */

import { serviceClient } from './serviceClient';
import { PERMISSION_LOOKUP_TIMEOUT_MS } from './permissionClient';

export async function checkPermission(
  convergeId: string,
  key: string,
  sourceApp?: string,
): Promise<boolean> {
  if (!convergeId) throw new Error('checkPermission: convergeId required');
  if (!key) throw new Error('checkPermission: key required');

  const { granted } = await serviceClient.call<{ granted: boolean }>(
    'converge_access',
    'POST',
    '/api/internal/check-permission',
    { convergeId, key, sourceApp: sourceApp ?? process.env.APP_NAME ?? null },
    { timeoutMs: PERMISSION_LOOKUP_TIMEOUT_MS },
  );
  return Boolean(granted);
}
