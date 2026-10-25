let loading: Promise<void> | null = null;

export function loadYouTubeAPI(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      loading = null;
      reject(new Error('youtube-api'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export function waitForPlaylist(player: YT.Player, timeoutMs = 12000): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      try {
        const list = player.getPlaylist();
        if (list && list.length) {
          resolve(list);
          return;
        }
      } catch {
        /* player still settling */
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error('playlist-timeout'));
        return;
      }
      window.setTimeout(tick, 250);
    };
    tick();
  });
}

export async function readPlaylistIds(playlistId: string): Promise<string[]> {
  await loadYouTubeAPI();
  const wrap = document.createElement('div');
  wrap.className = 'offscreen';
  const host = document.createElement('div');
  wrap.appendChild(host);
  document.body.appendChild(wrap);
  let player: YT.Player | null = null;
  try {
    player = await new Promise<YT.Player>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('playlist-timeout')), 12000);
      const created = new YT.Player(host, {
        width: 320,
        height: 180,
        playerVars: {
          listType: 'playlist',
          list: playlistId,
          autoplay: 0,
          controls: 0,
          mute: 1,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            window.clearTimeout(timeout);
            try {
              event.target.mute();
            } catch {
              /* already quiet */
            }
            try {
              event.target.cuePlaylist({ list: playlistId, listType: 'playlist', index: 0 });
            } catch {
              /* listType in playerVars is enough on some clients */
            }
            resolve(event.target);
          },
          onError: () => {
            window.clearTimeout(timeout);
            reject(new Error('playlist-error'));
          },
        },
      });
      player = created;
    });
    return await waitForPlaylist(player);
  } finally {
    try {
      player?.destroy();
    } catch {
      /* already gone */
    }
    wrap.remove();
  }
}
