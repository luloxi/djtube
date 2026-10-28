# DJTube

Two YouTube videos, one fader. You beatmatch by ear. The transition is not constant-power: at the center both decks stay at 100%. Far left is only A, far right is only B. Each deck has its own volume; the percentages on the fader are transition × volume.

The first visit asks for **Preparar** or **DJ**. They never show together. Preparar is the synchronizer, highlights, and pads. DJ is the two decks and the mixer. The choice is stored in `djtube-mode` and switched from the bottom bar. `/sync` opens Preparar.

The mixer fills the viewport (`100dvh`), edge to edge, with no title and no top bar. From 1024px the decks sit side by side: queue and search share the left slot and switch with icons (not stacked). In DJ, volume A, the crossfader, and volume B are one block under the decks. A bottom icon bar holds the mode, record, admin (owner only), and the account menu.

On a phone the decks stack as 16:9 thumbnails with the fader and play in the first screen, and a color edge between A, B, and the fader. Queue and search are two large centered buttons; highlights sit with the rest of the dock. Each deck has a list icon: tap a title to load that deck. In the list, A and B sit on the left and right with the deck colors. A queue strip appears only when the viewport is tall enough. In landscape the decks sit side by side again.

Paste a video or playlist URL, or search when the Worker has a YouTube Data API key. Drag or tap A/B on a row. Swipe a row left or right (touch or mouse) to remove it: it slides out and a short **deshacer** toast puts it back. A row loaded on A or B snaps back and stays. Play is the large button; the iframe has `fs: 0` and does not take pointer events, so YouTube fullscreen stays off. Each deck has one − on the left of the rate and one + on the right, at every width. Nudges sit beside that group. Tap the number (without dragging) for the YouTube rates, higher above and lower below. **Auto** next to the fader glides A↔B in 3 s by default; drag the seconds. The round-arrow control pauses and seeks to 0:00. Play is mint, that rewind is lavender, the speed cluster is peach, and TAP is sky blue. TAP’s tooltip is “Tocá al ritmo para medir el BPM” on hover and on a long-press. Loading a track muted-prerolls it so play starts tighter. Controls are icons, with the words in the tooltip and `aria-label`. BPM is the large number on each deck. Status text is a short toast. There is no analyze button on the deck and no hot-cue row under the video. Sync stays on the bottom bar.

The iframe does not expose audio. Analyzing the track that is currently playing is not possible: the iframe is cross-origin, and capturing the tab with `suppressLocalAudioPlayback` would silence the set. Analysis lives in Preparar, opened from the bottom bar. The deck has no analyze button.

**Empezar** once, in **Chrome or Edge**, and share that tab with audio. The capture uses `{ audio: { suppressLocalAudioPlayback: true }, preferCurrentTab: true, selfBrowserSurface: 'include' }` (plus `video: true`, which `getDisplayMedia` requires). The analysis audio stays in the stream and does not play out of the speakers. Firefox and Safari cannot silence that capture, so the page will not start there.

A small YouTube player walks the queue. It uses the highest `playbackRate` the video allows (usually 2×) and the detected BPM is divided by that rate. Short tracks play through. Long tracks use one continuous window for BPM and sample-seeks so the waveform still covers the whole duration. Peaks, BPM, and beat offset stay in IndexedDB by `videoId` and in D1 (`track_analysis`) for that account, so another device of the same user receives them. Other accounts do not. A newer server row wins; a local-only row is uploaded. The mixer hears about them over `BroadcastChannel` and updates the waveform, BPM, and sync suggestion without a reload. Anything already stored is skipped.

The list shows queued, analyzing (with progress), ready with BPM, or error with retry, plus pause and overall progress. When the list finishes, the mixer plays a short soft chime and a toast. It chimes again only after a new batch finishes. The sync tab keeps working in the background off the capture's audio clock, not a `setTimeout` loop.

TAP and the manual BPM field stay as the fallback. With BPM and offset, each waveform draws the beat grid (the downbeat anchors zero). **Entrar en beat** waits for the other deck's next beat and starts there. **Igualar BPM** (remembered) nudges `playbackRate` toward the leader and eases back to 1×. YouTube rates are discrete. Without an offset the grid is not drawn.

