import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { VoiceRelay } from '../voice-worker/src/relay.js';

test('PC relay deduplicates, leases once, rejects stale results and erases audio', async () => {
    const database = new DatabaseSync(':memory:'), kv = new Map();
    const ctx = {storage:{sql:{exec(query,...bindings){const stmt=database.prepare(query);return {toArray:()=>stmt.all(...bindings)};}},
        put:async(k,v)=>kv.set(k,v),get:async k=>kv.get(k),setAlarm:async()=>{}}};
    // Match Cloudflare's eager SQL execution and iterable cursor.
    ctx.storage.sql.exec=(query,...bindings)=>{const rows=database.prepare(query).all(...bindings);return {toArray:()=>rows};};
    const relay = new VoiceRelay(ctx);
    const call=async(action,body={})=>relay.fetch(new Request('https://relay/'+action,{method:'POST',body:JSON.stringify(body)}));
    const payload={input:{names:['ベンチプレス']},audio:'private-audio',kind:'analyze'};
    assert.equal((await call('enqueue',{id:'one',hash:'a',payload})).status,202);
    assert.equal((await call('enqueue',{id:'one',hash:'b',payload})).status,409);
    const job=(await (await call('poll')).json()).job;
    assert.equal(job.audio,'private-audio');
    assert.equal((await (await call('poll')).json()).job,null);
    assert.equal((await call('complete',{id:'one',lease:'wrong',result:{id:'one'}})).status,409);
    const result={id:'one',text:'8回',operations:[]};
    assert.equal((await call('complete',{id:'one',lease:job.lease,result})).status,200);
    assert.equal(database.prepare('SELECT payload FROM jobs').get().payload,null);
    assert.deepEqual(await (await call('enqueue',{id:'one',hash:'a',payload})).json(),result);
    assert.deepEqual(await (await call('result',{id:'one'})).json(),result);
    database.prepare('UPDATE jobs SET expires=0').run();await relay.alarm();
    assert.equal((await call('result',{id:'one'})).status,410);
    database.close();
});
