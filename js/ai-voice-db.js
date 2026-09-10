(() => {
    class VoiceDB {
        async open() {
            this.db = await new Promise((resolve, reject) => {
                const req = indexedDB.open('gym-ai-voice-v2', 1);
                req.onupgradeneeded = () => {
                    req.result.createObjectStore('sessions', { keyPath: 'id' });
                    const blocks = req.result.createObjectStore('blocks', { keyPath: 'id' }); blocks.createIndex('session', 'session'); blocks.createIndex('position', ['session', 'number']);
                    const jobs = req.result.createObjectStore('jobs', { keyPath: 'id' }); jobs.createIndex('session', 'session');
                };
                req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
            });
            return this;
        }
        transaction(stores, write, operation) {
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(stores, write ? 'readwrite' : 'readonly');
                let result;
                try { result = operation(tx); } catch (e) { tx.abort(); reject(e); return; }
                tx.oncomplete = () => resolve(result?.result ?? result);
                tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || Error('保存を中断しました'));
            });
        }
        put(store, value) { return this.transaction([store], true, tx => tx.objectStore(store).put(value)); }
        all(store) { return this.transaction([store], false, tx => tx.objectStore(store).getAll()); }
        bySession(store, id) { return this.transaction([store], false, tx => tx.objectStore(store).index('session').getAll(id)); }
        blocks(id, start, end) {
            return this.transaction(['blocks'], false, tx => tx.objectStore('blocks').index('position').getAll(IDBKeyRange.bound([id,start],[id,end])));
        }
        lastBlock(id) {
            return new Promise((resolve,reject) => {
                const tx=this.db.transaction(['blocks'],'readonly');
                const req=tx.objectStore('blocks').index('position').openKeyCursor(IDBKeyRange.bound([id,0],[id,Number.MAX_SAFE_INTEGER]),'prev');
                req.onsuccess=()=>resolve(req.result ? req.result.key[1] : -1); req.onerror=()=>reject(req.error);
            });
        }
        // Session state and completed job are committed together, so retries cannot duplicate sets.
        complete(session, job) {
            return this.transaction(['sessions', 'jobs'], true, tx => {
                tx.objectStore('sessions').put(session); tx.objectStore('jobs').put(job);
            });
        }
        async finalize(session) {
            return this.transaction(['sessions', 'blocks'], true, tx => {
                tx.objectStore('sessions').put(session);
                const req=tx.objectStore('blocks').index('session').openKeyCursor(session.id);
                req.onsuccess=()=>{ const cursor=req.result; if(cursor){ tx.objectStore('blocks').delete(cursor.primaryKey); cursor.continue(); } };
            });
        }
        deleteSession(id) {
            return this.transaction(['sessions', 'blocks', 'jobs'], true, tx => {
                tx.objectStore('sessions').delete(id);
                for (const table of ['blocks', 'jobs']) {
                    const store = tx.objectStore(table), req = store.index('session').openKeyCursor(id);
                    req.onsuccess = () => { const cursor = req.result; if (cursor) { store.delete(cursor.primaryKey); cursor.continue(); } };
                }
            });
        }
    }
    globalThis.VoiceDB = VoiceDB;
})();
