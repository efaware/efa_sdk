/**
 * permissionClient.ts – Live-Lookup von User-Permissions beim converge_access-Service.
 *
 * Aufruf bei JEDEM Permission-Check (kein Cache). Permissions stehen nicht mehr
 * im JWT — der JWT trägt nur Identität (sub, name). Die effektiven Permission-Keys
 * werden pro Request beim converge_access-Service abgerufen.
 *
 * Warum kein Cache?
 *   Permission-Änderungen (Rolle entzogen, neue Permission vergeben) sollen
 *   sofort wirken — kein 8h-Lag durch JWT-Caching, kein TTL-Window. Der Trade-off
 *   ist die Latenz: jeder geschützte App-Request hat ≥ 1 Hop zu converge_access
 *   (das wiederum ggf. converge_zbv für Rollen-Lookup anfragt). Bei Listen-Views
 *   mit pro-Item-Permission-Check multipliziert sich das. Die akzeptable
 *   Latenz-Obergrenze ist im BACKLOG zu definieren — falls das Reporting eine
 *   spürbare P95-Verschlechterung zeigt, kann hier ein kurzer TTL-Cache
 *   (5–30 s, analog zu serviceDiscovery) nachgerüstet werden, ohne den
 *   architektonischen Vertrag zu brechen.
 *
 * Usage in middleware:
 *   import { getUserPermissions, isPlatformAdmin } from '@efa-one/sdk/backend';
 *
 *   const keys = await getUserPermissions(req.user.convergeId);
 *   if (!keys.includes('myapp.admin') && !isPlatformAdmin(keys)) {
 *     return res.status(403).json({ error: 'Forbidden' });
 *   }
 *
 * Nie direkt auf `'efa-all'`/`'converge-admin'` vergleichen — `isPlatformAdmin()`
 * kennt beide Keys des Übergangs (bis Q1-2027).
 *
 * Fehlerverhalten: wirft bei Netzwerkfehler / non-2xx — Aufrufer reagieren fail-closed.
 * Konsequenz: converge_access-Ausfall sperrt jeden permission-geprüften Request
 * in jeder App. Das ist gewollt (sicher), aber macht converge_access zum
 * Single-Point-of-Failure für die gesamte Plattform-Berechtigung.
 */

import { serviceClient } from './serviceClient';

/**
 * Liefert alle effektiven Permission-Keys eines Users.
 *
 * @param convergeId  Die Converge-User-UUID (sub aus dem JWT)
 * @returns Array von Permission-Keys (z.B. ["myapp.default", "efa-all"]; ein
 *          Kernel ab efa_kernel#98 liefert bis Q1-2027 zusätzlich "converge-admin")
 * @throws Error wenn der Lookup fehlschlägt
 */
export async function getUserPermissions(convergeId: string): Promise<string[]> {
  if (!convergeId) {
    throw new Error('getUserPermissions: convergeId required');
  }
  const { keys } = await serviceClient.call<{ keys: string[] }>(
    'converge_access',
    'GET',
    `/api/internal/users/${encodeURIComponent(convergeId)}/permissions`,
  );
  return keys ?? [];
}
