import type { PlaylistSummary, SavedTrack } from './account-data';

export type AccountFailure = 'unauthorized' | 'unconfigured' | 'limit' | 'invalid' | 'not_found' | 'error';
export type AccountResult<T> = ({ ok: true } & T) | { ok: false; reason: AccountFailure };

async function call<T>(path: string, method: string, body?: unknown): Promise<AccountResult<T>> {
  try {
    const response = await fetch(path, {
      method,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await response.json().catch(() => null)) as ({ ok?: boolean; reason?: string } & T) | null;
    if (response.ok && data && data.ok === true) return data as { ok: true } & T;
    const reason = data?.reason;
    if (reason === 'unauthorized' || reason === 'unconfigured' || reason === 'limit' || reason === 'invalid' || reason === 'not_found') return { ok: false, reason };
    return { ok: false, reason: response.status === 401 ? 'unauthorized' : 'error' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export const accountKey = {
  get: () => call<{ key: string | null }>('/api/account/key', 'GET'),
  put: (key: string) => call<Record<string, never>>('/api/account/key', 'PUT', { key }),
  remove: () => call<Record<string, never>>('/api/account/key', 'DELETE'),
};

export const accountPlaylists = {
  list: () => call<{ playlists: PlaylistSummary[] }>('/api/account/playlists', 'GET'),
  create: (name: string, tracks: SavedTrack[]) => call<{ playlist: PlaylistSummary }>('/api/account/playlists', 'POST', { name, tracks }),
  read: (id: string) => call<{ playlist: PlaylistSummary; tracks: SavedTrack[] }>(`/api/account/playlists/${encodeURIComponent(id)}`, 'GET'),
  rename: (id: string, name: string) => call<Record<string, never>>(`/api/account/playlists/${encodeURIComponent(id)}`, 'PATCH', { name }),
  remove: (id: string) => call<Record<string, never>>(`/api/account/playlists/${encodeURIComponent(id)}`, 'DELETE'),
};
