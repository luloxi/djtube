import { useEffect, useRef, useState } from 'react';
import { downloadBlob, stamp } from '../lib/download';
import { formatTime } from '../lib/format';
import { Icon } from './icons';

function videoMime(): string | undefined {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export type SideTab = 'queue' | 'search' | 'highlights';

export function Header({
  onStatus,
  owner = false,
  onSignOut,
  tab,
  onTab,
}: {
  onStatus: (message: string) => void;
  owner?: boolean;
  onSignOut?: () => void;
  tab: SideTab | null;
  onTab: (tab: SideTab) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [menu, setMenu] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number>(0);
  const chunks = useRef<Blob[]>([]);
  const accountRef = useRef<HTMLDivElement>(null);

  function cleanup() {
    window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(false);
    setElapsed(0);
  }

  async function start() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      onStatus('Sin captura');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const mime = videoMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks.current, { type: recorder.mimeType || 'video/webm' });
        if (blob.size) downloadBlob(blob, `djtube-${stamp()}.webm`);
        cleanup();
        onStatus(blob.size ? 'Grabación lista' : 'Vacía');
      };
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (recorder.state !== 'inactive') recorder.stop();
      });
      recorder.start(1000);
      recorderRef.current = recorder;
      streamRef.current = stream;
      setRecording(true);
      const started = Date.now();
      timerRef.current = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250);
      onStatus('Grabando');
    } catch {
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

  const recLabel = recording ? `Detener ${formatTime(elapsed)}` : 'Grabar';

  return (
    <nav className="dock" aria-label="Navegación">
      <div className="dock-tabs">
        <button type="button" className="icon-button" aria-pressed={tab === 'queue'} aria-label="Cola" title="Cola" onClick={() => onTab('queue')}>
          <Icon name="queue" />
        </button>
        <button type="button" className="icon-button" aria-pressed={tab === 'search'} aria-label="Buscar" title="Buscar" onClick={() => onTab('search')}>
          <Icon name="search" />
        </button>
        <button type="button" className="icon-button" aria-pressed={tab === 'highlights'} aria-label="Cortes" title="Cortes" onClick={() => onTab('highlights')}>
          <Icon name="cuts" />
        </button>
      </div>
      <span className="dock-gap" />
      <a className="icon-button" href="/sync" target="_blank" rel="noopener noreferrer" title="Sincronizador" aria-label="Sincronizador" data-testid="open-sync">
        <Icon name="analyze" />
      </a>
      <button type="button" className={recording ? 'icon-button rec on' : 'icon-button rec'} aria-label={recLabel} title={recLabel} onClick={recording ? stop : () => void start()}>
        <Icon name={recording ? 'stop' : 'record'} />
        {recording ? <span className="rec-time">{formatTime(elapsed)}</span> : null}
      </button>
      {owner ? (
        <a className="icon-button" href="/admin" title="Admin" aria-label="Admin">
          <Icon name="admin" />
        </a>
      ) : null}
      {onSignOut ? (
        <div className="account" ref={accountRef}>
          <button type="button" className="icon-button" aria-label="Cuenta" title="Cuenta" aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((open) => !open)}>
            <Icon name="user" />
          </button>
          {menu ? (
            <div className="account-menu" role="menu">
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
