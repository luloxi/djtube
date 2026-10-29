# DJTube

Dos videos de YouTube, un fader. Mezcla a oído: el crossfader no es una curva de potencia constante, en el centro suenan los dos al 100%.

La primera vez pregunta **Preparar** o **DJ**. No conviven. Preparar es la lista de cortes. No hay pads, ni hot cues, ni captura de audio. DJ es los dos decks y el mixer. La elección queda en `djtube-mode` y se cambia desde la barra de abajo. Si algo está sonando, ir a Preparar pide confirmación porque corta la música.

La mezcla ocupa todo el viewport (`100dvh`), de borde a borde, sin título ni barra superior. Desde 1024px los decks van lado a lado: cola y búsqueda comparten el panel izquierdo y se alternan con iconos (no van apiladas). En DJ el volumen de A, el crossfader y el volumen de B son un solo bloque debajo de los decks. Abajo hay una barra de iconos: modo, clave de YouTube, admin (solo el dueño) y la cuenta.

En el móvil los dos decks van apilados, con fader y play a la vista, y una raya de color que separa A, B y el fader. Con el disco apagado la miniatura es 16:9; prendido, el video llena el círculo más grande del deck. Cola y búsqueda son dos botones grandes al centro de la barra; cortes a un lado. En las filas, A y B van a izquierda y derecha con el color del deck. Si la pantalla es alta, un recorte de la cola queda a la vista. En horizontal, los decks vuelven a ir lado a lado.

## Mezclar

1. **Buscar** es la única entrada. Pega un enlace de video y va a la cola. Pega uno de playlist (`list=`, también `watch?v=…&list=…`, music.youtube.com y youtu.be) y un modal pregunta **Agregar toda la lista** o **Solo esta canción** (solo si el enlace trae un video); la X, un clic afuera o Escape lo cierran sin agregar nada. La lista entera se trae de a páginas, sin tope de 50 (`/api/playlist` usa la clave compartida de la Data API si hay cupo, y si no la continuación de YouTube), en orden, sin repetidos ni videos privados o no disponibles, con una barrita de carga y un aviso «N temas agregados». Un texto común busca con esa clave compartida, o con la clave propia de este navegador (ver más abajo). Al pie de la cola, **Guardar cola** ofrece **Descargar lista de links** (`djtube-cola-AAAA-MM-DD.txt`: título, enlace y línea en blanco por tema; es una lista de enlaces, no el audio) o **Guardar en YouTube** (ver más abajo).
2. Carga un tema en A y otro en B. También puedes arrastrar.
3. En escritorio y en el móvil horizontal, play, volver y la velocidad van en una sola fila, todos del mismo alto. En el móvil vertical (también ~360 y ~412 de ancho) son exactamente dos filas del mismo tamaño: play y volver; debajo, − velocidad +. El icono de visualización (onda neón rosa, disco/video) está arriba a la derecha del encabezado de cada deck, con tooltip al pasar el mouse o mantener pulsado; en el móvil se oculta mientras la cola o la búsqueda están abiertas. No queda un botón suelto. No hay TAP, ni BPM, ni icono de sincronizar o de analizar en esa fila. Volver pausa y busca el inicio (0:00). El video no tiene fullscreen (`fs: 0`).
4. El fader del centro es el control grande: izquierda solo A, centro ambos, derecha solo B. A su lado están los volúmenes, en vertical. El número sobre el fader ya es la mezcla de los dos. Se arrastra.
5. **Auto** (junto al fader) desliza A↔B. Por defecto dura 3 s; los segundos se arrastran.
6. Cada deck tiene un solo − a la izquierda del número de velocidad y un solo + a la derecha, en cualquier ancho. No hay botones « » al lado. Un clic en el número abre una grilla compacta con todas las velocidades que permite YouTube, siempre dentro de la pantalla y sin scroll; tocar una la aplica y se cierra (también con un toque afuera o Escape). No se cambia deslizando; − y + y las flechas del teclado siguen. Arrastrar el disco busca.
7. Los botones no tienen fondo: cada icono es neón según su rol (play verde, volver violeta, velocidad naranja, visualización rosa). Brillan un poco en reposo y más al pasar el mouse, enfocar o prender; nunca se ponen negros ni grises.
8. **La onda** de cada deck no se puede seleccionar como texto. Apretar y arrastrar sobre ella explora el tema: mientras el deck suena se oye a saltos donde estás (como rebobinar o avanzar rápido) y se calla si dejas quieto el dedo; si estaba en pausa, busca en silencio. Al soltar, el cursor queda donde soltaste y el tema sigue desde ahí (o sigue en pausa). Funciona con mouse y con touch. Marcar un corte es **Shift + arrastrar** sobre la onda (en escritorio).
9. Los títulos de YouTube se muestran como texto: `&#39;`, `&amp;` y demás entidades se decodifican (sin `innerHTML`), también en la cola ya guardada.
10. Al cargar un tema, el deck lo precarga (play mudo, pausa en 0) para que el arranque salga más a tiempo.

