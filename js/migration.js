// 2026-07-11: 月曜日メニューをユーザー指定の内容に一度だけ更新し、
// 本日の実績を過去データとして自動保存する。
(function () {
    const FLAG = 'gym_migration_20260711_v1';
    if (localStorage.getItem(FLAG)) return;

    try {
        const dayIndex = 1; // 月曜日
        const menu = storage.getMenu();
        if (!menu[dayIndex]) {
            localStorage.setItem(FLAG, '1');
            return;
        }
        if (!menu[dayIndex].exercises) menu[dayIndex].exercises = [];
        const exercises = menu[dayIndex].exercises;

        function upsert(oldName, fields) {
            let ex = exercises.find(e => e.name === oldName);
            if (!ex) {
                ex = {
                    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
                    name: fields.name || oldName,
                    weight: '',
                    sets: '3',
                    repsRange: '',
                    restMinutes: 2,
                    perSetWeight: false
                };
                exercises.push(ex);
            }
            Object.assign(ex, fields);
            return ex;
        }

        upsert('ベンチプレス', { weight: '70', sets: '3', restMinutes: 3 });
        upsert('インクラインダンベルプレス', { weight: '28', sets: '3', repsRange: '6-10', restMinutes: 2 });
        upsert('ディップス', { weight: '0', sets: '3', repsRange: '10-15' });
        upsert('ショルダープレスマシン', { name: 'ショルダープレスマシン(ハンマーストレングス)', weight: '25', sets: '4', repsRange: '8-12', restMinutes: 1.5 });
        upsert('インクラインスミス', { name: 'インクラインスミスプレス', weight: '35', sets: '3', repsRange: '12-15', restMinutes: 2 });
        upsert('マシンサイド', { name: 'マシンサイドレイズ', sets: '3', perSetWeight: true });
        upsert('ダンベルサイドレイズ', { sets: '4', perSetWeight: true });
        upsert('ライイングトライセプスエクステンション', { weight: '30', sets: '3', repsRange: '10-15' });

        storage.setMenu(menu);

        const records = {
            'ベンチプレス': { weight: '70', sets: ['7', '4', '4'], setCount: 3 },
            'インクラインダンベルプレス': { weight: '28', sets: ['7', '7', '6'], setCount: 3 },
            'ディップス': { weight: '0', sets: ['13', '10', '7'], setCount: 3 },
            'ショルダープレスマシン(ハンマーストレングス)': { weight: '25', sets: ['6', '8', '5', '6'], setCount: 4 },
            'インクラインスミスプレス': { weight: '35', sets: ['8', '7', ''], setCount: 3 },
            'マシンサイドレイズ': {
                perSetWeight: true,
                sets: [
                    { weight: '11', reps: '13' },
                    { weight: '11', reps: '11' },
                    { weight: '10', reps: '14' }
                ],
                setCount: 3
            },
            'ライイングトライセプスエクステンション': { weight: '30', sets: ['8', '7', '6'], setCount: 3 }
        };

        storage.saveRecord(new Date(), dayIndex, records);
        localStorage.setItem(FLAG, '1');
    } catch (e) {
        console.error('Migration failed:', e);
    }
})();

// ケーブルサイドレイズを削除し、ダンベルサイドレイズとライイングトライセプスエクステンションの順番を入れ替える
(function () {
    const FLAG2 = 'gym_migration_reorder_v2';
    if (localStorage.getItem(FLAG2)) return;

    try {
        const dayIndex = 1; // 月曜日
        const menu = storage.getMenu();

        if (menu[dayIndex] && menu[dayIndex].exercises) {
            const exercises = menu[dayIndex].exercises;

            const cableIdx = exercises.findIndex(e => e.name === 'ケーブルサイドレイズ');
            if (cableIdx !== -1) exercises.splice(cableIdx, 1);

            const dbIdx = exercises.findIndex(e => e.name === 'ダンベルサイドレイズ');
            const tricepIdx = exercises.findIndex(e => e.name === 'ライイングトライセプスエクステンション');
            if (dbIdx !== -1 && tricepIdx !== -1) {
                [exercises[dbIdx], exercises[tricepIdx]] = [exercises[tricepIdx], exercises[dbIdx]];
            }

            storage.setMenu(menu);
        }

        localStorage.setItem(FLAG2, '1');
    } catch (e) {
        console.error('Migration v2 failed:', e);
    }
})();

