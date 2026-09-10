/* Pure command/session model. Prototype storage never touches gym_records. */
(() => {
    const normalize = text => text.normalize('NFKC').toLowerCase().replace(/[\s、。,.，！!？?]/g, '');
    const clean = text => text.normalize('NFKC').toLowerCase().replace(/[\s、。，！!？?]/g, '');
    class VoiceSession {
        constructor(names, state) {
            this.names = [...new Set(names.filter(n => typeof n === 'string' && n.trim()))];
            this.state = state || { active: false, pendingEnd: false, current: null, weight: null, sets: [], startedAt: null, endedAt: null };
        }
        accept(raw) {
            const t = clean(raw);
            const s = this.state;
            if (s.pendingEnd) {
                if (['はい', '終了', '終了する', '保存して終了'].includes(t)) {
                    s.pendingEnd = false; s.active = false; s.endedAt = Date.now();
                    return '試作記録を保存しました。終了します';
                }
                if (['いいえ', '続ける', 'キャンセル'].includes(t)) {
                    s.pendingEnd = false; return '続けます';
                }
                return '終了しますか。はい、または、いいえ、と言ってください';
            }
            if (t === '筋トレ開始') {
                if (s.active) return 'すでに開始しています';
                if (s.endedAt) return 'この試験は終了しています。新しい試験は画面から開始してください';
                s.active = true; s.startedAt = Date.now(); return '開始しました。種目、重量、回数を話してください';
            }
            if (!s.active) return '筋トレ開始、と言ってください';
            if (t === '筋トレ終了') {
                s.pendingEnd = true; return `${s.sets.length}セットを保存しています。終了しますか。はい、または、いいえ、と言ってください`;
            }
            if (t === '今の取り消し') {
                if (!s.sets.length) return '取り消すセットがありません';
                s.sets.pop(); return '直前のセットを取り消しました';
            }
            let m = t.match(/^訂正([0-9]+)回$/);
            if (m) {
                if (!s.sets.length) return '訂正するセットがありません';
                if (+m[1] < 1 || +m[1] > 999) return '回数を1から999回で話してください';
                s.sets.at(-1).reps = +m[1]; return `直前のセットを${+m[1]}回に訂正しました`;
            }
            if (t === '今の記録') return `${s.current || '種目未選択'}、合計${s.sets.length}セットを保存しています`;
            // Anchored grammar: never extract arbitrary numbers from surrounding conversation.
            m = t.match(/^(.*?)(?:([0-9]+(?:\.[0-9]+)?)(?:キロ|kg|キログラム))?(?:([0-9]+)回)?$/);
            if (!m || (!m[1] && m[2] === undefined && m[3] === undefined)) return '種目、重量、回数をもう一度話してください';
            const [, spokenName, weight, reps] = m;
            let name = s.current;
            if (spokenName) {
                const matches = this.names.filter(n => normalize(n) === normalize(spokenName));
                if (matches.length !== 1) return '種目を特定できません。画面の登録種目名で話してください';
                name = matches[0];
            }
            if (!name) return '先に種目名と重量を話してください';
            const nextWeight = weight !== undefined ? +weight : name === s.current ? s.weight : null;
            if (nextWeight !== null && (!Number.isFinite(nextWeight) || nextWeight < 0 || nextWeight > 1000)) return '重量を0から1000キロで話してください';
            if (reps !== undefined && (+reps < 1 || +reps > 999)) return '回数を1から999回で話してください';
            if (reps !== undefined && nextWeight === null) return '重量も一緒に話してください';
            s.current = name; s.weight = nextWeight;
            if (reps === undefined) return `${name}、${nextWeight === null ? '重量を話してください' : nextWeight + 'キロに設定しました'}`;
            s.sets.push({ name, weight: nextWeight, reps: +reps, at: Date.now() });
            return `${name}、${s.sets.filter(set => set.name === name).length}セット目、${nextWeight}キロ${+reps}回を保存`;
        }
    }
    globalThis.VoiceSession = VoiceSession;
    if (typeof module !== 'undefined') module.exports = VoiceSession;
})();
