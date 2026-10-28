class PitchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = 1;
    this.size = 4096;
    this.buf = new Float32Array(this.size);
    this.write = 0;
    this.read = 0;
    this.port.onmessage = (event) => {
      const ratio = event.data && event.data.ratio;
      if (typeof ratio === 'number' && ratio >= 0.25 && ratio <= 4) this.ratio = ratio;
    };
  }

  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0];
    const output = outputs[0] && outputs[0][0];
    if (!output) return true;
    const size = this.size;
    const grain = 1024;
    for (let i = 0; i < output.length; i += 1) {
      if (input) {
        this.buf[this.write] = input[i] || 0;
        this.write = (this.write + 1) % size;
      }
      const base = Math.floor(this.read);
      const frac = this.read - base;
      const i0 = ((base % size) + size) % size;
      const i1 = (i0 + 1) % size;
      output[i] = this.buf[i0] + (this.buf[i1] - this.buf[i0]) * frac;
      this.read += this.ratio;
      if (this.read >= size) this.read -= size;
      if (this.read < 0) this.read += size;
      let ahead = this.write - this.read;
      if (ahead < 0) ahead += size;
      if (ahead < 64 || ahead > size - 64) this.read = (this.write - grain + size) % size;
    }
    return true;
  }
}

registerProcessor('djtube-pitch', PitchProcessor);