Atajos: `espacio` play/pausa de ambos, `Q` deck A, `W` deck B, `←` `→` el fader, `shift` salta más. No actúan si estás escribiendo en un campo.

## Cortes

El audio y el video de YouTube no se capturan, no se graban y no se descargan. Suena solo el reproductor oficial embebido. Preparar es la lista de cortes (nombre y tiempos). No hay pestaña `/sync`.

No hay BPM, ni TAP, ni «entrar en beat», ni grilla: se mezcla de oído. YouTube solo tiene velocidades discretas. Los avisos son un toast corto.

En DJ, el video se dibuja dentro de un disco redondo: el círculo más grande que entra en el deck, centrado, en cualquier ancho. Gira mientras ese deck suena (33⅓) y se queda quieto en pausa. Empieza prendido. Una preferencia vieja de disco apagado se tira una sola vez (`djtube-disc-v2`); después, si se apaga, queda en `djtube-disc-A` o `djtube-disc-B` en `0`. Arrastrar busca: hacia adelante sube un momento la velocidad, hacia atrás pausa y busca (YouTube no reproduce al revés). Al soltar vuelve el estado anterior. El video tapa el círculo entero (sin bandas negras) y los controles quedan pegados y compactos debajo.

El micrófono de la barra (solo en escritorio; no aparece en celulares ni tablets; apagado por defecto) entra por Web Audio: tono (±12 semitonos), volumen y reverb. Es el micrófono de quien mezcla, no el audio de YouTube.

En escritorio (1024px y puntero fino) la cola, los dos decks y el mixer son una sola grilla. Arrastrar un borde reparte el lugar: la cola más ancha achica los dos decks, un deck más ancho achica al otro, el mixer más alto achica la fila de decks. Nada se sale de la mesa ni se pisa. Al cambiar el tamaño de la ventana, lo guardado se vuelve a encajar, también si venía de un layout viejo más grande que la pantalla. La cámara, si está prendida, flota encima y también queda dentro de la mesa. El layout queda en `djtube-layout`. **Restablecer** está en la cuenta. La barra de abajo no se esconde. En el teléfono la grilla fija no se mueve.

Los cortes se hacen solo en Preparar (modo edición), nunca en DJ (producción): la onda de los decks solo explora el tema, no selecciona ni guarda. En la lista de Cortes puedes buscar, renombrar, reabrir para ajustar, borrar, exportar e importar JSON. No se descarga el audio del corte.

La cola se puede vaciar: no saca los temas que están en A o en B. Deslizar una fila a izquierda o derecha (dedo o mouse) también la quita, con una salida corta y un aviso **deshacer**. Si el tema está en A o en B, la fila vuelve sola.

Admin se abre encima de la mezcla, sin desmontar los decks. El dueño ve un contador de pedidos de uso sin límite en el icono (se consulta cada tanto). La campana, en el menú de quien ya entró, activa el push en ese teléfono. Un pedido nuevo avisa al dueño. Al marcarlo sin límite, si esa persona se suscribió, también le llega un push, y un mail por Resend desde `DJTube <no-responder@lulox.com.ar>` (o `APPROVAL_FROM`). Si el mail falla, se anota en el log y el cambio queda igual.

