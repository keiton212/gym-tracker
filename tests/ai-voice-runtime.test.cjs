const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const M=require('../js/ai-voice-model.js'),A=require('../js/ai-voice-audio.js');
const settle=async()=>{for(let i=0;i<15;i++)await new Promise(setImmediate);};
function runtime(){
 const elements=new Map(),tables={sessions:new Map(),blocks:new Map(),jobs:new Map()},intervals=[],nodes=[],packets=[],listeners={};
 const stored=new Map([['gym_menu',JSON.stringify({0:{exercises:[{name:'ベンチプレス'}]}})],['gym_records','{}'],['gym_ai_voice_token','test-token']]);
 const element=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',disabled:false,replaceChildren(...c){this.children=c;}});return elements.get(id);};
 class DB{async open(){return this;}async put(t,v){tables[t].set(v.id,structuredClone(v));}async all(t){return [...tables[t].values()].map(v=>structuredClone(v));}async bySession(t,id){return (await this.all(t)).filter(v=>v.session===id);}async blocks(id,start,end){return (await this.bySession('blocks',id)).filter(v=>v.number>=start&&v.number<=end).sort((a,b)=>a.number-b.number);}async lastBlock(id){return (await this.bySession('blocks',id)).reduce((n,b)=>Math.max(n,b.number),-1);}async complete(s,j){await this.put('sessions',s);await this.put('jobs',j);}async deleteSession(id){tables.sessions.delete(id);for(const name of ['blocks','jobs'])for(const [key,value]of tables[name])if(value.session===id)tables[name].delete(key);}async finalize(s){await this.put('sessions',s);for(const [id,b]of tables.blocks)if(b.session===s.id)tables.blocks.delete(id);}}
 const noop=()=>{};const link=()=>({connect:noop,disconnect:noop});
 class Context{constructor(){this.state='running';this.sampleRate=16000;this.audioWorklet={addModule:async()=>{}};this.destination={};}async resume(){}async close(){this.state='closed';this.onstatechange?.();}createMediaStreamSource(){return link();}createGain(){return {...link(),gain:{value:1}};}}
 class Node{constructor(){nodes.push(this);this.port={postMessage:()=>this.port.onmessage({data:{flushed:true}})};}connect(){}disconnect(){}}
 const calls=[];
 const c={console,crypto:globalThis.crypto,Date,JSON,Map,Set,Blob,FormData,URL,AbortSignal,Option:class{},structuredClone,Float32Array,Int16Array,
 AIVoiceModel:M,VoiceAudio:A,VoiceMenu:require('../js/ai-voice-menu.js'),VoiceHistory:require('../js/ai-voice-history.js'),VoiceDB:DB,GYM_VOICE_ENDPOINT:'https://test',AudioContext:Context,AudioWorkletNode:Node,
 localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},
 navigator:{onLine:true,storage:{estimate:async()=>({quota:1e9,usage:0})},mediaDevices:{getUserMedia:async()=>({getAudioTracks:()=>[{label:'test mic',addEventListener:noop}],getTracks:()=>[{stop:noop}]}),enumerateDevices:async()=>[]}},
 document:{getElementById:element,createElement:()=>({click:noop,replaceChildren(...children){this.children=children;}}),addEventListener:(name,fn)=>listeners[name]=fn,hidden:false},addEventListener:noop,
 setTimeout,clearTimeout,setInterval:fn=>intervals.push(fn),
 fetch:async(url,options={})=>{calls.push(url);if(url.endsWith('/health'))return Response.json({ready:true,providers:{openai:true,codex:true,groq:false}});if(url.endsWith('/session'))return Response.json({authenticated:true});
 if(url.endsWith('/analyze')){if(c.offline)throw Error('offline');const meta=JSON.parse(options.body.get('metadata'));const next=packets.shift();assert.ok(next,'expected packet');return Response.json({id:meta.id,...next});}
 if(url.endsWith('/audit'))return Response.json({summary:'一致',issues:[]});throw Error('Unexpected '+url);}};
 c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync('js/ai-voice.js','utf8'),c);
 let sequence=0;
 return {c,element,tables,stored,calls,packets,listeners,async init(){await settle();},async start(){await element('enable').onclick();},
 async emit(level){nodes.at(-1).port.onmessage({data:{pcm:new Float32Array(16000).fill(level),rate:16000,sequence:sequence++}});await settle();},
 async tick(){intervals[0]();await settle();},state(){return [...tables.sessions.values()].at(-1);}};
}
test('capture persists before API, retry preserves single set, silent end audits and removes audio only on confirmation',async()=>{
 const r=runtime();await r.init();assert.equal(r.element('enable').disabled,false);await r.start();
 await r.emit(.1);await r.emit(0);await r.emit(0);await r.emit(0);assert.equal(r.tables.blocks.size,4);
 r.c.offline=true;await r.tick();assert.equal(r.state().state.sets.length,0);assert.equal(r.tables.blocks.size,4);
 r.c.offline=false;r.packets.push({text:'ベンチプレス70キロ8回',uncertain:false,operations:[{kind:'append',name:'ベンチプレス',weight:70,reps:[8]}]});
 r.element('retry').onclick();await settle();assert.equal(r.state().state.sets.length,1,r.element('status').textContent);await r.tick();assert.equal(r.state().state.sets.length,1);
 r.packets.push({text:'筋トレ終了',uncertain:false,operations:[{kind:'review'}]});await r.emit(.1);await r.emit(0);await r.emit(0);await r.emit(0);await r.tick();await r.tick();
 assert.equal(r.state().state.phase,'review');assert.ok(r.state().state.audit);
 r.packets.push({text:'確認して保存',uncertain:false,operations:[{kind:'finalize'}]});await r.emit(.1);await r.emit(0);await r.emit(0);await r.emit(0);await r.tick();await r.tick();
 assert.equal(r.state().finalized,true);assert.equal(r.tables.blocks.size,0);assert.equal(JSON.parse(r.stored.get('gym_records'))[r.state().recordDate][r.state().dayIndex]['ベンチプレス'].sets[0].reps,'8');
 assert.equal(r.state().records['ベンチプレス'].sets[0].reps,'8');
});
test('worklet yields consecutive blocks through simulated 80 minutes and flushes partial tail',()=>{
 let count=0,frames=0,last=-1;const c={sampleRate:16000,Float32Array,AudioWorkletProcessor:class{constructor(){this.port={postMessage:data=>{if(data.pcm){assert.equal(data.sequence,last+1);last=data.sequence;frames+=data.pcm.length;count++;}}};}},registerProcessor:(name,cls)=>{c.Processor=cls;}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('js/ai-voice-capture.js','utf8'),c);const p=new c.Processor();const block=new Float32Array(128);
 for(let i=0;i<600000;i++)p.process([[block]]);
 assert.equal(count,4800);assert.equal(frames,16000*4800);
 p.process([[block]]);p.port.onmessage({data:'flush'});assert.equal(frames,16000*4800+128);
});
test('hiding the page does not stop healthy capture; menu reads both history formats without mutations',async()=>{
 const r=runtime();r.stored.set('gym_records',JSON.stringify({'2020-01-01':{0:{'ベンチプレス':{weight:'70',sets:['8','6']}}}}));
 await r.init();r.element('menuDay').value='0';await r.element('menuDay').onchange();
 const card=r.element('menuCards').children[0];assert.match(card.children[2].textContent,/70kg × 8回/);
 const original=r.stored.get('gym_records');await r.start();r.c.document.hidden=true;r.listeners.visibilitychange();await settle();
 assert.equal(r.element('stop').disabled,false);await r.emit(.1);assert.equal(r.tables.blocks.size,1);
 r.c.document.hidden=false;r.listeners.visibilitychange();await settle();assert.equal(r.element('stop').disabled,false);
 await r.element('stop').onclick();assert.equal(r.state().gaps.length,0);assert.equal(r.stored.get('gym_records'),original);
});
test('short quiet speech is detected while silence and isolated clicks are excluded',()=>{
 const pcm=new Int16Array(16000);assert.equal(A.level(pcm).speech,false);
 pcm[10]=32767;assert.equal(A.level(pcm).speech,false);
 pcm.fill(260,1600,3200);assert.equal(A.level(pcm).speech,true);
});
test('previous history excludes current day and retains individual set weights',()=>{
 const V=require('../js/ai-voice-menu.js');
 const records={'2026-09-10':{1:{bench:{weight:'99',sets:['99']}}},'2026-09-01':{1:{bench:{perSetWeight:true,sets:[{weight:'70',reps:'8'},{weight:'65',reps:'6'}]}}}};
 assert.equal(V.previous(records,'bench',1,'2026-09-10'),'2026-09-01：70kg × 8回 ／ 65kg × 6回');
 assert.match(V.previous({},'bench',1,'2026-09-10'),/ありません/);
 assert.equal(V.describe({weight:'0',sets:['10']}),'自重 × 10回');
});
test('screen deletion updates history, and deleting a session removes its jobs and audio only',async()=>{
 const r=runtime();await r.init();await r.start();
 r.packets.push({text:'ベンチプレス70キロ8回を2セット',uncertain:false,operations:[{kind:'append',name:'ベンチプレス',weight:70,reps:[8,8]}]});
 await r.emit(.1);await r.emit(0);await r.emit(0);await r.emit(0);await r.tick();
 await r.element('sets').children[0].children[1].onclick();assert.equal(r.state().state.sets.length,1);
 assert.equal(JSON.parse(r.stored.get('gym_records'))[r.state().recordDate][r.state().dayIndex]['ベンチプレス'].sets.length,1);
 await r.element('stop').onclick();const deletedId=r.state().id;
 r.tables.sessions.set('other',{id:'other',createdAt:1,finalized:true,mode:'validation',state:M.initial(['ベンチプレス'])});
 r.tables.blocks.set('other:0',{id:'other:0',session:'other',number:0,pcm:new Int16Array(10)});
 r.element('deleteSession').onclick();assert.equal(r.element('deleteConfirm').hidden,false);
 await r.element('confirmDeleteSession').onclick();assert.equal(r.tables.sessions.has(deletedId),false);assert.equal(r.tables.jobs.size,0);assert.equal(r.tables.blocks.size,1);assert.ok(r.tables.sessions.has('other'));assert.equal(r.stored.get('gym_records'),'{}');
});
test('old test session can be opened and deleted without importing it into history',async()=>{
 const r=runtime();await r.init();const state=M.apply(M.initial(['ベンチプレス']),{id:'old-event',text:'test',operations:[{kind:'append',name:'ベンチプレス',weight:70,reps:[8]}]});
 r.tables.sessions.set('old',{id:'old',createdAt:1,mode:'validation',state,gaps:[],logs:[],capturedMs:0});r.element('sessions').value='old';await r.element('loadSession').onclick();
 assert.match(r.element('summary').textContent,/テスト/);assert.equal(r.stored.get('gym_records'),'{}');
 await r.element('confirmDeleteSession').onclick();assert.equal(r.tables.sessions.has('old'),false);assert.equal(r.stored.get('gym_records'),'{}');
});
test('failed history write retains audio and retry saves once',async()=>{
 const r=runtime();await r.init();await r.start();const original=r.c.localStorage.setItem;
 r.c.localStorage.setItem=(k,v)=>{if(k==='gym_records')throw Error('quota');original(k,v);};
 r.packets.push({text:'ベンチプレス70キロ8回',uncertain:false,operations:[{kind:'append',name:'ベンチプレス',weight:70,reps:[8]}]});
 await r.emit(.1);await r.emit(0);await r.emit(0);await r.emit(0);await r.tick();assert.equal(r.tables.blocks.size,4);assert.equal(r.state().finalized,false);assert.match(r.element('summary').textContent,/保存失敗/);
 r.c.localStorage.setItem=original;await r.element('retry').onclick();await settle();const stored=JSON.parse(r.stored.get('gym_records'));assert.equal(stored[r.state().recordDate][r.state().dayIndex]['ベンチプレス'].sets.length,1);
 await r.element('stop').onclick();
});


