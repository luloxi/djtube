# DJTube

Dos videos de YouTube, un fader. Mezcla a oído: el crossfader no es una curva de potencia constante, en el centro suenan los dos al 100%.

La primera vez pregunta **Preparar** o **DJ**. No conviven. Preparar es sincronizador, cortes y pads. DJ es los dos decks y el mixer. La elección queda en `djtube-mode` y se cambia desde la barra de abajo. `/sync` abre Preparar.

La mezcla ocupa todo el viewport (`100dvh`), de borde a borde, sin título ni barra superior. Desde 1024px los decks van lado a lado: cola y búsqueda comparten el panel izquierdo y se alternan con iconos (no van apiladas). En DJ el volumen de A, el crossfader y el volumen de B son un solo bloque debajo de los decks. Abajo hay una barra de iconos: modo, grabar, admin (solo el dueño) y la cuenta.

En el móvil los dos decks van apilados, con miniatura 16:9, fader y play a la vista, y una raya de color que separa A, B y el fader. Cola y búsqueda son dos botones grandes al centro de la barra; cortes a un lado. El icono de lista en cada deck abre la cola: un toque en el nombre carga ese deck. En las filas, A y B van a izquierda y derecha con el color del deck. Si la pantalla es alta, un recorte de la cola queda a la vista. En horizontal, los decks vuelven a ir lado a lado.

## Mezclar

1. Pega un enlace de video o de playlist, o busca (si el worker tiene secreto).
2. Carga un tema en A y otro en B. También puedes arrastrar.
3. Play, volver al principio, nudge y TAP son iconos (el nombre está en el tooltip y en `aria-label`). Volver pausa y busca el inicio (0:00). El BPM es el número grande de cada deck. Play es el botón grande; el video no tiene fullscreen (`fs: 0`).
4. El fader del centro es el control grande: izquierda solo A, centro ambos, derecha solo B. A su lado están los volúmenes, en vertical. El número sobre el fader ya es la mezcla de los dos. Se arrastra, igual que la onda (clic busca, arrastre marca un corte).
5. **Auto** (junto al fader) desliza A↔B. Por defecto dura 3 s; los segundos se arrastran.
6. Cada deck tiene un solo − a la izquierda del número de velocidad y un solo + a la derecha, en cualquier ancho. Los nudges (mantener) van al lado. Arrastrar el número sigue valiendo; un toque sin arrastre abre las velocidades que permite YouTube, las altas arriba y las bajas abajo.
7. Play es menta, volver lavanda, la velocidad (nudges, −, número, +) durazno y TAP celeste. TAP muestra «Tocá al ritmo para medir el BPM» al pasar el mouse y, en el teléfono, al mantenerlo pulsado.
8. Al cargar un tema, el deck lo precarga (play mudo, pausa en 0) para que el arranque salga más a tiempo.

Atajos: `espacio` play/pausa de ambos, `Q` deck A, `W` deck B, `←` `→` el fader, `shift` salta más. No actúan si estás escribiendo en un campo.

## Sincronizador, BPM, cortes

El iframe no entrega el audio. Analizar el tema que está sonando, en vivo, no se puede: el iframe es de otro origen, y capturar la pestaña con `suppressLocalAudioPlayback` le saca el audio al set. El análisis va en Preparar, desde la barra de abajo. El deck no tiene botón de analizar.

1. En esa pestaña, **Empezar** una vez. Hay que usar **Chrome o Edge** y compartir **esta** pestaña **con audio**. La captura pide `suppressLocalAudioPlayback`: el audio entra al análisis y **no sale por los altavoces**. Firefox y Safari no saben silenciar esa captura, y la página no arranca.
2. Un reproductor pequeño de YouTube pasa la cola. Usa la velocidad más alta que acepte el video (suele ser ×2) y el BPM detectado se divide por esa velocidad. En temas cortos suena el tema entero. En temas largos, una ventana continua sirve para el BPM y unos saltos arman la onda de toda la duración.
3. Picos, BPM y el offset del beat quedan en IndexedDB, por `videoId`, y también en D1 (`track_analysis`) para esa cuenta. Otro dispositivo del mismo usuario los recibe. Otra cuenta no. Si el servidor tiene una fila más nueva, gana; si solo está en este navegador, se sube. La otra pestaña del mixer se entera al momento (BroadcastChannel) y pinta la onda, el BPM y la sugerencia de sync sin recargar. Lo que ya estaba analizado no se repite.
4. La lista muestra en cola, analizando (con avance), listo con BPM, o error con reintento. Se puede pausar. Cuando la cola termina, el mixer suena un campanazo corto y muestra un aviso. Solo vuelve a sonar cuando entra trabajo nuevo y ese lote también termina.
5. Puedes dejar el sincronizador en segundo plano: el reloj es el audio de la captura, no una cadena de `setTimeout`. Si Chrome pausa el video al ocultar la pestaña, al volver se reanuda.

Si el número no convence: **TAP** o edítalo a mano. Con BPM y offset, cada onda muestra la grilla (el downbeat ancla el cero). **Entrar en beat** espera el próximo beat del otro deck y arranca ahí. **Igualar BPM** (se recuerda) acerca el `playbackRate` y vuelve a ×1 en escalones. YouTube solo tiene velocidades discretas. Sin offset, la grilla no se dibuja. Los avisos son un toast corto.

