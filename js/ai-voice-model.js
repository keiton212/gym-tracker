/* Deterministic reducer: AI proposes operations; only validated operations mutate records. */
(() => {
    const initial = names => ({ version: 2, names: [...new Set(names)], phase: 'recording', current: null,
        weight: null, sets: [], pending: [], events: [], applied: [], audit: null, revision: 0 });
    const number = (x, min, max, integer = false) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max && (!integer || Number.isInteger(x));
    function apply(state, packet) {
        if (state.applied.includes(packet.id)) return state;
        const next = structuredClone(state);
        const issue = reason => next.pending.push({ id: packet.id, text: packet.text, reason, at: packet.at });
        next.events.push({ id: packet.id, text: packet.text, at: packet.at, operations: packet.operations });
        next.applied.push(packet.id); next.revision++; next.audit = null;
        if (packet.boundary) { issue('長い発話の分割境界です。数字とセット数を確認してください'); return next; }
        if (packet.uncertain) { issue(packet.reason || '発話を確定できません'); return next; }
        const base = structuredClone(next);
        let appended = 0;
        try {
            if (!Array.isArray(packet.operations) || packet.operations.length > 30) throw Error('操作形式が不正です');
            for (const op of packet.operations) {
                if (op.kind === 'ignore') continue;
                if (op.kind === 'review') { next.phase = 'review'; continue; }
                if (op.kind === 'finalize') { next.finalizeRequested = true; continue; }
                if (op.kind === 'resolve') {
                    if (!op.targetId || !next.pending.some(p => p.id === op.targetId)) throw Error('確認対象を特定できません');
                    next.pending = next.pending.filter(p => p.id !== op.targetId); continue;
                }
                const name = op.name || next.current;
                if (!next.names.includes(name)) throw Error('登録種目を特定できません');
                const weight = op.weight === null || op.weight === undefined ? (name === next.current ? next.weight : null) : op.weight;
                if (weight !== null && !number(weight, 0, 1000)) throw Error('重量を確認してください');
                if (op.kind === 'select') { next.current = name; next.weight = weight; continue; }
                if (op.kind === 'append') {
                    if (weight === null) throw Error('種目の重量を指定してください');
                    if (!Array.isArray(op.reps) || !op.reps.length || op.reps.length > 20 || op.reps.some(r => !number(r, 1, 999, true))) throw Error('回数を確認してください');
                    next.current = name; next.weight = weight;
                    for (const reps of op.reps) next.sets.push({ id: `${packet.id}:${appended++}`, name, weight, reps, sourceId: packet.id, at: packet.at });
                    continue;
                }
                if (op.kind === 'correct' || op.kind === 'undo') {
                    const candidates = next.sets.filter(s => s.name === name);
                    const target = op.targetId ? next.sets.find(s => s.id === op.targetId && s.name === name) :
                        number(op.setIndex, 1, candidates.length, true) ? candidates[op.setIndex - 1] : null;
                    if (!target) throw Error('訂正・取り消しの対象が不明です');
                    if (op.kind === 'undo') next.sets = next.sets.filter(s => s.id !== target.id);
                    else {
                        if (!Array.isArray(op.reps) || op.reps.length !== 1 || !number(op.reps[0], 1, 999, true)) throw Error('訂正の回数を確認してください');
                        target.reps = op.reps[0]; if (op.weight !== null && op.weight !== undefined) target.weight = weight;
                        target.correctedBy = packet.id;
                    }
                    continue;
                }
                throw Error('未対応の操作です');
            }
        } catch (e) {
            base.pending.push({ id: packet.id, text: packet.text, reason: e.message, at: packet.at }); return base;
        }
        return next;
    }
    function legacy(state) {
        const records = {};
        for (const set of state.sets) {
            records[set.name] ||= { perSetWeight: true, sets: [], setCount: 0 };
            records[set.name].sets.push({ weight: String(set.weight), reps: String(set.reps) });
            records[set.name].setCount++;
        }
        return records;
    }
    const api = { initial, apply, legacy };
    globalThis.AIVoiceModel = api;
    if (typeof module !== 'undefined') module.exports = api;
})();
