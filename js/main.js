// トレーニング中に選択されている記録日（app.sessionDate）を「前回の記録」検索から除外するための日付文字列
function currentSessionDateStr() {
    if (!app?.sessionDate) return undefined;
    return typeof toLocalDateStr === 'function'
        ? toLocalDateStr(app.sessionDate)
        : `${app.sessionDate.getFullYear()}-${String(app.sessionDate.getMonth() + 1).padStart(2, '0')}-${String(app.sessionDate.getDate()).padStart(2, '0')}`;
}

function numOrEmpty(value) {
    return value === null || value === undefined || Number.isNaN(value) ? '' : String(value);
}

// 種目（メイン/代替それぞれ）の入力フォーム用の参照値をまとめる。
// - last: 前回の記録（灰色のプレースホルダーと「前回を入れる」ボタン用。同じ曜日を優先）
// - best: セット番号ごとの最高記録（重量優先。比較の ↑↓ 表示用）
// 種目名ごとに独立して引くので、同じメニュー枠の別種目と値が混ざらない。
function getExerciseReference(dayIndex, exercise) {
    const sessionDateStr = currentSessionDateStr();
    const last = exercise.name ? storage.getLastRecord(exercise.name, sessionDateStr, dayIndex, true) : null;
    const lastPairs = recordSetPairs(last);
    const lastShared = parseSharedWeight(last) ?? lastPairs.find(p => p.weight != null)?.weight ?? null;
    const menuWeight = exercise.weight !== undefined && exercise.weight !== '' && !Number.isNaN(parseFloat(exercise.weight))
        ? parseFloat(exercise.weight)
        : null;
    return {
        last,
        lastDate: last?.date || null,
        lastPairs,
        // 共通重量の初期表示：前回の重量 → 無ければメニューの重量
        fallbackWeight: lastShared ?? menuWeight,
        best: exercise.name ? (storage.getBestSetPairs(exercise.name, sessionDateStr) || []) : []
    };
}

function formatSetBestLabel(best) {
    if (!best || best.reps == null) return '';
    const text = best.weight != null ? `${best.weight}kg ${best.reps}回` : `${best.reps}回`;
    return `<span class="set-best-display" title="このセットの最高記録（重量優先）">最高 ${text}</span>`;
}

function buildLastRecordRowHTML(ref) {
    if (!ref.last || ref.lastPairs.every(p => p.reps == null)) return '';
    const date = new Date(`${ref.lastDate}T00:00:00`);
    const summary = ref.lastPairs.filter(p => p.reps != null).map(formatSetPair).join(' / ');
    return `
        <div class="last-record-row">
            <span class="last-record-text">前回 ${formatMonthDay(date)}：${escapeAttr(summary)}</span>
            <button type="button" class="btn-fill-last">前回を入れる</button>
        </div>
    `;
}

function buildNormalSetInputsHTML(dayIndex, exercise, liveValues, ref) {
    const setCount = Math.max(1, parseInt(exercise.sets) || 1);
    const suggestedReps = parseRepsRangeLower(exercise.repsRange);

    return Array.from({ length: setCount }, (_, i) => {
        const best = ref.best[i] || null;
        const lastReps = ref.lastPairs[i]?.reps ?? null;
        const liveReps = liveValues?.sets?.[i]?.reps ?? '';
        // 灰色の表示は前回の回数（無ければ目標回数レンジの下限）。値そのものは空のまま
        const defaultReps = lastReps ?? suggestedReps;
        const placeholder = defaultReps !== null ? `${defaultReps}` : '回数';
        const sameBtn = lastReps !== null
            ? `<button type="button" class="btn-same" data-set="${i}" title="このセットに前回の記録を入れる">入</button>`
            : '<span class="btn-same-spacer" aria-hidden="true"></span>';
        return `
            <div class="set-input-row" data-best-weight="${numOrEmpty(best?.weight)}" data-best-reps="${numOrEmpty(best?.reps)}">
                <label class="set-label-with-best"><span>セット${i + 1}</span>${formatSetBestLabel(best)}</label>
                <input type="number" class="reps-input" data-set="${i}" data-last-reps="${numOrEmpty(lastReps)}" data-suggested-reps="${suggestedReps ?? ''}" value="${escapeAttr(liveReps)}" placeholder="${placeholder}" min="0" inputmode="numeric">
                <button type="button" class="btn-reps-step" data-delta="-1" aria-label="回数を減らす">−</button>
                <button type="button" class="btn-reps-step" data-delta="1" aria-label="回数を増やす">＋</button>
                ${sameBtn}
                <span class="reps-diff"></span>
            </div>
        `;
    }).join('');
}

