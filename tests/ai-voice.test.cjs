const {test}=require('node:test'); const assert=require('node:assert/strict');
const M=require('../js/ai-voice-model.js'), A=require('../js/ai-voice-audio.js');
const names=['ベンチプレス','インクラインダンベルプレス','ディップス'];
const op=(kind,extra={})=>({kind,name:null,weight:null,reps:[],setIndex:null,targetId:null,...extra});
const packet=(id,operations,extra={})=>({id,text:'発話',at:1,operations,...extra});
test('single, inherited, changed weight, grouped and bodyweight sets',()=>{
 let s=M.initial(names);
 s=M.apply(s,packet('1',[op('append',{name:names[0],weight:70,reps:[8]})]));
 s=M.apply(s,packet('2',[op('append',{reps:[6]})]));
 s=M.apply(s,packet('3',[op('append',{weight:65,reps:[8]})]));
 s=M.apply(s,packet('4',[op('append',{name:names[1],weight:20,reps:[10,10,10]})]));
 s=M.apply(s,packet('5',[op('append',{name:names[2],weight:0,reps:[10,8,6]})]));
 assert.deepEqual(s.sets.map(s=>s.reps),[8,6,8,10,10,10,10,8,6]);
 assert.deepEqual(s.sets.slice(0,3).map(s=>s.weight),[70,70,65]);
 assert.equal(M.legacy(s)['ディップス'].sets[0].weight,'0');
});
test('idempotent retry differs from another identical utterance',()=>{
 let s=M.initial(names); const p=packet('1',[op('append',{name:names[0],weight:70,reps:[8]})]);
 s=M.apply(s,p); s=M.apply(s,p); assert.equal(s.sets.length,1);
 s=M.apply(s,{...p,id:'2'}); assert.equal(s.sets.length,2);
});
test('unknown novel names are provisional; missing weight, invalid numbers, uncertain and split do not guess',()=>{
 let s=M.initial(names);
 s=M.apply(s,packet('novel',[op('append',{name:'サイドレイズ',weight:10,reps:[12]})]));
 assert.equal(s.sets.length,1); assert.equal(s.sets[0].novel,true); assert.deepEqual(s.novelNames,['サイドレイズ']);
 assert.equal(M.legacy(s)['サイドレイズ'],undefined);
 s=M.approveNovel(s,'サイドレイズ');
 assert.equal(s.sets[0].novel,undefined); assert.ok(s.names.includes('サイドレイズ'));
 assert.equal(M.legacy(s)['サイドレイズ'].sets[0].reps,'12');
 s=M.initial(names);
 for(const p of [packet('2',[op('append',{name:names[0],reps:[8]})]),
 packet('3',[op('append',{name:names[0],weight:70,reps:[-1]})]),packet('4',[op('append',{name:names[0],weight:70,reps:[8]})],{uncertain:true}),
 packet('5',[op('append',{name:names[0],weight:70,reps:[8]})],{boundary:true})]) s=M.apply(s,p);
 assert.equal(s.sets.length,0); assert.equal(s.pending.length,4);
 s=M.apply(M.initial(names),packet('n',[op('append',{name:'新品種',weight:20,reps:[10]})]));
 s=M.rejectNovel(s,'新品種');
 assert.equal(s.sets.length,0); assert.deepEqual(s.novelNames,[]);
});
test('targeted correction and undo are atomic; resolution cannot erase unrelated pending items',()=>{
 let s=M.apply(M.initial(names),packet('1',[op('append',{name:names[0],weight:70,reps:[8,6]})]));
 s=M.apply(s,packet('2',[op('correct',{name:names[0],setIndex:2,reps:[7]})]));
 assert.deepEqual(s.sets.map(s=>s.reps),[8,7]);
 s=M.apply(s,packet('3',[op('undo',{name:names[0],setIndex:1})])); assert.equal(s.sets.length,1);
 s=M.apply(s,packet('4',[op('undo',{name:names[0]})])); assert.equal(s.pending.length,1);
 const before=s.sets.length;
 s=M.apply(s,packet('5',[op('append',{reps:[3]}),op('resolve',{targetId:'invalid'})])); assert.equal(s.sets.length,before);
 s=M.apply(s,packet('6',[op('resolve',{targetId:'4'})])); assert.ok(!s.pending.some(p=>p.id==='4'));
});
test('ignore creates no records and review retains ability to correct',()=>{
 let s=M.apply(M.initial(names),packet('1',[op('ignore')])); assert.equal(s.sets.length,0);
 s=M.apply(s,packet('2',[op('append',{name:names[0],weight:70,reps:[8]}),op('review')]));
 assert.equal(s.phase,'review'); s=M.apply(s,packet('3',[op('correct',{name:names[0],setIndex:1,reps:[9]})])); assert.equal(s.sets[0].reps,9);
});
test('PCM blocks convert to a independently decodable mono 16kHz WAV',async()=>{
 const pcm=A.downsample(new Float32Array(48000).fill(0.5),48000); assert.equal(pcm.length,16000);
 const v=new DataView(await A.wav([pcm,pcm]).arrayBuffer()); assert.equal(v.getUint32(24,true),16000);
 assert.equal(v.getUint32(40,true),64000); assert.equal(v.byteLength,64044); assert.equal(v.getInt16(44,true),16384);
});
