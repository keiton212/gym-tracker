// バックアップ・復元まわり。
// LocalStorageのみに依存しているため、iOS側の事情（サイトデータの自動削除、
// ホーム画面アプリの削除・再インストールなど）で記録が消えることがあり得る。
// meal-trackerで実際に同種の事故が起きた対策として導入した仕組みをそのまま流用している：
// 1) 手動バックアップ書き出し 2) バックアップからの復元 3) 定期的な自動バックアップ
// 4) 記録が空の状態で起動した場合の復元導線 5) 保存領域を消されにくくする申告
const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1日ごと

const Backup = {
    init() {
        document.getElementById('exportDataBtn')?.addEventListener('click', () => this.save());
        document.getElementById('importDataBtn')?.addEventListener('click', () => document.getElementById('backupRestoreInput')?.click());
        document.getElementById('backupRestoreInput')?.addEventListener('change', e => this.restore(e));
        document.getElementById('recoveryRestoreBtn')?.addEventListener('click', () => this.openRestoreFromRecovery());
        document.getElementById('recoveryFreshBtn')?.addEventListener('click', () => this.dismissRecovery());

        this.requestPersistentStorage();
        this.renderStatus();

        // データが空で起動した場合は自動バックアップを走らせない。
        // 空の内容で保存すると、同名の正常なバックアップを上書きしかねないため
        if (storage.wasEmptyOnBoot) {
            this.showRecovery();
        } else {
            this.maybeAutoBackup();
        }
    },

    // ---------- バックアップの作成 ----------

    buildPayload() {
        const data = {};
        Object.values(STORAGE_KEYS).forEach(key => {
            const raw = localStorage.getItem(key);
            if (raw === null) return;
            // gym_training_start_dateのようにJSON化せず生の文字列で保存しているキーもあるため、
            // パースできなければ生の文字列のまま持たせる（restore側もこれに合わせて書き分ける）
            try {
                data[key] = JSON.parse(raw);
            } catch (e) {
                data[key] = raw;
            }
        });
        return { app: 'GymTracker', savedAt: new Date().toISOString(), data };
    },

    fileNameFor(savedAt) {
        const d = new Date(savedAt);
        const p = n => String(n).padStart(2, '0');
        return `gym-tracker-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
            `-${p(d.getHours())}${p(d.getMinutes())}.json`;
    },

    downloadPayload(payload) {
        const json = JSON.stringify(payload, null, 2);
        const fileName = this.fileNameFor(payload.savedAt);
        const blob = new Blob([json], { type: 'application/json' });

        storage.setLastExportAt(Date.now());
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
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    save() {
        this.downloadPayload(this.buildPayload());
    },

    // アプリを開いた際、前回のバックアップから一定期間経っていればタップ不要で自動保存する
    maybeAutoBackup() {
        const last = storage.getLastExportAt() || 0;
        if (Date.now() - last < AUTO_BACKUP_INTERVAL_MS) return;
        this.downloadPayload(this.buildPayload());
        this.showToast('💾 自動バックアップを保存しました');
    },

    // ---------- 最終バックアップの表示 ----------

    renderStatus() {
        const el = document.getElementById('backupStatusText');
        if (!el) return;

        const last = storage.getLastExportAt();
        const staleMs = 7 * 24 * 60 * 60 * 1000;
        const stale = !last || (Date.now() - last > staleMs);

        let text;
        if (!last) {
            text = '⚠ まだバックアップがありません';
        } else {
            const d = new Date(last);
            const p = n => String(n).padStart(2, '0');
            text = (stale ? '⚠ ' : '') + `最終バックアップ: ${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
        }
        el.textContent = text;
        el.classList.toggle('stale', stale);
    },

    // ---------- 保存領域の保護 ----------

    // OSに「容量が逼迫してもこのデータは消さないでほしい」と申告する。
    // 許可されるかはブラウザ任せなので、これ単独には頼らずバックアップと併用する
    async requestPersistentStorage() {
        if (!navigator.storage || !navigator.storage.persist) return;
        try {
            await navigator.storage.persisted() || await navigator.storage.persist();
        } catch (e) {
            // 取得できなくても致命的ではない（バックアップの方が本命の対策）
        }
    },

    // ---------- 記録が空で起動したときの復元導線 ----------

    showRecovery() {
        const el = document.getElementById('recoveryOverlay');
        if (el) el.hidden = false;
    },

    dismissRecovery() {
        const el = document.getElementById('recoveryOverlay');
        if (el) el.hidden = true;
    },

    openRestoreFromRecovery() {
        this.dismissRecovery();
        document.getElementById('backupRestoreInput')?.click();
    },

    // ---------- 復元 ----------

    restore(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            try {
                const payload = JSON.parse(reader.result);
                const data = payload.data || payload;
                const validKeys = new Set(Object.values(STORAGE_KEYS));
                const keysToRestore = Object.keys(data).filter(k => validKeys.has(k));
                if (!keysToRestore.length) throw new Error('no valid keys');

                keysToRestore.forEach(key => {
                    // buildPayloadで生の文字列のまま持たせたキーは、そのまま書き戻す
                    const value = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]);
                    localStorage.setItem(key, value);
                });
                alert('✓ 復元しました。アプリを再読み込みします。');
                location.reload();
            } catch (err) {
                alert('⚠ 復元に失敗しました。正しいバックアップファイルか確認してください。');
            } finally {
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    },

    showToast(text) {
        const toast = document.createElement('div');
        toast.className = 'backup-toast';
        toast.textContent = text;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
};

document.addEventListener('DOMContentLoaded', () => Backup.init());
