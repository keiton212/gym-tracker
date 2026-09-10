// One authenticated owner's bounded, expiring PC queue. No public execution API.
const reply = (data, status = 200) => Response.json(data, { status });
export class VoiceRelay {
    constructor(ctx) {
        this.ctx = ctx;
        this.sql = ctx.storage.sql;
        this.sql.exec(`CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, hash TEXT NOT NULL,
            payload TEXT, result TEXT, expires INTEGER NOT NULL, lease TEXT, leasedUntil INTEGER DEFAULT 0)`);
    }
    async alarm() {
        this.sql.exec('DELETE FROM jobs WHERE expires < ?', Date.now());
        const next = this.sql.exec('SELECT MIN(expires) AS expiry FROM jobs').toArray()[0]?.expiry;
        if (next) await this.ctx.storage.setAlarm(next + 1);
    }
    async fetch(request) {
        const action = new URL(request.url).pathname;
        const body = await request.json(), now = Date.now();
        this.sql.exec('DELETE FROM jobs WHERE expires < ?', now);
        if (action === '/heartbeat') {
            await this.ctx.storage.put('heartbeat', now);
            return reply({ ok: true });
        }
        if (action === '/status') return reply({ online: now - (await this.ctx.storage.get('heartbeat') || 0) < 45000 });
        if (action === '/enqueue') {
            const old = this.sql.exec('SELECT hash, result FROM jobs WHERE id = ?', body.id).toArray()[0];
            if (old) return old.hash !== body.hash ? reply({ error: 'job_conflict' }, 409) : reply(old.result ? JSON.parse(old.result) : { queued: true, id: body.id }, old.result ? 200 : 202);
            if (this.sql.exec('SELECT COUNT(*) AS n FROM jobs').toArray()[0].n >= 100) return reply({ error: 'pc_queue_full' }, 429);
            this.sql.exec('INSERT INTO jobs (id, hash, payload, expires) VALUES (?, ?, ?, ?)', body.id, body.hash, JSON.stringify(body.payload), now + 900000);
            await this.ctx.storage.setAlarm(this.sql.exec('SELECT MIN(expires) AS expiry FROM jobs').toArray()[0].expiry + 1);
            return reply({ queued: true, id: body.id }, 202);
        }
        if (action === '/result') {
            const row = this.sql.exec('SELECT result FROM jobs WHERE id = ?', body.id).toArray()[0];
            return row ? reply(row.result ? JSON.parse(row.result) : { queued: true, id: body.id }, row.result ? 200 : 202) : reply({ error: 'job_expired' }, 410);
        }
        if (action === '/poll') {
            const row = this.sql.exec('SELECT id, payload FROM jobs WHERE result IS NULL AND leasedUntil < ? ORDER BY expires LIMIT 1', now).toArray()[0];
            if (!row) return reply({ job: null });
            const lease = crypto.randomUUID();
            this.sql.exec('UPDATE jobs SET lease = ?, leasedUntil = ? WHERE id = ?', lease, now + 240000, row.id);
            return reply({ job: { ...JSON.parse(row.payload), id: row.id, lease } });
        }
        if (action === '/complete') {
            const row = this.sql.exec('SELECT lease FROM jobs WHERE id = ?', body.id).toArray()[0];
            if (!row || row.lease !== body.lease) return reply({ error: 'stale_lease' }, 409);
            // Erase audio and context as soon as a result is accepted.
            this.sql.exec('UPDATE jobs SET result = ?, payload = NULL WHERE id = ?', JSON.stringify(body.result), body.id);
            if (body.result.error) {
                this.sql.exec('UPDATE jobs SET expires = MIN(expires, ?) WHERE id = ?', now + 5000, body.id);
                await this.ctx.storage.setAlarm(now + 5001);
            }
            return reply({ ok: true });
        }
        return reply({ error: 'not_found' }, 404);
    }
}
