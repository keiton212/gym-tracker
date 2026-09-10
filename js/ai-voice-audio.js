(() => {
    function downsample(input, rate) {
        const ratio = rate / 16000, out = new Int16Array(Math.round(input.length / ratio));
        for (let i = 0; i < out.length; i++) {
            const start = Math.floor(i * ratio), end = Math.min(input.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
            let sum = 0; for (let k = start; k < end; k++) sum += input[k];
            out[i] = Math.round(Math.max(-1, Math.min(1, sum / (end - start))) * 32767);
        }
        return out;
    }
    function wav(parts) {
        const length = parts.reduce((n, p) => n + p.length, 0), bytes = new ArrayBuffer(44 + length * 2), v = new DataView(bytes);
        const word = (at, text) => [...text].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
        word(0, 'RIFF'); v.setUint32(4, 36 + length * 2, true); word(8, 'WAVE'); word(12, 'fmt ');
        v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
        v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
        word(36, 'data'); v.setUint32(40, length * 2, true); let at = 44;
        for (const part of parts) for (const sample of part) { v.setInt16(at, sample, true); at += 2; }
        return new Blob([bytes], { type: 'audio/wav' });
    }
    // Short utterances must not be diluted by averaging over a whole second.
    function level(pcm) {
        let peak = 0, voiced = 0;
        for (let i = 0; i < pcm.length; i += 320) {
            const end = Math.min(i + 320, pcm.length); let sum = 0;
            for (let k = i; k < end; k++) sum += (pcm[k] / 32768) ** 2;
            const rms = Math.sqrt(sum / (end - i)); peak = Math.max(peak, rms);
            if (rms > 0.006) voiced += end - i;
        }
        return { peak, speech: voiced >= 640 };
    }
    const api = { downsample, wav, level };
    globalThis.VoiceAudio = api; if (typeof module !== 'undefined') module.exports = api;
})();
