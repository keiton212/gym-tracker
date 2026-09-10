(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    let db, s, jobs = [], stream, ctx, node, source, mute, wake;
    let recording = false, stopping = false, busy = false, auditBusy = false, ready = false;
    let writes = Promise.resolve(), blockNo = 0, lastBlock = 0, received = 0, buffered = 0;
    let activeStart = null, silence = 0, continuation = false, flushResolve;
    let retryAt = 0, failures = 0, auditWanted = false, finalizeWanted = false;
    let editing = false;
    let endpoint = localStorage.getItem('gym_ai_voice_endpoint') || GYM_VOICE_ENDPOINT;
    let token = localStorage.getItem('gym_ai_voice_token') || '';
    const message = text => { $('status').textContent = text; };
    const persist = () => db.put('sessions', s);
    const log = (type, detail = '') => { s.logs.push({ at: Date.now(), type, detail }); if (s.logs.length > 6000) s.logs.shift(); };
    const calendarDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    function names() {
        const menu = JSON.parse(localStorage.getItem('gym_menu') || '{}'), today = new Date().getDay();
        return [...new Set([today, ...[0,1,2,3,4,5,6].filter(i => i !== today)].flatMap(day =>
            (menu[day]?.exercises || []).flatMap(e => [e.name, ...(Array.isArray(e.alternatives) ? e.alternatives : [])])).filter(n => typeof n === 'string' && n.trim()))];
    }
    const fresh = () => ({ id: crypto.randomUUID(), createdAt: Date.now(), state: AIVoiceModel.initial(names()),
        logs: [], gaps: [], capturedMs: 0, blockNo: 0, finalized: false, startedAt: null, interrupted: false, mode: 'live',
        recordDate: calendarDate(), dayIndex: new Date().getDay() });
    function syncHistory(remove = false) {
        try { VoiceHistory.sync(localStorage, s, remove); s.historyError = ''; }
        catch (e) { s.historyError = e.message; throw e; }
    }
    async function editRecord(operation, text) {
        if (busy || auditBusy || stopping || editing) return;
        editing = true; render();
        try {
            writes = writes.then(async () => {
                s.state = AIVoiceModel.apply(s.state, { id: crypto.randomUUID(), at: Date.now(), text, operations: [operation] });
                s.records = AIVoiceModel.legacy(s.state); await persist(); syncHistory(); await persist();
            });
            await writes; message('削除を保存しました。');
        } catch(e) { writes = writes.catch(() => {}); message('端末の音声記録は保持しています。履歴への反映を再試行してください：'+e.message); }
        finally { editing = false; render(); }
    }
    function renderMenu() {
        try {
            const menu = JSON.parse(localStorage.getItem('gym_menu') || '{}');
            const records = JSON.parse(localStorage.getItem('gym_records') || '{}');
            const day = Number($('menuDay').value), date = new Date(s.createdAt);
            const before = s.recordDate || calendarDate(date);
            const cards = (menu[day]?.exercises || []).map(e => {
                const card = document.createElement('article'); card.className = 'exercise-card';
                const title = document.createElement('h3'); title.textContent = e.name;
                const plan = document.createElement('p'); plan.textContent = `メニュー：${VoiceMenu.weight(e.weight)} · ${e.sets || '未設定'}セット · ${e.repsRange || '未設定'}回`;
                const rows = [e.name, ...(Array.isArray(e.alternatives) ? e.alternatives : [])].flatMap(name => {
                    const last = document.createElement('p'); last.className = 'note';
                    last.textContent = `${name === e.name ? '前回' : '代替：'+name}：${VoiceMenu.previous(records, name, day, before)}`;
                    const now = document.createElement('p'); now.className = 'current-sets';
                    const sets = s.state.sets.filter(x => x.name === name);
                    now.textContent = `${name === e.name ? '今回' : name+'・今回'}：${sets.length ? sets.map((x,i) => `${i+1}: ${VoiceMenu.weight(x.weight)} × ${x.reps}回`).join(' ／ ') : 'まだ記録なし'}`;
                    return [last, now];
                });
                card.replaceChildren(title, plan, ...rows); return card;
            });
            $('menuCards').replaceChildren(...cards);
            $('menuNote').textContent = cards.length ? '前回は選んだ曜日の、今回より前の日付の通常履歴です。メニューの目標値を実績へ自動入力しません。' : 'この曜日のメニューは空です。別の曜日を選ぶか、ホームで登録してください。';
        } catch { $('menuNote').textContent = 'メニュー・履歴を読み込めません。元のデータは変更していません。'; }
    }
    function render() {
        if (!s) return;
        renderMenu();
        $('names').textContent = s.state.names.join(' ／ ') || '登録種目がありません。先にメニューを登録してください。';
        const counts = {};
        $('sets').replaceChildren(...s.state.sets.map(set => {
            const li = document.createElement('li'); counts[set.name] = (counts[set.name] || 0) + 1; const setIndex = counts[set.name];
            const label = document.createElement('span'); label.textContent = `${set.name} ${counts[set.name]}セット目：${set.weight === 0 ? '自重' : set.weight + 'kg'} × ${set.reps}回`;
            const button = document.createElement('button'); button.textContent = '削除'; button.className = 'secondary'; button.disabled = busy || auditBusy || stopping || editing;
            button.onclick = () => editRecord({ kind:'undo', name:set.name, targetId:set.id }, `${set.name}の${setIndex}セット目を画面で削除`);
            li.replaceChildren(label, button); return li;
        }));
        $('pending').replaceChildren(...s.state.pending.map((p,i) => {
            const li = document.createElement('li'), label = document.createElement('span'); label.textContent = `確認待ち${i+1}：「${p.text}」 — ${p.reason}`;
            const button = document.createElement('button'); button.textContent = '記録に入れず削除'; button.className = 'secondary'; button.disabled = busy || auditBusy || stopping || editing;
            button.onclick = () => editRecord({ kind:'resolve', targetId:p.id }, `確認待ち${i+1}を画面で無視`); li.replaceChildren(label, button); return li;
        }));
        $('summary').textContent = `${s.state.sets.length}セット · ${s.mode !== 'live' ? '以前のテスト記録（通常履歴には未反映）' : s.historyError ? '履歴への保存失敗：'+s.historyError : '通常の履歴へ自動保存'}`;
        $('deleteSession').disabled = recording || stopping || busy || auditBusy || editing;
        $('confirmDeleteSession').disabled = recording || stopping || busy || auditBusy || editing;
        $('menuDay').disabled = s.mode === 'live' && (recording || !!s.startedAt || s.state.sets.length > 0);
        $('queueStatus').textContent = `送信待ち：${jobs.filter(j => j.status !== 'done').length}件${busy ? ' · 解析中' : ''}`;
        $('phase').textContent = s.finalized ? '保存完了' : s.state.phase === 'review' ? '終了時の確認' : 'トレーニング記録';
        $('enable').disabled = editing || s.deleting || recording || stopping || s.finalized || !ready || !s.state.names.length;
        $('stop').disabled = !recording; $('new').disabled = recording || stopping || busy || auditBusy;
        $('connect').disabled = recording; $('mic').disabled = recording;
        $('loadSession').disabled = recording || stopping || busy || auditBusy; $('sessions').disabled = recording || stopping || busy || auditBusy;
        $('finalize').disabled = busy || auditBusy || stopping || s.finalized || s.state.pending.length > 0 || jobs.some(j => j.status !== 'done');
        $('auditBtn').disabled = busy || auditBusy || s.finalized || jobs.some(j => j.status !== 'done');
        $('audit').textContent = auditBusy ? '発話と記録を照合しています…' : s.state.audit?.summary || '全体照合はまだ完了していません。';
        $('result').textContent = `録音中断：${s.gaps.length}件${s.interrupted ? ' · 中断した区間の記録を確認してください' : ''}`;
    }
    async function api(path, body) {
        const response = await fetch(endpoint + path, { method: 'POST', headers: { Authorization: `Bearer ${token}`,
            ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
            body: body instanceof FormData ? body : JSON.stringify(body), signal: AbortSignal.timeout(125000) });
        const result = await response.json();
        if (!response.ok) { const e = Error(result.error || '通信に失敗しました'); e.status = response.status; throw e; }
        return result;
    }
    async function health() {
        if (!endpoint) { message('初回接続を設定してください。'); return; }
        try {
            const r = await fetch(endpoint + '/health', { signal: AbortSignal.timeout(10000) }); const h = await r.json();
            let authenticated=false;
            if(token && h.ready){ const check=await fetch(endpoint+'/session',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)}); authenticated=check.ok && (await check.json()).authenticated; }
            ready = r.ok && h.ready && authenticated;
            message(!h.ready ? '音声サービスの秘密設定待ちです。' : authenticated ? '開始できます。音は出ません。' : '専用パスワードで接続してください。');
        } catch { ready = false; message('音声サービスに接続できません。保存済みの記録は残っています。'); }
        render();
    }
    async function acquireWake() {
        if (!navigator.wakeLock) { $('wake').textContent = '点灯維持非対応：端末の自動ロックを無効にしてください'; return; }
        try {
            const lock = await navigator.wakeLock.request('screen'); if (!recording) { await lock.release(); return; }
            wake = lock; $('wake').textContent = '画面の点灯維持：有効';
            lock.addEventListener('release', () => { if (wake === lock) { wake = null; $('wake').textContent = '点灯維持が解除されました'; } });
        } catch { $('wake').textContent = '点灯維持に失敗：自動ロック設定を確認してください'; }
    }
    async function makeJob(end, boundary = false) {
        if (activeStart === null || end < activeStart) return;
        const job = { id: `${s.id}:job:${activeStart}-${end}`, session: s.id, start: activeStart, end,
            boundary: boundary || continuation, status: 'pending', at: Date.now() };
        await db.put('jobs', job); jobs.push(job); activeStart = null; silence = 0; continuation = boundary; render();
    }
    async function acceptBlock(data) {
        const pcm = VoiceAudio.downsample(data.pcm, data.rate), number = blockNo++;
        await db.put('blocks', { id: `${s.id}:${number}`, session: s.id, number, pcm, at: Date.now() });
        s.capturedMs += pcm.length / 16; s.blockNo = blockNo;
        const { peak: rms, speech } = VoiceAudio.level(pcm);
        if (recording) $('captureStatus').textContent = `録音中 · ${stream?.getAudioTracks()[0]?.label || 'マイク'} · 入力レベル ${Math.round(rms * 1000)}`;
        if (speech) { if (activeStart === null) activeStart = Math.max(jobs.at(-1)?.end + 1 || 0, number - 1); silence = 0; }
        else if (activeStart !== null) silence++;
        if (activeStart !== null && silence >= 3) { await makeJob(number); continuation = false; }
        else if (activeStart !== null && number - activeStart >= 39) { await makeJob(number, true); activeStart = number + 1; }
        await persist();
    }
    async function start() {
        if (s.deleting || recording || editing || !ready || !s.state.names.length) return;
        try {
            if (!s.startedAt && s.mode === 'live') s.recordDate = calendarDate();
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            await ctx.resume();
            const estimate = await navigator.storage?.estimate?.();
            if (estimate && estimate.quota - estimate.usage < 190000000) throw Error('録音用に約190MB以上の空き容量が必要です');
            stream = await navigator.mediaDevices.getUserMedia({ audio: { ...($('mic').value ? { deviceId: { exact: $('mic').value } } : {}),
                channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
            await ctx.audioWorklet.addModule('js/ai-voice-capture.js');
            node = new AudioWorkletNode(ctx, 'gym-pcm'); source = ctx.createMediaStreamSource(stream); mute = ctx.createGain(); mute.gain.value = 0;
            source.connect(node); node.connect(mute); mute.connect(ctx.destination);
            received = 0; lastBlock = Date.now(); recording = true; activeStart = null; continuation = false;
            if (s.startedAt) { s.interrupted = true; log('resumed'); } else s.startedAt = Date.now();
            node.port.onmessage = ({ data }) => {
                if (data.flushed) { flushResolve?.(); return; }
                if (!data.pcm) return;
                if (recording && Date.now() - lastBlock > 6000) {
                    void stop('音声の受信に6秒以上の空白があります。中断区間を確認してください', true);
                }
                lastBlock = Date.now();
                if (data.sequence !== received++) s.gaps.push({ at: Date.now(), reason: '音声ブロックが不連続です' });
                buffered++;
                writes = writes.then(() => acceptBlock(data)).catch(e => { void stop('録音保存に失敗：' + e.message, true); }).finally(() => buffered--);
                if (buffered > 8) void stop('録音の保存が追いつかないため中断しました', true);
            };
            for (const t of stream.getAudioTracks()) {
                t.addEventListener('ended', () => { if (recording) void stop('マイク接続が切れました', true); });
                t.addEventListener('mute', () => { if (recording) void stop('マイク入力が中断されました', true); });
            }
            ctx.onstatechange = () => { if (recording && ctx.state !== 'running') void stop('iPhoneが録音処理を停止しました', true); };
            const devices = await navigator.mediaDevices.enumerateDevices(), selected = $('mic').value;
            $('mic').replaceChildren(new Option('iPhoneが選択したマイク', ''), ...devices.filter(d => d.kind === 'audioinput').map(d => new Option(d.label || 'マイク', d.deviceId))); $('mic').value = selected;
            log('capture-start', { microphone: stream.getAudioTracks()[0]?.label, rate: ctx.sampleRate });
            await persist(); await acquireWake(); render(); message('録音中です。種目・重量・回数を話してください。');
        } catch (e) { await stop(e.message || 'マイクを開始できませんでした', true); }
    }
    async function stop(reason = '録音を停止しました', gap = false) {
        if (stopping) return;
        stopping = true; const wasRecording = recording; recording = false;
        if (gap) { s.interrupted = true; s.gaps.push({ at: Date.now(), reason }); }
        if (node && wasRecording) {
            let flushed = false;
            await Promise.race([new Promise(resolve => { flushResolve = () => { flushed = true; resolve(); }; node.port.postMessage('flush'); }), new Promise(resolve => setTimeout(resolve,1500))]);
            if (!flushed) s.gaps.push({ at: Date.now(), reason: '最後の1秒未満を取得できませんでした' });
        }
        stream?.getTracks().forEach(t => t.stop()); node?.disconnect(); source?.disconnect(); mute?.disconnect();
        await ctx?.close().catch(() => {}); await wake?.release().catch(() => {}); wake = null; node = null;
        await writes.catch(() => {});
        if (activeStart !== null) await makeJob(blockNo - 1, gap).catch(() => {});
        log('capture-stop', reason); await persist().catch(() => {});
        $('captureStatus').textContent = '録音：停止'; message(reason); stopping = false; render();
    }
    async function pump() {
        if (!db || !s || s.deleting || editing || busy || stopping || auditBusy || !token || !navigator.onLine || Date.now() < retryAt || s.finalized) return;
        const job = jobs.find(j => j.status !== 'done');
        if (!job) { if (auditWanted) await audit(); return; }
        busy = true; render();
        try {
            const blocks = await db.blocks(s.id, job.start, job.end);
            if (blocks.length !== job.end - job.start + 1) throw Error('録音区間に欠落があります。書き出して確認してください');
            const form = new FormData(); form.set('audio', VoiceAudio.wav(blocks.map(b => b.pcm)), 'speech.wav');
            form.set('metadata', JSON.stringify({ id: job.id, names: s.state.names, context: { current: s.state.current, weight: s.state.weight,
                sets: s.state.sets, pending: s.state.pending } }));
            const packet = await api('/analyze', form); if (packet.id !== job.id) throw Error('処理IDが一致しません');
            writes = writes.then(async () => {
                const next = { ...s, state: AIVoiceModel.apply(s.state, { ...packet, at: job.at, boundary: job.boundary }) };
                const done = { ...job, status: 'done', text: packet.text, completedAt: Date.now() };
                await db.complete(next, done); s = next; Object.assign(job, done); syncHistory(); await persist();
            });
            await writes; $('heard').textContent = `聞き取り：${packet.text || '発話なし'}`;
            $('reply').textContent = packet.uncertain || job.boundary ? '終了時の確認に追加しました' : '記録を更新しました'; failures = 0;
            if (s.state.phase === 'review' || s.state.finalizeRequested) auditWanted = true;
            if (s.state.finalizeRequested) { finalizeWanted = true; s.state.finalizeRequested = false; }
        } catch (e) {
            // Restore a usable write chain after a failed atomic commit.
            writes = writes.catch(() => {});
            failures++; retryAt = Date.now() + Math.min(60000, 2000 * 2 ** Math.min(failures,5));
            if ([401,403,400,413,503].includes(e.status)) { retryAt = Infinity; ready = false; }
            message(`未処理分を端末に保持しています：${e.message}`); log('processing-error', e.message);
        } finally { busy = false; render(); }
    }
    async function audit() {
        if (busy || auditBusy || jobs.some(j => j.status !== 'done') || s.finalized) return;
        auditWanted = false; auditBusy = true; const revision = s.state.revision; render();
        try {
            const result = await api('/audit', { id: `${s.id}:audit:${revision}`, names: s.state.names, events: s.state.events, sets: s.state.sets, pending: s.state.pending });
            writes = writes.then(async () => {
                if (revision !== s.state.revision) { auditWanted = true; return; }
                s.state.audit = { revision, summary: result.summary, issues: result.issues };
                for (const issue of result.issues || []) {
                    const event = s.state.events.find(e => e.id === issue.sourceId);
                    if (event && !s.state.pending.some(p => p.id === issue.sourceId)) s.state.pending.push({ id: issue.sourceId, text: event.text, reason: issue.reason });
                }
                await persist();
            }); await writes;
        } catch (e) { writes = writes.catch(() => {}); message('全体照合は未完了です：' + e.message); }
        finally { auditBusy = false; render(); }
        if (finalizeWanted && !s.state.pending.length && s.state.audit?.revision === s.state.revision) await finalize();
    }
    async function finalize() {
        if (editing || busy || auditBusy || stopping || s.finalized || jobs.some(j => j.status !== 'done') || s.state.pending.length) return;
        finalizeWanted = true;
        if (s.state.audit?.revision !== s.state.revision) { auditWanted = true; return; }
        await stop('最終区間を保存しています');
        if (jobs.some(j => j.status !== 'done')) { auditWanted = true; return; }
        try {
            syncHistory();
            const next = { ...s, finalized: true, finalizedAt: Date.now(), records: AIVoiceModel.legacy(s.state) };
            await db.finalize(next); s = next; finalizeWanted = false;
            message(s.mode === 'live' ? '通常の履歴へ保存しました。一時録音を削除しました。' : '以前のテスト記録として保存しました。通常履歴には未反映です。');
        } catch (e) { message('最終保存に失敗しました。録音を保持します：' + e.message); }
        render();
    }
    function download(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url),10000); }
    $('connect').onclick = async () => {
        try {
            const value = new URL($('endpoint').value.trim());
            if (value.protocol !== 'https:' || value.username || value.password || value.search || value.hash || value.pathname !== '/') throw Error('HTTPSのサービスURLを指定してください');
            endpoint = value.origin;
            const r = await fetch(endpoint + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('password').value }), signal: AbortSignal.timeout(15000) });
            const result = await r.json(); if (!r.ok) throw Error(result.error);
            token = result.token; localStorage.setItem('gym_ai_voice_endpoint', endpoint); localStorage.setItem('gym_ai_voice_token', token); $('password').value = '';
            retryAt = 0; await health();
        } catch (e) { message('接続できません：' + e.message); }
    };
    $('enable').onclick = start; $('stop').onclick = () => stop('手動で中断しました', false);
    $('retry').onclick = async () => { try { if(!editing && !busy) { syncHistory(); await persist(); } retryAt = 0; void pump(); } catch(e) { message('履歴への保存に失敗：'+e.message); } render(); };
    $('auditBtn').onclick = () => { s.state.phase = 'review'; auditWanted = true; };
    $('finalize').onclick = finalize;
    $('new').onclick = async () => {
        if (recording || busy || auditBusy || stopping || editing) return;
        s = fresh(); jobs = []; blockNo = 0; activeStart = null; retryAt = 0; writes = Promise.resolve(); finalizeWanted = false; auditWanted = false;
        $('menuDay').value = String(s.dayIndex); $('deleteConfirm').hidden = true;
        await persist(); await sessionOptions(); render(); message('通常の履歴に保存する新しい記録を開始できます。');
    };
    async function sessionOptions(){
        const sessions=(await db.all('sessions')).sort((a,b)=>b.createdAt-a.createdAt);
        $('sessions').replaceChildren(...sessions.map(x=>new Option(`${new Date(x.createdAt).toLocaleString('ja-JP')} · ${x.mode === 'live' ? '通常記録' : '旧テスト'} · ${x.finalized?'確定済み':'未確定'}`,x.id)));
        $('sessions').value=s.id;
    }
    $('loadSession').onclick=async()=>{
        if(recording||busy||auditBusy||stopping||editing)return;
        const selected=(await db.all('sessions')).find(x=>x.id===$('sessions').value);if(!selected)return;
        await writes;s=selected;jobs=(await db.bySession('jobs',s.id)).sort((a,b)=>a.start-b.start);blockNo=Math.max(s.blockNo||0,(await db.lastBlock(s.id))+1);
        activeStart=null;continuation=false;finalizeWanted=false;auditWanted=false;retryAt=0;
        $('menuDay').value = String(s.dayIndex ?? new Date(s.createdAt).getDay()); $('deleteConfirm').hidden = true;
        render();message('保存済みの音声記録を開きました。');
    };
    $('deleteSession').onclick = () => { $('deleteConfirm').hidden = false; };
    $('cancelDeleteSession').onclick = () => { $('deleteConfirm').hidden = true; };
    $('confirmDeleteSession').onclick = async () => {
        if (recording || busy || auditBusy || stopping || editing) return;
        editing = true; render();
        try {
            await writes; s.deleting = true; await persist(); syncHistory(true); await db.deleteSession(s.id);
            s = fresh(); jobs = []; blockNo = 0; activeStart = null; continuation = false; auditWanted = false; finalizeWanted = false; retryAt = 0;
            await persist(); await sessionOptions(); $('menuDay').value = String(s.dayIndex); $('deleteConfirm').hidden = true;
            message('この音声記録と一時録音を削除しました。');
        } catch(e) { message('削除を完了できませんでした。再試行してください：'+e.message); }
        finally { editing = false; render(); }
    };
    $('export').onclick = () => download(new Blob([JSON.stringify({ ...s, jobs },null,2)], { type:'application/json' }), `gym-ai-${s.id}.json`);
    $('exportAudio').onclick = async () => {
        const last=await db.lastBlock(s.id);
        if(last<0){ message('一時録音はありません'); return; }
        for(let i=0;i<=last;i+=600){ const blocks=await db.blocks(s.id,i,i+599); download(VoiceAudio.wav(blocks.map(b=>b.pcm)),`gym-audio-${s.id}-${i}.wav`); }
    };
    $('menuDay').replaceChildren(...['日','月','火','水','木','金','土'].map((day,i) => new Option(day+'曜日',String(i))));
    $('menuDay').value = String(new Date().getDay());
    $('menuDay').onchange = async () => { if(s.mode === 'live' && !s.startedAt && !s.state.sets.length) { s.dayIndex = Number($('menuDay').value); await persist(); } renderMenu(); };
    document.addEventListener('visibilitychange', () => {
        if (!recording) return;
        log(document.hidden ? 'page-hidden' : 'page-visible');
        if (!document.hidden) {
            if (Date.now()-lastBlock > 6000) { void stop('画面を離れている間に録音が中断しました。再開してください', true); return; }
            if (!wake) void acquireWake();
        }
        writes = writes.then(persist).catch(e => { void stop('状態を保存できません：'+e.message,true); });
    });
    window.addEventListener('online', () => { retryAt=0; void pump(); });
    setInterval(() => {
        if (!s) return;
        const seconds=Math.floor(s.capturedMs/1000); $('elapsed').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')} / 80:00`; $('progress').value=seconds;
        if (recording && Date.now()-lastBlock>6000) void stop('音声データが届かなくなりました',true);
        void pump();
    },1000);
    (async () => {
        try {
            db=await new VoiceDB().open(); let sessions=(await db.all('sessions')).sort((a,b)=>b.createdAt-a.createdAt);
            for (const deleted of sessions.filter(x=>x.deleting)) { VoiceHistory.sync(localStorage, deleted, true); await db.deleteSession(deleted.id); }
            sessions = sessions.filter(x=>!x.deleting);
            s=sessions.find(x=>!x.finalized && x.mode === 'live')||fresh(); jobs=(await db.bySession('jobs',s.id)).sort((a,b)=>a.start-b.start);
            if (!s.startedAt && !s.state.sets.length) s.state.names = names();
            $('menuDay').value = String(s.dayIndex);
            try { syncHistory(); } catch(e) { message('履歴への反映を再試行してください：'+e.message); }
            blockNo=Math.max(s.blockNo||0,(await db.lastBlock(s.id))+1);
            if (s.startedAt) {
                s.interrupted=true; log('page-reopened'); const last=jobs.reduce((max,j)=>Math.max(max,j.end),-1);
                for (let from=last+1;from<blockNo;from+=40) { activeStart=from; await makeJob(Math.min(blockNo-1,from+39),true); } continuation=false;
            }
            $('endpoint').value=endpoint; await persist(); await sessionOptions(); render(); await health();
            if(s.startedAt) message('前回の未確定記録・録音を復旧しました。未送信分を再処理します。');
        } catch(e) { message('端末データを開けません。既存データは削除していません：'+e.message); }
    })();
})();