In DJ, each deck's disc icon shows the video as a platter spinning while it plays (33⅓). Dragging seeks: forward raises the rate briefly, backward pauses and seeks (YouTube cannot play in reverse). Release restores the previous transport.

The dock microphone (off by default) goes through Web Audio: pitch (±12 semitones), volume, and reverb. If it is on when a recording starts, it is mixed in and a second microphone is not opened. Turning it on mid-take still joins the recording.

On a desktop (1024px and a fine pointer) an optional webcam tile can be shown, and the queue, decks, mixer, and camera can be dragged and resized. The layout is `djtube-layout`. **Restablecer** is in the account menu. `\` hides the dock; the bottom edge shows it again. Phones keep the fixed grid.

Drag the waveform to save a named highlight. Search, cue, or play it into either deck, delete, export, or import JSON. The highlight `.webm` stays disabled unless that region was captured before — the sync pass does not store a clip, because the audio is sped up. **Grabar** uses `getDisplayMedia` when it exists. Android Chrome has no display capture: it falls back to the microphone with a `MediaRecorder` mime the device reports via `isTypeSupported` (`video/mp4` / `audio/webm`). If nothing can be recorded, the button is disabled.

Clear list keeps whatever is loaded on A or B. Admin opens as a sheet over the mixer so playback is not torn down. The owner sees a pending-request badge on the admin icon (polled). The admin bell opts this phone into Web Push. Someone waiting on the hold screen can opt in too. A new pending account notifies the owner's subscriptions. Approving also pushes that person if they subscribed, and sends mail through Resend from `DJTube <no-responder@lulox.com.ar>` (or `APPROVAL_FROM`). A failed send is logged and does not undo the approval.

The account menu has [contact](https://lulox.com.ar/contacto) and the [repo](https://github.com/luloxi/djtube). The app is installable (manifest, icons, a tiny service worker) with a dismissible prompt (`Cerrar` / `No mostrar más`).

Highlights and captured audio stay in the browser. BPM, offset, and peaks also sync to that account. The mixer itself asks you to sign in.

Live: https://djtube.lucianoolivabianco.workers.dev and, once the custom domain is attached, https://dj.lulox.com.ar. `workers.dev` stays.

## Access

Signed-out visitors only see **Entrar con Google**. The OAuth client's redirect URIs are exactly these two:

`https://djtube.lucianoolivabianco.workers.dev/api/auth/callback/google`

`https://dj.lulox.com.ar/api/auth/callback/google`

The second one has to be added in the Google Cloud project `luloxdev`. Sessions are per host.

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
pnpm exec wrangler secret put VAPID_PUBLIC_KEY
pnpm exec wrangler secret put VAPID_PRIVATE_KEY
pnpm exec wrangler secret put RESEND_API_KEY
```

Do not commit secrets. The D1 database is `djtube`, binding `DB`. Approval mail is a `POST` to `https://api.resend.com/emails` with `Authorization: Bearer` and the `RESEND_API_KEY` secret. The sender is `DJTube <no-responder@lulox.com.ar>` unless `APPROVAL_FROM` is set. A failed send is only logged, and the log does not include the secret. Without `YT_API_KEY`, search shows a hint and URL paste still works. Playlists expand via a hidden IFrame `getPlaylist()` plus oEmbed, not the Data API. Search and oEmbed both require an approved session.

Why this was written from scratch: [DECISIONS.md](DECISIONS.md). Spanish guide: [README.md](README.md).

Limits: sync capture is Chrome or Edge only, once per session, and Preparar has to keep running; YouTube quantizes speed and the BPM is corrected for that rate; long waveforms are an overview, not every sample; the beat grid is visual, not a phase lock, and the playing deck cannot be analyzed live; backward jog pauses because YouTube cannot reverse; playlists are public and capped at 50; new analysis does not produce a highlight `.webm`; no EQ. The queue and captured audio stay in the browser. BPM, offset, and peaks also live in D1 for that account.
