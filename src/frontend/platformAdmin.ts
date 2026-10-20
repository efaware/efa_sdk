/**
 * platformAdmin.ts – die oberste Berechtigung der Plattform.
 *
 * Seit dem Q4-2026-Release (Kernel v1.1.0, efaware/efa_kernel#98) heißt sie
 * `efa-all` (vormals `converge-admin`). Wer sie hält, darf in jeder App alles.
 *
 * Übergang: Der Kernel liefert Apps über `/api/internal/users/:id/permissions`
 * bis Q1-2027 zusätzlich den Alt-Key `converge-admin`; ein Kernel vor #98 kennt
 * nur den Alt-Key. Deshalb gilt beides als Plattform-Admin. Apps prüfen nie
 * selbst auf einen der beiden Strings, sondern immer über `isPlatformAdmin()`.
 *
 * TODO(Q1-2027): `converge-admin` entfernen, wenn der Kernel-Alias fällt
 * (`LEGACY_ADMIN_PERMISSION_KEY` in efa_kernel `backend/src/access/efaAll.ts`).
 */

/** Permission-Key der obersten Berechtigung. */
export const PLATFORM_ADMIN_PERMISSION = 'efa-all';

/**
 * Alle Keys, die als Plattform-Admin zählen.
 * TODO(Q1-2027): `'converge-admin'` entfernen, wenn der Kernel-Alias fällt.
 */
export const PLATFORM_ADMIN_PERMISSIONS: readonly string[] = Object.freeze([
  PLATFORM_ADMIN_PERMISSION,
  'converge-admin',
]);

/** Ist dieser einzelne Key eine Plattform-Admin-Berechtigung? */
export function isPlatformAdminPermission(key: string): boolean {
  return PLATFORM_ADMIN_PERMISSIONS.includes(key);
}

/** Hält ein Benutzer mit diesen Permission-Keys die oberste Berechtigung? */
export function isPlatformAdmin(permissionKeys: readonly string[] | null | undefined): boolean {
  return !!permissionKeys && permissionKeys.some(isPlatformAdminPermission);
}
