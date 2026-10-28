import { useEffect, useRef, useState } from 'react';
import type { AppMode, PrepararPane } from '../lib/mode';
import { downloadBlob, stamp } from '../lib/download';
import { formatTime } from '../lib/format';
import { detectRecordMode, recorderMime, recordFileExt, type RecordMode } from '../lib/record';
import { captureFallback, captureKind, mixForRecorder } from '../lib/record-mix';
import { Icon } from './icons';
import { VoiceControl, type VoiceMix } from './VoiceControl';

export type SideTab = 'queue' | 'search' | 'highlights';

const CONTACT_URL = 'https://lulox.com.ar/contacto';
const REPO_URL = 'https://github.com/luloxi/djtube';

function liveRecordMode(): RecordMode {
  const mediaRecorder = typeof MediaRecorder !== 'undefined';
  const displayMedia = typeof navigator.mediaDevices?.getDisplayMedia === 'function';
  const userMedia = typeof navigator.mediaDevices?.getUserMedia === 'function';
  const coarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return detectRecordMode({ mediaRecorder, displayMedia, userMedia, coarsePointer });
}

function isTypeSupported(type: string): boolean {
  try {
    return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type);
  } catch {
    return false;
  }
}

export function Header({
  onStatus,
  owner = false,
  onSignOut,
  tab,
  onTab,
  onAdmin,
  pending = 0,
  mode,
  onMode,
  prepararPane = 'sync',
  onPrepararPane,
  desktop = false,
  webcamOn = false,
  onWebcam,
  chromeOn = true,
  onChrome,
  onResetLayout,
}: {
  onStatus: (message: string) => void;
  owner?: boolean;
  onSignOut?: () => void;
  tab: SideTab | null;
  onTab: (tab: SideTab) => void;
  onAdmin?: () => void;
  pending?: number;
  mode: AppMode;
  onMode: (mode: AppMode) => void;
  prepararPane?: PrepararPane;
  onPrepararPane?: (pane: PrepararPane) => void;
  desktop?: boolean;
  webcamOn?: boolean;
  onWebcam?: () => void;
  chromeOn?: boolean;
  onChrome?: () => void;
  onResetLayout?: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [menu, setMenu] = useState(false);
  const [recordMode] = useState<RecordMode>(() => liveRecordMode());
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureRef = useRef<MediaStream | null>(null);
  const recordCtx = useRef<AudioContext | null>(null);
  const releaseMix = useRef<(() => void) | null>(null);
  const attachVoice = useRef<((next: MediaStream | null) => void) | null>(null);
  const voiceMix = useRef<VoiceMix>({ stream: null, ctx: null });
  const timerRef = useRef<number>(0);
  const chunks = useRef<Blob[]>([]);
  const accountRef = useRef<HTMLDivElement>(null);

  function cleanup() {
    window.clearInterval(timerRef.current);
    attachVoice.current = null;
    releaseMix.current?.();
    releaseMix.current = null;
    captureRef.current?.getTracks().forEach((track) => track.stop());
    captureRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const ctx = recordCtx.current;
    recordCtx.current = null;
    if (ctx) void ctx.close();
    recorderRef.current = null;
    setRecording(false);
    setElapsed(0);
  }

  function voiceIsLive() {
    return Boolean(voiceMix.current.stream?.getAudioTracks().some((track) => track.readyState === 'live'));
  }

  async function start() {
    if (recordMode === 'none') {
      onStatus('Sin captura');
      return;
    }
    const voiceLive = voiceIsLive();
    try {
      let kind: 'display' | 'mic' = recordMode === 'display' ? 'display' : 'mic';
      let base: MediaStream | null = null;
      const plan = captureKind(recordMode, voiceLive);
      if (plan === 'display') {
        try {
          base = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        } catch (error) {
          const canMic = typeof navigator.mediaDevices.getUserMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
          const fallback = captureFallback(voiceIsLive(), canMic);
          if (fallback === 'none') throw error;
          kind = 'mic';
          if (fallback === 'mic') base = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        }
      } else if (plan === 'mic') {
        base = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }
      const ctx = new AudioContext();
      await ctx.resume();
      const mixed = mixForRecorder(base, voiceIsLive() ? voiceMix.current.stream : null, ctx);
      recordCtx.current = ctx;
      releaseMix.current = mixed.release;
      attachVoice.current = mixed.attachVoice;
      captureRef.current = base;
      const stream = mixed.stream;
      const mime = recorderMime(kind, isTypeSupported);
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunks.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mime || (kind === 'mic' ? 'audio/webm' : 'video/webm');
        const blob = new Blob(chunks.current, { type });
        const ext = recordFileExt(type, kind);
        if (blob.size) downloadBlob(blob, `djtube-${stamp()}.${ext}`);
        cleanup();
        onStatus(blob.size ? (kind === 'mic' ? 'Audio listo' : 'Grabación lista') : 'Vacía');
      };
      const stopTrack = stream.getVideoTracks()[0] ?? stream.getAudioTracks()[0];
      stopTrack?.addEventListener('ended', () => {
        if (recorder.state !== 'inactive') recorder.stop();
      });
      recorder.start(1000);
      recorderRef.current = recorder;
      streamRef.current = stream;
      setRecording(true);
      const started = Date.now();
      timerRef.current = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250);
      onStatus(kind === 'mic' ? 'Grabando mic' : 'Grabando');
    } catch {
      cleanup();
      onStatus('Cancelada');
    }
  }

  function stop() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    else cleanup();
  }

  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !accountRef.current?.contains(event.target)) setMenu(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const recOff = recordMode === 'none';
  const recLabel = recording ? `Detener ${formatTime(elapsed)}` : recOff ? 'Sin captura' : recordMode === 'mic' ? 'Grabar mic' : 'Grabar';

  return (
    <nav className="dock" aria-label="Navegación">
      <div className="dock-modes">
        <button type="button" className="icon-button" aria-pressed={mode === 'preparar'} aria-label="Preparar" title="Preparar" onClick={() => onMode('preparar')}>
          <Icon name="prepare" />
        </button>
        <button type="button" className="icon-button" aria-pressed={mode === 'dj'} aria-label="DJ" title="DJ" onClick={() => onMode('dj')}>
          <Icon name="decks" />
        </button>
        {mode === 'preparar' ? (
          <>
            <button type="button" className="icon-button" aria-pressed={prepararPane === 'sync'} aria-label="Sincronizador" title="Sincronizador" onClick={() => onPrepararPane?.('sync')}>
              <Icon name="analyze" />
            </button>
            <button type="button" className="icon-button" aria-pressed={prepararPane === 'cuts'} aria-label="Cortes" title="Cortes" onClick={() => onPrepararPane?.('cuts')}>
              <Icon name="cuts" />
            </button>
            <button type="button" className="icon-button" aria-pressed={prepararPane === 'pads'} aria-label="Pads" title="Pads" onClick={() => onPrepararPane?.('pads')}>
              <Icon name="pads" />
            </button>
          </>
        ) : null}
      </div>
      {mode === 'dj' ? (
        <div className="dock-main">
          <button type="button" className="icon-button dock-hit" aria-pressed={tab === 'queue'} aria-label="Cola" title="Cola" onClick={() => onTab('queue')}>
            <Icon name="queue" size={22} />
          </button>
          <button type="button" className="icon-button dock-hit search" aria-pressed={tab === 'search'} aria-label="Buscar" title="Buscar" onClick={() => onTab('search')}>
            <Icon name="search" size={22} />
          </button>
        </div>
      ) : null}
      <span className="dock-gap" />
      {mode === 'dj' ? (
        <VoiceControl
          mix={voiceMix}
          onStatus={onStatus}
          onMix={(next) => {
            voiceMix.current = next;
            attachVoice.current?.(next.stream);
          }}
        />
      ) : null}
      {desktop && mode === 'dj' && onWebcam ? (
        <button type="button" className="icon-button" aria-pressed={webcamOn} aria-label="Cámara" title="Cámara" onClick={onWebcam}>
          <Icon name="camera" />
        </button>
      ) : null}
      {desktop && onChrome ? (
        <button type="button" className="icon-button" aria-pressed={chromeOn} aria-label={chromeOn ? 'Ocultar menú' : 'Mostrar menú'} title={chromeOn ? 'Ocultar menú' : 'Mostrar menú'} onClick={onChrome}>
          <Icon name={chromeOn ? 'eye' : 'eye-off'} />
        </button>
      ) : null}
      <button
        type="button"
        className={recording ? 'icon-button rec on' : 'icon-button rec'}
        aria-label={recLabel}
        title={recLabel}
        disabled={recOff && !recording}
        onClick={recording ? stop : () => void start()}
      >
        <Icon name={recording ? 'stop' : 'record'} />
        {recording ? <span className="rec-time">{formatTime(elapsed)}</span> : null}
      </button>
      {owner ? (
        <button type="button" className="icon-button admin-hit" title="Admin" aria-label="Admin" onClick={onAdmin}>
          <Icon name="admin" />
          {pending > 0 ? <span className="badge">{pending > 99 ? '99+' : pending}</span> : null}
        </button>
      ) : null}
      {onSignOut ? (
        <div className="account" ref={accountRef}>
          <button type="button" className="icon-button" aria-label="Cuenta" title="Cuenta" aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((open) => !open)}>
            <Icon name="user" />
          </button>
          {menu ? (
            <div className="account-menu" role="menu">
              <a role="menuitem" href={CONTACT_URL} target="_blank" rel="noopener noreferrer" aria-label="Contacto" title="Contacto">
                <Icon name="mail" />
                <span>Contacto</span>
              </a>
              <a role="menuitem" href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label="Código" title="Código">
                <Icon name="code" />
                <span>Código</span>
              </a>
              {onResetLayout ? (
                <button type="button" role="menuitem" aria-label="Restablecer" title="Restablecer" onClick={onResetLayout}>
                  <Icon name="reset" />
                  <span>Restablecer</span>
                </button>
              ) : null}
              <button type="button" role="menuitem" aria-label="Salir" title="Salir" onClick={onSignOut}>
                <Icon name="sign-out" />
                <span>Salir</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}
