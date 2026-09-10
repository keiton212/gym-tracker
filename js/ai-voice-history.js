/* Merge only this voice session's sets; never replace the day's manual records. */
(() => {
    function sync(store, session, remove = false) {
        if (session.mode !== 'live') return;
        const raw = store.getItem('gym_records');
        const records = raw === null ? {} : JSON.parse(raw);
        if (!records || typeof records !== 'object' || Array.isArray(records)) throw Error('履歴の形式を確認してください');
        const date = session.recordDate, day = String(session.dayIndex);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[0-6]$/.test(day)) throw Error('保存日・曜日が不明です');
        const exercises = structuredClone(records[date]?.[day] || {});
        const signature = data => JSON.stringify(Object.entries(data).flatMap(([name, record]) =>
            record.perSetWeight && Array.isArray(record.sets) ? record.sets.filter(x => x?.voiceSessionId === session.id).map(x =>
                [name, x.voiceSetId, String(x.weight), String(x.reps)]) : []).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
        const observed = signature(exercises);
        const wanted = JSON.stringify(session.state.sets.map(x => [x.name,x.id,String(x.weight),String(x.reps)]).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
        // The desired signature also accepts a retry after a successful localStorage
        // write whose following IndexedDB checkpoint was interrupted.
        if (!remove && session.historySignature !== undefined && observed !== session.historySignature && observed !== wanted) {
            throw Error('この音声記録の履歴が別画面で編集・削除されています。上書きを停止しました');
        }
        for (const name of Object.keys(exercises)) {
            const record = exercises[name];
            if (!record.perSetWeight || !Array.isArray(record.sets)) continue;
            const remaining = record.sets.filter(set => set?.voiceSessionId !== session.id);
            if (remaining.length === record.sets.length) continue;
            if (remaining.length) exercises[name] = { ...record, sets: remaining, setCount: remaining.length };
            else delete exercises[name];
        }
        for (const set of remove ? [] : session.state.sets) {
            if (!Object.hasOwn(exercises, set.name)) exercises[set.name] = { perSetWeight: true, sets: [], setCount: 0 };
            const record = exercises[set.name];
            if (!record.perSetWeight) {
                record.sets = (record.sets || []).map(reps => ({ weight: record.weight ?? '', reps }));
                record.perSetWeight = true;
            }
            record.sets.push({ weight: String(set.weight), reps: String(set.reps), voiceSessionId: session.id, voiceSetId: set.id });
            record.setCount = record.sets.length;
        }
        if (Object.keys(exercises).length) { records[date] ||= {}; records[date][day] = exercises; }
        else if (records[date]) { delete records[date][day]; if (!Object.keys(records[date]).length) delete records[date]; }
        store.setItem('gym_records', JSON.stringify(records));
        session.historySignature = signature(exercises);
    }
    globalThis.VoiceHistory = { sync };
    if (typeof module !== 'undefined') module.exports = { sync };
})();
