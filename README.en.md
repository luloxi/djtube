# DJTube

Two YouTube videos, one fader. You beatmatch by ear. The transition is not constant-power: at the center both decks stay at 100%. Far left is only A, far right is only B. Each deck has its own volume; the percentages on the fader are transition × volume.

Desktop first. On a narrow screen the decks stack.

Paste a video or playlist URL, or search when the Worker has a YouTube Data API key. Drag or click a track onto deck A or B. Play, pause, cue, nudge, and pick a playback rate the player actually allows. **Auto** glides the fader to the other side over N seconds.

The iframe does not expose audio, and analyzing inside a deck silences the mix. The waveform icon in the header (**Sincronizador**) opens `/sync` in another tab, behind the same sign-in.

**Empezar** once, in **Chrome or Edge**, and share that tab with audio. The capture uses `{ audio: { suppressLocalAudioPlayback: true }, preferCurrentTab: true, selfBrowserSurface: 'include' }` (plus `video: true`, which `getDisplayMedia` requires). The analysis audio stays in the stream and does not play out of the speakers. Firefox and Safari cannot silence that capture, so the page will not start there.

A small YouTube player walks the queue and the decks. It uses the highest `playbackRate` the video allows (usually 2×) and the detected BPM is divided by that rate. Short tracks play through. Long tracks use one continuous window for BPM and sample-seeks so the waveform still covers the whole duration. Peaks and BPM are stored in IndexedDB by `videoId`. The mixer tab hears about them over `BroadcastChannel` and updates the waveform, BPM, and sync suggestion without a reload. Anything already stored is skipped.

The list shows queued, analyzing (with progress), ready with BPM, or error with retry, plus pause and overall progress. When the list finishes, the mixer plays a short soft chime and a toast. It chimes again only after a new batch finishes. The sync tab keeps working in the background off the capture's audio clock, not a `setTimeout` loop.

Decks no longer have **Analizar**. TAP and the manual BPM field stay as the fallback. Sync still suggests a `playbackRate` snapped to a rate the player actually allows.

Drag the waveform to save a named highlight. Search, cue, or play it into either deck, delete, export, or import JSON. The highlight `.webm` stays disabled unless that region was captured before — the sync pass does not store a clip, because the audio is sped up. **Grabar** records the mixer tab with `getDisplayMedia` and downloads a `.webm`.

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

Limits: sync capture is Chrome or Edge only, once per session, and the sync tab has to stay open; YouTube quantizes speed and the BPM is corrected for that rate; long waveforms are an overview, not every sample; sync is not a phase lock; playlists are public and capped at 50; new analysis does not produce a highlight `.webm`; no EQ. Queue, peaks, and BPM stay in the browser.
