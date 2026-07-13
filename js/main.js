function buildNormalSetInputsHTML(dayIndex, exercise, liveValues) {
    const lastRecord = storage.getLastRecordForSameDay(exercise.name, dayIndex);
    const setCount = Math.max(1, parseInt(exercise.sets) || 1);
    const lastIsPerSetWeight = lastRecord?.perSetWeight;

    return Array.from({ length: setCount }, (_, i) => {
        let lastReps = null;
        if (lastRecord?.sets?.[i] !== undefined) {
            const entry = lastRecord.sets[i];
            const rawReps = lastIsPerSetWeight ? entry?.reps : entry;
            if (rawReps !== undefined && rawReps !== '') lastReps = parseInt(rawReps);
        }
        const liveReps = liveValues?.sets?.[i]?.reps ?? '';
        const placeholder = lastReps !== null && !isNaN(lastReps) ? `${lastReps}` : '回数';
        const sameBtn = lastReps !== null && !isNaN(lastReps)
            ? `<button type="button" class="btn-same" data-set="${i}">同</button>`
            : '';
        return `
            <div class="set-input-row">
                <label>セット${i + 1}</label>
                <input type="number" class="reps-input" data-set="${i}" data-last-reps="${lastReps ?? ''}" value="${escapeAttr(liveReps)}" placeholder="${placeholder}" min="0" inputmode="numeric">
                <button type="button" class="btn-reps-step" data-delta="-1" aria-label="回数を減らす">−</button>
                <button type="button" class="btn-reps-step" data-delta="1" aria-label="回数を増やす">＋</button>
                ${sameBtn}
                <span class="reps-diff"></span>
            </div>
        `;
    }).join('');
}

function buildPerSetWeightInputsHTML(dayIndex, exercise, liveValues) {
    const lastRecord = storage.getLastRecordForSameDay(exercise.name, dayIndex);
    const setCount = Math.max(1, parseInt(exercise.sets) || 1);
    const lastIsPerSetWeight = lastRecord?.perSetWeight;

    return Array.from({ length: setCount }, (_, i) => {
        let lastWeight = '';
        let lastReps = null;
        if (lastRecord?.sets?.[i] !== undefined) {
            const entry = lastRecord.sets[i];
            if (lastIsPerSetWeight && entry && typeof entry === 'object') {
                lastWeight = entry.weight ?? '';
                if (entry.reps !== undefined && entry.reps !== '') lastReps = parseInt(entry.reps);
            }
        }
        const liveWeight = liveValues?.sets?.[i]?.weight ?? '';
        const liveReps = liveValues?.sets?.[i]?.reps ?? '';
        const repsPlaceholder = lastReps !== null && !isNaN(lastReps) ? `${lastReps}` : '回数';
        const weightPlaceholder = lastWeight !== '' ? `${lastWeight}` : 'kg';
        const sameBtn = (lastReps !== null || lastWeight !== '')
            ? `<button type="button" class="btn-same" data-set="${i}">同</button>`
            : '';
        return `
            <div class="set-input-row set-input-row-weighted">
                <label>セット${i + 1}</label>
                <input type="number" class="set-weight-input" data-set="${i}" data-last-weight="${lastWeight}" value="${escapeAttr(liveWeight)}" placeholder="${weightPlaceholder}" min="0" inputmode="decimal">
                <span class="set-weight-unit">×</span>
                <input type="number" class="reps-input" data-set="${i}" data-last-reps="${lastReps ?? ''}" value="${escapeAttr(liveReps)}" placeholder="${repsPlaceholder}" min="0" inputmode="numeric">
                <button type="button" class="btn-reps-step" data-delta="-1" aria-label="回数を減らす">−</button>
                <button type="button" class="btn-reps-step" data-delta="1" aria-label="回数を増やす">＋</button>
                ${sameBtn}
                <span class="reps-diff"></span>
            </div>
        `;
    }).join('');
}

