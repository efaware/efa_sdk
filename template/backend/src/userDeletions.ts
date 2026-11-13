import { pool } from './db';

/**
 * Daten gelöschter Benutzer entfernen (DSGVO Art. 17). `onUserDeleted` aus dem SDK
 * ruft das mit den Converge-User-UUIDs aus der Tombstone-Liste des Kernels auf:
 * beim Start alle der letzten 90 Tage, danach alle 10 min die neuen.
 *
 * Muss idempotent sein: dieselben IDs kommen nach jedem Neustart wieder. Wirft er,
 * liefert das SDK dieselbe Seite beim nächsten Lauf erneut; ein halber Durchlauf wird
 * so vervollständigt, eine Transaktion ist nicht nötig (und mit `pool.query('BEGIN')`
 * auch nicht möglich: bei PostgreSQL träfe es eine beliebige Pool-Verbindung).
 *
 * Beim Ausbau der App hier ergänzen, als eigene DELETEs VOR `app_users`:
 * persönliche Daten ohne FK auf `app_users` (Entwürfe, Verläufe, Ansichten).
 * Firmendaten, die die Person nur angelegt hat, bleiben: ihr `owner_id` wird per
 * `ON DELETE SET NULL` leer. Siehe CLAUDE.md → „Gelöschte Benutzer“.
 *
 * `IN ($1, $2, …)` statt `= ANY($1)`: läuft so in PostgreSQL und SQLite gleich.
 */
export async function deleteUserData(convergeIds: string[]): Promise<void> {
  if (convergeIds.length === 0) return;
  const placeholders = convergeIds.map((_, i) => `$${i + 1}`).join(', ');
  await pool.query(`DELETE FROM app_users WHERE converge_id IN (${placeholders})`, convergeIds);
}
