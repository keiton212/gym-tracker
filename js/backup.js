// LocalStorageを主保存先として維持しつつ、IndexedDBに世代バックアップを自動保存する。
// 同一端末内の誤消去・破損には自動復旧し、端末故障にはJSON書き出しで備える。
const BACKUP_DB_NAME = 'gym_tracker_resilience';
const BACKUP_STORE_NAME = 'snapshots';
const BACKUP_DB_VERSION = 1;
const MAX_LOCAL_SNAPSHOTS = 20;

var Backup = {
    dbPromise: null,
    snapshotTimer: null,

    async init() {
        await this.requestPersistentStorage();

        if (storage.needsRecoveryOnBoot) {
            const recovered = await this.restoreLatestLocalSnapshot();
            if (recovered) return;
            this.showRecovery();
        } else {
            await this.createLocalSnapshot('startup');
        }

        this.renderStatus();
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') this.createLocalSnapshot('background');
        });
        window.addEventListener('pagehide', () => this.createLocalSnapshot('pagehide'));
    },

    openDatabase() {
        if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB unavailable'));
        if (this.dbPromise) return this.dbPromise;

        this.dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(BACKUP_DB_NAME, BACKUP_DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(BACKUP_STORE_NAME)) {
                    const store = db.createObjectStore(BACKUP_STORE_NAME, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('createdAt', 'createdAt');
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        return this.dbPromise;
    },

    buildData() {
        const data = {};
        Object.values(STORAGE_KEYS).forEach(key => {
            const raw = localStorage.getItem(key);
            if (raw === null) return;
            try {
                data[key] = JSON.parse(raw);
            } catch (e) {
                data[key] = raw;
            }
        });
        return data;
    },

    hasUsefulData(data) {
        const records = data?.[STORAGE_KEYS.RECORDS];
        const menu = data?.[STORAGE_KEYS.MENU];
        const hasRecords = records && typeof records === 'object' && Object.keys(records).length > 0;
        const hasMenu = menu && typeof menu === 'object' && Object.values(menu)
            .some(day => Array.isArray(day?.exercises) && day.exercises.length > 0);
        return Boolean(hasRecords || hasMenu);
    },

    scheduleSnapshot() {
        clearTimeout(this.snapshotTimer);
        this.snapshotTimer = setTimeout(() => this.createLocalSnapshot('change'), 300);
    },

    async createLocalSnapshot(reason) {
        const data = this.buildData();
        if (!this.hasUsefulData(data)) {
            this.setProtectionStatus('データ作成後に開始');
            return false;
        }

        try {
            const db = await this.openDatabase();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(BACKUP_STORE_NAME, 'readwrite');
                tx.objectStore(BACKUP_STORE_NAME).add({
                    createdAt: Date.now(),
                    reason,
                    data
                });
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });
            await this.pruneLocalSnapshots(db);
            this.setProtectionStatus('保護済み');
            return true;
        } catch (e) {
            this.setProtectionStatus('利用できません', true);
            return false;
        }
    },

    async pruneLocalSnapshots(db) {
        await new Promise((resolve, reject) => {
            const tx = db.transaction(BACKUP_STORE_NAME, 'readwrite');
            const store = tx.objectStore(BACKUP_STORE_NAME);
            const request = store.openCursor(null, 'prev');
            let kept = 0;
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) return;
                kept += 1;
                if (kept > MAX_LOCAL_SNAPSHOTS) cursor.delete();
                cursor.continue();
            };
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    },

    async latestLocalSnapshot() {
        try {
            const db = await this.openDatabase();
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(BACKUP_STORE_NAME, 'readonly');
                const request = tx.objectStore(BACKUP_STORE_NAME).openCursor(null, 'prev');
                request.onsuccess = () => resolve(request.result?.value || null);
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            return null;
        }
    },

    async restoreLatestLocalSnapshot() {
        const snapshot = await this.latestLocalSnapshot();
        if (!snapshot || !this.hasUsefulData(snapshot.data)) return false;
        this.writeData(snapshot.data);
        this.showToast('端末内バックアップから自動復元しました');
        setTimeout(() => location.reload(), 500);
        return true;
    },

    normalizePayload(payload) {
        if (payload?.app === 'GymTracker' && payload.data) return payload.data;
        if (payload?.data && typeof payload.data === 'object') return payload.data;

        // 以前の「データを書き出す」で作られたファイルとの互換性を保つ。
        if (payload?.menu || payload?.records || payload?.timerSettings) {
            return {
                [STORAGE_KEYS.MENU]: payload.menu,
                [STORAGE_KEYS.RECORDS]: payload.records,
                [STORAGE_KEYS.TIMER_SETTINGS]: payload.timerSettings
            };
        }
        return payload;
    },

    validatedData(payload) {
        const source = this.normalizePayload(payload);
        if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Invalid backup');

        const validKeys = new Set(Object.values(STORAGE_KEYS));
        const data = {};
        Object.entries(source).forEach(([key, value]) => {
            if (validKeys.has(key) && value !== undefined) data[key] = value;
        });
        if (!Object.keys(data).length || !this.hasUsefulData(data)) throw new Error('No GymTracker data');
        return data;
    },

    writeData(data) {
        const validKeys = new Set(Object.values(STORAGE_KEYS));
        Object.entries(data).forEach(([key, value]) => {
            if (!validKeys.has(key) || value === undefined) return;
            localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        });
    },

    filePayload() {
        return {
            app: 'GymTracker',
            version: 2,
            savedAt: new Date().toISOString(),
            data: this.buildData()
        };
    },

    fileName(savedAt) {
        const date = new Date(savedAt);
        const pad = value => String(value).padStart(2, '0');
        return `gym-tracker-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.json`;
    },

    save() {
        const payload = this.filePayload();
        const json = JSON.stringify(payload, null, 2);
        const fileName = this.fileName(payload.savedAt);
        const blob = new Blob([json], { type: 'application/json' });

        storage.setLastExportAt(Date.now());
        this.createLocalSnapshot('manual-export');
        this.renderStatus();
        window.app?.displayBackupReminder?.();

        if (navigator.canShare) {
            const file = new File([blob], fileName, { type: 'application/json' });
            if (navigator.canShare({ files: [file] })) {
                navigator.share({ files: [file], title: 'GymTracker バックアップ' }).catch(() => {});
                return;
            }
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    openFilePicker() {
        document.getElementById('backupRestoreInput')?.click();
    },

    async restoreFromFile(event) {
        const input = event.target;
        const file = input.files?.[0];
        if (!file) return;

        try {
            const payload = JSON.parse(await file.text());
            const data = this.validatedData(payload);
            await this.createLocalSnapshot('before-file-restore');
            this.writeData(data);
            await this.createLocalSnapshot('file-restore');
            alert('復元しました。アプリを再読み込みします。');
            location.reload();
        } catch (e) {
            alert('復元に失敗しました。GymTrackerのバックアップファイルを選んでください。');
        } finally {
            input.value = '';
        }
    },

    showRecovery() {
        const overlay = document.getElementById('recoveryOverlay');
        if (!overlay) return;
        const message = document.getElementById('recoveryMessage');
        if (message && storage.needsRecoveryOnBoot) {
            message.textContent = '保存データの破損を検知しました。端末内の自動バックアップが見つからなかったため、書き出したバックアップファイルから復元してください。';
        }
        overlay.hidden = false;
    },

    startFresh() {
        document.getElementById('recoveryOverlay').hidden = true;
        this.createLocalSnapshot('fresh-start');
    },

    async requestPersistentStorage() {
        if (!navigator.storage?.persist) return;
        try {
            const alreadyPersistent = await navigator.storage.persisted();
            if (!alreadyPersistent) await navigator.storage.persist();
        } catch (e) {
            // ブラウザ側が拒否しても通常保存とバックアップは継続する。
        }
    },

    setProtectionStatus(text, failed = false) {
        const element = document.getElementById('localBackupStatus');
        if (!element) return;
        element.textContent = text;
        element.style.color = failed ? '#b91c1c' : '';
    },

    renderStatus() {
        const element = document.getElementById('backupStatusText');
        if (!element) return;

        const last = storage.getLastExportAt();
        const stale = !last || Date.now() - last > 7 * 24 * 60 * 60 * 1000;
        element.classList.toggle('stale', stale);
        if (!last) {
            element.textContent = '端末外バックアップはまだありません';
            return;
        }
        const date = new Date(last);
        const pad = value => String(value).padStart(2, '0');
        element.textContent = `${stale ? 'しばらく書き出していません — ' : ''}最終書き出し: ${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    },

    showToast(text) {
        const toast = document.createElement('div');
        toast.className = 'backup-toast';
        toast.textContent = text;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
};

window.Backup = Backup;
document.addEventListener('DOMContentLoaded', () => Backup.init());