function buildExerciseBodyHTML(dayIndex, exercise, liveValues) {
    if (exercise.perSetWeight) {
        return `
            <div class="exercise-record-info">
                <div>セット数: <input type="number" class="sets-input" value="${escapeAttr(exercise.sets)}" min="1" max="10" inputmode="numeric"></div>
            </div>
            <label class="per-set-weight-toggle">
                <input type="checkbox" class="per-set-weight-checkbox" checked> セットごとに重量を変える
            </label>
            <div class="set-inputs">
                ${buildPerSetWeightInputsHTML(dayIndex, exercise, liveValues)}
            </div>
        `;
    }

    const step = exercise.weightStep ?? 2.5;
    const weightValue = liveValues?.sharedWeight ?? exercise.weight;
    return `
        <div class="exercise-record-info">
            <div>重量:
                <button type="button" class="btn-weight-step" data-delta="-${step}" aria-label="重量を減らす">−</button>
                <input type="number" class="weight-input" value="${escapeAttr(weightValue)}" min="0" inputmode="decimal">
                <button type="button" class="btn-weight-step" data-delta="${step}" aria-label="重量を増やす">＋</button>
            kg</div>
            <div>セット数: <input type="number" class="sets-input" value="${escapeAttr(exercise.sets)}" min="1" max="10" inputmode="numeric"></div>
        </div>
        <label class="per-set-weight-toggle">
            <input type="checkbox" class="per-set-weight-checkbox"> セットごとに重量を変える
        </label>
        <div class="set-inputs">
            ${buildNormalSetInputsHTML(dayIndex, exercise, liveValues)}
        </div>
    `;
}

function buildExerciseCardHTML(dayIndex, exercise, isFirst, isLast) {
    return `
        <div class="exercise-record" data-exercise-id="${exercise.id}">
            <div class="exercise-record-header">
                <div class="reorder-buttons">
                    <button class="btn-reorder btn-reorder-up" aria-label="上に移動" ${isFirst ? 'disabled' : ''}>▲</button>
                    <button class="btn-reorder btn-reorder-down" aria-label="下に移動" ${isLast ? 'disabled' : ''}>▼</button>
                </div>
                <input type="text" class="exercise-name-input" value="${escapeAttr(exercise.name)}" placeholder="種目名">
                <button class="btn-delete-exercise" aria-label="削除">🗑</button>
            </div>
            <div class="rest-timer-row">
                <button class="btn-secondary rest-toggle-btn">レスト開始</button>
                <span class="rest-countdown" role="button" tabindex="0">${formatTime((exercise.restMinutes ?? 2) * 60)}</span>
            </div>
            <div class="exercise-body">
                ${buildExerciseBodyHTML(dayIndex, exercise)}
            </div>
        </div>
    `;
}

class GymApp {
    constructor() {
        this.currentDayIndex = new Date().getDay();
        this.restTimers = {};
        this.wakeLock = null;
        this.sessionStartedAt = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.displayHomeScreen();
    }

    setupEventListeners() {
        document.getElementById('startBtn')?.addEventListener('click', () => this.startTraining());
        document.getElementById('menuEditBtn')?.addEventListener('click', () => this.showMenuScreen());
        document.getElementById('historyBtn')?.addEventListener('click', () => this.showHistoryScreen());

        document.getElementById('finishTrainingBtn')?.addEventListener('click', () => this.finishTraining());
        document.getElementById('addExerciseBtn')?.addEventListener('click', () => this.addExercise());
        document.getElementById('addMenuExerciseBtn')?.addEventListener('click', () => menuEditor.addExercise());
        document.getElementById('exportDataBtn')?.addEventListener('click', () => this.exportData());

        this.setupTimerTapToEdit();

        document.getElementById('timerStartBtn')?.addEventListener('click', () => {
            timer.start();
            document.getElementById('timerStartBtn').style.display = 'none';
            document.getElementById('timerPauseBtn').style.display = 'inline-block';
        });

        document.getElementById('timerPauseBtn')?.addEventListener('click', () => {
            timer.pause();
            document.getElementById('timerStartBtn').style.display = 'inline-block';
            document.getElementById('timerPauseBtn').style.display = 'none';
        });

        document.getElementById('timerResetBtn')?.addEventListener('click', () => {
            timer.reset();
            document.getElementById('timerStartBtn').style.display = 'inline-block';
            document.getElementById('timerPauseBtn').style.display = 'none';
        });

        document.querySelectorAll('.btn-back').forEach(btn => {
            btn.addEventListener('click', () => this.showHomeScreen());
        });

        document.addEventListener('visibilitychange', () => {
            const trainingScreen = document.getElementById('trainingScreen');
            if (document.visibilityState === 'visible' && trainingScreen?.classList.contains('active')) {
                this.requestWakeLock();
            }
        });
    }

