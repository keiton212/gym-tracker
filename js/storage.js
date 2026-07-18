const STORAGE_KEYS = {
    MENU: 'gym_menu',
    RECORDS: 'gym_records',
    TIMER_SETTINGS: 'gym_timer_settings',
    LAST_EXPORT_AT: 'gym_last_export_at'
    ,DRAFTS: 'gym_training_drafts'
};

const DEFAULT_TIMER_SETTINGS = {
    0: 70,
    1: 70,
    2: 70,
    3: 70,
    4: 70,
    5: 70,
    6: 70
};

const SEED_MENU = {
    0: { label: '日曜日', status: '休み', exercises: [] },
    1: { label: '月曜日', status: 'push（胸メイン）', exercises: [
        { id: '1', name: 'ベンチプレス', weight: '70', sets: '3', repsRange: '5-8', restMinutes: 3 },
        { id: '2', name: 'インクラインダンベルプレス', weight: '28', sets: '3', repsRange: '6-10', restMinutes: 2, weightStep: 2 },
        { id: '3', name: 'ディップス', weight: '9', sets: '3', repsRange: '8-12', restMinutes: 2 },
        { id: '4', name: 'ショルダープレスマシン', weight: '25', sets: '4', repsRange: '8-12', restMinutes: 2, weightStep: 1.25 },
        { id: '5', name: 'インクラインスミス', weight: '35', sets: '2', repsRange: '12-15', restMinutes: 1 },
        { id: '6', name: 'ケーブルサイドレイズ', weight: '-', sets: '3', repsRange: '12-20', restMinutes: 1 },
        { id: '7', name: 'マシンサイド', weight: '12', sets: '3', repsRange: '12-20', restMinutes: 1 },
        { id: '8', name: 'ライイングトライセプスエクステンション', weight: '-', sets: '3', repsRange: '10-15', restMinutes: 1 }
    ]},
    2: { label: '火曜日', status: 'pull（広がり）', exercises: [
        { id: '21', name: '懸垂', weight: '-', sets: '4', repsRange: '6-10', restMinutes: 3 },
        { id: '22', name: 'ラットプルダウン ミドルパラレル', weight: '66', sets: '3', repsRange: '8-12', restMinutes: 2 },
        { id: '23', name: '片手ラットプル', weight: '24', sets: '2', repsRange: '10-15', restMinutes: 1 },
        { id: '24', name: 'アイソラテラルロー', weight: '80', sets: '3', repsRange: '8-12', restMinutes: 2, weightStep: 1.25 },
        { id: '25', name: 'ローロー', weight: '63', sets: '1', repsRange: '-', restMinutes: 1 },
        { id: '26', name: 'バーベルカール', weight: '-', sets: '3', repsRange: '12-15', restMinutes: 1 },
        { id: '27', name: 'フェイスプル', weight: '-', sets: '2', repsRange: '15-20', restMinutes: 1 },
        { id: '28', name: 'ケーブルプルオーバー', weight: '-', sets: '3', repsRange: '15-20', restMinutes: 1 }
    ]},
    3: { label: '水曜日', status: 'legs（脚＋腹筋）', exercises: [
        { id: '31', name: 'スクワット', weight: '92.5', sets: '3', repsRange: '5-8', restMinutes: 3 },
        { id: '32', name: 'ルーマニアンデッドリフト', weight: '-', sets: '3', repsRange: '6-10', restMinutes: 2 },
        { id: '33', name: 'レッグカール', weight: '46', sets: '3', repsRange: '10-15', restMinutes: 1 },
        { id: '34', name: 'レッグエクステンション', weight: '84', sets: '2', repsRange: '12-15', restMinutes: 1 },
        { id: '35', name: 'ケーブルクランチ', weight: '-', sets: '3', repsRange: '10-15', restMinutes: 1 },
        { id: '36', name: 'ハンギングレッグレイズ', weight: '-', sets: '3', repsRange: '10-15', restMinutes: 1 }
    ]},
    4: { label: '木曜日', status: '休み', exercises: [] },
    5: { label: '金曜日', status: 'push（肩メイン）', exercises: [
        { id: '51', name: 'ダンベルショルダープレス', weight: '26', sets: '3', repsRange: '5-8', restMinutes: 3, weightStep: 2 },
        { id: '52', name: 'ベンチプレス', weight: '67.5', sets: '2', repsRange: '6', restMinutes: 3 },
        { id: '53', name: 'マシンサイド', weight: '11', sets: '1', repsRange: '12-20', restMinutes: 1, weightStep: 1.25 },
        { id: '54', name: 'ダンベルサイドレイズ', weight: '10', sets: '3', repsRange: '12-20', restMinutes: 1, weightStep: 1 },
        { id: '55', name: 'ケーブルサイドレイズ', weight: '11', sets: '4', repsRange: '12-20', restMinutes: 1 },
        { id: '56', name: 'インクラインダンベルプレス', weight: '-', sets: '3', repsRange: '8-12', restMinutes: 2, weightStep: 2 },
        { id: '57', name: 'インクラインスミス', weight: '35', sets: '1', repsRange: '12-20', restMinutes: 1 },
        { id: '59', name: 'ライイングトライセプスエクステンション', weight: '-', sets: '3', repsRange: '8-12', restMinutes: 1 },
        { id: '60', name: 'ケーブルプレスダウン', weight: '-', sets: '2', repsRange: '10-15', restMinutes: 1 }
    ]},
    6: { label: '土曜日', status: 'pull（厚み）', exercises: [
        { id: '61', name: 'アイソラテラルロー', weight: '85', sets: '4', repsRange: '6-10', restMinutes: 3 },
        { id: '62', name: '懸垂', weight: '-', sets: '3', repsRange: '6-10', restMinutes: 2 },
        { id: '63', name: 'チェストサポートロウ', weight: '-', sets: '3', repsRange: '8-12', restMinutes: 2 },
        { id: '64', name: 'ラットプルダウン ミドルパラレル', weight: '68', sets: '2', repsRange: '8-12', restMinutes: 1 },
        { id: '65', name: 'プーリーロー', weight: '130', sets: '3', repsRange: '8-12', restMinutes: 1 },
        { id: '66', name: 'ストレートアームプルダウン', weight: '-', sets: '2', repsRange: '12-20', restMinutes: 1 },
        { id: '67', name: 'インクラインダンベルカール', weight: '-', sets: '3', repsRange: '8-12', restMinutes: 1, weightStep: 2 },
        { id: '68', name: 'ハンマーカール', weight: '-', sets: '2', repsRange: '10-15', restMinutes: 1 }
    ]}
};

