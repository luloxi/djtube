# DJTube — build decision

Spanish summary: no reutilicé un mixer entero. Los repos públicos o no son MIT, o son PHP/JS suelto y viejo, o no encajan con Vite + React + Worker. La app se construye desde cero y sí usa `wavesurfer.js` (regiones) y `web-audio-beat-detector`.

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

- **wavesurfer.js 7** (BSD-3-Clause) and its **Regions** plugin. The YouTube IFrame does not expose audio, so WaveSurfer does not play the track. It renders precomputed peaks (`peaks` + `duration`, no media URL, `backend: 'WebAudio'` so the playhead can move) and drag-selects a highlight.
- **web-audio-beat-detector** (MIT). `analyze(AudioBuffer)` runs on a slice of the sync tab's capture. The player runs at its highest rate, so the detector's tempo window is scaled by that rate and the result is divided before it is folded into a DJ range. Doing the fold first would halve a 2× reading a second time.
- **realtime-bpm-analyzer** (Apache-2.0) was the other candidate. It is built for a live AudioWorklet stream and would need the buffer to play back in real time. The sync tab already holds a capture for the waveform, so the offline detector is the better fit. A small interval/energy estimator in `src/lib/bpm.ts` is the fallback if the library throws (quiet audio, no beats) and is what the unit tests lock down.

## Why analysis is not a deck button

Capturing the mixer tab means soloing one deck and playing it through the speakers, which breaks the set. `/sync` is a second view of the same signed-in app. It captures itself, with `suppressLocalAudioPlayback`, and the two tabs share the queue over `BroadcastChannel`. IndexedDB stays the copy that is still there after a reload. The chime is played in the mixer tab because the sync tab's own audio is the one being silenced.

## Mix curve

Not constant-power. The brief is explicit: `A = min(1, 2*(1-x))`, `B = min(1, 2*x)`, then times each deck's own volume. Center is both at 100%.

## Playlist titles

`getPlaylist()` on a hidden IFrame player expands a playlist with no Data API key. Titles go through YouTube **oEmbed**, proxied at `/api/oembed` so a CORS failure cannot spam the console. Thumbnails use `i.ytimg.com` immediately and the oEmbed thumbnail when it arrives.

## Search secret

`/api/search` reads the Worker secret `YT_API_KEY`. It is not set in this repo and must not be committed. Missing key returns HTTP 200 `{ ok: false, reason: "missing_key" }` so the browser does not log a failed request. Paste-a-URL still works.