// 曜日ラベルを push / pull / legs 表記に更新する
(function () {
    const FLAG3 = 'gym_migration_ppl_labels_v3';
    if (localStorage.getItem(FLAG3)) return;

    try {
        const menu = storage.getMenu();
        const statusMap = {
            1: 'push（胸メイン）',
            2: 'pull（広がり）',
            3: 'legs（脚＋腹筋）',
            5: 'push（肩メイン）',
            6: 'pull（厚み）'
        };

        Object.keys(statusMap).forEach(key => {
            const idx = parseInt(key);
            if (menu[idx]) menu[idx].status = statusMap[idx];
        });

        storage.setMenu(menu);
        localStorage.setItem(FLAG3, '1');
    } catch (e) {
        console.error('Migration v3 failed:', e);
    }
})();

// 種目ごとの重量刻み幅（weightStep）をユーザー指定の値に更新する
(function () {
    const FLAG4 = 'gym_migration_weight_step_v4';
    if (localStorage.getItem(FLAG4)) return;

    try {
        const menu = storage.getMenu();
        const stepMap = {
            'インクラインダンベルプレス': 1,
            'ダンベルショルダープレス': 1,
            'ダンベルサイドレイズ': 1,
            'ショルダープレスマシン': 1.25,
            'ショルダープレスマシン(ハンマーストレングス)': 1.25,
            'アイソラテラルロー': 1.25,
            'マシンサイド': 1.25
        };

        for (let day = 0; day < 7; day++) {
            if (!menu[day] || !menu[day].exercises) continue;
            menu[day].exercises.forEach(ex => {
                if (stepMap[ex.name] !== undefined) {
                    ex.weightStep = stepMap[ex.name];
                }
            });
        }

        storage.setMenu(menu);
        localStorage.setItem(FLAG4, '1');
    } catch (e) {
        console.error('Migration v4 failed:', e);
    }
})();

// ダンベル種目3つの重量刻み幅を2kgに更新する
(function () {
    const FLAG5 = 'gym_migration_weight_step_v5';
    if (localStorage.getItem(FLAG5)) return;

    try {
        const menu = storage.getMenu();
        const stepMap = {
            'インクラインダンベルプレス': 2,
            'ダンベルショルダープレス': 2,
            'インクラインダンベルカール': 2
        };

        for (let day = 0; day < 7; day++) {
            if (!menu[day] || !menu[day].exercises) continue;
            menu[day].exercises.forEach(ex => {
                if (stepMap[ex.name] !== undefined) {
                    ex.weightStep = stepMap[ex.name];
                }
            });
        }

        storage.setMenu(menu);
        localStorage.setItem(FLAG5, '1');
    } catch (e) {
        console.error('Migration v5 failed:', e);
    }
})();

// 土曜日メニューをユーザー指定の新しい構成に再編成する
(function () {
    const FLAG6 = 'gym_migration_saturday_rebuild_v6';
    if (localStorage.getItem(FLAG6)) return;

    try {
        const dayIndex = 6; // 土曜日
        const menu = storage.getMenu();
        if (!menu[dayIndex]) {
            localStorage.setItem(FLAG6, '1');
            return;
        }
        if (!menu[dayIndex].exercises) menu[dayIndex].exercises = [];
        const oldExercises = menu[dayIndex].exercises;

        function findByName(name) {
            return oldExercises.find(e => e.name === name);
        }

        function buildExercise(name, sets, extra) {
            const existing = findByName(name);
            if (existing) {
                return Object.assign({}, existing, { sets: String(sets) }, extra || {});
            }
            return Object.assign({
                id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
                name,
                weight: '',
                sets: String(sets),
                repsRange: '',
                restMinutes: 2
            }, extra || {});
        }

        menu[dayIndex].exercises = [
            buildExercise('アイソラテラルロー', 3),
            buildExercise('懸垂', 3),
            buildExercise('ベントオーバーロー', 3, { alternatives: ['プーリーロー'] }),
            buildExercise('ラットプルダウン ミドルパラレル', 3),
            buildExercise('チェストサポートロウ', 3),
            buildExercise('ケーブルプルオーバー', 2),
            buildExercise('インクラインダンベルカール', 3),
            buildExercise('ハンマーカール', 2)
        ];

        storage.setMenu(menu);
        localStorage.setItem(FLAG6, '1');
    } catch (e) {
        console.error('Migration v6 failed:', e);
    }
})();
