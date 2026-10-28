import { youtubePlaylistUrl } from './queue-export';

export const YT_ITEM_BATCH = 5;

export type YoutubeFailure = 'consent' | 'quota' | 'forbidden' | 'auth' | 'upstream';

export type SaveQueueResult = {
  ok: boolean;
  reason?: YoutubeFailure | 'empty';
  playlistId?: string;
  url?: string;
  added: number;
  total: number;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function reasonsOf(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return [];
  const row = error as { message?: unknown; status?: unknown; errors?: unknown };
  const reasons: string[] = [];
  if (typeof row.status === 'string') reasons.push(row.status);
  if (typeof row.message === 'string') reasons.push(row.message);
  if (Array.isArray(row.errors)) {
    for (const item of row.errors) {
      if (item && typeof item === 'object' && typeof (item as { reason?: unknown }).reason === 'string') {
        reasons.push((item as { reason: string }).reason);
      }
    }
  }
  return reasons;
}

/** Map a YouTube Data API error to a reason. Never returns the raw body. */
export function classifyYouTubeError(status: number, body: unknown): YoutubeFailure | 'skip' {
  const reasons = reasonsOf(body).join(' ');
  if (/quotaExceeded|dailyLimitExceeded|rateLimitExceeded|userRateLimitExceeded/i.test(reasons)) return 'quota';
  if (/accessNotConfigured|SERVICE_DISABLED|youtubeSignupRequired/i.test(reasons)) return 'forbidden';
  if (status === 401) return 'auth';
  if (status === 403 && /insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient authentication scopes/i.test(reasons)) return 'consent';
  if (status === 403) return 'forbidden';
  if (status === 400 || status === 404) return 'skip';
  return 'upstream';
}

export async function createYouTubePlaylist(
  fetchImpl: FetchLike,
  token: string,
  title: string,
): Promise<{ ok: true; playlistId: string; url: string } | { ok: false; reason: YoutubeFailure }> {
  const response = await fetchImpl('https://www.googleapis.com/youtube/v3/playlists?part=snippet,status', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      snippet: { title },
      status: { privacyStatus: 'private' },
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const reason = classifyYouTubeError(response.status, body);
    return { ok: false, reason: reason === 'skip' ? 'upstream' : reason };
  }
  const id = body && typeof body === 'object' && typeof (body as { id?: unknown }).id === 'string' ? (body as { id: string }).id : '';
  if (!/^[\w-]{8,80}$/.test(id)) return { ok: false, reason: 'upstream' };
  return { ok: true, playlistId: id, url: youtubePlaylistUrl(id) };
}

export async function addYouTubePlaylistItems(
  fetchImpl: FetchLike,
  token: string,
  playlistId: string,
  videoIds: string[],
): Promise<{ added: number; stopped?: YoutubeFailure }> {
  let added = 0;
  for (const videoId of videoIds) {
    const response = await fetchImpl('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        snippet: {
          playlistId,
          resourceId: { kind: 'youtube#video', videoId },
        },
      }),
    });
    if (response.ok) {
      added += 1;
      continue;
    }
    const body = await response.json().catch(() => null);
    const reason = classifyYouTubeError(response.status, body);
    if (reason === 'skip') continue;
    return { added, stopped: reason };
  }
  return { added };
}

type ApiResult = {
  ok?: boolean;
  reason?: string;
  granted?: boolean;
  playlistId?: string;
  url?: string;
  added?: number;
};

async function readJson(response: Response): Promise<ApiResult | null> {
  const data = (await response.json().catch(() => null)) as ApiResult | null;
  return data && typeof data === 'object' ? data : null;
}

export async function youtubeScopeGranted(fetchImpl: FetchLike = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl('/api/youtube/playlist', { cache: 'no-store' });
    const data = await readJson(response);
    return Boolean(response.ok && data?.ok && data.granted);
  } catch {
    return false;
  }
}

/** Create the playlist, then insert tracks in small batches. Keeps a partial playlist. */
export async function saveQueueToYouTube(
  input: {
    title: string;
    videoIds: string[];
    fetchImpl?: FetchLike;
    onProgress?: (done: number, total: number) => void;
    batchSize?: number;
  },
): Promise<SaveQueueResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const total = input.videoIds.length;
  if (!total) return { ok: false, reason: 'empty', added: 0, total: 0 };
  const createdResponse = await fetchImpl('/api/youtube/playlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'create', title: input.title }),
  });
  const created = await readJson(createdResponse);
  if (!createdResponse.ok || !created?.ok || !created.playlistId) {
    return { ok: false, reason: (created?.reason as YoutubeFailure) || 'upstream', added: 0, total };
  }
  const playlistId = created.playlistId;
  const url = created.url || youtubePlaylistUrl(playlistId);
  let added = 0;
  const batchSize = input.batchSize ?? YT_ITEM_BATCH;
  for (let index = 0; index < input.videoIds.length; index += batchSize) {
    const videoIds = input.videoIds.slice(index, index + batchSize);
    const response = await fetchImpl('/api/youtube/playlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'items', playlistId, videoIds }),
    });
    const page = await readJson(response);
    const batchAdded = typeof page?.added === 'number' ? page.added : 0;
    added += batchAdded;
    input.onProgress?.(added, total);
    if (!response.ok || !page?.ok) {
      return { ok: false, reason: (page?.reason as YoutubeFailure) || 'upstream', playlistId, url, added, total };
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return { ok: true, playlistId, url, added, total };
}