class Storage {
    constructor() {
        this.initializeStorage();
    }

    initializeStorage() {
        const existingMenu = localStorage.getItem(STORAGE_KEYS.MENU);
        const menuData = existingMenu ? JSON.parse(existingMenu) : null;

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

        if (!localStorage.getItem(STORAGE_KEYS.RECORDS)) {
            localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify({}));
        }
        if (!localStorage.getItem(STORAGE_KEYS.TIMER_SETTINGS)) {
            localStorage.setItem(STORAGE_KEYS.TIMER_SETTINGS, JSON.stringify(DEFAULT_TIMER_SETTINGS));
        }
    }

    // メニュー関連
    getMenu() {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.MENU)) || SEED_MENU;
    }

    setMenu(menu) {
        localStorage.setItem(STORAGE_KEYS.MENU, JSON.stringify(menu));
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

    deleteExercise(dayIndex, exerciseId) {
        const menu = this.getMenu();
        menu[dayIndex].exercises = menu[dayIndex].exercises.filter(e => e.id !== exerciseId);
        this.setMenu(menu);
    }

    // 種目の並び替え（direction: -1で上へ、+1で下へ）
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
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.RECORDS)) || {};
    }

    saveRecord(date, dayIndex, exerciseRecords) {
        const records = this.getRecords();
        const dateStr = date.toISOString().split('T')[0];

        if (!records[dateStr]) {
            records[dateStr] = {};
        }

        records[dateStr][dayIndex] = exerciseRecords;
        localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records));
    }

    getRecordForDay(date, dayIndex) {
        const records = this.getRecords();
        const dateStr = date.toISOString().split('T')[0];
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
    }

    // 前回の同じ曜日の記録を取得
    getLastRecordForSameDay(exerciseName, dayIndex) {
        const records = this.getRecords();
        const allRecords = [];

        for (const dateStr in records) {
            if (records[dateStr][dayIndex]) {
                const dayRecords = records[dateStr][dayIndex];
                if (dayRecords[exerciseName]) {
                    allRecords.push({
                        date: dateStr,
                        data: dayRecords[exerciseName]
                    });
                }
            }
        }

        if (allRecords.length === 0) return null;
        allRecords.sort((a, b) => new Date(b.date) - new Date(a.date));
        return allRecords[0].data;
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
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.TIMER_SETTINGS)) || DEFAULT_TIMER_SETTINGS;
    }

    setTimerSettings(settings) {
        localStorage.setItem(STORAGE_KEYS.TIMER_SETTINGS, JSON.stringify(settings));
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
        const drafts = JSON.parse(localStorage.getItem(STORAGE_KEYS.DRAFTS) || '{}');
        return drafts[dayIndex] || null;
    }

    saveDraft(dayIndex, draft) {
        const drafts = JSON.parse(localStorage.getItem(STORAGE_KEYS.DRAFTS) || '{}');
        drafts[dayIndex] = draft;
        localStorage.setItem(STORAGE_KEYS.DRAFTS, JSON.stringify(drafts));
    }

    clearDraft(dayIndex) {
        const drafts = JSON.parse(localStorage.getItem(STORAGE_KEYS.DRAFTS) || '{}');
        delete drafts[dayIndex];
        localStorage.setItem(STORAGE_KEYS.DRAFTS, JSON.stringify(drafts));
    }
}

const storage = new Storage();
