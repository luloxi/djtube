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

Todo se queda en este navegador. No hay cuenta.

## Desarrollo

```bash
pnpm install
pnpm test
pnpm build
pnpm dev
```

## Deploy

Worker de Cloudflare `djtube`, assets estáticos del build de Vite.

```bash
pnpm build
pnpm exec wrangler deploy
pnpm exec wrangler secret put YT_API_KEY   # lo pone Luciano; no va en el repo
```

Sin `YT_API_KEY`, la búsqueda muestra una nota y pegar un enlace sigue funcionando. La playlist no usa esa clave: un iframe oculto llama a `getPlaylist()` y los títulos salen de oEmbed (`/api/oembed`).

Por qué no partimos de otro mixer: [DECISIONS.md](DECISIONS.md). English: [README.en.md](README.en.md).

## Límites

- Hay que compartir el audio de la pestaña una vez por tema para la onda, el BPM y el clip. Chrome o Edge van mejor que Firefox.
- YouTube solo acepta las velocidades que expone el player. El sync es una sugerencia, no un beatgrid ni un keylock.
- La playlist depende de `getPlaylist()` (públicas, como mucho 50 temas).
- El `.webm` de un highlight solo existe para el tramo grabado en el último Analizar.
- No hay EQ, ni login, ni nube.
