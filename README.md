# DJTube

Dos videos de YouTube, un fader. Mezcla a oído: el crossfader no es una curva de potencia constante, en el centro suenan los dos al 100%.

DJTube abre directo en los dos decks y el mixer. No hay pantalla de modos, ni cortes, ni pads, ni hot cues, ni captura de audio. La primera vez aparece una introducción con el ícono de la app que sugiere conseguir tu propia clave de YouTube para tener más búsquedas (un botón abre la hoja «Clave de YouTube», el otro la cierra); queda descartada en `djtube-intro`.

La mezcla ocupa todo el viewport (`100dvh`), de borde a borde, sin título ni barra superior. Desde 1024px los decks van lado a lado: el panel izquierdo es Buscar, con la cola de temas debajo del cuadro de búsqueda (no hay botón ni encabezado de Cola). En DJ el volumen de A, el crossfader y el volumen de B son un solo bloque debajo de los decks. Abajo hay una barra de iconos: Buscar (en el móvil), cámara y voz (escritorio) y la cuenta.

En el móvil los dos decks van apilados, con fader y play a la vista, y una raya de color que separa A, B y el fader. Con el disco apagado la miniatura es 16:9; prendido, el video llena el círculo más grande del deck. Buscar es un botón grande al centro de la barra; abre la búsqueda con la cola debajo, a pantalla completa. En las filas, A y B van a izquierda y derecha con el color del deck. En horizontal, los decks vuelven a ir lado a lado.

## Mezclar

1. **Buscar** es la única entrada. Pega un enlace de video y va a la cola. Pega uno de playlist (`list=`, también `watch?v=…&list=…`, music.youtube.com y youtu.be) y un modal pregunta **Agregar toda la lista** o **Solo esta canción** (solo si el enlace trae un video); la X, un clic afuera o Escape lo cierran sin agregar nada. La lista entera se trae de a páginas, sin tope de 50 (`/api/playlist` usa la clave compartida de la Data API si hay cupo, y si no la continuación de YouTube), en orden, sin repetidos ni videos privados o no disponibles, con una barrita de carga y un aviso «N temas agregados». Un texto común busca con esa clave compartida, o con la clave propia de este navegador (ver más abajo). Al pie de la cola, **Guardar cola** ofrece **Descargar lista de links** (`djtube-cola-AAAA-MM-DD.txt`: título, enlace y línea en blanco por tema; es una lista de enlaces, no el audio) o **Guardar en YouTube** (ver más abajo).
2. Carga un tema en A y otro en B. También puedes arrastrar.
3. En escritorio, play, volver y la velocidad van en una sola fila debajo del disco. En el móvil (vertical y horizontal) los controles van al costado del disco, en dos columnas juntas y centradas verticalmente respecto al disco: a la izquierda play arriba y volver abajo; a la derecha + arriba, la velocidad en el medio y − abajo (botones de 44 px, con un hueco claro sobre la línea de tiempo). En el móvil, tocar la línea de tiempo no mueve la canción: hay que arrastrar de costado (con el mouse sigue buscando al apretar). El icono de visualización (onda neón rosa, disco/video) está arriba a la derecha del encabezado de cada deck, con tooltip al pasar el mouse o mantener pulsado; en el móvil se oculta mientras la cola o la búsqueda están abiertas. No queda un botón suelto. No hay TAP, ni BPM, ni icono de sincronizar o de analizar en esa fila. Volver pausa y busca el inicio (0:00). El video no tiene fullscreen (`fs: 0`).
4. El fader del centro es el control grande: izquierda solo A, centro ambos, derecha solo B. A su lado están los volúmenes, en vertical. El número sobre el fader ya es la mezcla de los dos. Se arrastra.
5. **Auto** (junto al fader) desliza A↔B. Por defecto dura 3 s; los segundos se arrastran.
6. Cada deck tiene un solo − a la izquierda del número de velocidad y un solo + a la derecha, en cualquier ancho. No hay botones « » al lado. Un clic en el número abre una grilla compacta con todas las velocidades que permite YouTube, siempre dentro de la pantalla y sin scroll; tocar una la aplica y se cierra (también con un toque afuera o Escape). No se cambia deslizando; − y + y las flechas del teclado siguen. Arrastrar el disco busca.
7. Los botones no tienen fondo: cada icono es neón según su rol (play verde, volver violeta, velocidad naranja, visualización rosa). Brillan un poco en reposo y más al pasar el mouse, enfocar o prender; nunca se ponen negros ni grises.
8. **La onda** de cada deck no se puede seleccionar como texto. Apretar y arrastrar sobre ella explora el tema: mientras el deck suena se oye a saltos donde estás (como rebobinar o avanzar rápido) y se calla si dejas quieto el dedo; si estaba en pausa, busca en silencio. Al soltar, el cursor queda donde soltaste y el tema sigue desde ahí (o sigue en pausa). Funciona con mouse y con touch. Marcar un corte es **Shift + arrastrar** sobre la onda (en escritorio).
9. Los títulos de YouTube se muestran como texto: `&#39;`, `&amp;` y demás entidades se decodifican (sin `innerHTML`), también en la cola ya guardada.
10. Al cargar un tema, el deck lo precarga (play mudo, pausa en 0) para que el arranque salga más a tiempo.

