import { useEffect, useRef, useState } from 'react';
import { startVoice, type VoiceSession } from '../lib/voice';
import { Icon } from './icons';

export type VoiceMix = { stream: MediaStream | null; ctx: AudioContext | null };

export function VoiceControl({
  mix,
  onStatus,
  onMix,
}: {
  mix: { current: VoiceMix };
  onStatus: (message: string) => void;
  onMix?: (mix: VoiceMix) => void;
}) {
  const [on, setOn] = useState(false);
  const [open, setOpen] = useState(false);
  const [semitones, setSemitones] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [reverb, setReverb] = useState(0);
  const sessionRef = useRef<VoiceSession | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const onMixRef = useRef(onMix);
  onMixRef.current = onMix;

  function apply(session: VoiceSession, next = { semitones, volume, reverb }) {
    session.setSemitones(next.semitones);
    session.setVolume(next.volume);
    session.setReverb(next.reverb);
  }

  async function toggle() {
    if (sessionRef.current) {
      sessionRef.current.stop();
      sessionRef.current = null;
      const cleared = { stream: null, ctx: null };
      mix.current = cleared;
      onMixRef.current?.(cleared);
      setOn(false);
      setOpen(false);
      return;
    }
    try {
      const session = await startVoice();
      sessionRef.current = session;
      apply(session);
      const next = { stream: session.stream, ctx: session.context };
      mix.current = next;
      onMixRef.current?.(next);
      setOn(true);
      setOpen(true);
    } catch {
      const cleared = { stream: null, ctx: null };
      mix.current = cleared;
      onMixRef.current?.(cleared);
      setOn(false);
      onStatus('Sin micrófono');
    }
  }

  useEffect(() => {
    return () => {
      sessionRef.current?.stop();
      sessionRef.current = null;
      const cleared = { stream: null, ctx: null };
      mix.current = cleared;
      onMixRef.current?.(cleared);
    };
  }, [mix]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !boxRef.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div className="voice-wrap" ref={boxRef}>
      <button
        type="button"
        className={on ? 'icon-button on' : 'icon-button'}
        aria-pressed={on}
        aria-label="Micrófono"
        title="Micrófono"
        onClick={() => {
          if (on) setOpen((value) => !value);
          else void toggle();
        }}
        onContextMenu={(event) => {
          if (!on) return;
          event.preventDefault();
          void toggle();
        }}
      >
        <Icon name="mic" />
      </button>
      {on && open ? (
        <div className="voice-pop" role="group" aria-label="Voz">
          <div className="voice-pitch">
            <button
              type="button"
              className="icon-button"
              aria-label="Tono más grave"
              title="Tono más grave"
              disabled={semitones <= -12}
              onClick={() => {
                const next = Math.max(-12, semitones - 1);
                setSemitones(next);
                sessionRef.current?.setSemitones(next);
              }}
            >
              <Icon name="minus" />
            </button>
            <span>{semitones > 0 ? `+${semitones}` : semitones}</span>
            <button
              type="button"
              className="icon-button"
              aria-label="Tono más agudo"
              title="Tono más agudo"
              disabled={semitones >= 12}
              onClick={() => {
                const next = Math.min(12, semitones + 1);
                setSemitones(next);
                sessionRef.current?.setSemitones(next);
              }}
            >
              <Icon name="plus" />
            </button>
          </div>
          <label>
            <Icon name="mic" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              aria-label="Volumen de voz"
              onChange={(event) => {
                const next = Number(event.target.value);
                setVolume(next);
                sessionRef.current?.setVolume(next);
              }}
            />
          </label>
          <label>
            <Icon name="reverb" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={reverb}
              aria-label="Reverb"
              onChange={(event) => {
                const next = Number(event.target.value);
                setReverb(next);
                sessionRef.current?.setReverb(next);
              }}
            />
          </label>
          <button type="button" className="icon-button" aria-label="Apagar micrófono" title="Apagar micrófono" onClick={() => void toggle()}>
            <Icon name="x" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
