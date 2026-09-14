/* Voice recording for the main training screen. Keeps primary actions minimal. */
(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    const MIC_KEY = 'gym_voice_mic_id';
    const PROVIDER_KEY = 'gym_voice_provider';
    const providerLabels = { openai: 'OpenAI', codex: 'Codex PC', groq: 'Groq' };

    const VoiceWorkout = {
        ready: false,
        recording: false,
        busy: false,
        stopping: false,
        db: null,
        session: null,
        jobs: [],
        token: '',
        endpoint: '',
        preferredProvider: localStorage.getItem(PROVIDER_KEY) || 'openai',
        providers: { openai: true, codex: false, groq: false },
        stream: null,
        ctx: null,
        node: null,
        source: null,
        mute: null,
        wake: null,
        pcmListener: null,
        flushListener: null,
        useNativeCapture: false,
        gapLimitMs: 6000,
        writes: Promise.resolve(),
        blockNo: 0,
        lastBlock: 0,
        received: 0,
        buffered: 0,
        activeStart: null,
        silence: 0,
        continuation: false,
        flushResolve: null,
        retryAt: 0,
        failures: 0,
        pumpTimer: null,
        onSetsChanged: null,

        async init({ onSetsChanged } = {}) {
            this.onSetsChanged = onSetsChanged || null;
            this.endpoint = localStorage.getItem('gym_ai_voice_endpoint') || globalThis.GYM_VOICE_ENDPOINT;
            this.token = localStorage.getItem('gym_ai_voice_token') || '';
            this.bindUi();
            try {
                this.db = await new VoiceDB().open();
                await this.ensureSession();
                await this.autoConnect();
                this.refreshMics(false);
                this.render();
                if (!this.pumpTimer) this.pumpTimer = setInterval(() => this.tick(), 1000);
            } catch (e) {
                this.setStatus('音声データを開けません：' + e.message);
            }
        },

        bindUi() {
            $('voiceStart')?.addEventListener('click', () => this.start());
            $('voiceStop')?.addEventListener('click', () => this.stop('録音を止めました', false));
            $('voiceConfirm')?.addEventListener('click', () => this.openConfirm());
            $('voiceSave')?.addEventListener('click', () => this.save());
            $('voiceReconnect')?.addEventListener('click', () => this.autoConnect());
            $('voiceMicRefresh')?.addEventListener('click', () => this.refreshMics(true));
            $('voiceMic')?.addEventListener('change', () => {
                localStorage.setItem(MIC_KEY, $('voiceMic').value || '');
            });
            for (const [provider, id] of Object.entries({ openai: 'voiceProviderOpenai', codex: 'voiceProviderCodex', groq: 'voiceProviderGroq' })) {
                $(id)?.addEventListener('click', async () => {
                    if (this.recording || this.busy || this.session?.startedAt || !this.providers[provider]) return;
                    this.preferredProvider = provider;
                    this.session.provider = provider;
                    localStorage.setItem(PROVIDER_KEY, provider);
                    await this.persist();
                    this.setStatus(providerLabels[provider] + 'に切り替えました');
                    this.render();
                });
            }
            $('voiceApproveNovel')?.addEventListener('click', () => this.approveAllNovel());
            $('voiceRejectNovel')?.addEventListener('click', () => this.rejectAllNovel());
            window.addEventListener('online', () => { this.retryAt = 0; void this.pump(); });
        },

        calendarDate(date = new Date()) {
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        },

        menuNames(dayIndex = new Date().getDay()) {
            const menu = JSON.parse(localStorage.getItem('gym_menu') || '{}');
            const order = [dayIndex, ...[0, 1, 2, 3, 4, 5, 6].filter(i => i !== dayIndex)];
            const names = order.flatMap(day =>
                (menu[day]?.exercises || []).flatMap(e => [e.name, ...(Array.isArray(e.alternatives) ? e.alternatives : [])])
            ).filter(n => typeof n === 'string' && n.trim());
            return [...new Set(names)];
        },

        fresh(dayIndex, recordDate) {
            return {
                id: crypto.randomUUID(), createdAt: Date.now(),
                state: AIVoiceModel.initial(this.menuNames(dayIndex)),
                logs: [], gaps: [], capturedMs: 0, blockNo: 0, finalized: false, startedAt: null,
                interrupted: false, mode: 'live', provider: this.preferredProvider,
                recordDate, dayIndex
            };
        },

        async ensureSession() {
            const dayIndex = window.app?.currentDayIndex ?? new Date().getDay();
            const recordDate = window.app?.sessionDate ? this.calendarDate(window.app.sessionDate) : this.calendarDate();
            let sessions = (await this.db.all('sessions')).sort((a, b) => b.createdAt - a.createdAt);
            for (const deleted of sessions.filter(x => x.deleting)) {
                VoiceHistory.sync(localStorage, deleted, true);
                await this.db.deleteSession(deleted.id);
            }
            sessions = sessions.filter(x => !x.deleting);
            this.session = sessions.find(x => !x.finalized && x.mode === 'live' && x.dayIndex === dayIndex && x.recordDate === recordDate)
                || this.fresh(dayIndex, recordDate);
            if (!this.session.startedAt && !this.session.state.sets.length) {
                this.session.state.names = this.menuNames(dayIndex);
                this.session.dayIndex = dayIndex;
                this.session.recordDate = recordDate;
            }
            this.jobs = (await this.db.bySession('jobs', this.session.id)).sort((a, b) => a.start - b.start);
            this.blockNo = Math.max(this.session.blockNo || 0, (await this.db.lastBlock(this.session.id)) + 1);
            await this.persist();
            this.emitSets();
        },

        async alignToDay(dayIndex, recordDate) {
            if (!this.db) return;
            if (this.recording) await this.stop('記録日を切り替えました', false);
            if (this.session && !this.session.finalized
                && this.session.dayIndex === dayIndex && this.session.recordDate === recordDate) {
                this.session.state.names = this.menuNames(dayIndex);
                await this.persist();
                this.emitSets();
                this.render();
                return;
            }
            const sessions = (await this.db.all('sessions')).sort((a, b) => b.createdAt - a.createdAt);
            const existing = sessions.find(x => !x.finalized && !x.deleting && x.mode === 'live'
                && x.dayIndex === dayIndex && x.recordDate === recordDate);
            this.session = existing || this.fresh(dayIndex, recordDate);
            if (!this.session.startedAt && !this.session.state.sets.length) {
                this.session.state.names = this.menuNames(dayIndex);
            }
            this.jobs = (await this.db.bySession('jobs', this.session.id)).sort((a, b) => a.start - b.start);
            this.blockNo = Math.max(this.session.blockNo || 0, (await this.db.lastBlock(this.session.id)) + 1);
            this.activeStart = null;
            await this.persist();
            this.emitSets();
            this.render();
        },

        async resetForDay(dayIndex, recordDate) {
            return this.alignToDay(dayIndex, recordDate);
        },

        persist() { return this.db.put('sessions', this.session); },

        setStatus(text) {
            const el = $('voiceStatus');
            if (el) el.textContent = text;
        },

        setHint(text) {
            const el = $('voiceHint');
            if (el) el.textContent = text;
        },

        async autoConnect() {
            const note = $('voiceConnectNote');
            const nativeNote = $('voiceNativeNote');
            if (nativeNote) {
                nativeNote.textContent = globalThis.GymNativeAudio?.available?.()
                    ? 'iOSアプリ版：Spotify同時再生・画面オフ録音に対応しています。'
                    : 'Safari/PWAでは裏録音・Spotify同時は制限されます。iOSアプリ版なら対応します。';
            }
            if (note) note.textContent = '接続確認中…';
            this.setStatus('音声サービスに接続しています…');
            try {
                if (!this.endpoint) throw Error('接続先が未設定です');
                const health = await fetch(this.endpoint + '/health', { signal: AbortSignal.timeout(10000) });
                const h = await health.json();
                this.providers = h.providers || { openai: true, codex: false, groq: false };
                let ok = false;
                if (this.token && h.ready) {
                    const check = await fetch(this.endpoint + '/session', {
                        headers: { Authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(10000)
                    });
                    ok = check.ok && (await check.json()).authenticated;
                }
                if (!ok && h.ready) {
                    const login = await fetch(this.endpoint + '/login', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: '{}', signal: AbortSignal.timeout(15000)
                    });
                    const result = await login.json();
                    if (!login.ok) throw Error(result.error || 'login_failed');
                    this.token = result.token;
                    localStorage.setItem('gym_ai_voice_endpoint', this.endpoint);
                    localStorage.setItem('gym_ai_voice_token', this.token);
                    ok = true;
                }
                this.ready = health.ok && h.ready && ok;
                this.setStatus(this.ready ? '音声準備OK' : '音声サービスに接続できません');
                if (note) note.textContent = this.ready ? '自動接続済み' : '再接続を試してください';
            } catch (e) {
                this.ready = false;
                this.setStatus('音声サービスに接続できません' + (e?.message ? `（${e.message}）` : ''));
                if (note) note.textContent = '接続に失敗しました。再接続を試してください';
            }
            this.render();
        },

        isDjiLabel(label = '') {
            return /dji|mic\s*mini|transmitter|receiver/i.test(label);
        },

        async refreshMics(requestPermission) {
            try {
                const select = $('voiceMic');
                if (!select) return;
                const saved = localStorage.getItem(MIC_KEY) || '';
                let inputs = [];
                if (globalThis.GymNativeAudio?.available()) {
                    if (requestPermission) {
                        try { await GymNativeAudio.configure(); } catch (_) { /* continue to list */ }
                    }
                    const nativeInputs = await GymNativeAudio.listInputs();
                    inputs = nativeInputs.map(d => ({ deviceId: d.id, label: d.label || d.type || 'マイク' }));
                } else {
                    if (requestPermission) {
                        const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
                        tmp.getTracks().forEach(t => t.stop());
                    }
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    inputs = devices.filter(d => d.kind === 'audioinput').map(d => ({ deviceId: d.deviceId, label: d.label || 'マイク' }));
                }
                const preferred = inputs.find(d => d.deviceId === saved)
                    || inputs.find(d => this.isDjiLabel(d.label))
                    || null;
                select.replaceChildren(
                    new Option('自動（DJIがあれば優先）', ''),
                    ...inputs.map(d => new Option(d.label || 'マイク', d.deviceId))
                );
                select.value = preferred?.deviceId || saved || '';
                if (select.value) localStorage.setItem(MIC_KEY, select.value);
            } catch {
                this.setStatus('マイク一覧を取得できません。許可を確認してください');
            }
        },

        chosenMicConstraint() {
            const selected = $('voiceMic')?.value || localStorage.getItem(MIC_KEY) || '';
            if (selected) return { deviceId: { exact: selected } };
            return {};
        },

        syncHistory(remove = false) {
            const confirmed = {
                ...this.session,
                state: {
                    ...this.session.state,
                    sets: this.session.state.sets.filter(s => !s.novel)
                }
            };
            VoiceHistory.sync(localStorage, confirmed, remove);
            this.session.historySignature = confirmed.historySignature;
            this.session.historyError = '';
        },

        emitSets() {
            this.onSetsChanged?.(this.session?.state?.sets || [], this.session);
        },

        render() {
            if (!this.session) return;
            const s = this.session;
            const novel = s.state.novelNames || [];
            const pending = s.state.pending || [];
            const recording = this.recording;
            const canStart = this.ready && !recording && !this.stopping && !s.finalized && s.state.names.length + novel.length > 0;
            if ($('voiceStart')) $('voiceStart').disabled = !canStart || this.busy;
            if ($('voiceStop')) $('voiceStop').disabled = !recording;
            if ($('voiceConfirm')) $('voiceConfirm').disabled = this.busy || recording || (!novel.length && !pending.length);
            if ($('voiceSave')) {
                $('voiceSave').disabled = this.busy || recording || this.stopping || s.finalized
                    || novel.length > 0 || pending.length > 0
                    || this.jobs.some(j => j.status !== 'done');
            }
            for (const [key, id] of Object.entries({ openai: 'voiceProviderOpenai', codex: 'voiceProviderCodex', groq: 'voiceProviderGroq' })) {
                const btn = $(id); if (!btn) continue;
                btn.disabled = recording || this.busy || !!s.startedAt || !this.providers[key];
                btn.classList.toggle('is-selected', (s.provider || this.preferredProvider) === key);
                btn.textContent = ((s.provider || this.preferredProvider) === key ? '✓ ' : '') + providerLabels[key]
                    + (!this.providers[key] ? '（未設定）' : '');
            }
            const provider = s.provider || this.preferredProvider;
            if ($('voiceProviderNote')) {
                $('voiceProviderNote').textContent = provider === 'codex'
                    ? 'Codex：PCの中継が必要です。止まっていると送れません。'
                    : provider === 'groq' ? 'Groq：比較用の安価な方式です。' : 'OpenAI：標準の認識方式です。';
            }
            if ($('voiceHeard')) $('voiceHeard').textContent = $('voiceHeard').dataset.last || '聞き取り：まだありません';
            if ($('voiceReply')) $('voiceReply').textContent = $('voiceReply').dataset.last || '結果はここに出ます';
            if ($('voiceQueue')) {
                const n = this.jobs.filter(j => j.status !== 'done').length;
                $('voiceQueue').textContent = this.busy ? `解析中… 残り${n}` : `送信待ち ${n}`;
            }
            const seconds = Math.floor((s.capturedMs || 0) / 1000);
            if ($('voiceElapsed')) {
                $('voiceElapsed').textContent =
                    `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
            }
            const list = $('voiceLiveSets');
            if (list) {
                list.replaceChildren(...s.state.sets.map(set => {
                    const li = document.createElement('li');
                    li.textContent = `${set.name} ${set.weight === 0 ? '自重' : set.weight + 'kg'} × ${set.reps}回`
                        + (set.novel ? '（未登録・確認待ち）' : '');
                    return li;
                }));
            }
            const box = $('voiceConfirmBox');
            if (box) {
                const needs = novel.length || pending.length;
                box.hidden = !needs;
                if ($('voiceConfirmSummary')) {
                    const parts = [];
                    if (novel.length) parts.push(`新しい種目：${novel.join('、')}（メニューに追加して記録します）`);
                    if (pending.length) {
                        const reasons = pending.slice(0, 3).map(p => p.reason || p.text || '内容不明').join('、');
                        parts.push(`確認待ち ${pending.length}件：${reasons}`);
                    }
                    $('voiceConfirmSummary').textContent = parts.join(' ／ ') || '';
                }
                if ($('voiceApproveNovel')) {
                    $('voiceApproveNovel').disabled = !novel.length;
                    $('voiceApproveNovel').textContent = novel.length ? '合っている（登録）' : '合っている';
                }
            }
            if (s.finalized) this.setHint('保存済み。過去データで確認できます');
            else if (!s.state.names.length && !novel.length) this.setHint('先にメニュー種目を登録してください（setup-menu）');
            else if (novel.length || pending.length) this.setHint('「確認」で内容をチェックしてから保存');
            else if (recording) this.setHint(this.busy ? '解析中。話し続けてOK' : (this.useNativeCapture ? 'アプリ版：音楽・画面オフでも録音を続けます' : '種目・キロ・回数を話してください'));
            else if (this.ready) this.setHint(globalThis.GymNativeAudio?.available?.()
                ? '下の「録音を開始」（Spotify同時・バックグラウンド対応）'
                : '下の「録音を開始」を押してください');
            else this.setHint('接続を待っています…');
            document.body.dataset.voiceMode = s.finalized ? 'done' : recording ? 'recording' : this.ready ? 'ready' : 'connecting';
        },

        openConfirm() {
            const box = $('voiceConfirmBox');
            if (box) {
                box.hidden = false;
                box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            this.render();
        },

        async approveAllNovel() {
            let state = this.session.state;
            const novels = [...(state.novelNames || [])];
            if (!novels.length && (state.pending || []).length) {
                this.setStatus('確認待ちの発話は手入力で直すか「取り消す」を押してください');
                this.render();
                return;
            }
            for (const name of novels) {
                state = AIVoiceModel.approveNovel(state, name);
                this.addNameToMenu(name);
            }
            this.session.state = state;
            await this.persist();
            try { this.syncHistory(); await this.persist(); } catch (e) { this.setStatus('履歴反映に失敗：' + e.message); }
            this.emitSets();
            if ((this.session.state.pending || []).length) {
                this.setStatus('新しい種目を登録しました。確認待ちは手入力か「取り消す」で処理してください');
            } else {
                this.setStatus('確認しました。保存できます');
            }
            this.render();
        },

        async rejectAllNovel() {
            let state = this.session.state;
            for (const name of [...(state.novelNames || [])]) state = AIVoiceModel.rejectNovel(state, name);
            for (const p of [...(state.pending || [])]) {
                state = AIVoiceModel.apply(state, {
                    id: crypto.randomUUID(), at: Date.now(), text: '確認待ちを無視',
                    operations: [{ kind: 'resolve', targetId: p.id, name: null, weight: null, reps: [], setIndex: null }]
                });
            }
            this.session.state = state;
            await this.persist();
            try { this.syncHistory(); await this.persist(); } catch (_) { /* ignore */ }
            this.emitSets();
            this.setStatus('未確認の内容を取り消しました');
            this.render();
        },

        addNameToMenu(name) {
            try {
                if (globalThis.storage?.addExerciseToDay) {
                    const day = this.session.dayIndex;
                    const exists = storage.getExercisesForDay(day)
                        .some(ex => ex.name === name || (ex.alternatives || []).includes(name));
                    if (!exists) storage.addExerciseToDay(day, { name, sets: '3', perSetWeight: true });
                    return;
                }
                const menu = JSON.parse(localStorage.getItem('gym_menu') || '{}');
                const day = this.session.dayIndex;
                menu[day] ||= { label: '', status: '', exercises: [] };
                menu[day].exercises ||= [];
                if (!menu[day].exercises.some(e => e.name === name)) {
                    menu[day].exercises.push({
                        id: crypto.randomUUID(), name, weight: '', sets: '3', repsRange: '',
                        restMinutes: 2, alternatives: []
                    });
                    localStorage.setItem('gym_menu', JSON.stringify(menu));
                }
            } catch (_) { /* keep voice session even if menu write fails */ }
        },

        handlePcmMessage(data) {
            if (data.flushed) { this.flushResolve?.(); return; }
            if (!data.pcm) return;
            const limit = this.useNativeCapture ? 20000 : this.gapLimitMs;
            if (this.recording && Date.now() - this.lastBlock > limit) {
                if (this.useNativeCapture) {
                    this.session.gaps.push({ at: Date.now(), reason: '音声の一時途切れ（継続中）' });
                    this.lastBlock = Date.now();
                } else {
                    void this.stop('音声の受信が途切れました', true);
                    return;
                }
            }
            this.lastBlock = Date.now();
            if (data.sequence !== this.received++) this.session.gaps.push({ at: Date.now(), reason: '音声ブロック不連続' });
            this.buffered++;
            this.writes = this.writes.then(() => this.acceptBlock(data))
                .catch(e => { void this.stop('録音保存に失敗：' + e.message, true); })
                .finally(() => this.buffered--);
            if (this.buffered > 8) void this.stop('録音の保存が追いつきません', true);
        },

        async start() {
            if (!this.ready || this.recording || this.session.finalized) return;
            try {
                await this.refreshMics(false);
                const estimate = await navigator.storage?.estimate?.();
                if (estimate && estimate.quota - estimate.usage < 190000000) throw Error('空き容量が足りません（約190MB必要）');

                this.received = 0; this.lastBlock = Date.now(); this.recording = true;
                this.activeStart = null; this.continuation = false;
                this.useNativeCapture = !!globalThis.GymNativeAudio?.available();
                this.gapLimitMs = this.useNativeCapture ? 20000 : 6000;

                if (!this.session.startedAt) {
                    this.session.startedAt = Date.now();
                    if (window.app?.sessionDate) this.session.recordDate = this.calendarDate(window.app.sessionDate);
                    this.session.dayIndex = window.app?.currentDayIndex ?? this.session.dayIndex;
                }

                if (this.useNativeCapture) {
                    await GymNativeAudio.configure();
                    this.pcmListener = await GymNativeAudio.addPcmListener((data) => this.handlePcmMessage(data));
                    this.flushListener = await GymNativeAudio.addFlushListener(() => this.flushResolve?.());
                    const deviceId = $('voiceMic')?.value || localStorage.getItem(MIC_KEY) || '';
                    await GymNativeAudio.startCapture(deviceId);
                    const label = $('voiceMic')?.selectedOptions?.[0]?.text || 'ネイティブマイク';
                    if ($('voiceMicActive')) $('voiceMicActive').textContent = '使用中：' + label + '（ネイティブ）';
                } else {
                    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
                    await this.ctx.resume();
                    this.stream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            ...this.chosenMicConstraint(),
                            channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true
                        }
                    });
                    await this.ctx.audioWorklet.addModule('js/ai-voice-capture.js');
                    this.node = new AudioWorkletNode(this.ctx, 'gym-pcm');
                    this.source = this.ctx.createMediaStreamSource(this.stream);
                    this.mute = this.ctx.createGain(); this.mute.gain.value = 0;
                    this.source.connect(this.node); this.node.connect(this.mute); this.mute.connect(this.ctx.destination);
                    const label = this.stream.getAudioTracks()[0]?.label || 'マイク';
                    if ($('voiceMicActive')) $('voiceMicActive').textContent = '使用中：' + label;
                    this.node.port.onmessage = ({ data }) => this.handlePcmMessage(data);
                    for (const t of this.stream.getAudioTracks()) {
                        t.addEventListener('ended', () => { if (this.recording) void this.stop('マイクが切れました', true); });
                        t.addEventListener('mute', () => { if (this.recording) void this.stop('マイク入力が中断されました', true); });
                    }
                    this.ctx.onstatechange = () => {
                        if (this.recording && this.ctx.state !== 'running') void this.stop('iPhoneが録音を停止しました', true);
                    };
                }

                if (navigator.wakeLock) {
                    try { this.wake = await navigator.wakeLock.request('screen'); } catch (_) { /* optional */ }
                }
                await this.persist();
                this.setStatus(this.useNativeCapture ? '録音中（アプリ・音楽同時OK）' : '録音中');
                this.render();
            } catch (e) {
                await this.stop(e.message || 'マイクを開始できません', true);
            }
        },

        async acceptBlock(data) {
            const pcm = VoiceAudio.downsample(data.pcm, data.rate), number = this.blockNo++;
            await this.db.put('blocks', { id: `${this.session.id}:${number}`, session: this.session.id, number, pcm, at: Date.now() });
            this.session.capturedMs += pcm.length / 16;
            this.session.blockNo = this.blockNo;
            const { speech } = VoiceAudio.level(pcm);
            if (speech) {
                if (this.activeStart === null) this.activeStart = Math.max(this.jobs.at(-1)?.end + 1 || 0, number - 1);
                this.silence = 0;
            } else if (this.activeStart !== null) this.silence++;
            if (this.activeStart !== null && this.silence >= 3) {
                await this.makeJob(number); this.continuation = false;
            } else if (this.activeStart !== null && number - this.activeStart >= 39) {
                await this.makeJob(number, true); this.activeStart = number + 1;
            }
            await this.persist();
            this.render();
        },

        async makeJob(end, boundary = false) {
            if (this.activeStart === null || end < this.activeStart) return;
            const job = {
                id: `${this.session.id}:job:${this.activeStart}-${end}`, session: this.session.id,
                start: this.activeStart, end, boundary: boundary || this.continuation,
                status: 'pending', at: Date.now()
            };
            await this.db.put('jobs', job);
            this.jobs.push(job);
            this.activeStart = null; this.silence = 0; this.continuation = boundary;
            this.render();
        },

        async stop(reason = '録音を止めました', gap = false) {
            if (this.stopping) return;
            this.stopping = true;
            const was = this.recording;
            const usedNative = this.useNativeCapture;
            this.recording = false;
            if (gap) {
                this.session.interrupted = true;
                this.session.gaps.push({ at: Date.now(), reason });
            }
            if (usedNative && was) {
                let flushed = false;
                const flushWait = new Promise(resolve => {
                    this.flushResolve = () => { flushed = true; resolve(); };
                });
                await GymNativeAudio.stopCapture();
                await Promise.race([
                    flushWait,
                    new Promise(resolve => setTimeout(resolve, 1500))
                ]);
                if (!flushed) this.session.gaps.push({ at: Date.now(), reason: '末尾を取得できませんでした' });
                try { await this.pcmListener?.remove(); } catch (_) { /* ignore */ }
                try { await this.flushListener?.remove(); } catch (_) { /* ignore */ }
                this.pcmListener = null;
                this.flushListener = null;
                await GymNativeAudio.teardown();
            } else if (this.node && was) {
                let flushed = false;
                await Promise.race([
                    new Promise(resolve => { this.flushResolve = () => { flushed = true; resolve(); }; this.node.port.postMessage('flush'); }),
                    new Promise(resolve => setTimeout(resolve, 1500))
                ]);
                if (!flushed) this.session.gaps.push({ at: Date.now(), reason: '末尾を取得できませんでした' });
            }
            this.stream?.getTracks().forEach(t => t.stop());
            this.node?.disconnect(); this.source?.disconnect(); this.mute?.disconnect();
            await this.ctx?.close().catch(() => {});
            await this.wake?.release().catch(() => {});
            this.wake = null; this.node = null; this.stream = null; this.ctx = null;
            this.useNativeCapture = false;
            await this.writes.catch(() => {});
            if (this.activeStart !== null) await this.makeJob(this.blockNo - 1, gap).catch(() => {});
            await this.persist().catch(() => {});
            this.setStatus(reason);
            this.stopping = false;
            this.render();
        },

        async api(path, body) {
            const response = await fetch(this.endpoint + path, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' })
                },
                body: body instanceof FormData ? body : JSON.stringify(body),
                signal: AbortSignal.timeout(125000)
            });
            const result = await response.json();
            const errors = {
                pc_offline: 'Codex用PC中継が停止中です',
                pc_processing_failed: 'PC解析に失敗しました',
                job_expired: 'PC処理の期限切れです',
                groq_not_configured: 'Groqが未設定です'
            };
            if (result.error && response.ok) throw Error(errors[result.error] || result.error);
            if (!response.ok) {
                const e = Error(errors[result.error] || result.error || '通信に失敗しました');
                e.status = response.status;
                throw e;
            }
            return result;
        },

        async processed(path, body) {
            let result = await this.api(path, body);
            const deadline = Date.now() + 230000;
            while (result.queued) {
                if (Date.now() > deadline) throw Error('PCの処理待ちです');
                await new Promise(r => setTimeout(r, 3000));
                result = await this.api('/pc-result', { id: result.id });
            }
            return result;
        },

        async pump() {
            if (!this.db || !this.session || this.busy || this.stopping || this.recording === undefined) return;
            if (!this.token || !navigator.onLine || Date.now() < this.retryAt || this.session.finalized) return;
            const job = this.jobs.find(j => j.status !== 'done');
            if (!job) return;
            this.busy = true; this.render();
            try {
                const blocks = await this.db.blocks(this.session.id, job.start, job.end);
                if (blocks.length !== job.end - job.start + 1) throw Error('録音区間に欠落があります');
                const form = new FormData();
                form.set('audio', VoiceAudio.wav(blocks.map(b => b.pcm)), 'speech.wav');
                form.set('metadata', JSON.stringify({
                    provider: this.session.provider || this.preferredProvider,
                    id: job.id,
                    names: [...new Set([...(this.session.state.names || []), ...(this.session.state.novelNames || [])])],
                    context: {
                        current: this.session.state.current, weight: this.session.state.weight,
                        sets: this.session.state.sets, pending: this.session.state.pending
                    }
                }));
                const packet = await this.processed('/analyze', form);
                if (packet.id !== job.id) throw Error('処理IDが一致しません');
                this.writes = this.writes.then(async () => {
                    const next = { ...this.session, state: AIVoiceModel.apply(this.session.state, { ...packet, at: job.at, boundary: job.boundary }) };
                    const done = { ...job, status: 'done', text: packet.text, completedAt: Date.now() };
                    await this.db.complete(next, done);
                    this.session = next;
                    Object.assign(job, done);
                    this.syncHistory();
                    await this.persist();
                });
                await this.writes;
                if ($('voiceHeard')) {
                    $('voiceHeard').textContent = `聞き取り：${packet.text || '発話なし'}`;
                    $('voiceHeard').dataset.last = $('voiceHeard').textContent;
                }
                if ($('voiceReply')) {
                    $('voiceReply').textContent = packet.uncertain || job.boundary ? '確認が必要です' : 'セットを更新しました';
                    $('voiceReply').dataset.last = $('voiceReply').textContent;
                }
                this.failures = 0;
                this.emitSets();
            } catch (e) {
                this.writes = this.writes.catch(() => {});
                this.failures++;
                this.retryAt = Date.now() + Math.min(60000, 2000 * 2 ** Math.min(this.failures, 5));
                if (e.status === 401) {
                    await this.autoConnect();
                    this.retryAt = 0; this.failures = 0;
                } else if ([403, 400, 413, 503, 425].includes(e.status)) {
                    this.retryAt = Infinity;
                }
                this.setStatus('未送信を保持：' + e.message);
            } finally {
                this.busy = false;
                this.render();
            }
        },

        async save() {
            if (this.recording) await this.stop('保存のため録音を止めました', false);
            if ((this.session.state.novelNames || []).length || (this.session.state.pending || []).length) {
                this.setStatus('先に「確認」で内容をチェックしてください');
                this.openConfirm();
                return;
            }
            if (this.jobs.some(j => j.status !== 'done')) {
                this.setStatus('まだ解析中の発話があります');
                return;
            }
            try {
                if (this.session.state.phase !== 'review') {
                    this.session.state.phase = 'review';
                }
                try {
                    const result = await this.processed('/audit', {
                        provider: this.session.provider || this.preferredProvider,
                        id: `${this.session.id}:audit:${this.session.state.revision}`,
                        names: this.session.state.names,
                        events: this.session.state.events,
                        sets: this.session.state.sets,
                        pending: this.session.state.pending
                    });
                    this.session.state.audit = { revision: this.session.state.revision, summary: result.summary, issues: result.issues };
                    for (const issue of result.issues || []) {
                        const event = this.session.state.events.find(e => e.id === issue.sourceId);
                        if (event && !this.session.state.pending.some(p => p.id === issue.sourceId)) {
                            this.session.state.pending.push({ id: issue.sourceId, text: event.text, reason: issue.reason });
                        }
                    }
                    if (this.session.state.pending.length) {
                        await this.persist();
                        this.setStatus('照合で確認事項があります');
                        this.openConfirm();
                        this.render();
                        return;
                    }
                } catch (_) {
                    // Save anyway if audit fails after user confirmed sets.
                }
                this.syncHistory();
                const next = {
                    ...this.session, finalized: true, finalizedAt: Date.now(),
                    records: AIVoiceModel.legacy(this.session.state)
                };
                await this.db.finalize(next);
                this.session = next;
                this.emitSets();
                this.setStatus('保存しました。過去データに入っています');
                this.render();
            } catch (e) {
                this.setStatus('保存に失敗：' + e.message);
            }
        },

        tick() {
            if (!this.session) return;
            this.render();
            const limit = this.useNativeCapture ? 45000 : 6000;
            if (this.recording && Date.now() - this.lastBlock > limit) {
                if (this.useNativeCapture) {
                    this.session.gaps.push({ at: Date.now(), reason: '長時間の音声空白（継続中）' });
                    this.lastBlock = Date.now();
                } else {
                    void this.stop('音声が届かなくなりました', true);
                }
            }
            void this.pump();
        }
    };

    globalThis.VoiceWorkout = VoiceWorkout;
})();
