# DJTube

Two YouTube videos, one fader. You beatmatch by ear. The transition is not constant-power: at the center both decks stay at 100%. Far left is only A, far right is only B. Each deck has its own volume; the percentages on the fader are transition × volume.

Desktop first. On a narrow screen the decks stack.

Paste a video or playlist URL, or search when the Worker has a YouTube Data API key. Drag or click a track onto deck A or B. Play, pause, cue, nudge, and pick a playback rate the player actually allows. **Auto** glides the fader to the other side over N seconds.

The iframe does not expose audio. **Analizar** asks you to share this tab with audio, solos that deck, draws a wavesurfer waveform, and estimates BPM (`web-audio-beat-detector`, with a small onset fallback). Peaks and BPM are cached in IndexedDB. TAP and a manual BPM field are there when the guess is wrong. Sync suggests the `playbackRate` that would match the other deck, snapped to an available rate.

Drag the waveform to save a named highlight. Search, cue, or play it into either deck, delete, export, or import JSON. The highlight `.webm` download stays disabled (not-allowed cursor, tooltip) unless that region was captured during Analizar. **Grabar** records the tab with `getDisplayMedia` and downloads a `.webm`.

Highlights, waveforms, and captured audio stay in the browser. The mixer itself asks you to sign in.

Live: https://djtube.lucianoolivabianco.workers.dev

## Access

Signed-out visitors only see **Entrar con Google**. The OAuth client's redirect URI is exactly:

`https://djtube.lucianoolivabianco.workers.dev/api/auth/callback/google`

`lucianoolivabianco@gmail.com` is the owner and is always allowed. Anyone else is stored (email, name, avatar, first seen, last seen, visit count) as `pending` and sees "Pedí acceso, Luciano te habilita". They never reach the mixer. `/admin` is owner-only: approve, revoke, block, and search. Revoke and block remove access; block shows "Acceso bloqueado".

If `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is missing (or the Better Auth secret, or D1), the landing says "Login en configuración" and nobody gets in, including the owner. `/api/search` and the other API routes reject anyone who is not approved.

```bash
pnpm install
pnpm test
pnpm build
pnpm exec wrangler d1 migrations apply DB --remote
pnpm exec wrangler deploy
pnpm exec wrangler secret put BETTER_AUTH_SECRET
pnpm exec wrangler secret put GOOGLE_CLIENT_ID
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
pnpm exec wrangler secret put YT_API_KEY
```

Do not commit secrets. The D1 database is `djtube`, binding `DB`. Without `YT_API_KEY`, search shows a hint and URL paste still works. Playlists expand via a hidden IFrame `getPlaylist()` plus oEmbed, not the Data API. Search and oEmbed both require an approved session.

Why this was written from scratch: [DECISIONS.md](DECISIONS.md). Spanish guide: [README.md](README.md).

Limits: tab-audio capture once per track; YouTube quantizes speed; sync is not a phase lock; playlists are public and capped at 50; highlight audio exists only for the last analyzed span; no EQ. Highlight data is not stored in the cloud.
