# DJTube

Dos videos de YouTube, un fader. Mezcla a oído: el crossfader no es una curva de potencia constante, en el centro suenan los dos al 100%.

Pensado para escritorio. En el móvil los decks se apilan.

## Mezclar

1. Pega un enlace de video o de playlist, o busca (si el worker tiene secreto).
2. Carga un tema en A y otro en B. También puedes arrastrar.
3. Play / Pausa / Cue / Marcar. Cue vuelve al punto marcado y pausa.
4. El fader del centro es el control grande: izquierda solo A, centro ambos, derecha solo B. Cada deck tiene además su volumen. El porcentaje que ves ya es la mezcla de los dos.
5. **Auto** desliza el fader al otro lado en los segundos que indiques.
6. Nudge − / + cambia un momento a la velocidad vecina que el player permita. El selector usa `getAvailablePlaybackRates()`.

Atajos: `espacio` play/pausa de ambos, `Q` deck A, `W` deck B, `←` `→` el fader, `shift` salta más. No actúan si estás escribiendo en un campo.

## Analizar, BPM, cortes

El iframe no entrega el audio. **Analizar** pide compartir esta pestaña **con audio**, deja el otro deck en silencio y reproduce el que analizas. Con eso se dibuja la onda (wavesurfer) y se estima el BPM. Picos y BPM quedan en IndexedDB: la próxima vez salen al momento.

Si no convence el número: **TAP** o edítalo a mano. Con BPM en los dos decks, el sync propone el `playbackRate` para igualarlos y el valor que el player realmente puede aplicar.

Arrastra sobre la onda, ponle nombre y guarda el corte. En Highlights puedes buscar, hacer play o cue en A o B, borrar, exportar e importar JSON. **Audio** descarga el tramo en `.webm` solo si esa zona se capturó en Analizar; si no, el botón no se puede pulsar.

**Grabar** usa la captura de pantalla del navegador (vídeo + audio) y al parar descarga la sesión.

Los cortes, la onda y el audio se quedan en este navegador. Para mezclar hay que entrar.

## Acceso

La portada, si no hay sesión, es solo **Entrar con Google**. La URI de redirección del cliente OAuth es exactamente:

`https://djtube.lucianoolivabianco.workers.dev/api/auth/callback/google`

`lucianoolivabianco@gmail.com` es el dueño y siempre puede entrar. Cualquier otra cuenta queda registrada (email, nombre, avatar, primera vez, última vez, cantidad de visitas) con estado `pending` y ve «Pedí acceso, Luciano te habilita». No llega al mixer. En `/admin` el dueño aprueba, revoca o bloquea, y puede buscar. Revocar o bloquear saca el acceso; bloquear muestra «Acceso bloqueado».

Si faltan `GOOGLE_CLIENT_ID` o `GOOGLE_CLIENT_SECRET` (o el secreto de Better Auth, o D1), la portada dice «Login en configuración» y nadie entra, tampoco el dueño. `/api/search` y el resto de la API rechazan a quien no está aprobado.

## Desarrollo

```bash
pnpm install
pnpm test
pnpm build
pnpm dev
```

## Deploy

En vivo: https://djtube.lucianoolivabianco.workers.dev

Worker de Cloudflare `djtube`, assets estáticos del build de Vite.

```bash
pnpm build
pnpm exec wrangler d1 migrations apply DB --remote
pnpm exec wrangler deploy
pnpm exec wrangler secret put BETTER_AUTH_SECRET
pnpm exec wrangler secret put GOOGLE_CLIENT_ID
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
pnpm exec wrangler secret put YT_API_KEY
```

Los secretos no van en el repo. D1 se llama `djtube` y el binding del worker es `DB`.

Sin `YT_API_KEY`, la búsqueda muestra una nota y pegar un enlace sigue funcionando. La playlist no usa esa clave: un iframe oculto llama a `getPlaylist()` y los títulos salen de oEmbed (`/api/oembed`). Esas dos rutas exigen una sesión aprobada.

Por qué no partimos de otro mixer: [DECISIONS.md](DECISIONS.md). English: [README.en.md](README.en.md).

## Límites

- Hay que compartir el audio de la pestaña una vez por tema para la onda, el BPM y el clip. Chrome o Edge van mejor que Firefox.
- YouTube solo acepta las velocidades que expone el player. El sync es una sugerencia, no un beatgrid ni un keylock.
- La playlist depende de `getPlaylist()` (públicas, como mucho 50 temas).
- El `.webm` de un highlight solo existe para el tramo grabado en el último Analizar.
- No hay EQ. La biblioteca de cortes no está en la nube: sigue en el navegador.
