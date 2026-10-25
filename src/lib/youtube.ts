import type { Track } from '../types';

const VIDEO_ID = /^[\w-]{11}$/;

export type ParsedYouTube = {
  videoId?: string;
  playlistId?: string;
};

export function thumbnailFor(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

export function trackFromId(videoId: string, title = videoId): Track {
  return { videoId, title, thumbnail: thumbnailFor(videoId) };
}

export function parseYouTubeUrl(input: string): ParsedYouTube | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (VIDEO_ID.test(trimmed)) return { videoId: trimmed };
  if (/^(PL|UU|OL|RD|FL)[\w-]+$/.test(trimmed)) return { playlistId: trimmed };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
  if (host !== 'youtube.com' && host !== 'youtu.be' && host !== 'youtube-nocookie.com') return null;

  const list = url.searchParams.get('list') || undefined;
  let videoId: string | undefined;
  if (host === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0];
  } else if (url.pathname === '/watch') {
    videoId = url.searchParams.get('v') || undefined;
  } else {
    const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/);
    if (match) videoId = match[1];
  }
  if (videoId && !VIDEO_ID.test(videoId)) videoId = undefined;
  const playlistId = list && /^[\w-]+$/.test(list) ? list : undefined;
  if (!videoId && !playlistId) return null;
  return { videoId, playlistId };
}

export function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!VIDEO_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export async function fetchOEmbed(videoId: string): Promise<{ title: string; thumbnail: string | null } | null> {
  if (!VIDEO_ID.test(videoId)) return null;
  try {
    const response = await fetch(`/api/oembed?v=${videoId}`);
    if (!response.ok) return null;
    const data = (await response.json()) as { ok?: boolean; title?: string; thumbnail_url?: string };
    if (!data.ok || !data.title) return null;
    return { title: data.title, thumbnail: data.thumbnail_url ?? null };
  } catch {
    return null;
  }
}

export async function enrichTracks(ids: string[], onUpdate: (videoId: string, title: string, thumbnail: string | null) => void) {
  const queue = [...ids];
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      const id = queue.shift();
      if (!id) return;
      const meta = await fetchOEmbed(id);
      if (meta) onUpdate(id, meta.title, meta.thumbnail);
    }
  });
  await Promise.all(workers);
}