    setupTimerTapToEdit() {
        const timerValueEl = document.getElementById('timerValue');
        if (!timerValueEl) return;

        timerValueEl.setAttribute('contenteditable', 'true');
        timerValueEl.setAttribute('inputmode', 'numeric');

        let lastMinutes = Math.round(timer.duration / 60);

        timerValueEl.addEventListener('focus', () => {
            if (timer.isRunning) {
                timerValueEl.blur();
                return;
            }
            lastMinutes = Math.round(timer.duration / 60);
            timerValueEl.textContent = lastMinutes;
            selectElementText(timerValueEl);
        });

        timerValueEl.addEventListener('input', () => {
            sanitizeNumericContentEditable(timerValueEl, false);
        });

        timerValueEl.addEventListener('blur', () => {
            const minutes = Math.max(5, Math.min(180, parseInt(timerValueEl.textContent) || lastMinutes));
            storage.setTimerForDay(this.currentDayIndex, minutes);
            timer.setDuration(minutes);
            document.getElementById('timerStartBtn').style.display = 'inline-block';
            document.getElementById('timerPauseBtn').style.display = 'none';
        });

        timerValueEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                timerValueEl.blur();
            }
        });
    }

    switchScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
        document.getElementById(screenId)?.classList.add('active');
    }

    showHomeScreen() {
        this.releaseWakeLock();
        this.displayHomeScreen();
    }

    displayHomeScreen() {
        this.switchScreen('homeScreen');
        weather.updateWeatherDisplay();
        this.displayDailyTip();
    }

    displayDailyTip() {
        const tipEl = document.getElementById('tipCard');
        if (!tipEl || !Array.isArray(GYM_TIPS) || GYM_TIPS.length === 0) return;

        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 0);
        const dayOfYear = Math.floor((now - start) / 86400000);
        const index = dayOfYear % GYM_TIPS.length;

        tipEl.textContent = GYM_TIPS[index];
    }

    async requestWakeLock() {
        if (!('wakeLock' in navigator)) return;
        try {
            this.wakeLock = await navigator.wakeLock.request('screen');
        } catch (e) {
            this.wakeLock = null;
        }
    }

    releaseWakeLock() {
        if (this.wakeLock) {
            this.wakeLock.release().catch(() => {});
            this.wakeLock = null;
        }
    }

    startTraining() {
        this.currentDayIndex = new Date().getDay();
        this.sessionStartedAt = Date.now();
        this.switchScreen('trainingScreen');
        this.setupTrainingScreen(this.currentDayIndex);
        this.requestWakeLock();
    }

    setupTrainingScreen(dayIndex) {
        this.clearRestTimers();

        const menu = storage.getMenu();
        const dayMenu = menu[dayIndex] || { label: DAY_LABELS_FULL[dayIndex], status: '', exercises: [] };
        const dayLabel = document.getElementById('trainingDayLabel');
        if (dayLabel) {
            dayLabel.textContent = dayMenu.status ? `${DAY_LABELS_FULL[dayIndex]} - ${dayMenu.status}` : DAY_LABELS_FULL[dayIndex];
        }

        const savedMinutes = storage.getTimerForDay(dayIndex);
        timer.setDuration(savedMinutes);

        document.getElementById('timerStartBtn').style.display = 'inline-block';
        document.getElementById('timerPauseBtn').style.display = 'none';

        this.renderExerciseList(dayIndex);
    }

    renderExerciseList(dayIndex) {
        const exercises = storage.getExercisesForDay(dayIndex);
        const container = document.getElementById('exerciseList');
        if (!container) return;

        // 削除された種目のタイマーだけ停止・破棄する（残っている種目のタイマーは維持する）
        const currentIds = new Set(exercises.map(ex => ex.id));
        Object.keys(this.restTimers).forEach(id => {
            if (!currentIds.has(id)) {
                this.restTimers[id].stop();
                delete this.restTimers[id];
            }
        });

        if (exercises.length === 0) {
            container.innerHTML = `<p class="placeholder">まだ種目がありません。「＋種目を追加」から追加してください</p>`;
            return;
        }

        container.innerHTML = exercises.map((ex, idx) => buildExerciseCardHTML(dayIndex, ex, idx === 0, idx === exercises.length - 1)).join('');

        exercises.forEach(ex => {
            if (!this.restTimers[ex.id]) {
                this.restTimers[ex.id] = new RestTimer(ex.restMinutes || 0, (rt) => this.updateRestTimerUI(ex.id, rt));
            } else {
                this.updateRestTimerUI(ex.id, this.restTimers[ex.id]);
            }
        });

        container.querySelectorAll('.exercise-record').forEach(cardEl => {
            this.attachCardListeners(dayIndex, cardEl);
        });
    }

    addExercise() {
        const newId = storage.addExerciseToDay(this.currentDayIndex, {});
        this.renderExerciseList(this.currentDayIndex);

        const cardEl = document.querySelector(`.exercise-record[data-exercise-id="${newId}"]`);
        if (!cardEl) return;

        const nameInput = cardEl.querySelector('.exercise-name-input');
        nameInput.focus();
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    attachCardListeners(dayIndex, cardEl) {
        const exerciseId = cardEl.dataset.exerciseId;
        const nameInput = cardEl.querySelector('.exercise-name-input');

        nameInput.addEventListener('change', (e) => {
            storage.updateExercise(dayIndex, exerciseId, { name: e.target.value.trim() });
        });

        cardEl.querySelector('.rest-toggle-btn').addEventListener('click', () => {
            this.restTimers[exerciseId]?.toggle();
        });

        const restCountdownEl = cardEl.querySelector('.rest-countdown');
        restCountdownEl.setAttribute('contenteditable', 'true');
        restCountdownEl.setAttribute('inputmode', 'decimal');

        let lastRestMinutes = this.restTimers[exerciseId] ? this.restTimers[exerciseId].duration / 60 : 2;

        restCountdownEl.addEventListener('focus', () => {
            const rt = this.restTimers[exerciseId];
            if (!rt || rt.isRunning) {
                restCountdownEl.blur();
                return;
            }
            lastRestMinutes = rt.duration / 60;
            restCountdownEl.textContent = lastRestMinutes;
            selectElementText(restCountdownEl);
        });

        restCountdownEl.addEventListener('input', () => {
            sanitizeNumericContentEditable(restCountdownEl, true);
        });

        restCountdownEl.addEventListener('blur', () => {
            const rt = this.restTimers[exerciseId];
            if (!rt) return;
            const minutes = Math.max(0, Math.min(30, roundToHalf(parseFloat(restCountdownEl.textContent) || lastRestMinutes)));
            storage.updateExercise(dayIndex, exerciseId, { restMinutes: minutes });
            rt.setMinutes(minutes);
        });

        restCountdownEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                restCountdownEl.blur();
            }
        });

        cardEl.querySelector('.btn-reorder-up').addEventListener('click', () => {
            storage.reorderExercise(dayIndex, exerciseId, -1);
            this.renderExerciseList(dayIndex);
        });

        cardEl.querySelector('.btn-reorder-down').addEventListener('click', () => {
            storage.reorderExercise(dayIndex, exerciseId, 1);
            this.renderExerciseList(dayIndex);
        });

        cardEl.querySelector('.btn-delete-exercise').addEventListener('click', () => {
            const name = nameInput.value || 'この種目';
            if (!confirm(`${name}を削除しますか？`)) return;

            storage.deleteExercise(dayIndex, exerciseId);
            this.renderExerciseList(dayIndex);
        });

        this.attachBodyListeners(dayIndex, cardEl, nameInput);
    }

    attachBodyListeners(dayIndex, cardEl, nameInput) {
        const exerciseId = cardEl.dataset.exerciseId;
        const bodyEl = cardEl.querySelector('.exercise-body');

        const weightInput = bodyEl.querySelector('.weight-input');
        if (weightInput) {
            weightInput.addEventListener('change', (e) => {
                storage.updateExercise(dayIndex, exerciseId, { weight: e.target.value });
            });

            bodyEl.querySelectorAll('.btn-weight-step').forEach(btn => {
                btn.addEventListener('click', () => {
                    const delta = parseFloat(btn.dataset.delta);
                    const current = parseFloat(weightInput.value) || 0;
                    const next = Math.max(0, Math.round((current + delta) * 100) / 100);
                    weightInput.value = next;
                    storage.updateExercise(dayIndex, exerciseId, { weight: String(next) });
                });
            });
        }

        bodyEl.querySelector('.sets-input').addEventListener('change', (e) => {
            const newCount = Math.max(1, Math.min(10, parseInt(e.target.value) || 1));
            e.target.value = newCount;
            storage.updateExercise(dayIndex, exerciseId, { sets: String(newCount) });
            this.rerenderExerciseBody(dayIndex, cardEl, nameInput);
        });

        bodyEl.querySelector('.per-set-weight-checkbox').addEventListener('change', (e) => {
            storage.updateExercise(dayIndex, exerciseId, { perSetWeight: e.target.checked });
            this.rerenderExerciseBody(dayIndex, cardEl, nameInput);
        });

        this.attachSetInputListeners(bodyEl.querySelector('.set-inputs'));
    }

    rerenderExerciseBody(dayIndex, cardEl, nameInput) {
        const exerciseId = cardEl.dataset.exerciseId;
        const exercise = storage.getExercisesForDay(dayIndex).find(e => e.id === exerciseId);
        if (!exercise) return;

        const bodyEl = cardEl.querySelector('.exercise-body');
        const liveValues = this.captureLiveSetValues(bodyEl);
        bodyEl.innerHTML = buildExerciseBodyHTML(dayIndex, exercise, liveValues);
        this.attachBodyListeners(dayIndex, cardEl, nameInput);
    }

    // 現在入力中の重量・回数を、切り替え後の画面にそのまま引き継ぐために取得する
    captureLiveSetValues(bodyEl) {
        const wasPerSetWeight = !!bodyEl.querySelector('.set-input-row-weighted');
        const rows = bodyEl.querySelectorAll('.set-input-row');
        const sets = [];
        let sharedWeight = '';

        if (wasPerSetWeight) {
            rows.forEach(row => {
                const weight = row.querySelector('.set-weight-input')?.value || '';
                const reps = row.querySelector('.reps-input')?.value || '';
                sets.push({ weight, reps });
                if (weight !== '') sharedWeight = weight;
            });
        } else {
            sharedWeight = bodyEl.querySelector('.weight-input')?.value || '';
            rows.forEach(row => {
                const reps = row.querySelector('.reps-input')?.value || '';
                sets.push({ weight: sharedWeight, reps });
            });
        }

        return { sharedWeight, sets };
    }

    attachSetInputListeners(container) {
        if (!container) return;

        container.querySelectorAll('.btn-same').forEach(btn => {
            btn.addEventListener('click', () => {
                const row = btn.closest('.set-input-row');
                const repsInput = row.querySelector('.reps-input');
                const weightInput = row.querySelector('.set-weight-input');

                if (repsInput && repsInput.dataset.lastReps) {
                    repsInput.value = repsInput.dataset.lastReps;
                    repsInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
                if (weightInput && weightInput.dataset.lastWeight) {
                    weightInput.value = weightInput.dataset.lastWeight;
                }
            });
        });

        container.querySelectorAll('.btn-reps-step').forEach(btn => {
            btn.addEventListener('click', () => {
                const row = btn.closest('.set-input-row');
                const repsInput = row.querySelector('.reps-input');
                if (!repsInput) return;

                const lastReps = repsInput.dataset.lastReps ? parseInt(repsInput.dataset.lastReps) : null;
                const current = repsInput.value !== '' ? parseInt(repsInput.value) : (lastReps ?? 0);
                const delta = parseInt(btn.dataset.delta);
                const next = Math.max(0, (isNaN(current) ? 0 : current) + delta);

                repsInput.value = next;
                repsInput.dispatchEvent(new Event('input', { bubbles: true }));
            });
        });

        container.querySelectorAll('.reps-input').forEach(input => {
            const lastReps = input.dataset.lastReps ? parseInt(input.dataset.lastReps) : null;

            input.addEventListener('input', (e) => {
                const diffSpan = e.target.parentElement.querySelector('.reps-diff');
                if (!diffSpan) return;

                const currentValue = parseInt(e.target.value);
                if (lastReps === null || isNaN(currentValue)) {
                    diffSpan.textContent = '';
                    return;
                }

                const diff = currentValue - lastReps;
                if (diff > 0) {
                    diffSpan.textContent = `↑ +${diff}`;
                    diffSpan.style.color = '#10b981';
                } else if (diff < 0) {
                    diffSpan.textContent = `↓ ${diff}`;
                    diffSpan.style.color = '#ef4444';
                } else {
                    diffSpan.textContent = '';
                }
            });
        });
    }

    updateRestTimerUI(exerciseId, rt) {
        const card = document.querySelector(`.exercise-record[data-exercise-id="${exerciseId}"]`);
        if (!card) return;

        const countdownEl = card.querySelector('.rest-countdown');
        const toggleBtn = card.querySelector('.rest-toggle-btn');
        const row = card.querySelector('.rest-timer-row');

        if (countdownEl) countdownEl.textContent = formatTime(rt.remaining);
        if (toggleBtn) toggleBtn.textContent = rt.isRunning ? '一時停止' : 'レスト開始';

        if (row) {
            row.classList.toggle('rest-done', !rt.isRunning && rt.remaining === 0);
        }
    }

    clearRestTimers() {
        Object.values(this.restTimers).forEach(rt => rt.stop());
        this.restTimers = {};
    }

    finishTraining() {
        const cards = document.querySelectorAll('#exerciseList .exercise-record');
        const exerciseRecords = {};
        let hasAnyInput = false;

        cards.forEach(card => {
            const name = card.querySelector('.exercise-name-input').value.trim();
            if (!name) return;

            const isPerSetWeight = !!card.querySelector('.per-set-weight-checkbox')?.checked;

            if (isPerSetWeight) {
                const rows = card.querySelectorAll('.set-inputs .set-input-row');
                const sets = [];
                rows.forEach(row => {
                    const weight = row.querySelector('.set-weight-input')?.value || '';
                    const reps = row.querySelector('.reps-input')?.value || '';
                    if (weight !== '' || reps !== '') hasAnyInput = true;
                    sets.push({ weight, reps });
                });
                exerciseRecords[name] = { perSetWeight: true, sets, setCount: rows.length };
            } else {
                const weight = card.querySelector('.weight-input')?.value || '';
                const setInputs = card.querySelectorAll('.set-inputs input[data-set]');
                const sets = [];
                setInputs.forEach(input => {
                    if (input.value !== '') hasAnyInput = true;
                    sets.push(input.value);
                });
                exerciseRecords[name] = { weight, sets, setCount: setInputs.length };
            }
        });

        if (!hasAnyInput) {
            alert('何も記録されていません');
            return;
        }

        timer.stop();
        this.clearRestTimers();
        this.releaseWakeLock();
        storage.saveRecord(new Date(), this.currentDayIndex, exerciseRecords);

        const summary = this.buildSessionSummary(exerciseRecords);
        this.showSessionSummary(summary);
    }

    buildSessionSummary(exerciseRecords) {
        let totalSets = 0;
        let totalVolume = 0;

        Object.values(exerciseRecords).forEach(rec => {
            if (rec.perSetWeight) {
                rec.sets.forEach(s => {
                    const w = parseFloat(s.weight) || 0;
                    const r = parseFloat(s.reps) || 0;
                    if (s.reps !== '') totalSets++;
                    totalVolume += w * r;
                });
            } else {
                const w = parseFloat(rec.weight) || 0;
                rec.sets.forEach(s => {
                    const r = parseFloat(s) || 0;
                    if (s !== '') totalSets++;
                    totalVolume += w * r;
                });
            }
        });

        const elapsedMs = this.sessionStartedAt ? Date.now() - this.sessionStartedAt : 0;
        const elapsedMinutes = Math.max(0, Math.round(elapsedMs / 60000));

        return {
            exerciseCount: Object.keys(exerciseRecords).length,
            totalSets,
            totalVolume: Math.round(totalVolume),
            elapsedMinutes
        };
    }

    showSessionSummary(summary) {
        alert(
            `トレーニングを記録しました！\n\n` +
            `種目数: ${summary.exerciseCount}\n` +
            `完了セット数: ${summary.totalSets}\n` +
            `総ボリューム: ${summary.totalVolume}kg\n` +
            `所要時間: 約${summary.elapsedMinutes}分`
        );
        this.showHomeScreen();
    }

    showMenuScreen() {
        this.switchScreen('menuScreen');
        menuEditor.render(new Date().getDay());
    }

    showHistoryScreen() {
        this.switchScreen('historyScreen');
        history.render(new Date().getDay());
    }

    exportData() {
        const data = {
            exportedAt: new Date().toISOString(),
            menu: storage.getMenu(),
            records: storage.getRecords(),
            timerSettings: storage.getTimerSettings()
        };
        const json = JSON.stringify(data, null, 2);
        const fileName = `gym-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
        const blob = new Blob([json], { type: 'application/json' });

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
    }
}

// PWAの登録
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => {
        console.log('Service Worker registration failed:', err);
    });
}

// アプリの初期化
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new GymApp();
    window.app = app;
});
