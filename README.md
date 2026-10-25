# DJTube

Dos videos de YouTube, un fader. Mezcla a oído: el crossfader no es una curva de potencia constante, en el centro suenan los dos al 100%.

La mezcla ocupa todo el viewport (`100dvh`), de borde a borde, sin título ni barra superior. Desde 1024px los decks van lado a lado: cola y búsqueda a la izquierda, cortes a la derecha (se ocultan). El volumen de A, el crossfader y el volumen de B son un solo bloque debajo de los decks. Abajo hay una barra de iconos: sincronizador, grabar, admin (solo el dueño) y la cuenta, con salir en ese menú.

En el móvil los dos decks van apilados, con miniatura 16:9, fader y play a la vista. Cola, búsqueda y cortes se abren desde la barra inferior. En horizontal, los decks vuelven a ir lado a lado.

## Mezclar

1. Pega un enlace de video o de playlist, o busca (si el worker tiene secreto).
2. Carga un tema en A y otro en B. También puedes arrastrar.
3. Play, cue, marcar, nudge y TAP son iconos (el nombre está en el tooltip y en `aria-label`). Cue vuelve al punto marcado y pausa. El BPM es el número grande de cada deck.
4. El fader del centro es el control grande: izquierda solo A, centro ambos, derecha solo B. A su lado están los volúmenes, en vertical. El número sobre el fader ya es la mezcla de los dos. Se arrastra, igual que la onda (clic busca, arrastre marca un corte) y la velocidad.
5. **Auto** desliza el fader al otro lado. Los segundos se arrastran.
6. Nudge − / + cambia un momento a la velocidad vecina que el player permita. La velocidad se arrastra entre los valores de `getAvailablePlaybackRates()`.

Atajos: `espacio` play/pausa de ambos, `Q` deck A, `W` deck B, `←` `→` el fader, `shift` salta más. No actúan si estás escribiendo en un campo.

## Sincronizador, BPM, cortes

El iframe no entrega el audio, y analizar en el mismo deck en el que mezclas corta el sonido. El icono de onda de la barra inferior (**Sincronizador**) abre `/sync` en otra pestaña, con el mismo acceso. El mismo icono, en el deck, abre esa pestaña para el tema cargado.

1. En esa pestaña, **Empezar** una vez. Hay que usar **Chrome o Edge** y compartir **esta** pestaña **con audio**. La captura pide `suppressLocalAudioPlayback`: el audio entra al análisis y **no sale por los altavoces**. Firefox y Safari no saben silenciar esa captura, y la página no arranca.
2. Un reproductor pequeño de YouTube pasa la cola. Usa la velocidad más alta que acepte el video (suele ser ×2) y el BPM detectado se divide por esa velocidad. En temas cortos suena el tema entero. En temas largos, una ventana continua sirve para el BPM y unos saltos arman la onda de toda la duración.
3. Picos y BPM quedan en IndexedDB, por `videoId`. La pestaña del mixer se entera al momento (BroadcastChannel) y pinta la onda, el BPM y la sugerencia de sync sin recargar. Lo que ya estaba analizado no se repite.
4. La lista muestra en cola, analizando (con avance), listo con BPM, o error con reintento. Se puede pausar. Cuando la cola termina, el mixer suena un campanazo corto y muestra un aviso. Solo vuelve a sonar cuando entra trabajo nuevo y ese lote también termina.
5. Puedes dejar el sincronizador en segundo plano: el reloj es el audio de la captura, no una cadena de `setTimeout`. Si Chrome pausa el video al ocultar la pestaña, al volver se reanuda.

Si el número no convence: **TAP** o edítalo a mano. Con BPM en los dos decks, el mixer muestra un botón para igualar el `playbackRate` al valor que el player realmente puede aplicar. Los avisos («Deck A», «Guardado», «Grabando») son un toast corto.

Arrastra sobre la onda, ponle nombre y guarda el corte. En Highlights puedes buscar, hacer play o cue en A o B, borrar, exportar e importar JSON. **Audio** descarga el tramo en `.webm` solo si esa zona se capturó antes en este navegador. El sincronizador no guarda el clip: el audio va acelerado y no coincide con el reloj del tema.

**Grabar**, en la barra inferior, usa la captura de pantalla del navegador (vídeo + audio) y al parar descarga la sesión.

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

- El sincronizador es Chrome o Edge, y hay que compartir su pestaña con audio una vez por sesión. `suppressLocalAudioPlayback` es lo que evita que el análisis suene. Firefox y Safari no lo implementan.
- La pestaña `/sync` tiene que seguir abierta. El audio de la captura mantiene el análisis fuera de foco. Si el navegador mata el video, se reanuda al volver o con Seguir.
- YouTube solo acepta las velocidades que expone el player. El análisis usa la más alta y corrige el BPM. El sync del fader es una sugerencia, no un beatgrid ni un keylock.
- En un tema largo la onda es un panorama por tramos, no cada muestra. El BPM sale de una ventana continua (unos 30 s del tema).
- La playlist depende de `getPlaylist()` (públicas, como mucho 50 temas).
- El `.webm` de un highlight solo existe para un tramo capturado antes. El sincronizador nuevo no lo graba.
- No hay EQ. La cola, la onda y el BPM siguen en este navegador, no en la nube.
