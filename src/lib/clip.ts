function audioMime(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export async function sliceBlobToWebm(blob: Blob, recordStart: number, start: number, end: number): Promise<Blob> {
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    const sampleRate = audio.sampleRate;
    const offset = Math.max(0, start - recordStart);
    const regionEnd = Math.min(end, recordStart + audio.duration);
    const duration = Math.max(0.1, regionEnd - Math.max(start, recordStart));
    const startSample = Math.min(audio.length - 1, Math.floor(offset * sampleRate));
    const length = Math.max(1, Math.min(audio.length - startSample, Math.floor(duration * sampleRate)));
    const slice = context.createBuffer(audio.numberOfChannels, length, sampleRate);
    for (let channel = 0; channel < audio.numberOfChannels; channel += 1) {
      slice.copyToChannel(audio.getChannelData(channel).subarray(startSample, startSample + length), channel);
    }
    const destination = context.createMediaStreamDestination();
    const source = context.createBufferSource();
    source.buffer = slice;
    source.connect(destination);
    const mime = audioMime();
    const recorder = new MediaRecorder(destination.stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    const stopped = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => reject(new Error('recorder'));
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
    });
    recorder.start();
    source.start();
    await new Promise<void>((resolve) => {
      source.onended = () => resolve();
    });
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    if (recorder.state !== 'inactive') recorder.stop();
    return await stopped;
  } finally {
    await context.close();
  }
}