Atajos: `espacio` play/pausa de ambos, `Q` deck A, `W` deck B, `←` `→` el fader, `shift` salta más. No actúan si estás escribiendo en un campo.

## Reproductor

El audio y el video de YouTube no se capturan, no se graban y no se descargan. Suena solo el reproductor oficial embebido. No hay pestaña `/sync`.

No hay BPM, ni TAP, ni «entrar en beat», ni grilla: se mezcla de oído. YouTube solo tiene velocidades discretas. Los avisos son un toast corto.

En DJ, el video se dibuja dentro de un disco redondo: el círculo más grande que entra en el deck, centrado, en cualquier ancho. Gira mientras ese deck suena (33⅓) y se queda quieto en pausa. Empieza prendido. Una preferencia vieja de disco apagado se tira una sola vez (`djtube-disc-v2`); después, si se apaga, queda en `djtube-disc-A` o `djtube-disc-B` en `0`. Arrastrar busca: hacia adelante sube un momento la velocidad, hacia atrás pausa y busca (YouTube no reproduce al revés). Al soltar vuelve el estado anterior. El video tapa el círculo entero (sin bandas negras) y los controles quedan pegados y compactos debajo.

El micrófono de la barra (solo en escritorio; no aparece en celulares ni tablets; apagado por defecto) entra por Web Audio: tono (±12 semitonos), volumen y reverb. Es el micrófono de quien mezcla, no el audio de YouTube.

En escritorio (1024px y puntero fino) la cola, los dos decks y el mixer son una sola grilla. Arrastrar un borde reparte el lugar: la cola más ancha achica los dos decks, un deck más ancho achica al otro, el mixer más alto achica la fila de decks. Nada se sale de la mesa ni se pisa. Al cambiar el tamaño de la ventana, lo guardado se vuelve a encajar, también si venía de un layout viejo más grande que la pantalla. La cámara, si está prendida, flota encima y también queda dentro de la mesa. El layout queda en `djtube-layout`. **Restablecer** está en la cuenta. La barra de abajo no se esconde. En el teléfono la grilla fija no se mueve.

No hay botón de vaciar la cola. Deslizar una fila a izquierda o derecha (dedo o mouse) también la quita, con una salida corta y un aviso **deshacer**. Si el tema está en A o en B, la fila vuelve sola.

Admin se abre encima de la mezcla, sin desmontar los decks. El dueño ve un contador de pedidos de uso sin límite en el icono (se consulta cada tanto). La campana, en el menú de quien ya entró, activa el push en ese teléfono. Un pedido nuevo avisa al dueño. Al marcarlo sin límite, si esa persona se suscribió, también le llega un push, y un mail por Resend desde `DJTube <no-responder@lulox.com.ar>` (o `APPROVAL_FROM`). Si el mail falla, se anota en el log y el cambio queda igual.

