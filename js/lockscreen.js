// ロック画面/コントロールセンターからの操作（Media Session API）。
// 無音ループ音声を再生し続けることで、画面ロック中でも操作パネルとactionHandlerを維持するハック。
const lockScreenControl = (() => {
    let audioEl = null;
    let handlers = null;

    function createSilentWavUrl(durationSec = 2, sampleRate = 8000) {
        const dataSize = durationSec * sampleRate;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);

        const writeString = (offset, str) => {
            for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate, true);
        view.setUint16(32, 1, true);
        view.setUint16(34, 8, true);
        writeString(36, 'data');
        view.setUint32(40, dataSize, true);
        for (let i = 0; i < dataSize; i++) view.setUint8(44 + i, 128); // 128 = 無音（8bit PCM の中央値）

        return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
    }

    function start(actionHandlers) {
        handlers = actionHandlers;

        if (!audioEl) {
            audioEl = new Audio();
            audioEl.loop = true;
            audioEl.setAttribute('playsinline', '');
            audioEl.src = createSilentWavUrl();
        }
        audioEl.play().catch(() => {});

        if (!('mediaSession' in navigator)) return;

        // 早戻し/早送り（本来は15秒/30秒スキップ用）を回数の−1/+1に転用する。
        // iOSはこれらを登録すると「前へ/次へ」の代わりにこちらのアイコンを出す。
        navigator.mediaSession.setActionHandler('seekbackward', () => handlers?.onRepsDown?.());
        navigator.mediaSession.setActionHandler('seekforward', () => handlers?.onRepsUp?.());

        // 「前へ/次へ」が表示される環境向けのフォールバック
        navigator.mediaSession.setActionHandler('nexttrack', () => handlers?.onConfirm?.());
        navigator.mediaSession.setActionHandler('previoustrack', () => handlers?.onBack?.());

        // 一時停止を押しても裏の無音再生は止めない（止めるとロック画面の操作パネルごと消えるため）
        // 再生/一時停止はどちらも同じ「今のセットを確定して次へ」に割り当てる
        navigator.mediaSession.setActionHandler('play', () => {
            audioEl.play().catch(() => {});
            navigator.mediaSession.playbackState = 'playing';
            handlers?.onConfirm?.();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
            audioEl.play().catch(() => {});
            navigator.mediaSession.playbackState = 'playing';
            handlers?.onConfirm?.();
        });
    }

    function updateMetadata({ title, artist, album }) {
        if (!('mediaSession' in navigator)) return;
        navigator.mediaSession.metadata = new MediaMetadata({ title, artist, album });
    }

    function stop() {
        handlers = null;
        if (audioEl) audioEl.pause();

        if (!('mediaSession' in navigator)) return;
        navigator.mediaSession.setActionHandler('seekbackward', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
    }

    return { start, updateMetadata, stop };
})();
