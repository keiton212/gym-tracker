(() => {
    'use strict';
    const KEY = 'gym_voice_prototype_v1';
    const $ = id => document.getElementById(id);
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let data, session, running = false, recognition = null, speaking = false, wakeLock = null;
    let retryTimer, endTimer, cycleTimer, startTimer, speechTimer, restartCount = 0, failures = 0;
    let pendingReply = null, audioContext, generation = 0, lastTone = 0;
    let bootError = '';
    let names = [];
    try {
        const menu = JSON.parse(localStorage.getItem('gym_menu') || '{}');
        const exercises = menu[new Date().getDay()]?.exercises || [];
        names = exercises.flatMap(e => [e.name, ...(Array.isArray(e.alternatives) ? e.alternatives : [])]);
    } catch { bootError = '当日のメニューを読み取れません。元のデータは変更していません。'; }
    names = names.filter(n => typeof n === 'string' && n.trim());
    if (!names.length) names = ['ベンチプレス', 'スクワット', 'デッドリフト'];
    function fresh() {
        return { version: 1, createdAt: Date.now(), enabledAt: null, stoppedAt: null, names,
            state: new VoiceSession(names).state, logs: [], manualEvents: 0, interruptions: 0,
            userAgent: navigator.userAgent, verified: false };
    }
    try {
        const raw = localStorage.getItem(KEY);
        data = raw ? JSON.parse(raw) : fresh();
        if (data.version !== 1 || !Array.isArray(data.names) || !Array.isArray(data.logs) || !Array.isArray(data.state?.sets)) throw new Error('invalid');
    } catch { bootError = '前回の試作データを読み取れません。上書きせず停止しています。'; data = fresh(); }
    session = new VoiceSession(data.names, data.state);
    // Reloading is an interruption, never evidence of uninterrupted operation.
    if (data.enabledAt && !data.stoppedAt && !bootError) {
        data.stoppedAt = Date.now(); data.interruptions++;
        data.logs.push({ at: Date.now(), type: 'page-reopened' });
    }
    function persist() {
        localStorage.setItem(KEY, JSON.stringify(data));
    }
    function log(type, detail = '') {
        data.logs.push({ at: Date.now(), type, detail });
        if (data.logs.length > 5000) data.logs.splice(0, data.logs.length - 5000);
        try { persist(); } catch { halt('保存できません。空き容量を確認してください。記録は書き出せます。', false); }
    }
    function render() {
        $('names').textContent = data.names.join(' ／ ');
        $('sets').replaceChildren(...data.state.sets.map((set, i) => {
            const li = document.createElement('li');
            li.textContent = `${i + 1}. ${set.name} / ${set.weight}kg × ${set.reps}回`;
            return li;
        }));
        $('summary').textContent = `${data.state.sets.length}セット · 本体の履歴には未反映`;
        $('enable').disabled = running || !!bootError || !!data.state.endedAt;
        $('stop').disabled = !running;
        $('new').disabled = running;
        $('command').disabled = running;
        $('simulate').querySelector('button').disabled = running;
        $('timerSound').disabled = running;
    }
    function clearTimers() {
        [retryTimer, endTimer, cycleTimer, startTimer, speechTimer].forEach(clearTimeout);
    }
    function halt(reason, save = true) {
        running = false; speaking = false; generation++; pendingReply = null;
        clearTimers(); window.speechSynthesis?.cancel();
        const old = recognition; recognition = null;
        try { old?.abort(); } catch { /* already ended */ }
        wakeLock?.release().catch(() => {}); wakeLock = null;
        data.stoppedAt = Date.now();
        $('status').textContent = reason;
        $('wake').textContent = '画面の点灯維持：停止';
        if (save) log('stopped', reason);
        render();
    }
    function fatal(reason) {
        data.interruptions++; halt(reason);
        // Best effort audible failure; the persistent status remains if TTS itself failed.
        if (window.speechSynthesis) {
            const u = new SpeechSynthesisUtterance(reason); u.lang = 'ja-JP';
            window.speechSynthesis.speak(u);
        }
    }
    async function acquireWake() {
        if (!navigator.wakeLock) {
            $('wake').textContent = '点灯維持非対応：開始前に端末の自動ロックを無効にしてください';
            log('wake-unavailable'); return;
        }
        try {
            const lock = await navigator.wakeLock.request('screen');
            if (!running) { await lock.release(); return; }
            wakeLock = lock; $('wake').textContent = '画面の点灯維持：有効';
            log('wake-acquired');
            lock.addEventListener('release', () => {
                if (wakeLock !== lock) return;
                wakeLock = null;
                $('wake').textContent = '点灯維持が解除されました';
                log('wake-released');
                if (running && document.visibilityState === 'visible') acquireWake();
            });
        } catch { $('wake').textContent = '点灯維持に失敗：端末の自動ロック設定を確認してください'; log('wake-error'); }
    }
    function scheduleRestart(delay = 350) {
        if (!running || speaking) return;
        clearTimeout(retryTimer);
        retryTimer = setTimeout(startRecognition, delay);
    }
    function startRecognition() {
        if (!running || speaking || recognition) return;
        const r = new Recognition(); recognition = r;
        const processed = new Set(); const id = ++restartCount;
        r.lang = 'ja-JP'; r.continuous = true; r.interimResults = false;
        let started = 0;
        r.onstart = () => {
            if (recognition !== r || !running) return;
            clearTimeout(startTimer); started = Date.now();
            $('status').textContent = '聞き取り中 · 返答後に次の記録を話してください';
            log('recognition-start', id);
            // Refresh even when a browser silently stops emitting recognition events.
            cycleTimer = setTimeout(() => pauseRecognition(null), 45000);
        };
        r.onresult = event => {
            if (recognition !== r || !running || speaking || pendingReply !== null) return;
            const replies = [];
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (!event.results[i].isFinal || processed.has(i)) continue;
                processed.add(i); failures = 0;
                const text = event.results[i][0].transcript;
                log('recognized', { cycle: id, index: i, text });
                const reply = applyCommand(text, false);
                if (!running) return;
                replies.push(reply);
                if (data.state.endedAt) break;
            }
            if (replies.length) pauseRecognition(replies.join('。'));
        };
        r.onerror = event => {
            if (recognition !== r || !running) return;
            log('recognition-error', event.error);
            if (['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'].includes(event.error)) {
                fatal('音声入力を停止しました。マイクと音声認識の許可を確認してください');
            } else if (!['aborted', 'no-speech'].includes(event.error)) {
                failures++;
                if (failures >= 5) fatal('音声認識の復旧に失敗しました。試験を停止します');
            }
        };
        r.onend = () => {
            if (recognition !== r) return;
            recognition = null;
            [startTimer, cycleTimer, endTimer].forEach(clearTimeout);
            log('recognition-end', id);
            if (!running) return;
            if (pendingReply !== null) {
                const reply = pendingReply; pendingReply = null; speak(reply); return;
            }
            if (!started || Date.now() - started < 1500) failures++;
            if (failures >= 5) { fatal('音声認識が繰り返し停止したため、試験を停止します'); return; }
            log('reconnect', id); scheduleRestart(Math.min(5000, 350 * 2 ** failures));
        };
        startTimer = setTimeout(() => fatal('音声認識を開始できませんでした。試験を停止します'), 12000);
        try { r.start(); } catch (error) { log('start-error', error.name); fatal('音声認識を開始できませんでした'); }
    }
    function pauseRecognition(reply) {
        if (!running) return;
        clearTimeout(cycleTimer);
        pendingReply = reply;
        if (!recognition) {
            pendingReply = null;
            if (reply !== null) speak(reply); else scheduleRestart();
            return;
        }
        // Wait for onend before playing sound; never overlap microphone and TTS.
        endTimer = setTimeout(() => fatal('マイクの停止を確認できないため、試験を停止します'), 5000);
        try { recognition.abort(); } catch { fatal('マイクの停止に失敗しました'); }
    }
    function speak(text) {
        if (!running) return;
        speaking = true;
        const token = generation;
        $('status').textContent = '返答中 · 話し終わるまでお待ちください';
        $('reply').textContent = text;
        log('speech-start', text);
        if (text.startsWith('タイマー音の試験') && audioContext?.state === 'running') {
            const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
            oscillator.connect(gain); gain.connect(audioContext.destination); gain.gain.value = 0.08;
            oscillator.frequency.value = 880; oscillator.start(); oscillator.stop(audioContext.currentTime + 0.15);
        }
        const u = new SpeechSynthesisUtterance(text); u.lang = 'ja-JP';
        u.onend = () => {
            if (!running || token !== generation) return;
            clearTimeout(speechTimer); speaking = false; log('speech-end');
            if (data.state.endedAt) { halt('音声で終了しました。実機合格は記録と照合して判断してください'); return; }
            scheduleRestart(450);
        };
        u.onerror = () => { if (running && token === generation) fatal('読み上げに失敗したため、試験を停止します'); };
        speechTimer = setTimeout(() => fatal('読み上げが完了しないため、試験を停止します'), 20000);
        window.speechSynthesis.speak(u);
    }
    function applyCommand(text, manual) {
        const before = JSON.stringify(data.state);
        const reply = session.accept(text);
        if (manual) data.manualEvents++;
        try { persist(); } catch {
            data.state = JSON.parse(before); session.state = data.state;
            fatal('記録を保存できませんでした。試験を停止します'); return '保存に失敗しました';
        }
        $('heard').textContent = `聞き取り：${text}`;
        $('reply').textContent = reply;
        log(manual ? 'simulation' : 'command', { text, reply }); render();
        return reply;
    }
    $('enable').onclick = () => {
        if (!Recognition || !window.speechSynthesis || !window.isSecureContext) {
            $('status').textContent = 'HTTPSと、音声認識・読み上げ対応ブラウザが必要です。'; return;
        }
        running = true; generation++; failures = 0;
        if (data.enabledAt) data.interruptions++;
        data.enabledAt = data.enabledAt || Date.now(); data.stoppedAt = null;
        try {
            const Audio = window.AudioContext || window.webkitAudioContext;
            audioContext = audioContext || new Audio(); audioContext.resume().catch(() => {});
        } catch { log('audio-unavailable'); }
        log('enabled'); if (!running) return;
        render(); acquireWake(); lastTone = Date.now();
        // Both initial audio and recognition start originate from the user's activation.
        speak('マイクを有効にしました。返答の後に、筋トレ開始、と話してください');
    };
    $('stop').onclick = () => { data.interruptions++; halt('手動で中断しました。保存済みの試作記録は残っています'); };
    $('simulate').onsubmit = event => {
        event.preventDefault(); if (running || bootError) return;
        applyCommand($('command').value, true); $('command').value = '';
    };
    $('new').onclick = () => {
        if (running || !confirm('前回の試作記録と診断ログを新しい試験に置き換えます。必要なら先に書き出してください。')) return;
        data = fresh(); session = new VoiceSession(data.names, data.state); bootError = '';
        try { persist(); } catch { bootError = '試作データを保存できません'; }
        $('reply').textContent = '筋トレ開始、と話してください'; $('heard').textContent = '';
        $('status').textContent = bootError || '新しい試験を開始できます'; render();
    };
    $('export').onclick = () => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a');
        a.href = url; a.download = `gym-voice-test-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    };
    document.addEventListener('visibilitychange', () => {
        if (running && document.visibilityState !== 'visible') {
            data.interruptions++; halt('画面が非表示になったため試験を中断しました');
        }
    });
    window.addEventListener('pagehide', () => { if (running) { data.interruptions++; halt('ページを閉じたため中断しました'); } });
    setInterval(() => {
        const seconds = data.enabledAt ? Math.floor(((data.stoppedAt || Date.now()) - data.enabledAt) / 1000) : 0;
        $('elapsed').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')} / 80:00`;
        $('progress').value = seconds;
        $('result').textContent = `実機合格：未確認 · ${seconds >= 4800 ? '80分経過' : '80分未達'} · 中断${data.interruptions}回 · 手動テスト${data.manualEvents}回。発話と保存内容を照合してください。`;
        if (running && !speaking && pendingReply === null && recognition && $('timerSound').checked && Date.now() - lastTone >= 300000) {
            lastTone = Date.now(); log('timer-tone');
            // The same serialized audio path as confirmations, with the tone before TTS.
            pendingReply = 'タイマー音の試験です。記録を続けてください';
            const reply = pendingReply;
            pauseRecognition(reply);
        }
    }, 1000);
    render();
    if (bootError) $('status').textContent = bootError;
    else if (data.state.endedAt) {
        $('status').textContent = '終了済みの試作記録を表示しています。次は新しい試験を開始してください。';
        $('reply').textContent = '試作記録は保存されています';
    } else if (data.stoppedAt) $('status').textContent = '前回の試作記録を表示しています。再開は連続80分試験とは扱いません。';
})();
