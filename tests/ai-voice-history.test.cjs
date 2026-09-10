const {test}=require('node:test'),assert=require('node:assert/strict');
const {sync}=require('../js/ai-voice-history.js');
function fixture(records={}) {let raw=JSON.stringify(records);return {getItem:()=>raw,setItem:(k,v)=>{raw=v;},read:()=>JSON.parse(raw)};}
const session=(id='voice')=>({id,mode:'live',recordDate:'2026-09-11',dayIndex:5,state:{sets:[{id:id+':1',name:'bench',weight:70,reps:8}]}});
test('autosave is idempotent and corrections preserve manual sets and other days',()=>{
 const store=fixture({'2026-09-04':{5:{bench:{weight:'60',sets:['9']}}},'2026-09-11':{5:{bench:{weight:'65',sets:['8']},dips:{weight:'0',sets:['10']}}}}),s=session();
 sync(store,s);sync(store,s);let day=store.read()['2026-09-11'][5];assert.equal(day.bench.sets.length,2);assert.equal(day.bench.sets[0].weight,'65');assert.equal(day.dips.sets[0],'10');
 s.state.sets[0].reps=6;sync(store,s);day=store.read()['2026-09-11'][5];assert.equal(day.bench.sets[1].reps,'6');
 sync(store,s,true);day=store.read()['2026-09-11'][5];assert.equal(day.bench.sets.length,1);assert.equal(day.bench.sets[0].reps,'8');assert.equal(store.read()['2026-09-04'][5].bench.sets[0],'9');
});
test('separate voice sessions remain distinct and only owned rows are removed',()=>{
 const store=fixture(),a=session('a'),b=session('b');sync(store,a);sync(store,b);sync(store,a);assert.equal(store.read()['2026-09-11'][5].bench.sets.length,2);
 a.state.sets=[];sync(store,a);assert.equal(store.read()['2026-09-11'][5].bench.sets[0].voiceSessionId,'b');sync(store,b,true);assert.deepEqual(store.read(),{});
});
test('old tests never enter history and malformed history is not overwritten',()=>{
 const store=fixture();sync(store,{...session(),mode:'validation'});assert.deepEqual(store.read(),{});
 let wrote=false;assert.throws(()=>sync({getItem:()=>'{bad',setItem:()=>{wrote=true;}},session()));assert.equal(wrote,false);
});
