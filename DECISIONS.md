# DJTube — build decision

Spanish summary: no reutilicé un mixer entero. Los repos públicos o no son MIT, o son PHP/JS suelto y viejo, o no encajan con Vite + React + Worker. La app se construye desde cero y sí usa `wavesurfer.js` (regiones). No captura ni guarda audio de YouTube.

## Repos looked at

Searched GitHub for `youtube dj mixer`, `youtube crossfader`, and nearby names (about 10 minutes, 25 Oct 2026).

| Repo | License | Shape | Why it was not the base |
| --- | --- | --- | --- |
| [rafabez/youtube-mixer](https://github.com/rafabez/youtube-mixer) | MIT | ~256 KB, vanilla JS + PHP (`api/`, Apache) | Small and MIT, but it is a PHP host with a single `script.js`. No waveform, highlights, tab-audio BPM, or Worker. Fitting it to this stack would be a rewrite. |
| [buse974/reddeck](https://github.com/buse974/reddeck) | MIT | Larger vanilla app, v3.42, Last.fm, suggestions | Not small. Different architecture. Extra surface we would have to delete. |
| [YuriNuresi/youtube-dj-mixer](https://github.com/YuriNuresi/youtube-dj-mixer) | MIT | PHP + `mixer.js` | Same mismatch as youtube-mixer. |
| [iynere/crossfad.er](https://github.com/iynere/crossfad.er) | none | Create React App, stale | No license, so it is not reusable. |
| [john32b/youtubeMixer](https://github.com/john32b/youtubeMixer) | MIT | 2015 full-page crossfade | Not a two-deck DJ desk. |
| [TheBooleanJulian/deckmate](https://github.com/TheBooleanJulian/deckmate) | AGPL-3.0 | Two-deck YouTube DJ | Not an MIT-like license. |
| [esschillinger/daw-web](https://github.com/esschillinger/daw-web) | MIT | wavesurfer multi-track DAW | Not YouTube, not two decks. |

None of them are a clean, small, permissively licensed two-deck app we could drop onto a Cloudflare Worker. **Built from scratch.**

## Libraries we do use

- **wavesurfer.js 7** (BSD-3-Clause) and its **Regions** plugin. The YouTube IFrame does not expose audio, so WaveSurfer does not play the track. It can draw a beat grid and drag-select a highlight. It does not load a media URL and it does not receive captured YouTube audio.

## YouTube audio is not captured (28 Oct 2026)

The [YouTube API Services](https://developers.google.com/youtube/terms/api-services-terms-of-service) policies do not allow separating, storing, or downloading YouTube audio or video, and they do not allow a client that lets people download it. DJTube dropped every path that did that:

- `/sync` tab capture (`getDisplayMedia`, `sync-capture`, `sync-run`, `sync-queue`, `analysis-sync`)
- recording (`record.ts`, `MediaRecorder`) and clip download (`.webm`, `clip.ts`)
- audio blobs in IndexedDB (the `audio` store, and the `analyses` store that held peaks from that capture)
- the Worker writer for that analysis (`worker/analysis-db.ts`)

The D1 table `track_analysis` is left in place. Nothing reads it or writes it anymore. Playback is only the official embedded YouTube IFrame player. Tap tempo, a manual BPM, and the beat grid stay, because they never read captured audio. A `.txt` list of links is still fine. The person's own microphone (Web Audio) is not YouTube audio and stays.

## Search is public, and the shared key is metered (28 Oct 2026)

Anyone can open the mixer. `approved` means unlimited search on the shared key, not a gate. Anonymous callers get 20 Data API calls per UTC day (the IP is hashed; the raw address is not stored). Signed-in callers get 50. The owner and approved accounts are unlimited. Cache hits do not count: search is kept 24 h by normalized query, playlist pages 6 h. A key the user pastes stays in `localStorage` (`djtube-yt-key`). The browser calls YouTube directly. That key is never sent to the Worker and never logged.

## Mix curve

Not constant-power. The brief is explicit: `A = min(1, 2*(1-x))`, `B = min(1, 2*x)`, then times each deck's own volume. Center is both at 100%.

## Playlist titles

`getPlaylist()` on a hidden IFrame player expands a playlist with no Data API key. Titles go through YouTube **oEmbed**, proxied at `/api/oembed` so a CORS failure cannot spam the console. Thumbnails use `i.ytimg.com` immediately and the oEmbed thumbnail when it arrives.

## Search secret

`/api/search` and `/api/playlist` read the Worker secret `YT_API_KEY`. It is not in this repo, not in `wrangler.jsonc`, and not in the client bundle. Missing key returns HTTP 200 `{ ok: false, reason: "missing_key" }` so the browser does not log a failed request. Paste-a-URL still works. A call that actually uses the key is counted, including a failed upstream response. Cached successes are not.
