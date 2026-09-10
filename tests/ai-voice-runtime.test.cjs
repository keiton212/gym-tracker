const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const M=require('../js/ai-voice-model.js'),A=require('../js/ai-voice-audio.js');
const settle=async()=>{for(let i=0;i<15;i++)await new Promise(setImmediate);};
function runtime(){
 const elements=new Map(),tables={sessions:new Map(),blocks:new Map(),jobs:new Map()},intervals=[],nodes=[],packets=[];
 const stored=new Map([['gym_menu',JSON.stringify({0:{exercises:[{name:'ベンチプレス'}]}})],['gym_records','untouched'],['gym_ai_voice_token','test-token']]);
 const element=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',disabled:false,replaceChildren(...c){this.children=c;}});return elements.get(id);};
 class DB{async open(){return this;}async put(t,v){tables[t].set(v.id,structuredClone(v));}async all(t){return [...tables[t].values()].map(v=>structuredClone(v));}async bySession(t,id){return (await this.all(t)).filter(v=>v.session===id);}async blocks(id,start,end){return (await this.bySession('blocks',id)).filter(v=>v.number>=start&&v.number<=end).sort((a,b)=>a.number-b.number);}async lastBlock(id){return (await this.bySession('blocks',id)).reduce((n,b)=>Math.max(n,b.number),-1);}async complete(s,j){await this.put('sessions',s);await this.put('jobs',j);}async finalize(s){await this.put('sessions',s);for(const [id,b]of tables.blocks)if(b.session===s.id)tables.blocks.delete(id);}}
 const noop=()=>{};const link=()=>({connect:noop,disconnect:noop});
 class Context{constructor(){this.state='running';this.sampleRate=16000;this.audioWorklet={addModule:async()=>{}};this.destination={};}async resume(){}async close(){this.state='closed';this.onstatechange?.();}createMediaStreamSource(){return link();}createGain(){return {...link(),gain:{value:1}};}}
 class Node{constructor(){nodes.push(this);this.port={postMessage:()=>this.port.onmessage({data:{flushed:true}})};}connect(){}disconnect(){}}
 const calls=[];
 const c={console,crypto:globalThis.crypto,Date,JSON,Map,Set,Blob,FormData,URL,AbortSignal,Option:class{},structuredClone,Float32Array,Int16Array,
 AIVoiceModel:M,VoiceAudio:A,VoiceDB:DB,GYM_VOICE_ENDPOINT:'https://test',AudioContext:Context,AudioWorkletNode:Node,
 localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},
 navigator:{onLine:true,storage:{estimate:async()=>({quota:1e9,usage:0})},mediaDevices:{getUserMedia:async()=>({getAudioTracks:()=>[{label:'test mic',addEventListener:noop}],getTracks:()=>[{stop:noop}]}),enumerateDevices:async()=>[]}},
 document:{getElementById:element,createElement:()=>({click:noop}),addEventListener:noop,hidden:false},addEventListener:noop,
 setTimeout,clearTimeout,setInterval:fn=>intervals.push(fn),
 fetch:async(url,options={})=>{calls.push(url);if(url.endsWith('/health'))return Response.json({ready:true});if(url.endsWith('/session'))return Response.json({authenticated:true});
 if(url.endsWith('/analyze')){if(c.offline)throw Error('offline');const meta=JSON.parse(options.body.get('metadata'));const next=packets.shift();assert.ok(next,'expected packet');return Response.json({id:meta.id,...next});}
 if(url.endsWith('/audit'))return Response.json({summary:'一致',issues:[]});throw Error('Unexpected '+url);}};
 c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync('js/ai-voice.js','utf8'),c);
 let sequence=0;
 return {c,element,tables,stored,calls,packets,async init(){await settle();},async start(){await element('enable').onclick();},
 async emit(level){nodes.at(-1).port.onmessage({data:{pcm:new Float32Array(16000).fill(level),rate:16000,sequence:sequence++}});await settle();},
 async tick(){intervals[0]();await settle();},state(){return [...tables.sessions.values()].at(-1);}};
}
test('capture persists before API, retry preserves single set, silent end audits and removes audio only on confirmation',async()=>{
 const r=runtime();await r.init();assert.equal(r.element('enable').disabled,false);await r.start();
 await r.emit(.1);await r.emit(0);await r.emit(0);assert.equal(r.tables.blocks.size,3);
 r.c.offline=true;await r.tick();assert.equal(r.state().state.sets.length,0);assert.equal(r.tables.blocks.size,3);
 r.c.offline=false;r.packets.push({text:'ベンチプレス70キロ8回',uncertain:false,operations:[{kind:'append',name:'ベンチプレス',weight:70,reps:[8]}]});
 r.element('retry').onclick();await settle();assert.equal(r.state().state.sets.length,1,r.element('status').textContent);await r.tick();assert.equal(r.state().state.sets.length,1);
 r.packets.push({text:'筋トレ終了',uncertain:false,operations:[{kind:'review'}]});await r.emit(.1);await r.emit(0);await r.emit(0);await r.tick();await r.tick();
 assert.equal(r.state().state.phase,'review');assert.ok(r.state().state.audit);
 r.packets.push({text:'確認して保存',uncertain:false,operations:[{kind:'finalize'}]});await r.emit(.1);await r.emit(0);await r.emit(0);await r.tick();await r.tick();
 assert.equal(r.state().finalized,true);assert.equal(r.tables.blocks.size,0);assert.equal(r.stored.get('gym_records'),'untouched');
 assert.equal(r.state().records['ベンチプレス'].sets[0].reps,'8');
});
test('worklet yields consecutive blocks through simulated 80 minutes and flushes partial tail',()=>{
 let count=0,frames=0,last=-1;const c={sampleRate:16000,Float32Array,AudioWorkletProcessor:class{constructor(){this.port={postMessage:data=>{if(data.pcm){assert.equal(data.sequence,last+1);last=data.sequence;frames+=data.pcm.length;count++;}}};}},registerProcessor:(name,cls)=>{c.Processor=cls;}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('js/ai-voice-capture.js','utf8'),c);const p=new c.Processor();const block=new Float32Array(128);
 for(let i=0;i<600000;i++)p.process([[block]]);
 assert.equal(count,4800);assert.equal(frames,16000*4800);
 p.process([[block]]);p.port.onmessage({data:'flush'});assert.equal(frames,16000*4800+128);
});