test('provider selection is persisted and locked after recording starts',async()=>{
 const r=runtime();await r.init();await r.element('providerCodex').onclick();assert.equal(r.state().provider,'codex');
 assert.equal(r.element('providerGroq').disabled,true);await r.start();assert.equal(r.element('providerOpenai').disabled,true);
 await r.element('providerOpenai').onclick();assert.equal(r.state().provider,'codex');
 await r.element('stop').onclick();await r.element('new').onclick();assert.equal(r.state().provider,'codex');
 await r.element('providerOpenai').onclick();assert.equal(r.state().provider,'openai');
});
test('expired token auto-reconnects with saved password and hides setup',async()=>{
 const r=runtime();
 r.stored.set('gym_ai_voice_password','saved-pass');
 r.stored.set('gym_ai_voice_token','stale');
 let authenticated=false;
 r.c.fetch=async(url,options={})=>{
  r.calls.push(url);
  if(url.endsWith('/health'))return Response.json({ready:true,providers:{openai:true,codex:true,groq:true}});
  if(url.endsWith('/session'))return Response.json({authenticated});
  if(url.endsWith('/login')){
   assert.equal(JSON.parse(options.body).password,'saved-pass');
   authenticated=true;
   return Response.json({token:'fresh-token',expiresAt:Date.now()+3600000});
  }
  throw Error('Unexpected '+url);
 };
 await r.init();
 assert.equal(r.element('enable').disabled,false);
 assert.equal(r.element('setupManual').hidden,true);
 assert.match(r.element('setupStatus').textContent,/自動接続/);
 assert.equal(r.stored.get('gym_ai_voice_token'),'fresh-token');
 assert.ok(r.calls.some(u=>u.endsWith('/login')));
});