function buildPerSetWeightInputsHTML(dayIndex, exercise, liveValues, ref) {
    const setCount = Math.max(1, parseInt(exercise.sets) || 1);
    const step = exercise.weightStep ?? 2.5;
    const suggestedReps = parseRepsRangeLower(exercise.repsRange);

    return Array.from({ length: setCount }, (_, i) => {
        const best = ref.best[i] || null;
        const lastPair = ref.lastPairs[i] || null;
        const lastReps = lastPair?.reps ?? null;
        const lastWeight = lastPair?.weight ?? ref.fallbackWeight;
        const liveWeight = liveValues?.sets?.[i]?.weight ?? '';
        const liveReps = liveValues?.sets?.[i]?.reps ?? '';
        const defaultReps = lastReps ?? suggestedReps;
        const repsPlaceholder = defaultReps !== null ? `${defaultReps}` : '回数';
        const weightPlaceholder = lastWeight != null ? `${lastWeight}` : 'kg';
        const sameBtn = lastReps !== null
            ? `<button type="button" class="btn-same" data-set="${i}" title="このセットに前回の記録を入れる">入</button>`
            : '<span class="btn-same-spacer" aria-hidden="true"></span>';
        return `
            <div class="set-input-row set-input-row-weighted" data-best-weight="${numOrEmpty(best?.weight)}" data-best-reps="${numOrEmpty(best?.reps)}">
                <label class="set-label-with-best"><span>セット${i + 1}</span>${formatSetBestLabel(best)}</label>
                <button type="button" class="btn-weight-step-set" data-set="${i}" data-delta="-${step}" aria-label="重量を減らす">−</button>
                <input type="number" class="set-weight-input" data-set="${i}" data-last-weight="${numOrEmpty(lastWeight)}" value="${escapeAttr(liveWeight)}" placeholder="${weightPlaceholder}" min="0" inputmode="decimal">
                <button type="button" class="btn-weight-step-set" data-set="${i}" data-delta="${step}" aria-label="重量を増やす">＋</button>
                <input type="number" class="reps-input" data-set="${i}" data-last-reps="${numOrEmpty(lastReps)}" data-suggested-reps="${suggestedReps ?? ''}" value="${escapeAttr(liveReps)}" placeholder="${repsPlaceholder}" min="0" inputmode="numeric">
                <button type="button" class="btn-reps-step" data-delta="-1" aria-label="回数を減らす">−</button>
                <button type="button" class="btn-reps-step" data-delta="1" aria-label="回数を増やす">＋</button>
                ${sameBtn}
                <span class="reps-diff"></span>
            </div>
        `;
    }).join('');
}

// 入力欄が空のときの基準値（灰色で表示している前回の値）を数値で返す
function inputFallbackNumber(input, datasetKey) {
    if (!input) return null;
    const raw = input.dataset[datasetKey];
    const n = raw !== undefined && raw !== '' ? parseFloat(raw) : NaN;
    return Number.isNaN(n) ? null : n;
}

// そのセット行の重量入力欄（セットごと重量ならその行、共通重量なら種目の重量欄）
function weightInputForRow(row) {
    return row.querySelector('.set-weight-input')
        || row.closest('.exercise-body')?.querySelector('.weight-input')
        || null;
}

// 最高記録との比較表示（重量優先）。重量が最高より重ければ新記録、同じ重量なら回数の差を出す。
function updateRowDiff(row) {
    const diffSpan = row.querySelector('.reps-diff');
    if (!diffSpan) return;
    const reps = parseInt(row.querySelector('.reps-input')?.value, 10);
    const bestReps = row.dataset.bestReps !== '' ? parseInt(row.dataset.bestReps, 10) : NaN;
    diffSpan.textContent = '';
    diffSpan.className = 'reps-diff';
    if (Number.isNaN(reps) || reps <= 0 || Number.isNaN(bestReps)) return;

    const weightRaw = parseFloat(weightInputForRow(row)?.value);
    const weight = Number.isNaN(weightRaw) ? 0 : weightRaw;
    const bestWeightRaw = row.dataset.bestWeight !== '' ? parseFloat(row.dataset.bestWeight) : NaN;
    const bestWeight = Number.isNaN(bestWeightRaw) ? 0 : bestWeightRaw;

    if (weight > bestWeight) {
        diffSpan.textContent = '🏆 新記録';
        diffSpan.classList.add('diff-up');
    } else if (weight === bestWeight) {
        const diff = reps - bestReps;
        if (diff > 0) {
            diffSpan.textContent = `🏆 +${diff}`;
            diffSpan.classList.add('diff-up');
        } else if (diff < 0) {
            diffSpan.textContent = `↓ ${diff}`;
            diffSpan.classList.add('diff-down');
        } else {
            diffSpan.textContent = '＝';
            diffSpan.classList.add('diff-even');
        }
    }
}

