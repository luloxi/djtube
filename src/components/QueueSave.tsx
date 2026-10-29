import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Track } from '../types';
import { linkYouTubeScope } from '../lib/auth-client';
import { downloadBlob } from '../lib/download';
import { IMPORT_MAX_BYTES, parseQueueText, playlistTitle, queueLinksFilename, queueLinksText, watchVideosUrls } from '../lib/queue-export';
import { saveQueueToYouTube, youtubeScopeGranted, type SaveQueueResult } from '../lib/youtube-playlist';
import { Icon } from './icons';

const PENDING_KEY = 'djtube-ytpl';

type Step = 'menu' | 'youtube';

export function QueueSave({
  tracks,
  onImport,
  onClear,
  onStatus,
}: {
  tracks: Track[];
  onImport: (items: Array<{ videoId: string; title: string }>) => void;
  onClear: () => void;
  onStatus: (message: string) => void;
}) {
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('menu');
  const [title, setTitle] = useState(() => playlistTitle());
  const [progress, setProgress] = useState('');
  const [note, setNote] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const resumeOnce = useRef(false);

  function close() {
    setOpen(false);
    setStep('menu');
    setNote('');
    setLink('');
    setProgress('');
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy]);

  async function runCreate(name: string, ids: string[], allowConsent: boolean) {
    setBusy(true);
    setNote('');
    setLink('');
    setProgress(`0/${ids.length}`);
    try {
      if (allowConsent && !(await youtubeScopeGranted())) {
        sessionStorage.setItem(PENDING_KEY, JSON.stringify({ title: name, ids }));
        const linked = await linkYouTubeScope();
        if (linked === 'redirect') return;
        sessionStorage.removeItem(PENDING_KEY);
        setNote('Google todavía no deja crear la lista desde acá.');
        setBusy(false);
        return;
      }
      const result: SaveQueueResult = await saveQueueToYouTube({
        title: name,
        videoIds: ids,
        onProgress: (done, total) => setProgress(`${done}/${total}`),
      });
      if (result.url) setLink(result.url);
      setProgress(`${result.added}/${result.total}`);
      if (result.ok) {
        setNote('Lista privada creada.');
      } else if (result.reason === 'consent' && allowConsent) {
        sessionStorage.setItem(PENDING_KEY, JSON.stringify({ title: name, ids }));
        const linked = await linkYouTubeScope();
        if (linked === 'redirect') return;
        sessionStorage.removeItem(PENDING_KEY);
        setNote('Google todavía no deja crear la lista desde acá.');
      } else if (result.reason === 'quota') {
        setNote(result.added ? 'Se cortó por la cuota. Quedó lo que entró.' : 'Se cortó por la cuota de YouTube.');
      } else if (result.reason === 'forbidden') {
        setNote('La API de YouTube no está habilitada en el proyecto.');
      } else if (result.added) {
        setNote('Se cortó. Quedó lo que entró.');
      } else {
        setNote('No se pudo crear la lista.');
      }
    } catch {
      setNote('No se pudo crear la lista.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (resumeOnce.current) return;
    const params = new URLSearchParams(window.location.search);
    const flag = params.get('ytpl');
    if (!flag) return;
    resumeOnce.current = true;
    params.delete('ytpl');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    const raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    setOpen(true);
    setStep('youtube');
    if (flag !== 'ok') {
      setNote('Google no autorizó el permiso. Podés abrir la cola en YouTube y guardarla desde ahí.');
      return;
    }
    let pending: { title?: string; ids?: string[] } | null = null;
    try {
      pending = raw ? (JSON.parse(raw) as { title?: string; ids?: string[] }) : null;
    } catch {
      pending = null;
    }
    const ids = pending?.ids?.filter((id) => typeof id === 'string') ?? [];
    const name = pending?.title?.trim() || playlistTitle();
    setTitle(name);
    if (!ids.length) {
      setNote('No quedó una cola para guardar.');
      return;
    }
    void runCreate(name, ids, false);
  }, []);

  function download() {
    const blob = new Blob([queueLinksText(tracks)], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, queueLinksFilename());
    close();
  }

  function readFile(file: File) {
    if (file.size > IMPORT_MAX_BYTES) {
      onStatus('Archivo muy grande');
      return;
    }
    file
      .text()
      .then((text) => {
        const items = parseQueueText(text);
        if (!items) onStatus('Archivo no válido');
        else onImport(items);
      })
      .catch(() => onStatus('No se leyó'));
  }

  function openYouTube() {
    setTitle(playlistTitle());
    setNote('');
    setLink('');
    setProgress('');
    setStep('youtube');
  }

  const ids = tracks.map((track) => track.videoId);
  const chunks = watchVideosUrls(ids);
  const sheet = open
    ? createPortal(
        <div className="sheet-overlay">
          <button type="button" className="sheet-backdrop" aria-label="Cerrar" onClick={close} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Guardar cola" data-testid="queue-save-sheet">
            <div className="sheet-head">
              <button type="button" className="icon-button" aria-label="Cerrar" title="Cerrar" onClick={close}>
                <Icon name="x" />
              </button>
            </div>
            {step === 'menu' ? (
              <>
                <button type="button" className="choice" onClick={download}>
                  Descargar lista de links
                </button>
                <button type="button" className="choice" onClick={openYouTube}>
                  Guardar en YouTube
                </button>
              </>
            ) : (
              <>
                <input
                  type="text"
                  value={title}
                  maxLength={150}
                  aria-label="Nombre de la lista"
                  disabled={busy}
                  onChange={(event) => setTitle(event.target.value)}
                />
                <button
                  type="button"
                  className="choice"
                  disabled={busy || !title.trim() || ids.length === 0}
                  onClick={() => void runCreate(title.trim(), ids, true)}
                >
                  {progress ? progress : 'Crear playlist privada'}
                </button>
                {link ? (
                  <a className="choice" href={link} target="_blank" rel="noreferrer">
                    Abrir playlist
                  </a>
                ) : null}
                {note ? <p className="hint">{note}</p> : null}
                <div className="sheet-links">
                  {chunks.map((url, index) => (
                    <a key={url} className="choice" href={url} target="_blank" rel="noreferrer">
                      {chunks.length === 1 ? 'Abrir en YouTube' : `Abrir en YouTube ${index * 50 + 1}–${Math.min(ids.length, (index + 1) * 50)}`}
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  const clearSheet = confirmClear
    ? createPortal(
        <div className="sheet-overlay">
          <button type="button" className="sheet-backdrop" aria-label="Cancelar" onClick={() => setConfirmClear(false)} />
          <div className="sheet confirm-sheet" role="alertdialog" aria-modal="true" aria-label="Vaciar cola" data-testid="clear-confirm">
            <p>¿Vaciar la cola?</p>
            <div className="confirm-actions">
              <button type="button" className="icon-button tone-danger" aria-label="Vaciar" title="Vaciar" data-testid="clear-yes" onClick={() => { setConfirmClear(false); onClear(); }}>
                <Icon name="check" size={22} />
              </button>
              <button type="button" className="icon-button" aria-label="Cancelar" title="Cancelar" data-testid="clear-no" onClick={() => setConfirmClear(false)}>
                <Icon name="x" size={22} />
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <div className="queue-save">
        <button type="button" className="icon-button tone-play" data-testid="queue-upload" aria-label="Subir lista" title="Subir lista" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={20} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,text/plain"
          hidden
          data-testid="queue-file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) readFile(file);
          }}
        />
        <button
          type="button"
          className="icon-button tone-speed"
          data-testid="queue-save"
          aria-label="Guardar cola"
          title="Guardar cola"
          disabled={tracks.length === 0}
          onClick={() => {
            setStep('menu');
            setNote('');
            setLink('');
            setProgress('');
            setOpen(true);
          }}
        >
          <Icon name="download" size={20} />
        </button>
        <button type="button" className="icon-button tone-danger" data-testid="queue-clear" aria-label="Vaciar cola" title="Vaciar cola" disabled={tracks.length === 0} onClick={() => setConfirmClear(true)}>
          <Icon name="trash" size={20} />
        </button>
      </div>
      {sheet}
      {clearSheet}
    </>
  );
}
