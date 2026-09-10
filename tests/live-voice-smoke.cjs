// Opt-in live test: synthetic speech only. Reads the app-specific login from its private file.
const fs=require('node:fs'),path=require('node:path');
const {wav}=require('../js/ai-voice-audio.js');
(async()=>{
 const dir=path.join(process.env.LOCALAPPDATA,'GymTracker');
 const password=fs.readFileSync(path.join(dir,'voice-connection.txt'),'utf8').match(/専用接続パスワード: (\S+)/)[1];
 const base='https://gym-tracker-voice.nest-task-manager.workers.dev',origin='https://keiton212.github.io';
 const login=await fetch(base+'/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password})});
 if(!login.ok)throw Error('Login failed: '+login.status);const {token}=await login.json();
 const buf=fs.readFileSync(path.join(dir,'test-synthetic.wav'));let pcm;
 for(let at=12;at+8<=buf.length;){const size=buf.readUInt32LE(at+4);if(buf.toString('ascii',at,at+4)==='data'){pcm=new Int16Array(size/2);for(let i=0;i<pcm.length;i++)pcm[i]=buf.readInt16LE(at+8+i*2);break;}at+=8+size+(size%2);}
 if(!pcm)throw Error('Missing PCM');
 const form=new FormData();form.set('audio',wav([pcm]),'speech.wav');
 form.set('metadata',JSON.stringify({provider:process.env.GYM_TEST_PROVIDER || 'openai',id:'synthetic-deploy-test-'+Date.now(),names:['ベンチプレス','ディップス'],context:{current:null,weight:null,sets:[],pending:[]}}));
 const r=await fetch(base+'/analyze',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+token},body:form});
 if(!r.ok)throw Error('Analysis failed: '+r.status+' '+await r.text());
 let result=await r.json();const started=Date.now();
 while(result.queued){
  if(Date.now()-started>240000)throw Error('PC result timed out');
  await new Promise(resolve=>setTimeout(resolve,3000));
  const check=await fetch(base+'/pc-result',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({id:result.id})});
  if(!check.ok)throw Error('Polling failed: '+check.status);result=await check.json();
 }
 if(result.error)throw Error(result.error);
 console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
