import { useEffect, useRef, useState } from 'react';
import type { Track } from '../types';
import { CUE_SLOTS, clearCue, emptyCues, setCue, type HotCues } from '../lib/cues';
import { formatTime } from '../lib/format';
import { loadCues, saveCues } from '../lib/idb';
import { loadYouTubeAPI } from '../lib/youtube-api';
import { Icon } from './icons';

type Props = {
  tracks: Track[];
  onAdd: (url: string) => void;
};

export function Pads({ tracks, onAdd }: Props) {
  const [url, setUrl] = useState('');
  const [videoId, setVideoId] = useState<string | null>(tracks[0]?.videoId ?? null);
  const [cues, setCues] = useState<HotCues>(emptyCues);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const created = useRef(false);
  const videoRef = useRef(videoId);
  const longPressRef = useRef(0);
  videoRef.current = videoId;

  useEffect(() => {
    if (!videoId && tracks[0]) setVideoId(tracks[0].videoId);
  }, [tracks, videoId]);

  useEffect(() => {
    if (!videoId) {
      setCues(emptyCues());
      return;
    }
    let cancel = false;
    void loadCues(videoId).then((next) => {
      if (!cancel) setCues(next);
    });
    return () => {
      cancel = true;
    };
  }, [videoId]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || created.current) return;
    created.current = true;
    const host = document.createElement('div');
    mount.appendChild(host);
    let dead = false;
    void loadYouTubeAPI()
      .then(() => {
        if (dead) return;
        const player = new YT.Player(host, {
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              playerRef.current = event.target;
              const id = videoRef.current;
              if (id) {
                try {
                  event.target.cueVideoById(id);
                } catch {
                  /* ignore */
                }
              }
            },
            onStateChange: (event) => setPlaying(event.data === 1),
          },
        });
        playerRef.current = player;
      })
      .catch(() => undefined);
    return () => {
      dead = true;
    };
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !videoId) return;
    try {
      if (player.getVideoData?.()?.video_id === videoId) return;
      player.cueVideoById(videoId);
      setPlaying(false);
      setTime(0);
    } catch {
      /* player still booting */
    }
  }, [videoId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      try {
        setTime(playerRef.current?.getCurrentTime() ?? 0);
      } catch {
        /* ignore */
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  function write(next: HotCues) {
    setCues(next);
    if (videoId) void saveCues(videoId, next);
  }

  const selected = tracks.find((track) => track.videoId === videoId) ?? null;

  return (
    <section className="pads" aria-label="Pads">
      <form
        className="stack pads-add"
        onSubmit={(event) => {
          event.preventDefault();
          const raw = url.trim();
          if (!raw) return;
          onAdd(raw);
          setUrl('');
        }}
      >
        <input
          type="url"
          value={url}
          placeholder="Enlace"
          aria-label="Enlace"
          onChange={(event) => setUrl(event.target.value)}
        />
        <button type="submit" className="icon-button" aria-label="Agregar" title="Agregar" disabled={!url.trim()}>
          <Icon name="plus" />
        </button>
      </form>
      <div className="pads-body">
        <ul className="list pads-list">
          {tracks.length === 0 ? <li className="hint">Cola vacía</li> : null}
          {tracks.map((track) => (
            <li key={track.videoId}>
              <button
                type="button"
                className={track.videoId === videoId ? 'track-name is-on' : 'track-name'}
                aria-pressed={track.videoId === videoId}
                onClick={() => setVideoId(track.videoId)}
              >
                {track.title || track.videoId}
              </button>
            </li>
          ))}
        </ul>
        <div className="pads-stage">
          <div className="video-frame pads-video" ref={mountRef} />
          <div className="pads-transport">
            <button
              type="button"
              className="icon-button"
              aria-label={playing ? 'Pausa' : 'Play'}
              title={playing ? 'Pausa' : 'Play'}
              disabled={!videoId}
              onClick={() => {
                try {
                  if (playing) playerRef.current?.pauseVideo();
                  else playerRef.current?.playVideo();
                } catch {
                  /* ignore */
                }
              }}
            >
              <Icon name={playing ? 'pause' : 'play'} />
            </button>
            <span className="time">{formatTime(time)}</span>
            <span className="deck-title" title={selected?.title}>
              {selected?.title ?? ''}
            </span>
          </div>
          <div className="cues" aria-label="Pads">
            {Array.from({ length: CUE_SLOTS }, (_, index) => {
              const cue = cues[index];
              const set = cue != null;
              const label = set ? `Pad ${index + 1} ${formatTime(cue)}` : `Pad ${index + 1}`;
              return (
                <button
                  key={index}
                  type="button"
                  className={set ? 'cue-pad is-set' : 'cue-pad'}
                  disabled={!videoId}
                  title={label}
                  aria-label={label}
                  onPointerDown={() => {
                    window.clearTimeout(longPressRef.current);
                    longPressRef.current = window.setTimeout(() => {
                      longPressRef.current = 0;
                      if (set) write(clearCue(cues, index));
                    }, 520);
                  }}
                  onPointerUp={() => window.clearTimeout(longPressRef.current)}
                  onPointerLeave={() => window.clearTimeout(longPressRef.current)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    if (set) write(clearCue(cues, index));
                  }}
                  onClick={() => {
                    if (longPressRef.current === 0) return;
                    window.clearTimeout(longPressRef.current);
                    if (!videoId) return;
                    if (set) {
                      try {
                        playerRef.current?.seekTo(cue, true);
                      } catch {
                        /* ignore */
                      }
                      return;
                    }
                    try {
                      write(setCue(cues, index, playerRef.current?.getCurrentTime() ?? time));
                    } catch {
                      write(setCue(cues, index, time));
                    }
                  }}
                >
                  {set ? formatTime(cue) : index + 1}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
