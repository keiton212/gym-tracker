const { test } = require('node:test');
const assert = require('node:assert/strict');
const VoiceSession = require('../js/voice-session.js');
const create = () => new VoiceSession(['ベンチプレス', 'スクワット', 'ダンベルプレス']);
test('start, repeated reps, weight changes, correction, undo and confirmed end', () => {
    const s = create(); s.accept('筋トレ開始');
    s.accept('ベンチプレス７０キロ３回'); s.accept('5回'); s.accept('5回');
    assert.deepEqual(s.state.sets.map(x => x.reps), [3,5,5]);
    s.accept('訂正、6回'); assert.equal(s.state.sets[2].reps, 6);
    s.accept('今の取り消し'); assert.equal(s.state.sets.length, 2);
    s.accept('72.5キロ'); s.accept('4回');
    assert.deepEqual(s.state.sets.map(x => x.weight), [70,70,72.5]);
    s.accept('筋トレ終了'); assert.equal(s.state.active, true);
    s.accept('いいえ'); assert.equal(s.state.pendingEnd, false);
    s.accept('筋トレ終了'); s.accept('はい'); assert.equal(s.state.active, false);
    assert.ok(s.state.endedAt);
});
test('unknown names, ambiguous phrases and invalid values cannot modify records', () => {
    const s = create(); s.accept('筋トレ開始'); s.accept('ベンチプレス70キロ3回');
    for (const text of ['知らない種目40キロ3回','たぶん5回か4回','5','0回','1000回','-5回','1001キロ3回']) {
        const before = JSON.stringify(s.state); s.accept(text); assert.equal(JSON.stringify(s.state), before, text);
    }
});
test('exercise switching requires fresh weight and accepts registered alternatives', () => {
    const s = create(); s.accept('筋トレ開始'); s.accept('ベンチプレス70キロ3回');
    s.accept('スクワット5回'); assert.equal(s.state.sets.length, 1);
    s.accept('スクワット'); s.accept('5回'); assert.equal(s.state.sets.length, 1);
    s.accept('80キロ5回'); s.accept('ダンベルプレス20キロ8回');
    assert.deepEqual(s.state.sets.map(x => x.weight), [70,80,20]);
});
test('persisted prototype state resumes and undo of the final set persists empty records', () => {
    const s = create(); s.accept('筋トレ開始'); s.accept('ベンチプレス70kg3回');
    const restored = new VoiceSession(s.names, JSON.parse(JSON.stringify(s.state)));
    restored.accept('4回'); assert.equal(restored.state.sets.length, 2);
    restored.accept('今の取り消し'); restored.accept('今の取り消し');
    assert.deepEqual(restored.state.sets, []);
});
