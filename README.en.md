# DJTube

Two YouTube videos, one fader. You beatmatch by ear. The transition is not constant-power: at the center both decks stay at 100%. Far left is only A, far right is only B. Each deck has its own volume; the percentages on the fader are transition × volume.

The first visit asks for **Preparar** or **DJ**. They never show together. Preparar is the highlight list. There are no pads, no hot cues, and no audio capture. DJ is the two decks and the mixer. The choice is stored in `djtube-mode` and switched from the bottom bar. If something is playing, going to Preparar asks for confirmation because it stops the music.

The mixer fills the viewport (`100dvh`), edge to edge, with no title and no top bar. From 1024px the decks sit side by side: queue and search share the left slot and switch with icons (not stacked). In DJ, volume A, the crossfader, and volume B are one block under the decks. A bottom icon bar holds the mode, the YouTube key, admin (owner only), and the account menu.

On a phone the decks stack with the fader and play in the first screen, and a color edge between A, B, and the fader. With the disc off the picture is 16:9; with it on, the video fills the largest circle in the deck. Queue and search are two large centered buttons; highlights sit with the rest of the dock. In the list, A and B sit on the left and right with the deck colors. A queue strip appears only when the viewport is tall enough. In landscape the decks sit side by side again.

**Buscar** is the only way in. Paste a video URL and it goes to the queue. Paste a playlist URL (`list=`, including `watch?v=…&list=…`, music.youtube.com and youtu.be) and a small modal asks **Agregar toda la lista** or **Solo esta canción** (only when the URL also has a video); X, a click outside, or Escape closes it and adds nothing. The whole list is fetched page by page with no 50-track limit (the Worker's `/api/playlist` uses the shared Data API key when the quota allows, else YouTube's own continuation), in order, skipping duplicates and private or unavailable videos, with a thin loading bar and a toast like “N temas agregados”. Plain text searches use that shared key, or a key stored only in this browser (see below). Drag or tap A/B on a row. Swipe a row left or right (touch or mouse) to remove it: it slides out and a short **deshacer** toast puts it back. A row loaded on A or B snaps back and stays. At the bottom of the queue, **Guardar cola** opens a small sheet: **Descargar lista de links** (a `djtube-cola-YYYY-MM-DD.txt` with title, link and a blank line per track — a list of links, not the audio) or **Guardar en YouTube** (a private playlist, name editable; progress N/M; see “Save to YouTube” below; “Abrir en YouTube” links with `watch_videos` in chunks of 50 are always there as a fallback). On desktop and in mobile landscape each deck keeps one row of equal-height controls: play, rewind, then − rate +. In mobile portrait (including widths around 360 and 412) those controls are exactly two rows of the same button size: play and rewind, then − rate + underneath. The disc/video view toggle is a neon pink waveform icon at the top right of each deck's header (tooltip on hover and long-press); on a phone it hides while the queue or search is open. There is one − and one +, and no « » nudge buttons. The deck row has no TAP, BPM, waveform, sync, or analyze control. Tapping the rate value opens a compact grid with every YouTube speed at once, always inside the viewport and never scrolling; tap one to set it and close it (an outside tap or Escape also closes it). There is no swipe or drag to change speed (− and + and the left/right keys still work). Dragging the disc seeks. The iframe has `fs: 0` and does not take pointer events, so YouTube fullscreen stays off. **Auto** next to the fader glides A↔B in 3 s by default; drag the seconds. The round-arrow control pauses and seeks to 0:00. Buttons have no fill. Each icon is neon by role: play green, rewind violet, speed orange, the visualization toggle pink. They glow slightly at rest and more on hover, focus, and when on; they never turn black or grey. Loading a track muted-prerolls it so play starts tighter. Controls are icons, with the words in the tooltip and `aria-label`. Status text is a short toast. There is no analyze button and no waveform sync icon on the deck, and no hot-cue row.

YouTube audio and video are not captured, recorded, or downloaded. Playback is only the official embedded player. Preparar is the highlight list (name and times). There is no `/sync` tab.

There is no BPM, TAP, “enter on beat”, or beat grid: you mix by ear. YouTube rates are discrete. Status messages are a short toast.

In DJ, the video is drawn inside a round disc: the largest circle that fits in the deck, centered, at every breakpoint. It spins while that deck is playing (33⅓) and holds still while paused. It starts on. A saved off flag from before is dropped once (`djtube-disc-v2`); after that, turning it off stores `djtube-disc-A` or `djtube-disc-B` as `0`. Dragging seeks: forward raises the rate briefly, backward pauses and seeks (YouTube cannot play in reverse). Release restores the previous transport. The picture covers the circle (no black bars inside the platter) and the controls stay tight underneath.