En el menú de cuenta: [Contacto](https://lulox.com.ar/contacto) y el [repo](https://github.com/luloxi/djtube). Se puede instalar como PWA (manifiesto + iconos + service worker). El icono es un círculo naranja con dos puntos azules de ojos y un triángulo de play azul de boca (`public/djtube.svg`, el mismo del portfolio): 192, 512 y uno maskable sobre naranja liso con margen. La cara está centrada en vertical (mismo margen arriba y abajo del disco); `node scripts/make-icons.mjs` regenera los PNG. En Android, si la app ya estaba instalada, hay que reinstalarla para ver el icono nuevo. Un aviso ofrece instalar, cerrar, o no mostrar más.

Los cortes se quedan en este navegador. Para mezclar no hace falta entrar.

## Acceso

La mezcla está abierta. No hay que pedir permiso para usarla. Entrar con Google es opcional: sirve para el tope de búsquedas más alto y para pedir uso sin límite. Las URI de redirección del cliente OAuth son exactamente estas dos:

`https://djtube.lucianoolivabianco.workers.dev/api/auth/callback/google`

`https://dj.lulox.com.ar/api/auth/callback/google`

La segunda hay que agregarla en el proyecto de Google Cloud `luloxdev`. La sesión es por host.

`lucianoolivabianco@gmail.com` es el dueño y no tiene tope de búsqueda. Cualquier otra cuenta puede pedir **Uso sin límite** desde el menú (un botón; entrar no crea el pedido solo). Queda registrada (email, nombre, avatar, primera vez, última vez, cantidad de visitas) como `pending` hasta que Luciano la marca. En `/admin` el dueño da uso sin límite, revoca o bloquea, y puede buscar. Revocar vuelve a poner el tope. Bloquear impide pedir de nuevo y muestra «Bloqueado».

Si faltan `GOOGLE_CLIENT_ID` o `GOOGLE_CLIENT_SECRET` (o el secreto de Better Auth, o D1), el botón de entrar dice «Login en configuración». La mezcla sigue abierta. `/admin` sigue siendo solo del dueño.

## Búsqueda y cupo

La clave compartida vive solo en el secreto del Worker `YT_API_KEY`. No va en el cliente ni en `wrangler.jsonc`. Cada búsqueda que de verdad llama a YouTube con esa clave cuenta. Una respuesta ya guardada no cuenta.

- Anónimo (hash de la IP, nunca la IP cruda): 20 por día UTC.
- Con sesión y sin aprobar: 50 por día UTC.
- Dueño y cuentas marcadas sin límite: sin tope.
- Búsqueda en caché 24 h (consulta normalizada). Página de playlist en caché 6 h.

Si se acaba el cupo de la persona o el de la clave compartida, la app lo dice y ofrece **Usá tu propia clave**. Pegar un enlace sigue funcionando. La playlist, si la clave no se puede usar, prueba la continuación de YouTube (eso no gasta la clave). Los títulos de un video suelto salen de oEmbed (`/api/oembed`). Esas rutas no piden aprobación.

## Usá tu propia clave

El icono de la llave abre una hoja (se cierra con la X, un clic afuera o Escape). La clave de YouTube Data API v3 queda solo en este navegador (`localStorage`, `djtube-yt-key`). Con ella puesta, búsqueda y páginas de playlist van directo a `googleapis.com`. No se envía al servidor de DJTube y no se escribe en un log. Hay un botón para quitarla.

1. Creá un proyecto en [Google Cloud](https://console.cloud.google.com/projectcreate).
2. Activá [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com).
3. Creá una clave en [Credenciales](https://console.cloud.google.com/apis/credentials).
4. Restringila a YouTube Data API v3 y al referrer HTTP `https://dj.lulox.com.ar/*`.
5. Pegala en la hoja.

Es gratis. La cuota diaria es tuya: 10.000 unidades. Cada búsqueda cuesta 100.

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

Sin `YT_API_KEY`, la búsqueda muestra una nota y ofrece la clave propia. Pegar un enlace sigue funcionando. La playlist cae a la continuación de YouTube y los títulos de un video suelto salen de oEmbed (`/api/oembed`). Ninguna de esas rutas exige aprobación.

Por qué no partimos de otro mixer: [DECISIONS.md](DECISIONS.md). English: [README.en.md](README.en.md).

## Rate limit

Cada IP tiene un tope por ráfaga en `/api/*` (Workers Rate Limiting, gratis, por ubicación de Cloudflare, aproximado): 60 pedidos / 10 s en general, 12 / 10 s en búsqueda y playlists (`/api/search`, `/api/playlist`, `/api/youtube/playlist`) y 150 / 10 s en títulos (`/api/oembed`). Pasado el tope, el Worker responde `429` con `Retry-After: 10` antes de tocar la base o YouTube. El dueño y las cuentas marcadas **Sin límite** en admin no se cortan: solo cuando se pasa el tope se mira la sesión (máx. 5 consultas / 10 s por IP). Los archivos estáticos no pasan por el Worker. Los contadores están en `wrangler.jsonc` (`ratelimits`) y la lógica en `worker/ratelimit.ts`.

## Límites

- No se separa, guarda ni descarga el audio o el video de YouTube. La onda es una guía para marcar un corte, no el audio del tema.
- YouTube solo acepta las velocidades que expone el player.
- La playlist pública se recorre de a páginas (Data API o la continuación de YouTube). No hay tope de 50 en la cola.
- No hay archivo de audio de un corte. Sí se puede bajar un `.txt` con los enlaces de la cola.
- No hay EQ. La cola y los cortes quedan en este navegador.
- La clave compartida tiene tope diario (20 anónimo, 50 con sesión). La caché no cuenta.

## Guardar en YouTube

**Guardar en YouTube** pide el permiso `https://www.googleapis.com/auth/youtube` recién cuando se elige esa opción (Better Auth `linkSocial` con un scope extra; el ingreso normal no cambia). Los tokens quedan en el Worker. Hace falta, en el proyecto de Google Cloud del cliente OAuth de DJTube: **YouTube Data API v3** habilitada y el scope agregado en **Google Auth Platform → Acceso a los datos** (con la app en Prueba, la cuenta tiene que ser usuario de prueba). Cada alta cuesta 50 unidades de cuota (unos 200 temas por día con las 10 000 de base). Sin eso, la hoja igual ofrece los enlaces `watch_videos`.

## Navegación en neón

El ícono de la app (círculo naranja) aparece en la primera pantalla, donde se elige entre Preparar y DJ, y al comienzo de la barra de abajo. Los botones de navegación no tienen fondo: cada uno es un neón propio y ninguno comparte tono con el deck A (verde azulado) ni con el B (ámbar): Cola azul, Buscar rojo, Preparar amarillo, DJ cian. El que está activo se enciende con su color y un brillo fuerte; los demás quedan atenuados con un brillo leve.

## Cortar (Preparar)

En Preparar elegís la canción: pegás un enlace o buscás, o tocás una de la cola. Se abre un editor a pantalla completa que reparte la canción en filas de 10 s, como líneas de texto, con una marca por segundo y el tiempo al comienzo de cada fila. Arrastrá (mouse o dedo) de un punto a otro, aunque pase por varias filas, para marcar el corte; cerca de los bordes de la pantalla se desplaza solo. Los dos extremos se ajustan arrastrando sus puntas. Un toque sin arrastrar mueve el cabezal. El botón de play escucha solo la selección y se frena al llegar al final. Se guarda con un nombre propio (si queda vacío se usa «canción m:ss»). En la lista de Cortes, el lápiz renombra en el lugar (Enter guarda, Esc cancela) y las tijeras reabren el corte para ajustarlo. Los cortes viven en este navegador (IndexedDB) y se exportan o importan en JSON.

La señal de audio de YouTube no se puede leer desde la página, así que las filas muestran tiempo y no una onda real.

