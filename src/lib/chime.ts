const NOTES = [523.25, 659.25, 783.99, 1046.5];

/** Soft major arpeggio, about a second. Call it on a context the DJ tab has already unlocked. */
export function playChime(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.85, now);
  master.connect(ctx.destination);

  NOTES.forEach((freq, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    const start = now + index * 0.14;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.06, start + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + 0.55);
  });

  const tail = ctx.createOscillator();
  const tailGain = ctx.createGain();
  tail.type = 'triangle';
  tail.frequency.setValueAtTime(1318.51, now);
  const spark = now + 0.42;
  tailGain.gain.setValueAtTime(0.0001, spark);
  tailGain.gain.exponentialRampToValueAtTime(0.028, spark + 0.05);
  tailGain.gain.exponentialRampToValueAtTime(0.0001, spark + 0.62);
  tail.connect(tailGain);
  tailGain.connect(master);
  tail.start(spark);
  tail.stop(spark + 0.66);
}