En DJ, el icono de disco de cada deck muestra el video como un disco que gira mientras suena (33⅓). Arrastrar busca: hacia adelante sube un momento la velocidad, hacia atrás pausa y busca (YouTube no reproduce al revés). Al soltar vuelve el estado anterior.

El micrófono de la barra (apagado por defecto) entra por Web Audio: tono (±12 semitonos), volumen y reverb. Si está prendido al grabar, se mezcla; no abre un segundo micrófono. Si se prende durante la toma, entra igual.

En escritorio (1024px y puntero fino) se puede mostrar la cámara, y cola, decks, mixer y cámara se arrastran y se redimensionan. El layout queda en `djtube-layout`. **Restablecer** está en la cuenta. `\` oculta la barra; el borde inferior la vuelve a mostrar. En el teléfono nada de esto: la grilla fija no se mueve.

Arrastra sobre la onda, ponle nombre y guarda el corte. En Highlights puedes buscar, hacer play o cue en A o B, borrar, exportar e importar JSON. **Audio** descarga el tramo en `.webm` solo si esa zona se capturó antes en este navegador. El sincronizador no guarda el clip: el audio va acelerado y no coincide con el reloj del tema.

**Grabar**, en la barra inferior, usa la captura de pantalla cuando el navegador la tiene. En Chrome de Android no hay `getDisplayMedia`: se graba el micrófono con un `mimeType` que `MediaRecorder.isTypeSupported` acepte (`video/mp4`, `audio/webm`, etc.). Si no hay nada que grabar, el botón queda deshabilitado.

La cola se puede vaciar: no saca los temas que están en A o en B. Deslizar una fila a izquierda o derecha (dedo o mouse) también la quita, con una salida corta y un aviso **deshacer**. Si el tema está en A o en B, la fila vuelve sola.

Admin se abre encima de la mezcla, sin desmontar los decks. El dueño ve un contador de pedidos pendientes en el icono (se consulta cada tanto). La campana de admin activa el push en ese teléfono. Quien está en espera puede activarla también. Un pedido nuevo avisa al dueño. Al aprobar, si esa persona se suscribió, también le llega un push, y un mail por Resend desde `DJTube <no-responder@lulox.com.ar>` (o `APPROVAL_FROM`). Si el mail falla, se anota en el log y la aprobación queda igual.

En el menú de cuenta: [Contacto](https://lulox.com.ar/contacto) y el [repo](https://github.com/luloxi/djtube). Se puede instalar como PWA (manifiesto + iconos + service worker). Un aviso ofrece instalar, cerrar, o no mostrar más.

Los cortes y el audio de un corte se quedan en este navegador. BPM, offset y picos se sincronizan a la cuenta. Para mezclar hay que entrar.

## Acceso

La portada, si no hay sesión, es solo **Entrar con Google**. Las URI de redirección del cliente OAuth son exactamente estas dos:

`https://djtube.lucianoolivabianco.workers.dev/api/auth/callback/google`

`https://dj.lulox.com.ar/api/auth/callback/google`

La segunda hay que agregarla en el proyecto de Google Cloud `luloxdev`. La sesión es por host.

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

En vivo: https://djtube.lucianoolivabianco.workers.dev y, cuando el dominio custom quede en la zona, https://dj.lulox.com.ar. `workers.dev` sigue.

Worker de Cloudflare `djtube`, assets estáticos del build de Vite.

```bash
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

Los secretos no van en el repo. D1 se llama `djtube` y el binding del worker es `DB`. El mail de aprobación es un `POST` a `https://api.resend.com/emails` con `Authorization: Bearer` y el secreto `RESEND_API_KEY`. El remitente es `DJTube <no-responder@lulox.com.ar>`, salvo que `APPROVAL_FROM` traiga otro. Si Resend falla, el log no incluye el secreto y la aprobación no se deshace.

Sin `YT_API_KEY`, la búsqueda muestra una nota y pegar un enlace sigue funcionando. La playlist no usa esa clave: un iframe oculto llama a `getPlaylist()` y los títulos salen de oEmbed (`/api/oembed`). Esas dos rutas exigen una sesión aprobada.

Por qué no partimos de otro mixer: [DECISIONS.md](DECISIONS.md). English: [README.en.md](README.en.md).

## Límites

- El sincronizador es Chrome o Edge, y hay que compartir su pestaña con audio una vez por sesión. `suppressLocalAudioPlayback` es lo que evita que el análisis suene. Firefox y Safari no lo implementan.
- La pestaña `/sync` tiene que seguir abierta. El audio de la captura mantiene el análisis fuera de foco. Si el navegador mata el video, se reanuda al volver o con Seguir.
- YouTube solo acepta las velocidades que expone el player. El análisis usa la más alta y corrige el BPM. La grilla es visual, no un keylock. No hay análisis de BPM del tema que está sonando en el deck.
- En un tema largo la onda es un panorama por tramos, no cada muestra. El BPM sale de una ventana continua (unos 30 s del tema).
- La playlist depende de `getPlaylist()` (públicas, como mucho 50 temas).
- El `.webm` de un highlight solo existe para un tramo capturado antes. El sincronizador nuevo no lo graba.
- No hay EQ. La cola y el audio de un corte siguen en este navegador. BPM, offset y picos también están en D1 para esa cuenta.
