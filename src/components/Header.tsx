import { useRef, useState } from 'react';
import { downloadBlob, stamp } from '../lib/download';
import { formatTime } from '../lib/format';

function videoMime(): string | undefined {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export function Header({
  onStatus,
  owner = false,
  onSignOut,
}: {
  onStatus: (message: string) => void;
  owner?: boolean;
  onSignOut?: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number>(0);
  const chunks = useRef<Blob[]>([]);

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
      onStatus('Este navegador no puede grabar la pantalla.');
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
        onStatus(blob.size ? 'Sesión descargada.' : 'La grabación salió vacía.');
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
      onStatus('Grabando la pestaña.');
    } catch {
      onStatus('Grabación cancelada.');
    }
  }

  function stop() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    else cleanup();
  }

  return (
    <header className="top">
      <div>
        <h1>
          <span className={recording ? 'tally on' : 'tally'} aria-hidden="true" />
          DJTube
        </h1>
        <p className="tag">El oído manda.</p>
      </div>
      <div className="top-actions">
        {owner ? (
          <a className="text-link" href="/admin">
            Admin
          </a>
        ) : null}
        {onSignOut ? (
          <button type="button" onClick={onSignOut}>
            Salir
          </button>
        ) : null}
        {recording ? (
          <button type="button" className="primary" onClick={stop}>
            Detener {formatTime(elapsed)}
          </button>
        ) : (
          <button type="button" onClick={() => void start()}>
            Grabar
          </button>
        )}
      </div>
    </header>
  );
}
