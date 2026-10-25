# DJTube

Two YouTube videos, one fader. You beatmatch by ear. The transition is not constant-power: at the center both decks stay at 100%. Far left is only A, far right is only B. Each deck has its own volume; the percentages on the fader are transition × volume.

Desktop first. On a narrow screen the decks stack.

Paste a video or playlist URL, or search when the Worker has a YouTube Data API key. Drag or click a track onto deck A or B. Play, pause, cue, nudge, and pick a playback rate the player actually allows. **Auto** glides the fader to the other side over N seconds.

The iframe does not expose audio. **Analizar** asks you to share this tab with audio, solos that deck, draws a wavesurfer waveform, and estimates BPM (`web-audio-beat-detector`, with a small onset fallback). Peaks and BPM are cached in IndexedDB. TAP and a manual BPM field are there when the guess is wrong. Sync suggests the `playbackRate` that would match the other deck, snapped to an available rate.

Drag the waveform to save a named highlight. Search, cue, or play it into either deck, delete, export, or import JSON. The highlight `.webm` download stays disabled (not-allowed cursor, tooltip) unless that region was captured during Analizar. **Grabar** records the tab with `getDisplayMedia` and downloads a `.webm`.

No login. Data stays in the browser.

```bash
pnpm install
pnpm test
pnpm build
pnpm exec wrangler deploy
pnpm exec wrangler secret put YT_API_KEY
```

Do not commit the key. Without it, search shows a hint and URL paste still works. Playlists expand via a hidden IFrame `getPlaylist()` plus oEmbed, not the Data API.

Why this was written from scratch: [DECISIONS.md](DECISIONS.md). Spanish guide: [README.md](README.md).

Limits: tab-audio capture once per track; YouTube quantizes speed; sync is not a phase lock; playlists are public and capped at 50; highlight audio exists only for the last analyzed span; no EQ.