En el menú de cuenta: [Contacto](https://lulox.com.ar/contacto) y el [repo](https://github.com/luloxi/djtube). Se puede instalar como PWA (manifiesto + iconos + service worker). El icono es un círculo naranja con dos puntos azules de ojos y un triángulo de play azul de boca (`public/djtube.svg`, el mismo del portfolio): 192, 512 y uno maskable sobre naranja liso con margen. La cara está centrada en vertical (mismo margen arriba y abajo del disco); `node scripts/make-icons.mjs` regenera los PNG. En Android, si la app ya estaba instalada, hay que reinstalarla para ver el icono nuevo. Un aviso ofrece instalar, cerrar, o no mostrar más.

La cola se queda en este navegador. Para mezclar no hace falta entrar.

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

Se abre desde **Conseguir clave** en la introducción, desde **Clave de YouTube** en el menú de usuario (con o sin sesión) y desde el aviso «Usá tu propia clave» de Buscar: es la misma hoja en los tres lugares (se cierra con la X, un clic afuera o Escape; scrollea y nunca es más grande que la pantalla). Trae una guía paso a paso en acordeón (se abre un paso a la vez; tocar el abierto lo cierra; con teclado Enter/Espacio y `aria-expanded`) y enlaces que abren en pestaña nueva. La clave de YouTube Data API v3 queda solo en este navegador (`localStorage`, `djtube-yt-key`). Con ella puesta, búsqueda y páginas de playlist van directo a `googleapis.com`. No se envía al servidor de DJTube y no se escribe en un log.

**Necesitás una clave de API (API key), NO un ID de cliente OAuth.**

1. **Entrá a Google Cloud.** Abrí [Google Cloud Console](https://console.cloud.google.com/) con tu cuenta de Google (una de Gmail sirve) y aceptá los términos si te los pide.
2. **Creá un proyecto nuevo.** Arriba, al lado del logo «Google Cloud», tocá el selector de proyectos, «Proyecto nuevo» (New project), nombre `DJTube`, «Crear» (Create). Después elegí DJTube en el selector. Atajo: [crear proyecto](https://console.cloud.google.com/projectcreate).
3. **Habilitá YouTube Data API v3.** Abrí [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com) con DJTube seleccionado y tocá «Habilitar» (Enable). Si dice «Administrar», ya estaba.
4. **Creá la clave de API.** En [Credenciales](https://console.cloud.google.com/apis/credentials): «+ Crear credenciales» (Create credentials), «Clave de API» (API key). No elijas «ID de cliente de OAuth»: si te pide configurar la pantalla de consentimiento, elegiste mal.
5. **Restringila a YouTube (recomendado).** En «Restricciones de la API» elegí «Restringir clave», marcá «YouTube Data API v3» y «Aceptar» (Google suele exigirlo). Opcional: en «Restricciones de la aplicación», «Sitios web», agregá `https://dj.lulox.com.ar/*`. Después «Crear».
6. **Copiá la clave** (empieza con `AIza`). Si cerraste el cuadro: Credenciales, el nombre de la clave, «Mostrar clave».
7. **Pegala en la hoja y tocá Guardar.**

La hoja tiene **Guardar**, **Probar** (una llamada barata, `videos.list`, 1 unidad, directo del navegador a Google; muestra si anda o la causa: clave no válida o ID de OAuth, API sin habilitar, clave limitada a otros sitios o a otras APIs, cuota agotada, sin conexión) y **Borrar clave**.

Es gratis y no hace falta tarjeta. Por defecto Google da unas 100 búsquedas por día por proyecto (cada una cuesta 100 de las 10.000 unidades diarias); se renueva a medianoche, hora del Pacífico.

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

- No se separa, guarda ni descarga el audio o el video de YouTube. La onda es solo una guía de posición, no el audio del tema.
- YouTube solo acepta las velocidades que expone el player.
- La playlist pública se recorre de a páginas (Data API o la continuación de YouTube). No hay tope de 50 en la cola.
- Sí se puede bajar un `.txt` con los enlaces de la cola.
- No hay EQ. La cola queda en este navegador.
- La clave compartida tiene tope diario (20 anónimo, 50 con sesión). La caché no cuenta.

## Guardar en YouTube

**Guardar en YouTube** pide el permiso `https://www.googleapis.com/auth/youtube` recién cuando se elige esa opción (Better Auth `linkSocial` con un scope extra; el ingreso normal no cambia). Los tokens quedan en el Worker. Hace falta, en el proyecto de Google Cloud del cliente OAuth de DJTube: **YouTube Data API v3** habilitada y el scope agregado en **Google Auth Platform → Acceso a los datos** (con la app en Prueba, la cuenta tiene que ser usuario de prueba). Cada alta cuesta 50 unidades de cuota (unos 200 temas por día con las 10 000 de base). Sin eso, la hoja igual ofrece los enlaces `watch_videos`.

## Navegación en neón

En pantallas táctiles el botón de Cola o Buscar brilla solo mientras su panel está abierto: al cerrarlo vuelve a su brillo tenue (un toque ya no deja el `:hover` ni el foco pegados). 

El ícono de la app (círculo naranja) aparece grande en la introducción de la primera visita. Los botones de navegación no tienen fondo y son un neón propio, distinto del deck A (verde azulado) y del B (ámbar): Buscar rojo. Activo, se enciende con un brillo fuerte; inactivo, queda atenuado con un brillo leve.

## Menú de usuario

La barra de abajo ya no tiene la llave, la campana ni el escudo de admin: todo eso vive en el menú del botón de cuenta, tanto en móvil como en escritorio. Ahí están Entrar, Clave de YouTube (se guarda solo en este navegador, `djtube-yt-key`; sirve también sin haber entrado), Avisos (push, se enciende en verde neón), Admin (solo el dueño, con el contador de pedidos), Contacto, Código, Restablecer y Salir. El panel de admin ya no trae su propia campana.

Cuando alguien nuevo entra o hay más pedidos de uso sin límite que la última vez que se abrió Admin, el botón de cuenta y la fila Admin se encienden en magenta neón hasta que el dueño abre el panel. Se compara con una marca guardada en este navegador (`djtube-admin-seen`: la última primera visita vista y la cantidad de pedidos), contra los datos que ya devuelve `/api/admin/people` (`firstSeen`, `status`); no hay tabla nueva en el servidor. Se consulta cada 20 s y la primera vez no enciende nada. Como la marca es local, otro navegador del dueño tiene su propio aviso.

## Cola y Buscar

Hay dos botones de navegación neón: **Cola** (azul) y **Buscar** (rojo). Cada uno muestra su vista; el activo se enciende con su color y nunca usa los tonos de A y B. En el móvil, tocar el activo cierra el panel; en escritorio el panel izquierdo siempre muestra uno de los dos. Agregar un tema desde Buscar vuelve a la Cola.

Debajo de la última canción de la Cola hay una fila con tres iconos (solo tooltip): **Subir lista** (verde), **Guardar cola** (naranja) y **Vaciar cola** (rojo, pide confirmar). Subir lee un `.txt` (hasta 1 MB y 2000 temas) como el que baja Guardar cola, o cualquier texto con enlaces de YouTube; el título es la línea justo arriba del enlace. Suma al final solo los temas que no estaban, sin repetir; un archivo sin ningún enlace de video, binario o demasiado grande se rechaza con un aviso y no toca la cola. Todo es local: el archivo se lee en el navegador y no se sube a ningún servidor, así que las listas quedan privadas como texto.

Buscar tiene dos iconos para elegir qué buscar: **Videos** (verde) o **Playlists** (azul); cambiar de uno al otro limpia los resultados. Las playlists salen con portada, título y canal, y el **+** las agrega enteras a la Cola con el mismo recorrido de siempre (`/api/playlist` o tu clave propia, por páginas, sin repetidos). Usa `search.list` con `type=video` o `type=playlist` (100 unidades de cuota cada búsqueda, con la misma clave compartida, límite diario y caché de 24 horas; las playlists tienen el suyo) o tu clave propia directo desde el navegador.


## Play y cortes de reproducción

Un solo toque en play siempre arranca: si el reproductor todavía no está listo, el toque queda anotado y se aplica apenas lo esté; si el track recién cargado está en su precarga muteada, el toque la cancela en vez de que el pause final lo deshaga (antes había que apretar dos veces).

Mientras un deck tiene que estar sonando, un vigilante mira cada medio segundo que la posición avance. Si queda clavado (buffering, video congelado, `UNSTARTED`) o YouTube da un error recuperable (2, 5, …), recarga el mismo video con `loadVideoById` en la última posición y sigue, con reintentos cada vez más espaciados (4, 6, 9 y 13 s). Si el reproductor o su iframe desaparecieron, crea uno nuevo y retoma en la misma posición. Mientras reconecta, el botón de play pulsa en neón (tooltip «Reconectando…»); si se agotan los intentos aparece el aviso «No se pudo reconectar» y un toque en play vuelve a intentarlo. Un play sobre un reproductor trabado también lo recarga en la última posición en vez de pausarlo. Los errores 100, 101 y 150 (video no disponible) no se reintentan.

## Buscar: Enter, cuenta regresiva y switch

**Enter** y el botón **Buscar** solo buscan, nunca agregan nada. Si dejás de escribir, la búsqueda corre sola a los 3 segundos (con 2 o más letras y un texto distinto del último buscado): una barrita neón roja bajo el campo se achica durante esos 3 s, sin números, y se reinicia con cada tecla; Enter o el botón la cancelan. El mismo texto y tipo no se vuelve a pedir (se mantiene la caché de 24 h). A la derecha del botón está el switch **Videos | Playlists**, una píldora neón que se desliza entre las dos opciones; cambiarlo vuelve a buscar si hay texto. Los resultados se agregan solo con **A** o **B**: en un video, A/B lo carga en ese deck y lo deja en la cola; en una playlist hay tres botones: **+** (cian, «Agregar todo a la cola») agrega todos sus temas a la Cola sin cargar ningún deck y avisa «N temas agregados» (o «Ya estaban en la cola»; no duplica), y **A**/**B** cargan el primer tema en ese deck (aunque ya esté en la Cola) y mandan el resto a la Cola. Pegar o escribir un enlace de YouTube sigue agregándolo (con Enter o al pegar), porque eso no es una búsqueda. El campo de la clave propia dice «Clave API».

**Deslizar para abrir (móvil, touch).** Desde el borde izquierdo hacia la derecha se abre la Cola; desde el borde derecho hacia la izquierda, Buscar. Para cerrar, deslizá de vuelta (o desde el borde opuesto, o desde un lugar sin filas dentro del panel). Mientras el dedo está abajo el panel y los decks giran en perspectiva como las caras de un cubo y al soltar se acomodan solos (un empujón rápido también alcanza). Solo se animan `transform` y `opacity`, con un `requestAnimationFrame` por cuadro y `will-change` únicamente mientras dura el gesto; en reposo no corre nada. Con `prefers-reduced-motion` es un deslizamiento simple. No pisa el deslizar-para-quitar de las filas (esas arrancan lejos de los bordes), ni la línea de tiempo, el disco, los faders ni el crossfader; los botones Cola y Buscar siguen igual. Los botones se apagan al cerrar el panel. `touch-action: pan-y` evita que el gesto de volver atrás del navegador se coma el deslizamiento del borde (los gestos de sistema de Android pueden seguir ganando en los primeros píxeles).
