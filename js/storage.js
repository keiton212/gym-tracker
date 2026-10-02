const STORAGE_KEYS = {
    MENU: 'gym_menu',
    RECORDS: 'gym_records',
    TIMER_SETTINGS: 'gym_timer_settings',
    LAST_EXPORT_AT: 'gym_last_export_at'
    ,DRAFTS: 'gym_training_drafts', FOCUS_PROGRESS: 'gym_focus_progress'
    ,TRAINING_START_DATE: 'gym_training_start_date'
    ,INITIALIZED: 'gym_storage_initialized'
};

// 端末のローカル日付で YYYY-MM-DD を作る（UTCの toISOString だと日本時間の早朝に日付がずれる）
function toLocalDateStr(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function countFilledSets(record) {
    const sets = record?.sets || [];
    let filled = 0;
    sets.forEach(entry => {
        if (entry == null || entry === '') return;
        if (typeof entry === 'object') {
            if ((entry.reps ?? '') !== '' || (entry.weight ?? '') !== '') filled += 1;
        } else {
            filled += 1;
        }
    });
    return filled;
}

// 開発者本人の実際のトレーニング開始日（このデバイスに既存メニューがある＝本人の端末の場合の初期値として使う）
const DEVELOPER_TRAINING_START_DATE = '2025-08-11';

const DEFAULT_TIMER_SETTINGS = {
    0: 70,
    1: 70,
    2: 70,
    3: 70,
    4: 70,
    5: 70,
    6: 70
};

// 初回アクセス時（localStorageが空の状態）の初期メニュー。
// 他人に配布用リンクを渡したときに自分の個人的なメニュー・重量が渡らないよう、空の状態にしてある。
const SEED_MENU = {
    0: { label: '日曜日', status: '', exercises: [] },
    1: { label: '月曜日', status: '', exercises: [] },
    2: { label: '火曜日', status: '', exercises: [] },
    3: { label: '水曜日', status: '', exercises: [] },
    4: { label: '木曜日', status: '', exercises: [] },
    5: { label: '金曜日', status: '', exercises: [] },
    6: { label: '土曜日', status: '', exercises: [] }
};

class Storage {
    constructor() {
        this.initializeStorage();
    }

    readJson(key, fallback) {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        try {
            return JSON.parse(raw);
        } catch (e) {
            this.needsRecoveryOnBoot = true;
            return fallback;
        }
    }

    notifyChanged() {
        if (typeof Backup !== 'undefined') Backup.scheduleSnapshot();
    }

    initializeStorage() {
        const recordsWereMissing = localStorage.getItem(STORAGE_KEYS.RECORDS) === null;
        const wasInitialized = localStorage.getItem(STORAGE_KEYS.INITIALIZED) === '1';
        this.wasEmptyOnBoot = recordsWereMissing;
        this.needsRecoveryOnBoot = false;
        if (recordsWereMissing && wasInitialized) this.needsRecoveryOnBoot = true;

        const existingMenu = localStorage.getItem(STORAGE_KEYS.MENU);
        const menuData = this.readJson(STORAGE_KEYS.MENU, null);

        let hasMenu = false;
        if (menuData) {
            for (let i = 0; i < 7; i++) {
                if (menuData[i]?.exercises?.length > 0) {
                    hasMenu = true;
                    break;
                }
            }
        }

        if (!hasMenu) {
            localStorage.setItem(STORAGE_KEYS.MENU, JSON.stringify(SEED_MENU));
        }

        const records = this.readJson(STORAGE_KEYS.RECORDS, null);
        if (!records || typeof records !== 'object' || Array.isArray(records)) {
            if (localStorage.getItem(STORAGE_KEYS.RECORDS) !== null) this.needsRecoveryOnBoot = true;
            localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify({}));
        }
        const timerSettings = this.readJson(STORAGE_KEYS.TIMER_SETTINGS, null);
        if (!timerSettings || typeof timerSettings !== 'object' || Array.isArray(timerSettings)) {
            localStorage.setItem(STORAGE_KEYS.TIMER_SETTINGS, JSON.stringify(DEFAULT_TIMER_SETTINGS));
        }

        // トレーニング開始日：既にメニューがある（＝本人の端末）なら本人の実際の開始日を、
        // 真っさらな新規インストール（他人に配布したリンクなど）なら「今日」を開始日にする
        if (!localStorage.getItem(STORAGE_KEYS.TRAINING_START_DATE)) {
            const startDate = hasMenu ? DEVELOPER_TRAINING_START_DATE : toLocalDateStr();
            localStorage.setItem(STORAGE_KEYS.TRAINING_START_DATE, startDate);
        }
        localStorage.setItem(STORAGE_KEYS.INITIALIZED, '1');
    }

    getTrainingStartDate() {
        return localStorage.getItem(STORAGE_KEYS.TRAINING_START_DATE) || DEVELOPER_TRAINING_START_DATE;
    }

    // メニュー関連
    getMenu() {
        return this.readJson(STORAGE_KEYS.MENU, SEED_MENU) || SEED_MENU;
    }

    setMenu(menu) {
        localStorage.setItem(STORAGE_KEYS.MENU, JSON.stringify(menu));
        this.notifyChanged();
        // 並び替え直後に端末を閉じると debounce 前の古いスナップショットが残ることがあるため、メニュー変更は即時退避する
        if (typeof Backup !== 'undefined' && Backup.createLocalSnapshot) {
            clearTimeout(Backup.snapshotTimer);
            void Backup.createLocalSnapshot('menu-change');
        }
    }

    getExercisesForDay(dayIndex) {
        const menu = this.getMenu();
        return menu[dayIndex]?.exercises || [];
    }

    addExerciseToDay(dayIndex, exercise) {
        const menu = this.getMenu();
        if (!menu[dayIndex].exercises) {
            menu[dayIndex].exercises = [];
        }
        const id = Date.now().toString();
        menu[dayIndex].exercises.push({
            id,
            name: '',
            weight: '',
            sets: '3',
            repsRange: '',
            restMinutes: 2,
            perSetWeight: false,
            weightStep: 2.5,
            ...exercise
        });
        this.setMenu(menu);
        return id;
    }

    updateExercise(dayIndex, exerciseId, updates) {
        const menu = this.getMenu();
        const exercise = menu[dayIndex].exercises.find(e => e.id === exerciseId);
        if (exercise) {
            Object.assign(exercise, updates);
            this.setMenu(menu);
        }
    }

    // メニュー枠内の種目（メイン/代替）ごとに重量を保存する。
    // 代替種目はメインと weight を共有せず、altWeights に種目名キーで持つ。
    updateExerciseVariantWeight(dayIndex, exerciseId, variantName, weight) {
        const menu = this.getMenu();
        const exercise = menu[dayIndex]?.exercises?.find(e => e.id === exerciseId);
        if (!exercise) return;

        const isAlternative = Array.isArray(exercise.alternatives) && exercise.alternatives.includes(variantName);
        if (isAlternative) {
            exercise.altWeights = (exercise.altWeights && typeof exercise.altWeights === 'object') ? exercise.altWeights : {};
            exercise.altWeights[variantName] = weight;
        } else {
            exercise.weight = weight;
        }
        this.setMenu(menu);
    }

    addAlternativeToExercise(dayIndex, exerciseId, name) {
        const menu = this.getMenu();
        const exercise = menu[dayIndex]?.exercises?.find(e => e.id === exerciseId);
        if (!exercise || !name) return;
        exercise.alternatives = Array.isArray(exercise.alternatives) ? exercise.alternatives : [];
        if (name !== exercise.name && !exercise.alternatives.includes(name)) {
            exercise.alternatives.push(name);
            this.setMenu(menu);
        }
    }

    renameAlternative(dayIndex, exerciseId, altIndex, newName) {
        const menu = this.getMenu();
        const exercise = menu[dayIndex]?.exercises?.find(e => e.id === exerciseId);
        if (!exercise || !newName || !Array.isArray(exercise.alternatives) || exercise.alternatives[altIndex] === undefined) return;
        const oldName = exercise.alternatives[altIndex];
        exercise.alternatives[altIndex] = newName;
        if (exercise.altWeights && Object.prototype.hasOwnProperty.call(exercise.altWeights, oldName)) {
            exercise.altWeights[newName] = exercise.altWeights[oldName];
            delete exercise.altWeights[oldName];
        }
        this.setMenu(menu);
    }

    deleteExercise(dayIndex, exerciseId) {
        const menu = this.getMenu();
        menu[dayIndex].exercises = menu[dayIndex].exercises.filter(e => e.id !== exerciseId);
        this.setMenu(menu);
    }

    reorderExercise(dayIndex, exerciseId, direction) {
        const menu = this.getMenu();
        const exercises = menu[dayIndex].exercises;
        const index = exercises.findIndex(e => e.id === exerciseId);
        if (index === -1) return;

        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= exercises.length) return;

        [exercises[index], exercises[newIndex]] = [exercises[newIndex], exercises[index]];
        this.setMenu(menu);
    }

    // 記録関連
    getRecords() {
        return this.readJson(STORAGE_KEYS.RECORDS, {}) || {};
    }

    saveRecord(date, dayIndex, exerciseRecords) {
        const records = this.getRecords();
        const dateStr = toLocalDateStr(date);

        if (!records[dateStr]) {
            records[dateStr] = {};
        }

        records[dateStr][dayIndex] = exerciseRecords;
        localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records));
        this.notifyChanged();
    }

    getRecordForDay(date, dayIndex) {
        const records = this.getRecords();
        const dateStr = toLocalDateStr(date);
        return records[dateStr]?.[dayIndex] || null;
    }

    // 指定日付・曜日の記録を削除する（誤って追加した記録の取り消し用）
    deleteRecordForDate(dateStr, dayIndex) {
        const records = this.getRecords();
        if (!records[dateStr]) return;

        delete records[dateStr][dayIndex];
        if (Object.keys(records[dateStr]).length === 0) {
            delete records[dateStr];
        }
        localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records));
        this.notifyChanged();
    }

    // 前回の記録を取得する。
    // 同じ曜日の記録を優先し、無ければ種目名一致の直近記録にフォールバックする。
    // excludeDateStr（省略時は今日・ローカル日付）は除外する（トレーニング中に自動保存された今回分を「前回の記録」として拾わないため）
    getLastRecord(exerciseName, excludeDateStr, preferredDayIndex) {
        const records = this.getRecords();
        const allRecords = [];
        const excludeStr = excludeDateStr || toLocalDateStr();

        for (const dateStr in records) {
            if (dateStr === excludeStr) continue;
            const dayEntries = records[dateStr];
            for (const dayIndex in dayEntries) {
                if (dayEntries[dayIndex][exerciseName]) {
                    allRecords.push({
                        date: dateStr,
                        dayIndex: parseInt(dayIndex, 10),
                        data: dayEntries[dayIndex][exerciseName],
                        filled: countFilledSets(dayEntries[dayIndex][exerciseName])
                    });
                }
            }
        }

        if (allRecords.length === 0) return null;

        const rank = (list) => list.slice().sort((a, b) => {
            const dateDiff = new Date(b.date) - new Date(a.date);
            if (dateDiff !== 0) return dateDiff;
            return b.filled - a.filled;
        });

        const preferred = preferredDayIndex === undefined || preferredDayIndex === null
            ? []
            : rank(allRecords.filter(r => r.dayIndex === preferredDayIndex));
        const ranked = preferred.length > 0 ? preferred : rank(allRecords);
        return ranked[0].data;
    }

    // 指定曜日の過去セッション一覧（新しい順）
    getSessionsForDay(dayIndex) {
        const records = this.getRecords();
        const sessions = [];

        for (const dateStr in records) {
            if (records[dateStr][dayIndex]) {
                sessions.push({
                    date: dateStr,
                    exercises: records[dateStr][dayIndex]
                });
            }
        }

        sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
        return sessions;
    }

    // タイマー設定関連
    getTimerSettings() {
        return this.readJson(STORAGE_KEYS.TIMER_SETTINGS, DEFAULT_TIMER_SETTINGS) || DEFAULT_TIMER_SETTINGS;
    }

    setTimerSettings(settings) {
        localStorage.setItem(STORAGE_KEYS.TIMER_SETTINGS, JSON.stringify(settings));
        this.notifyChanged();
    }

    getTimerForDay(dayIndex) {
        const settings = this.getTimerSettings();
        return settings[dayIndex] || 70;
    }

    setTimerForDay(dayIndex, minutes) {
        const settings = this.getTimerSettings();
        settings[dayIndex] = minutes;
        this.setTimerSettings(settings);
    }

    // バックアップ書き出し日時の記録
    getLastExportAt() {
        const raw = localStorage.getItem(STORAGE_KEYS.LAST_EXPORT_AT);
        return raw ? parseInt(raw) : null;
    }

    setLastExportAt(timestamp) {
        localStorage.setItem(STORAGE_KEYS.LAST_EXPORT_AT, String(timestamp));
    }

    getDraft(dayIndex) {
        const drafts = this.readJson(STORAGE_KEYS.DRAFTS, {});
        return drafts[dayIndex] || null;
    }

    saveDraft(dayIndex, draft) {
        const drafts = this.readJson(STORAGE_KEYS.DRAFTS, {});
        drafts[dayIndex] = draft;
        localStorage.setItem(STORAGE_KEYS.DRAFTS, JSON.stringify(drafts));
        this.notifyChanged();
    }

    clearDraft(dayIndex) {
        const drafts = this.readJson(STORAGE_KEYS.DRAFTS, {});
        delete drafts[dayIndex];
        localStorage.setItem(STORAGE_KEYS.DRAFTS, JSON.stringify(drafts));
        this.notifyChanged();
    }

    // 進捗は「通し番号」ではなく種目ID＋セット番号で保存する。
    // 通し番号だと、集中モードを抜けた後に種目の並び替え・追加・削除をした場合に
    // 全く別の種目/セットを指してしまうため。
    getFocusProgress(dayIndex) {
        const data = this.readJson(STORAGE_KEYS.FOCUS_PROGRESS, {});
        const entry = data[dayIndex];
        return (entry && typeof entry === 'object' && entry.exerciseId) ? entry : null;
    }

    setFocusProgress(dayIndex, exerciseId, setIndex) {
        const data = this.readJson(STORAGE_KEYS.FOCUS_PROGRESS, {});
        data[dayIndex] = { exerciseId, setIndex };
        localStorage.setItem(STORAGE_KEYS.FOCUS_PROGRESS, JSON.stringify(data));
        this.notifyChanged();
    }

    clearFocusProgress(dayIndex) {
        const data = this.readJson(STORAGE_KEYS.FOCUS_PROGRESS, {});
        delete data[dayIndex];
        localStorage.setItem(STORAGE_KEYS.FOCUS_PROGRESS, JSON.stringify(data));
        this.notifyChanged();
    }
}

const storage = new Storage();