// セット行に前回の値を入れる（「入」「前回を入れる」ボタン用）。空欄のところだけ埋める場合は onlyEmpty
function fillRowFromLast(row, { onlyEmpty = false } = {}) {
    const repsInput = row.querySelector('.reps-input');
    const lastReps = inputFallbackNumber(repsInput, 'lastReps');
    if (lastReps === null) return false;
    if (!onlyEmpty || repsInput.value === '') repsInput.value = lastReps;
    const weightInput = weightInputForRow(row);
    const lastWeight = inputFallbackNumber(weightInput, 'lastWeight');
    if (weightInput && lastWeight !== null && (weightInput.value === '' || (!onlyEmpty && weightInput.classList.contains('set-weight-input')))) {
        weightInput.value = lastWeight;
    }
    return true;
}
function buildExerciseBodyHTML(dayIndex, exercise, liveValues) {
    const ref = getExerciseReference(dayIndex, exercise);
    const lastRow = buildLastRecordRowHTML(ref);

    if (exercise.perSetWeight) {
        return `
            ${lastRow}
            <div class="exercise-record-info">
                <div>セット数:
                    <button type="button" class="btn-sets-step" data-delta="-1" aria-label="セット数を減らす">−</button>
                    <input type="number" class="sets-input" value="${escapeAttr(exercise.sets)}" min="1" max="10" inputmode="numeric">
                    <button type="button" class="btn-sets-step" data-delta="1" aria-label="セット数を増やす">＋</button>
                </div>
            </div>
            <label class="per-set-weight-toggle">
                <input type="checkbox" class="per-set-weight-checkbox" checked> セットごとに重量を変える
            </label>
            <div class="set-inputs">
                ${buildPerSetWeightInputsHTML(dayIndex, exercise, liveValues, ref)}
            </div>
        `;
    }

    const step = exercise.weightStep ?? 2.5;
    // 重量も初期値は空欄。前回の重量（無ければメニューの重量）を灰色で表示する
    const weightValue = liveValues?.sharedWeight ?? '';
    const weightPlaceholder = ref.fallbackWeight != null ? `${ref.fallbackWeight}` : 'kg';
    return `
        ${lastRow}
        <div class="exercise-record-info">
            <div>重量:
                <button type="button" class="btn-weight-step" data-delta="-${step}" aria-label="重量を減らす">−</button>
                <input type="number" class="weight-input" value="${escapeAttr(weightValue)}" data-last-weight="${numOrEmpty(ref.fallbackWeight)}" placeholder="${weightPlaceholder}" min="0" inputmode="decimal">
                <button type="button" class="btn-weight-step" data-delta="${step}" aria-label="重量を増やす">＋</button>
            kg</div>
            <div>セット数:
                <button type="button" class="btn-sets-step" data-delta="-1" aria-label="セット数を減らす">−</button>
                <input type="number" class="sets-input" value="${escapeAttr(exercise.sets)}" min="1" max="10" inputmode="numeric">
                <button type="button" class="btn-sets-step" data-delta="1" aria-label="セット数を増やす">＋</button>
            </div>
        </div>
        <label class="per-set-weight-toggle">
            <input type="checkbox" class="per-set-weight-checkbox"> セットごとに重量を変える
        </label>
        <div class="set-inputs">
            ${buildNormalSetInputsHTML(dayIndex, exercise, liveValues, ref)}
        </div>
    `;
}

