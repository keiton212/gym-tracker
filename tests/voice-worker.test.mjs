import {test} from 'node:test'; import assert from 'node:assert/strict';
import worker,{VoiceBudget} from '../voice-worker/src/index.js';
const origin='https://keiton212.github.io';
const digest=async text=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))).toString('hex');
async function env(){return {ALLOWED_ORIGIN:origin,AUTH_SECRET:'test-only-secret',USER_PASS_HASH:await digest('test-password'),OPENAI_API_KEY:'test-only-key',
 LOGIN_LIMIT:{limit:async()=>({success:true})},BUDGET:{idFromName:()=>'',get:()=>({fetch:async()=>new Response('{}')})}};}
const req=(path,body,headers={})=>new Request('https://test'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test('auth, CORS, secret readiness and oversized requests fail closed',async()=>{
 const e=await env();
 assert.equal((await worker.fetch(req('/audit',{}),e)).status,401);
 assert.equal((await worker.fetch(req('/login',{password:'wrong'}),e)).status,401);
 assert.equal((await worker.fetch(req('/login',{password:'test-password'},{Origin:'https://evil.test'}),e)).status,403);
 assert.equal((await worker.fetch(req('/login',{password:'x'.repeat(2000)}),e)).status,413);
 const login=await worker.fetch(req('/login',{password:'test-password'}),e); const {token}=await login.json(); assert.ok(token);
 assert.equal((await worker.fetch(req('/audit',{},{Authorization:'Bearer '+token}),{...e,OPENAI_API_KEY:''})).status,503);
 assert.equal((await worker.fetch(req('/audit',{id:'x',names:[]},{Authorization:'Bearer '+token}),{...e,BUDGET:{idFromName:()=>'',get:()=>({fetch:async()=>new Response('{}',{status:429})})}})).status,429);
});
test('quota is durable, atomic, and prevents requests above daily audio allowance',async()=>{
 let value;const storage={transaction:async fn=>fn({get:async()=>value,put:async(k,v)=>{value=v;}})};
 const budget=new VoiceBudget({storage});
 const call=seconds=>budget.fetch(new Request('https://budget',{method:'POST',body:JSON.stringify({seconds})}));
 assert.equal((await call(10800)).status,200); assert.equal((await call(1)).status,429);
 assert.equal(value.seconds,10800);
});
test('malformed audio rejected without calling OpenAI',async()=>{
 const e=await env(),{token}=await (await worker.fetch(req('/login',{password:'test-password'}),e)).json();
 const form=new FormData();form.set('audio',new Blob([new Uint8Array(100)]),'bad.wav');form.set('metadata',JSON.stringify({id:'x',names:[]}));
 const r=await worker.fetch(new Request('https://test/analyze',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+token},body:form}),e);
 assert.equal(r.status,400);
});