The dock microphone (desktop only, hidden on phones and tablets; off by default) goes through Web Audio: pitch (±12 semitones), volume, and reverb. It is the person's own mic, not YouTube audio.

On a desktop (1024px and a fine pointer) the queue, the two decks, and the mixer are one grid. Dragging a divider gives the space to its neighbour: a wider queue shrinks both decks, a wider deck shrinks the other, a taller mixer shrinks the deck row. Nothing overflows the desk or overlaps. Resizing the window clamps the saved layout again, including an older layout that was larger than the screen. The webcam, when it is on, floats above the grid and stays inside the desk. The layout is `djtube-layout`. **Restablecer** is in the account menu. The bottom bar cannot be hidden. Phones keep the fixed grid.

Each deck's waveform is not text-selectable. Press and drag on it to scrub: while the deck plays you hear short bursts at the pointer (like fast rewind or forward) and it goes silent when the pointer rests; a paused deck seeks silently. On release the playhead stays where you let go and playback continues from there (or stays paused). Mouse and touch. YouTube titles are shown as plain text: `&#39;`, `&amp;` and other entities are decoded (no `innerHTML`), including already-saved queue items.

Cuts are made only in Preparar (edit mode), never in DJ (production): the deck waveform only scrubs, it does not select or save. In the Cortes list you can search, rename, reopen to adjust, delete, export, or import JSON. The cut's audio is not downloaded.

Clear list keeps whatever is loaded on A or B. Admin opens as a sheet over the mixer so playback is not torn down. The owner sees a badge for unlimited-search requests on the admin icon (polled). The bell, for someone already signed in, opts this phone into Web Push. A new request notifies the owner's subscriptions. Marking someone unlimited also pushes that person if they subscribed, and sends mail through Resend from `DJTube <no-responder@lulox.com.ar>` (or `APPROVAL_FROM`). A failed send is logged and does not undo the change.

