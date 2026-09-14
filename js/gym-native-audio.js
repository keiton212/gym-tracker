/* Capacitor GymAudioSession bridge for vanilla JS (no bundler). */
(() => {
    'use strict';

    function plugin() {
        return globalThis.Capacitor?.Plugins?.GymAudioSession || null;
    }

    const GymNativeAudio = {
        isNativeApp() {
            try {
                return !!(globalThis.Capacitor?.isNativePlatform?.());
            } catch {
                return false;
            }
        },

        available() {
            return this.isNativeApp() && !!plugin();
        },

        async configure() {
            const p = plugin();
            if (!p) return { ok: false, reason: 'plugin_missing' };
            return p.configureForWorkoutRecording();
        },

        async teardown() {
            const p = plugin();
            if (!p?.teardown) return;
            try { await p.teardown(); } catch (_) { /* ignore */ }
        },

        async listInputs() {
            const p = plugin();
            if (!p?.listInputs) return [];
            const result = await p.listInputs();
            return Array.isArray(result?.inputs) ? result.inputs : [];
        },

        async startCapture(deviceId = '') {
            const p = plugin();
            if (!p) throw Error('GymAudioSession plugin missing');
            return p.startNativeCapture({ deviceId: deviceId || '' });
        },

        async stopCapture() {
            const p = plugin();
            if (!p?.stopNativeCapture) return;
            try { await p.stopNativeCapture(); } catch (_) { /* ignore */ }
        },

        async addPcmListener(handler) {
            const p = plugin();
            if (!p?.addListener) return null;
            return p.addListener('pcmBlock', (event) => {
                try {
                    const raw = atob(event.base64 || '');
                    const bytes = new Uint8Array(raw.length);
                    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
                    const usable = bytes.byteLength - (bytes.byteLength % 4);
                    const pcm = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + usable));
                    handler({
                        pcm,
                        rate: Number(event.rate) || 16000,
                        sequence: Number(event.sequence) || 0
                    });
                } catch (e) {
                    console.warn('GymNativeAudio pcm decode failed', e);
                }
            });
        },

        async addFlushListener(handler) {
            const p = plugin();
            if (!p?.addListener) return null;
            return p.addListener('pcmFlushed', () => handler());
        }
    };

    globalThis.GymNativeAudio = GymNativeAudio;
})();
