const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function boot(seed = {}) {
    const elements = new Map(), timers = new Map(), recognizers = [], utterances = [];
    let timerId = 0, now = Date.now();
    class Clock extends Date { static now() { return now; } }
    const get = id => {
        if (!elements.has(id)) elements.set(id, { textContent: '', disabled: false, checked: true, value: '',
            replaceChildren(...children) { this.children = children; }, querySelector() { return get(id + '-button'); } });
        return elements.get(id);
    };
    const store = new Map(Object.entries(seed));
    class Recognition {
        constructor() { recognizers.push(this); }
        start() { this.onstart(); }
        abort() { this.onend(); }
        result(text, index = 0) {
            const results = []; const item = [{ transcript: text }]; item.isFinal = true; results[index] = item;
            this.onresult({resultIndex: index, results});
        }
    }
    const c = { console, Date: Clock, JSON, Map, Set, Blob, URL, SpeechRecognition: Recognition,
        SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
        speechSynthesis: { speak(u) { utterances.push(u); }, cancel() {} },
        navigator: { userAgent: 'unit-test' }, isSecureContext: true,
        localStorage: { getItem(k) { return store.get(k) ?? null; }, setItem(k,v) { store.set(k,v); } },
        document: { getElementById:get, createElement:() => ({}), addEventListener() {}, visibilityState:'visible' },
        addEventListener() {}, setTimeout(fn,ms) { const id = ++timerId; timers.set(id,{fn,ms}); return id; },
        clearTimeout(id) { timers.delete(id); }, setInterval() {}, confirm:() => true };
    c.window = c; vm.createContext(c);
    for (const file of ['js/voice-session.js','js/voice-test.js']) vm.runInContext(fs.readFileSync(file,'utf8'),c);
    function tick(ms) { const match = [...timers].find(([,t]) => t.ms === ms); assert.ok(match,`timer ${ms}`); now += ms; timers.delete(match[0]); match[1].fn(); }
    const state = () => JSON.parse(store.get('gym_voice_prototype_v1'));
    const finishSpeech = () => { utterances.at(-1).onend(); tick(450); };
    return { c, get, store, recognizers, utterances, tick, state, finishSpeech };
}
test('runtime serializes TTS, deduplicates events, permits identical sets, and preserves existing app data', () => {
    const b = boot({ gym_records:'{"existing":"untouched"}', gym_menu:JSON.stringify({[new Date().getDay()]:{exercises:[{name:'ベンチプレス',alternatives:['ダンベルプレス']}]}}) });
    b.get('enable').onclick(); b.finishSpeech();
    b.recognizers.at(-1).result('筋トレ開始'); b.finishSpeech();
    const r = b.recognizers.at(-1);
    r.result('ベンチプレス70キロ3回'); r.result('ベンチプレス70キロ3回');
    assert.equal(b.state().state.sets.length,1);
    b.finishSpeech(); b.recognizers.at(-1).result('3回');
    assert.equal(b.state().state.sets.length,2);
    b.finishSpeech(); b.recognizers.at(-1).result('筋トレ終了');
    b.finishSpeech(); b.recognizers.at(-1).result('はい');
    b.utterances.at(-1).onend();
    assert.equal(b.state().state.active,false); assert.ok(b.state().stoppedAt);
    assert.equal(b.store.get('gym_records'),'{"existing":"untouched"}');
    assert.ok(b.state().names.includes('ダンベルプレス'));
});
test('permission rejection stops rather than loops; silent cycle refresh restarts', () => {
    const b = boot(); b.get('enable').onclick(); b.finishSpeech();
    b.tick(45000); b.tick(350); assert.equal(b.recognizers.length,2);
    b.recognizers.at(-1).onerror({error:'not-allowed'});
    assert.ok(b.state().stoppedAt); assert.equal(b.get('stop').disabled,true);
});
test('storage failure rolls back record and never announces success', () => {
    const b = boot();
    b.get('command').value = '筋トレ開始'; b.get('simulate').onsubmit({preventDefault(){}});
    b.c.localStorage.setItem = () => { throw new Error('quota'); };
    b.get('command').value = 'ベンチプレス70キロ3回'; b.get('simulate').onsubmit({preventDefault(){}});
    assert.equal(b.state().state.sets.length,0);
    assert.match(b.get('status').textContent,/保存できません/);
});
