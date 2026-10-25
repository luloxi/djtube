class DjtubePeakProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.peak = 0;
    this.count = 0;
    this.block = 2048;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    const frames = channel ? channel.length : 128;
    if (channel) {
      for (let i = 0; i < channel.length; i += 1) {
        const value = channel[i] < 0 ? -channel[i] : channel[i];
        if (value > this.peak) this.peak = value;
      }
    }
    this.count += frames;
    if (this.count >= this.block) {
      this.port.postMessage({ peak: this.peak, samples: this.count });
      this.peak = 0;
      this.count = 0;
    }
    return true;
  }
}

registerProcessor('djtube-peak', DjtubePeakProcessor);
