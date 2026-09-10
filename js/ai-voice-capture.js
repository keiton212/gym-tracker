/* One-second PCM blocks; no recognition restarts and no audible output. */
class GymPCMProcessor extends AudioWorkletProcessor {
    constructor() { super(); this.parts = new Float32Array(sampleRate); this.used = 0; this.sequence = 0;
        this.port.onmessage = e => { if (e.data === 'flush') { this.emit(); this.port.postMessage({ flushed: true }); } }; }
    emit() {
        if (!this.used) return;
        const pcm = this.parts.slice(0, this.used);
        this.port.postMessage({ pcm, rate: sampleRate, sequence: this.sequence++ }, [pcm.buffer]); this.used = 0;
    }
    process(inputs) {
        const input = inputs[0]?.[0];
        if (input) for (const value of input) { this.parts[this.used++] = value; if (this.used === this.parts.length) this.emit(); }
        return true;
    }
}
registerProcessor('gym-pcm', GymPCMProcessor);
