import { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';

type Props = {
  peaks: number[] | null;
  duration: number;
  time: number;
  color: string;
  progress: string;
  clearToken: number;
  onSeek: (seconds: number) => void;
  onSelect: (start: number, end: number) => void;
};

export function Waveform({ peaks, duration, time, color, progress, clearToken, onSeek, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const seekRef = useRef(onSeek);
  const selectRef = useRef(onSelect);
  const gestureRef = useRef(false);
  seekRef.current = onSeek;
  selectRef.current = onSelect;

  const peaksRef = useRef(peaks);
  peaksRef.current = peaks;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !(duration > 0)) return;
    const initial = peaksRef.current;
    const shown = initial?.length ? initial : placeholder(800);
    let ws: WaveSurfer;
    try {
      ws = WaveSurfer.create({
        container: host,
        height: Math.max(48, host.clientHeight || 96),
        waveColor: color,
        progressColor: progress,
        cursorColor: '#f4efe6',
        cursorWidth: 2,
        barWidth: 2,
        barGap: 1,
        barRadius: 1,
        normalize: Boolean(initial?.length),
        interact: true,
        dragToSeek: false,
        hideScrollbar: true,
        autoScroll: false,
        autoCenter: false,
        backend: 'WebAudio',
        peaks: [shown],
        duration,
      });
    } catch {
      return;
    }
    const regions = ws.registerPlugin(RegionsPlugin.create());
    regions.enableDragSelection({
      color: 'rgba(231, 164, 90, 0.28)',
      drag: true,
      resize: true,
    });
    ws.on('error', () => undefined);
    ws.on('interaction', (seconds) => {
      if (gestureRef.current) {
        gestureRef.current = false;
        return;
      }
      seekRef.current(seconds);
    });
    const keepLatest = (region: { id: string; start: number; end: number }) => {
      if (region.end - region.start < 0.3) {
        regions.getRegions().find((item) => item.id === region.id)?.remove();
        return;
      }
      gestureRef.current = true;
      for (const other of regions.getRegions()) {
        if (other.id !== region.id) other.remove();
      }
      selectRef.current(region.start, region.end);
    };
    regions.on('region-created', keepLatest);
    regions.on('region-updated', keepLatest);
    wsRef.current = ws;
    regionsRef.current = regions;
    let fitted = 0;
    const fit = () => {
      const next = Math.floor(host.clientHeight);
      if (next < 36 || next === fitted) return;
      fitted = next;
      ws.setOptions({ height: next });
    };
    const observer = new ResizeObserver(fit);
    observer.observe(host);
    fit();
    return () => {
      observer.disconnect();
      regionsRef.current = null;
      wsRef.current = null;
      ws.destroy();
    };
  }, [duration, color, progress]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !(duration > 0)) return;
    const shown = peaks?.length ? peaks : placeholder(800);
    ws.setOptions({ normalize: Boolean(peaks?.length) });
    ws.load('', [shown], duration).catch(() => undefined);
  }, [peaks, duration]);

  useEffect(() => {
    regionsRef.current?.clearRegions();
  }, [clearToken]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !(duration > 0)) return;
    try {
      ws.setTime(Math.min(time, duration));
    } catch {
      /* playhead waits until the waveform is ready */
    }
  }, [time, duration]);

  return <div className="wave" ref={hostRef} data-testid="waveform" />;
}

function placeholder(count: number): number[] {
  return new Array(count).fill(0.08);
}
