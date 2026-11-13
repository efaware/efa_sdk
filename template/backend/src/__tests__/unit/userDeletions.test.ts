import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import { deleteUserData } from '../../userDeletions';

describe('deleteUserData', () => {
  beforeEach(() => query.mockReset());

  it('löscht app_users der übergebenen Converge-IDs mit je einem Platzhalter', async () => {
    await deleteUserData(['a', 'b', 'c']);
    expect(query).toHaveBeenCalledWith('DELETE FROM app_users WHERE converge_id IN ($1, $2, $3)', ['a', 'b', 'c']);
  });

  it('macht ohne IDs nichts', async () => {
    await deleteUserData([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('reicht Fehler weiter, damit das SDK dieselbe Seite erneut liefert', async () => {
    query.mockRejectedValueOnce(new Error('db down'));
    await expect(deleteUserData(['a'])).rejects.toThrow('db down');
  });
});