The account menu has [contact](https://lulox.com.ar/contacto) and the [repo](https://github.com/luloxi/djtube). The app is installable (manifest, icons, a tiny service worker) with a dismissible prompt (`Cerrar` / `No mostrar más`). The installed icon is an orange circle with two blue dot eyes and a blue play triangle as the mouth (`public/djtube.svg`, also in the portfolio): 192, 512, and a maskable 512 on solid orange with safe padding. The face is vertically centered (equal padding above and below on the disc); `node scripts/make-icons.mjs` regenerates the PNGs. On Android, an already installed app has to be reinstalled before the new icon shows up.

Highlights stay in the browser. Mixing does not require a sign-in.

Live: https://djtube.lucianoolivabianco.workers.dev and, once the custom domain is attached, https://dj.lulox.com.ar. `workers.dev` stays.

## Access

The mixer is open. Google sign-in is optional: it raises the daily search cap and lets you ask for unlimited search. The OAuth client's redirect URIs are exactly these two:

`https://djtube.lucianoolivabianco.workers.dev/api/auth/callback/google`

`https://dj.lulox.com.ar/api/auth/callback/google`

The second one has to be added in the Google Cloud project `luloxdev`. Sessions are per host.

`lucianoolivabianco@gmail.com` is the owner and has no search cap. Anyone else can ask for **Uso sin límite** from the account menu (a button; signing in does not create the request). They are stored (email, name, avatar, first seen, last seen, visit count) as `pending` until Luciano marks them. `/admin` is owner-only: unlimited, revoke, block, and search. Revoke puts the daily cap back. Block stops another request and shows "Bloqueado".

If `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is missing (or the Better Auth secret, or D1), the sign-in button says "Login en configuración". The mixer stays open. `/admin` is still owner-only.

## Search quota

The shared key is only the Worker secret `YT_API_KEY`. It is not in the client and not in `wrangler.jsonc`. A search counts only when that key is actually sent to YouTube. A cached response does not count.

- Anonymous (a hash of the IP, never the raw address): 20 per UTC day.
- Signed in, not approved: 50 per UTC day.
- Owner and accounts marked unlimited: no cap.
- Search cache 24 h (normalized query). Playlist page cache 6 h.

When the person's limit or the shared quota runs out, the app says so and offers **Usá tu propia clave**. Pasting a link still works. A playlist that cannot use the key falls back to YouTube's continuation (that does not spend the key). A single video's title comes from oEmbed (`/api/oembed`). Those routes do not require approval.

## Bring your own key

The key icon opens a sheet (X, a click outside, or Escape closes it). A YouTube Data API v3 key stays only in this browser (`localStorage`, `djtube-yt-key`). With it set, search and playlist pages go straight to `googleapis.com`. It is never sent to the DJTube server and never written to a log. There is a button to remove it.

1. Create a project in [Google Cloud](https://console.cloud.google.com/projectcreate).
2. Enable [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com).
3. Create a key in [Credentials](https://console.cloud.google.com/apis/credentials).
4. Restrict it to YouTube Data API v3 and the HTTP referrer `https://dj.lulox.com.ar/*`.
5. Paste it into the sheet.

It is free. The daily quota is yours: 10,000 units. A search costs 100.

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

Do not commit secrets. The D1 database is `djtube`, binding `DB`. The unlimited-search mail is a `POST` to `https://api.resend.com/emails` with `Authorization: Bearer` and the `RESEND_API_KEY` secret. The sender is `DJTube <no-responder@lulox.com.ar>` unless `APPROVAL_FROM` is set. A failed send is only logged, and the log does not include the secret. Without `YT_API_KEY`, search shows a hint and offers a browser key. URL paste still works. Playlists fall back to YouTube's continuation, and a single title comes from oEmbed. Neither route requires approval.

Why this was written from scratch: [DECISIONS.md](DECISIONS.md). Spanish guide: [README.md](README.md).

Limits: YouTube audio and video are not separated, stored, or downloaded; the waveform is a guide for a highlight, not the track; YouTube quantizes speed; backward jog pauses because YouTube cannot reverse; public playlists are walked page by page with no 50-track cap; a highlight has no audio file (a `.txt` of links is fine); no EQ. The queue and highlights stay in the browser. The shared key is capped at 20 anonymous searches a day and 50 for a signed-in account. Cache hits are free.

## Save to YouTube

**Guardar en YouTube** asks for the `https://www.googleapis.com/auth/youtube` scope only at that moment (Better Auth `linkSocial` with an extra scope; normal sign-in is unchanged). Tokens stay on the Worker. It needs, in the Google Cloud project of DJTube's OAuth client: the **YouTube Data API v3** enabled, and the scope added under **Google Auth Platform → Data Access** (with the app in Testing, the account must be a test user). Quota is 50 units per insert (about 200 tracks per day on the default 10 000). Without that setup the sheet still offers the `watch_videos` links.

## Rate limit

Each IP has a burst cap on `/api/*` (Workers Rate Limiting, free, per Cloudflare location, approximate): 60 requests / 10 s in general, 12 / 10 s on search and playlists (`/api/search`, `/api/playlist`, `/api/youtube/playlist`) and 150 / 10 s on titles (`/api/oembed`). Past the cap the Worker returns `429` with `Retry-After: 10` before touching D1 or YouTube. The owner and accounts marked **Sin límite** in admin are never cut off: the session is only looked up once a cap is hit (max 5 lookups / 10 s per IP). Static assets never reach the Worker. Counters live in `wrangler.jsonc` (`ratelimits`), logic in `worker/ratelimit.ts`.

## Neon navigation

The app icon (orange circle) shows on the first screen, where you pick Preparar or DJ, and at the start of the bottom bar. Navigation buttons have no fill: each is its own neon and none shares a hue with deck A (teal) or deck B (amber): Cola blue, Buscar red, Preparar yellow, DJ cyan. The active one lights up in its colour with a strong glow; the rest dim with a faint glow.

## Cutting (Preparar)

In Preparar you pick a song: paste a link, search, or tap one from the queue. A full-screen editor lays the song out as rows of 10 s, like lines of text, with a tick per second and the time at the start of each row. Drag (mouse or finger) from one point to another, across as many rows as needed, to mark the cut; near the screen edges it scrolls by itself. Drag either end to fine-tune it. A tap without dragging moves the playhead. Play auditions only the selection and stops at its end. Save with your own name (blank falls back to “song m:ss”). In the Cortes list the pencil renames in place (Enter saves, Esc cancels) and the scissors reopen the cut to adjust it. Cuts live in this browser (IndexedDB) and export or import as JSON.

YouTube's audio signal can't be read from the page, so the rows show time rather than a real waveform.