function buildExerciseCardHTML(dayIndex, exercise, isFirst, isLast) {
    // variantNames は種目本体を必ず1つ含む（名前が未入力でも入力フォームを描画するため）。
    // choiceControl（切替ボタン）用には、名前が入っているものだけに絞ったnamedChoicesを使う。
    const variantNames = [exercise.name, ...(exercise.alternatives || [])];
    const namedChoices = variantNames.filter(Boolean);
    const choiceControl = namedChoices.length > 1
        ? `<div class="exercise-choice-label">このメニュー枠で行う種目
                <div class="exercise-choice-buttons">${namedChoices.map((name, index) => `<button type="button" class="exercise-choice-btn ${index === 0 ? 'active' : ''}" data-choice="${escapeAttr(name)}">${escapeAttr(name)}</button>`).join('')}</div>
           </div>`
        : '';
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
            ${choiceControl}
            <div class="rest-timer-row">
                <button class="btn-secondary rest-toggle-btn">レスト開始</button>
                <span class="rest-countdown" role="button" tabindex="0">${formatTime((exercise.restMinutes ?? 2) * 60)}</span>
            </div>
            <div class="rest-preset-row">
                ${REST_PRESETS.map(m => `<button type="button" class="rest-preset-btn ${(exercise.restMinutes ?? 2) === m ? 'active' : ''}" data-minutes="${m}">${m}分</button>`).join('')}
            </div>
            <div class="exercise-variants">
                ${variantNames.map((name, index) => `<div class="exercise-variant ${index === 0 ? 'active' : ''}" data-variant-name="${escapeAttr(name)}">
                    ${index > 0 ? `<div class="exercise-variant-or">
                        <span class="exercise-variant-or-label">OR</span>
                        <input type="text" class="exercise-name-input exercise-alt-name-input" data-alt-index="${index - 1}" value="${escapeAttr(name)}" placeholder="種目名">
                    </div>` : ''}
                    <div class="exercise-body">${buildExerciseBodyHTML(dayIndex, { ...exercise, name, weight: getVariantWeight(exercise, name) })}</div>
                </div>`).join('')}
            </div>
            <button type="button" class="btn-secondary btn-add-alternative">＋このメニューに別の種目を追加</button>
        </div>
    `;
}

class GymApp {
    constructor() {
        this.currentDayIndex = new Date().getDay();
        this.restTimers = {};
        this.wakeLock = null;
        this.sessionStartedAt = null;
        this.sessionDate = null;
        this.dateOffsetDays = 0;
        this.init();
    }

    init() {
        this.focusMode = new FocusMode(this);
        this.setupEventListeners();
        this.displayHomeScreen();
    }

    setupEventListeners() {
        document.getElementById('startBtn')?.addEventListener('click', () => this.startTraining());
        document.getElementById('startVoiceLink')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.startTraining({ focusVoice: true });
        });
        document.getElementById('menuEditBtn')?.addEventListener('click', () => this.showMenuScreen());
        document.getElementById('historyBtn')?.addEventListener('click', () => this.showHistoryScreen());
        document.getElementById('focusModeBtn')?.addEventListener('click', () => this.focusMode.start(this.currentDayIndex));

        document.getElementById('finishTrainingBtn')?.addEventListener('click', () => this.finishTraining());

        document.querySelectorAll('.date-offset-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setTrainingDateOffset(parseInt(btn.dataset.offset, 10)));
        });
        document.getElementById('addExerciseBtn')?.addEventListener('click', () => this.addExercise());
        document.getElementById('addMenuExerciseBtn')?.addEventListener('click', () => menuEditor.addExercise());
        this.setupTimerTapToEdit();
        this.initVoiceWorkout();

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
                timer.syncNow();
                Object.values(this.restTimers).forEach(rt => rt.syncNow());
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
        this.displayMilestoneCard();
        this.displayBackupReminder();
    }

    displayBackupReminder() {
        const el = document.getElementById('backupReminderCard');
        if (!el) return;

        const lastExportAt = storage.getLastExportAt();
        const daysSinceExport = lastExportAt ? (Date.now() - lastExportAt) / 86400000 : Infinity;

        if (daysSinceExport < 7) {
            el.innerHTML = '';
            return;
        }

        const message = lastExportAt
            ? 'しばらくバックアップを書き出していません'
            : 'まだバックアップを書き出していません';

        el.innerHTML = `
            <span>${message}</span>
            <button id="backupNowBtn" type="button" class="btn-backup-now">今すぐバックアップ</button>
        `;
        document.getElementById('backupNowBtn')?.addEventListener('click', () => Backup.save());
    }

    displayMilestoneCard() {
        const el = document.getElementById('milestoneCard');
        if (!el) return;

        const today = new Date();
        const days = getDaysSinceStart(today);
        const duration = formatDurationSinceStart(today);
        const milestone = isMilestoneDay(today);

        el.textContent = `トレーニング開始から${days}日目（${duration}）`;
        el.classList.toggle('milestone-highlight', milestone);
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

    startTraining({ focusVoice = false } = {}) {
        this.sessionStartedAt = Date.now();
        this.switchScreen('trainingScreen');
        this.setTrainingDateOffset(0, { resetTimer: true });
        this.requestWakeLock();
        if (focusVoice) {
            setTimeout(() => document.getElementById('voicePanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
        }
    }

    initVoiceWorkout() {
        if (!globalThis.VoiceWorkout) {
            const status = document.getElementById('voiceStatus');
            const note = document.getElementById('voiceConnectNote');
            if (status) status.textContent = '音声機能の読み込みに失敗しました。ページを再読み込みしてください';
            if (note) note.textContent = 'スクリプト読み込みエラー';
            return;
        }
        void VoiceWorkout.init({
            onSetsChanged: (sets) => this.applyVoiceSetsToForms(sets),
            onSessionDiscarded: (names) => this.clearVoiceDraft(names)
        });
    }

    clearVoiceDraft(names = []) {
        if (!names.length) return;
        const draft = storage.getDraft(this.currentDayIndex, currentSessionDateStr()) || {};
        let changed = false;
        for (const name of names) {
            if (Object.hasOwn(draft, name)) {
                delete draft[name];
                changed = true;
            }
        }
        if (!changed) return;
        storage.saveDraft(this.currentDayIndex, draft, currentSessionDateStr());
        this.renderExerciseList(this.currentDayIndex);
        this.autoSaveRecord();
    }

    mergeActiveScreenIntoDraft() {
        if (!document.querySelector('#exerciseList .exercise-record')) return;
        const draft = storage.getDraft(this.currentDayIndex, currentSessionDateStr()) || {};
        document.querySelectorAll('#exerciseList .exercise-record').forEach(card => {
            const activeVariant = card.querySelector('.exercise-variant.active');
            const name = card.querySelector('.exercise-choice-btn.active')?.dataset.choice
                || activeVariant?.dataset.variantName
                || card.querySelector('.exercise-name-input')?.value.trim();
            if (!name || !activeVariant) return;
            const perSet = !!activeVariant.querySelector('.per-set-weight-checkbox')?.checked;
            const rows = [...activeVariant.querySelectorAll('.set-input-row')];
            draft[name] = {
                weight: activeVariant.querySelector('.weight-input')?.value || '',
                sets: rows.map(row => perSet
                    ? {
                        weight: row.querySelector('.set-weight-input')?.value || '',
                        reps: row.querySelector('.reps-input')?.value || ''
                    }
                    : (row.querySelector('.reps-input')?.value || ''))
            };
        });
        storage.saveDraft(this.currentDayIndex, draft, currentSessionDateStr());
    }

    activateExerciseVariant(name) {
        document.querySelectorAll('#exerciseList .exercise-record').forEach(card => {
            const variants = [...card.querySelectorAll('.exercise-variant')];
            const match = variants.find(v => v.dataset.variantName === name);
            if (!match) return;
            card.querySelectorAll('.exercise-choice-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.choice === name);
            });
            variants.forEach(v => v.classList.toggle('active', v === match));
        });
    }

    applyVoiceSetsToForms(sets = []) {
        const sync = globalThis.VoiceFormSync;
        if (!sync) return;

        // Keep other exercises' in-progress typing before voice rewrite.
        this.mergeActiveScreenIntoDraft();

        const confirmed = sets.filter(s => !s.novel);
        const byName = {};
        for (const set of confirmed) {
            byName[set.name] ||= [];
            byName[set.name].push(set);
        }

        const dayIndex = this.currentDayIndex;
        const draft = storage.getDraft(dayIndex, currentSessionDateStr()) || {};
        const activated = [];
        let needsFullRender = false;

        for (const [name, group] of Object.entries(byName)) {
            let exercise = sync.findMenuExercise(storage.getExercisesForDay(dayIndex), name);
            if (!exercise) {
                storage.addExerciseToDay(dayIndex, {
                    name,
                    weight: String(group[0].weight ?? ''),
                    sets: String(Math.max(group.length, 3)),
                    perSetWeight: true
                });
                exercise = sync.findMenuExercise(storage.getExercisesForDay(dayIndex), name);
                needsFullRender = true;
            } else {
                const existingDraft = draft[name];
                const nextCount = sync.desiredSetCount(exercise, group, existingDraft);
                const updates = {};
                if (!exercise.perSetWeight) {
                    updates.perSetWeight = true;
                    needsFullRender = true;
                }
                if (nextCount > (parseInt(exercise.sets, 10) || 1)) {
                    updates.sets = String(nextCount);
                    needsFullRender = true;
                }
                if (Object.keys(updates).length) {
                    storage.updateExercise(dayIndex, exercise.id, updates);
                    exercise = sync.findMenuExercise(storage.getExercisesForDay(dayIndex), name) || {
                        ...exercise,
                        ...updates
                    };
                }
            }

            const rowCount = sync.desiredSetCount(exercise, group, draft[name]);
            draft[name] = sync.mergeVoiceSetsIntoDraft(draft[name], group, rowCount);
            activated.push(name);
        }

        storage.saveDraft(dayIndex, draft, currentSessionDateStr());

        if (needsFullRender || !document.querySelector('#exerciseList .exercise-record')) {
            this.renderExerciseList(dayIndex);
        } else {
            for (const name of activated) this.fillVariantInputsFromDraft(name, draft[name]);
        }
        for (const name of activated) this.activateExerciseVariant(name);
        // Do not autoSaveRecord here: it strips voiceSessionId and blocked later voice syncs.
        // Draft + VoiceHistory.sync own persistence during a live voice session.
    }

    fillVariantInputsFromDraft(name, values) {
        if (!values) return;
        document.querySelectorAll('#exerciseList .exercise-variant').forEach(variantEl => {
            if (variantEl.dataset.variantName !== name) return;
            const rows = [...variantEl.querySelectorAll('.set-input-row')];
            const draftSets = Array.isArray(values.sets) ? values.sets : [];
            rows.forEach((row, i) => {
                const entry = draftSets[i];
                const reps = entry && typeof entry === 'object' ? entry.reps : entry;
                const weight = entry && typeof entry === 'object' ? entry.weight : values.weight;
                const repsInput = row.querySelector('.reps-input');
                const weightInput = row.querySelector('.set-weight-input');
                if (repsInput && reps !== undefined && reps !== null && reps !== '') {
                    repsInput.value = String(reps);
                }
                if (weightInput && weight !== undefined && weight !== null && weight !== '') {
                    weightInput.value = String(weight);
                }
            });
            const sharedWeight = variantEl.querySelector('.weight-input');
            if (sharedWeight && values.weight !== undefined && values.weight !== '') {
                sharedWeight.value = String(values.weight);
            }
        });
    }

    // 記録日を「今日／昨日／一昨日」から選び直す（日付をまたいでのトレーニングや、記録し忘れた過去分の入力用）。
    // セッション全体タイマーは実際の運動時間を計るものなので、記録日の切替では止めない（resetTimerは開始時のみtrue）。
    setTrainingDateOffset(offsetDays, { resetTimer = false } = {}) {
        this.dateOffsetDays = offsetDays;

        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - offsetDays);
        this.sessionDate = targetDate;
        this.currentDayIndex = targetDate.getDay();

        document.querySelectorAll('.date-offset-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.offset, 10) === offsetDays);
        });

        this.setupTrainingScreen(this.currentDayIndex, { resetTimer });
        if (globalThis.VoiceWorkout) {
            const date = this.calendarDateForVoice();
            void VoiceWorkout.alignToDay(this.currentDayIndex, date);
        }
    }

    calendarDateForVoice(date = this.sessionDate || new Date()) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    setupTrainingScreen(dayIndex, { resetTimer = true } = {}) {
        this.clearRestTimers();

        const menu = storage.getMenu();
        const dayMenu = menu[dayIndex] || { label: DAY_LABELS_FULL[dayIndex], status: '', exercises: [] };
        const dayLabel = document.getElementById('trainingDayLabel');
        if (dayLabel) {
            const dateSuffix = this.dateOffsetDays > 0 ? `（${formatMonthDay(this.sessionDate)}）` : '';
            dayLabel.textContent = (dayMenu.status ? `${DAY_LABELS_FULL[dayIndex]} - ${dayMenu.status}` : DAY_LABELS_FULL[dayIndex]) + dateSuffix;
        }

        if (resetTimer) {
            const savedMinutes = storage.getTimerForDay(dayIndex);
            timer.setDuration(savedMinutes);

            document.getElementById('timerStartBtn').style.display = 'inline-block';
            document.getElementById('timerPauseBtn').style.display = 'none';
        }

        this.renderExerciseList(dayIndex);
        const draft = this.getRestorableInput(dayIndex);
        let notice = document.getElementById('draftNotice');
        if (!notice) {
            notice = document.createElement('div');
            notice.id = 'draftNotice';
            notice.className = 'draft-notice';
            document.getElementById('exerciseList')?.before(notice);
        }
        notice.textContent = draft
            ? '✅ この日の入力を復元しました（入力中は自動保存）'
            : '💾 入力内容は自動保存されます。灰色の数字は前回の記録です（「前回を入れる」で反映）';
        notice.hidden = false;
    }

    // 画面に復元する入力：この記録日の下書き → 無ければこの記録日に保存済みの記録。
    // 別の日の下書きは復元しない（先週の値が今週に入ってしまうのを防ぐ）
    getRestorableInput(dayIndex) {
        const dateStr = currentSessionDateStr() || toLocalDateStr();
        const draft = storage.getDraft(dayIndex, dateStr);
        if (draft && Object.keys(draft).length > 0) return draft;
        const saved = storage.getRecords()[dateStr]?.[dayIndex];
        return saved && Object.keys(saved).length > 0 ? saved : null;
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

        const draft = this.getRestorableInput(dayIndex);
        if (draft) {
            // 下書きは種目名キーで持っているので、対応する種目（メイン/代替）のフォームだけに復元する
            container.querySelectorAll('.exercise-record .exercise-variant').forEach(variantEl => {
                const values = draft[variantEl.dataset.variantName];
                if (!values) return;
                const weightInput = variantEl.querySelector('.weight-input');
                if (weightInput && values.weight !== '' && values.weight !== undefined) weightInput.value = values.weight;
                variantEl.querySelectorAll('.reps-input').forEach((input, i) => {
                    input.value = values.sets?.[i]?.reps ?? values.sets?.[i] ?? '';
                });
                variantEl.querySelectorAll('.set-weight-input').forEach((input, i) => {
                    const w = values.sets?.[i]?.weight;
                    if (w !== undefined && w !== '') input.value = w;
                });
            });

            // 代替種目の方を記録していた場合は、その種目を選択状態に戻す
            container.querySelectorAll('.exercise-record').forEach(card => {
                const variants = [...card.querySelectorAll('.exercise-variant')];
                const hasInput = v => [...v.querySelectorAll('.set-inputs input')].some(input => input.value !== '');
                const active = variants.find(v => v.classList.contains('active'));
                if (!active || hasInput(active)) return;
                const filled = variants.find(hasInput);
                if (!filled) return;
                variants.forEach(v => v.classList.toggle('active', v === filled));
                card.querySelectorAll('.exercise-choice-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.choice === filled.dataset.variantName));
            });
            container.querySelectorAll('.set-input-row').forEach(updateRowDiff);
        }

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
            this.renderExerciseList(dayIndex);
        });

        cardEl.querySelectorAll('.exercise-choice-btn').forEach(btn => btn.addEventListener('click', () => {
            cardEl.querySelectorAll('.exercise-choice-btn').forEach(item => item.classList.remove('active'));
            btn.classList.add('active');
            cardEl.querySelectorAll('.exercise-variant').forEach(variant => variant.classList.toggle('active', variant.dataset.variantName === btn.dataset.choice));
            this.saveDraftFromScreen();
        }));
        cardEl.querySelectorAll('.exercise-alt-name-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const altIndex = parseInt(input.dataset.altIndex, 10);
                const newName = e.target.value.trim();
                if (!newName) { this.renderExerciseList(dayIndex); return; }
                storage.renameAlternative(dayIndex, exerciseId, altIndex, newName);
                this.renderExerciseList(dayIndex);
            });
        });

        cardEl.querySelector('.btn-add-alternative')?.addEventListener('click', () => {
            const name = prompt('追加する種目名を入力してください');
            if (!name?.trim()) return;
            storage.addAlternativeToExercise(dayIndex, exerciseId, name.trim());
            this.renderExerciseList(dayIndex);
        });

        cardEl.querySelector('.rest-toggle-btn').addEventListener('click', () => {
            this.restTimers[exerciseId]?.toggle();
        });

        // レスト時間のワンタップ変更（カウントダウン中に押した場合は停止して新しい時間にリセット）
        cardEl.querySelectorAll('.rest-preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const minutes = parseFloat(btn.dataset.minutes);
                storage.updateExercise(dayIndex, exerciseId, { restMinutes: minutes });
                this.restTimers[exerciseId]?.setMinutes(minutes);
                cardEl.querySelectorAll('.rest-preset-btn').forEach(b => b.classList.toggle('active', b === btn));
            });
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
        cardEl.querySelectorAll('.exercise-body').forEach(bodyEl => this.attachBodyListenersToElement(dayIndex, cardEl, nameInput, bodyEl));
    }

    attachBodyListenersToElement(dayIndex, cardEl, nameInput, bodyEl) {
        const exerciseId = cardEl.dataset.exerciseId;
        // どの種目（メイン/代替）のフォームかを特定し、重量はその種目にだけ保存する
        const variantName = bodyEl.closest('.exercise-variant')?.dataset.variantName || '';

        const weightInput = bodyEl.querySelector('.weight-input');
        if (weightInput) {
            const onSharedWeightChanged = () => {
                bodyEl.querySelectorAll('.set-input-row').forEach(updateRowDiff);
                this.saveDraftFromScreen();
            };
            weightInput.addEventListener('input', onSharedWeightChanged);
            weightInput.addEventListener('change', (e) => {
                if (e.target.value !== '') storage.updateExerciseVariantWeight(dayIndex, exerciseId, variantName, e.target.value);
            });

            bodyEl.querySelectorAll('.btn-weight-step').forEach(btn => {
                btn.addEventListener('click', () => {
                    const delta = parseFloat(btn.dataset.delta);
                    // 空欄なら灰色で表示している前回の重量から増減する
                    const current = weightInput.value !== '' ? (parseFloat(weightInput.value) || 0) : (inputFallbackNumber(weightInput, 'lastWeight') ?? 0);
                    const next = Math.max(0, Math.round((current + delta) * 100) / 100);
                    weightInput.value = next;
                    storage.updateExerciseVariantWeight(dayIndex, exerciseId, variantName, String(next));
                    onSharedWeightChanged();
                });
            });
        }

        bodyEl.querySelector('.btn-fill-last')?.addEventListener('click', () => {
            bodyEl.querySelectorAll('.set-input-row').forEach(row => {
                fillRowFromLast(row, { onlyEmpty: true });
                updateRowDiff(row);
            });
            this.saveDraftFromScreen();
        });

        const setsInput = bodyEl.querySelector('.sets-input');
        const applySetsCount = (newCount) => {
            const clamped = Math.max(1, Math.min(10, newCount));
            storage.updateExercise(dayIndex, exerciseId, { sets: String(clamped) });
            this.rerenderExerciseBody(dayIndex, cardEl, nameInput);
        };

        setsInput.addEventListener('change', (e) => {
            applySetsCount(parseInt(e.target.value) || 1);
        });

        bodyEl.querySelectorAll('.btn-sets-step').forEach(btn => {
            btn.addEventListener('click', () => {
                const delta = parseInt(btn.dataset.delta);
                const current = parseInt(setsInput.value) || 1;
                applySetsCount(current + delta);
            });
        });

        bodyEl.querySelector('.per-set-weight-checkbox').addEventListener('change', (e) => {
            storage.updateExercise(dayIndex, exerciseId, { perSetWeight: e.target.checked });
            this.rerenderExerciseBody(dayIndex, cardEl, nameInput);
        });

        this.attachSetInputListeners(bodyEl.querySelector('.set-inputs'));
    }

    // セット数やセットごと重量の切替は全種目（メイン/代替）で共有しているため、
    // カード内の全フォームをそれぞれの種目名・重量で描き直す
    rerenderExerciseBody(dayIndex, cardEl, nameInput) {
        const exerciseId = cardEl.dataset.exerciseId;
        const exercise = storage.getExercisesForDay(dayIndex).find(e => e.id === exerciseId);
        if (!exercise) return;

        cardEl.querySelectorAll('.exercise-variant').forEach(variantEl => {
            const bodyEl = variantEl.querySelector('.exercise-body');
            if (!bodyEl) return;
            const name = variantEl.dataset.variantName || exercise.name;
            const liveValues = this.captureLiveSetValues(bodyEl);
            bodyEl.innerHTML = buildExerciseBodyHTML(dayIndex, { ...exercise, name, weight: getVariantWeight(exercise, name) }, liveValues);
            this.attachBodyListenersToElement(dayIndex, cardEl, nameInput, bodyEl);
        });
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

        // 「入」：このセットに前回の記録（重量・回数）を入れる
        container.querySelectorAll('.btn-same').forEach(btn => {
            btn.addEventListener('click', () => {
                const row = btn.closest('.set-input-row');
                if (!fillRowFromLast(row)) return;
                row.querySelector('.reps-input')?.dispatchEvent(new Event('input', { bubbles: true }));
            });
        });

        container.querySelectorAll('.btn-weight-step-set').forEach(btn => {
            btn.addEventListener('click', () => {
                const row = btn.closest('.set-input-row');
                const weightInput = row.querySelector('.set-weight-input');
                if (!weightInput) return;

                const delta = parseFloat(btn.dataset.delta);
                const current = weightInput.value !== '' ? (parseFloat(weightInput.value) || 0) : (inputFallbackNumber(weightInput, 'lastWeight') ?? 0);
                const next = Math.max(0, Math.round((current + delta) * 100) / 100);

                weightInput.value = next;
                weightInput.dispatchEvent(new Event('input', { bubbles: true }));
            });
        });

        container.querySelectorAll('.btn-reps-step').forEach(btn => {
            btn.addEventListener('click', () => {
                const row = btn.closest('.set-input-row');
                const repsInput = row.querySelector('.reps-input');
                if (!repsInput) return;

                // 空欄なら灰色で表示している前回の回数（無ければ目標回数の下限）から増減する
                const base = inputFallbackNumber(repsInput, 'lastReps') ?? inputFallbackNumber(repsInput, 'suggestedReps') ?? 0;
                const current = repsInput.value !== '' ? parseInt(repsInput.value) : base;
                const delta = parseInt(btn.dataset.delta);
                const next = Math.max(0, (isNaN(current) ? 0 : current) + delta);

                repsInput.value = next;
                repsInput.dispatchEvent(new Event('input', { bubbles: true }));
            });
        });

        container.querySelectorAll('.reps-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const row = e.target.closest('.set-input-row');
                // 回数を入れたのに重量が空欄なら、灰色で表示している重量でやったものとして入れる
                const weightInput = weightInputForRow(row);
                if (e.target.value !== '' && weightInput && weightInput.value === '') {
                    const fallback = inputFallbackNumber(weightInput, 'lastWeight');
                    if (fallback !== null) {
                        weightInput.value = fallback;
                        if (weightInput.classList.contains('weight-input')) {
                            row.closest('.exercise-body')?.querySelectorAll('.set-input-row').forEach(updateRowDiff);
                        }
                    }
                }
                updateRowDiff(row);
            });
        });

        container.querySelectorAll('.set-weight-input').forEach(input => {
            input.addEventListener('input', (e) => updateRowDiff(e.target.closest('.set-input-row')));
        });

        container.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => this.saveDraftFromScreen());
            input.addEventListener('change', () => this.saveDraftFromScreen());
        });
    }

    saveDraftFromScreen() {
        const draft = {};
        document.querySelectorAll('#exerciseList .exercise-record').forEach(card => {
            const name = card.querySelector('.exercise-choice-btn.active')?.dataset.choice || card.querySelector('.exercise-name-input')?.value.trim();
            if (!name) return;
            // 選択中の種目（メイン/代替）のフォームだけを、その種目名で保存する
            const activeVariant = card.querySelector('.exercise-variant.active') || card;
            const perSet = !!activeVariant.querySelector('.per-set-weight-checkbox')?.checked;
            const rows = [...activeVariant.querySelectorAll('.set-input-row')];
            draft[name] = {
                weight: activeVariant.querySelector('.weight-input')?.value || '',
                sets: rows.map(row => perSet ? { weight: row.querySelector('.set-weight-input')?.value || '', reps: row.querySelector('.reps-input')?.value || '' } : (row.querySelector('.reps-input')?.value || ''))
            };
        });
        storage.saveDraft(this.currentDayIndex, draft, currentSessionDateStr());
        this.autoSaveRecord();
    }

    // 「終了」ボタンを押さなくても、入力があるたびに正式な記録として自動保存する
    autoSaveRecord() {
        const { exerciseRecords, hasAnyInput } = this.collectExerciseRecords();
        const date = this.sessionDate || new Date();
        if (!hasAnyInput) {
            // 入力を全部消した場合は、この日の記録も消す（空の記録が残らないように）
            if (storage.getRecordForDay(date, this.currentDayIndex)) {
                storage.deleteRecordForDate(toLocalDateStr(date), this.currentDayIndex);
            }
            return;
        }
        storage.saveRecord(date, this.currentDayIndex, exerciseRecords);
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

        card.querySelectorAll('.rest-preset-btn').forEach(btn => {
            btn.classList.toggle('active', parseFloat(btn.dataset.minutes) * 60 === rt.duration);
        });
    }

    clearRestTimers() {
        Object.values(this.restTimers).forEach(rt => rt.stop());
        this.restTimers = {};
    }

    // 画面上の入力内容から記録データを組み立てる（自動保存・終了保存の両方で共有）
    collectExerciseRecords() {
        const cards = document.querySelectorAll('#exerciseList .exercise-record');
        const exerciseRecords = {};
        let hasAnyInput = false;

        cards.forEach(card => {
            const name = card.querySelector('.exercise-choice-btn.active')?.dataset.choice || card.querySelector('.exercise-name-input').value.trim();
            if (!name) return;

            const activeVariant = card.querySelector('.exercise-variant.active') || card;
            const isPerSetWeight = !!activeVariant.querySelector('.per-set-weight-checkbox')?.checked;

            // 何も入力していない種目（今日はやらなかった種目）は記録に含めない
            if (isPerSetWeight) {
                const rows = activeVariant.querySelectorAll('.set-inputs .set-input-row');
                const sets = [];
                let filled = false;
                rows.forEach(row => {
                    const weight = row.querySelector('.set-weight-input')?.value || '';
                    const reps = row.querySelector('.reps-input')?.value || '';
                    if (reps !== '') filled = true;
                    sets.push({ weight, reps });
                });
                if (!filled) return;
                hasAnyInput = true;
                exerciseRecords[name] = { perSetWeight: true, sets, setCount: rows.length };
            } else {
                const weight = activeVariant.querySelector('.weight-input')?.value || '';
                const setInputs = activeVariant.querySelectorAll('.set-inputs input.reps-input');
                const sets = [];
                setInputs.forEach(input => sets.push(input.value));
                if (!sets.some(v => v !== '')) return;
                hasAnyInput = true;
                exerciseRecords[name] = { weight, sets, setCount: setInputs.length };
            }
        });

        return { exerciseRecords, hasAnyInput };
    }

    finishTraining() {
        const { exerciseRecords, hasAnyInput } = this.collectExerciseRecords();

        if (!hasAnyInput) {
            alert('何も記録されていません');
            return;
        }

        timer.stop();
        this.clearRestTimers();
        this.releaseWakeLock();
        storage.saveRecord(this.sessionDate || new Date(), this.currentDayIndex, exerciseRecords);
        storage.clearDraft(this.currentDayIndex);

        const summary = this.buildSessionSummary(exerciseRecords);
        this.showSessionSummary(summary);
    }

    buildSessionSummary(exerciseRecords) {
        let totalSets = 0;

        Object.values(exerciseRecords).forEach(rec => {
            if (rec.perSetWeight) {
                rec.sets.forEach(s => {
                    if (s.reps !== '') totalSets++;
                });
            } else {
                rec.sets.forEach(s => {
                    if (s !== '') totalSets++;
                });
            }
        });

        const elapsedMs = this.sessionStartedAt ? Date.now() - this.sessionStartedAt : 0;
        const elapsedMinutes = Math.max(0, Math.round(elapsedMs / 60000));

        return {
            exerciseCount: Object.keys(exerciseRecords).length,
            totalSets,
            totalVolume: calculateSessionVolume(exerciseRecords),
            elapsedMinutes
        };
    }

    showSessionSummary(summary) {
        const lifetimeVolume = getTotalLifetimeVolume();
        const fun = getFunVolumeComparison(lifetimeVolume);

        alert(
            `トレーニングを記録しました！\n\n` +
            `種目数: ${summary.exerciseCount}\n` +
            `完了セット数: ${summary.totalSets}\n` +
            `総ボリューム: ${summary.totalVolume}kg\n` +
            `所要時間: 約${summary.elapsedMinutes}分\n\n` +
            `これまでの総重量: ${fun.unit}${fun.count}${fun.counter}分`
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
        Backup.renderStatus();
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
