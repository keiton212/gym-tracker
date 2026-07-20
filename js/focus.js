// 集中モード：今の種目・今のセットだけを大きく表示し、1タップ（またはロック画面操作）で
// 次のセット/種目へ自動で進める。実際の値の読み書きは通常のトレーニング画面のフォーム要素
// （storage連携・重量ステップ計算などをすでに持つ）に対してクリックを委譲することで二重実装を避ける。
class FocusMode {
    constructor(app) {
        this.app = app;
        this.exercises = [];
        this.steps = [];
        this.stepIndex = 0;
        this.selectedNames = {};
        this.pollInterval = null;
        // ロック画面操作（無音再生ハック）はONにした瞬間に他アプリの音楽が止まるため、
        // 集中モードに入っただけでは起動せず、ユーザーが明示的にONにしたときだけ使う。
        this.lockScreenActive = false;
        this.attachStaticListeners();
    }

    attachStaticListeners() {
        document.getElementById('focusExitBtn')?.addEventListener('click', () => this.exit());
        document.getElementById('focusPrevBtn')?.addEventListener('click', () => this.goBack());
        document.getElementById('focusCompleteBtn')?.addEventListener('click', () => this.completeStep());
        document.getElementById('focusWeightMinus')?.addEventListener('click', () => this.adjustWeight(-1));
        document.getElementById('focusWeightPlus')?.addEventListener('click', () => this.adjustWeight(1));
        document.getElementById('focusRepsMinus')?.addEventListener('click', () => this.adjustReps(-1));
        document.getElementById('focusRepsPlus')?.addEventListener('click', () => this.adjustReps(1));
        document.getElementById('focusRestToggleBtn')?.addEventListener('click', () => this.toggleRest());
        document.getElementById('focusLockScreenBtn')?.addEventListener('click', () => this.toggleLockScreen());

        const presetBox = document.getElementById('focusRestPresets');
        if (presetBox) {
            presetBox.innerHTML = REST_PRESETS.map(m => `<button type="button" class="focus-rest-preset-btn" data-minutes="${m}">${m}分</button>`).join('');
            presetBox.querySelectorAll('.focus-rest-preset-btn').forEach(btn => {
                btn.addEventListener('click', () => this.applyRestPreset(parseFloat(btn.dataset.minutes)));
            });
        }

        this.setupWeightTapToEdit();
        this.setupRestTapToEdit();
    }

    applyRestPreset(minutes) {
        const card = this.currentCardEl();
        if (!card) return;
        const exerciseId = card.dataset.exerciseId;
        const rt = this.app.restTimers[exerciseId];
        if (!rt) return;
        storage.updateExercise(this.dayIndex, exerciseId, { restMinutes: minutes });
        rt.setMinutes(minutes);
        this.updateRestDisplay();
    }

    setupWeightTapToEdit() {
        const el = document.getElementById('focusWeightValue');
        if (!el) return;
        el.setAttribute('contenteditable', 'true');
        el.setAttribute('inputmode', 'decimal');

        el.addEventListener('focus', () => selectElementText(el));
        el.addEventListener('input', () => sanitizeNumericContentEditable(el, true));
        el.addEventListener('blur', () => {
            const card = this.currentCardEl();
            const row = this.currentRow();
            if (!card || !row) return;

            const variant = card.querySelector('.exercise-variant.active') || card;
            const isPerSetWeight = !!variant.querySelector('.per-set-weight-checkbox')?.checked;
            const weightInput = isPerSetWeight ? row.querySelector('.set-weight-input') : variant.querySelector('.weight-input');
            const next = Math.max(0, parseFloat(el.textContent) || 0);

            weightInput.value = next;
            if (!isPerSetWeight) weightInput.dispatchEvent(new Event('change', { bubbles: true }));
            this.render();
        });
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                el.blur();
            }
        });
    }

    setupRestTapToEdit() {
        const el = document.getElementById('focusRestValue');
        if (!el) return;
        el.setAttribute('contenteditable', 'true');
        el.setAttribute('inputmode', 'decimal');

        let lastMinutes = 2;
        el.addEventListener('focus', () => {
            const card = this.currentCardEl();
            const rt = card ? this.app.restTimers[card.dataset.exerciseId] : null;
            if (!rt || rt.isRunning) {
                el.blur();
                return;
            }
            lastMinutes = rt.duration / 60;
            el.textContent = lastMinutes;
            selectElementText(el);
        });
        el.addEventListener('input', () => sanitizeNumericContentEditable(el, true));
        el.addEventListener('blur', () => {
            const card = this.currentCardEl();
            if (!card) return;

            const exerciseId = card.dataset.exerciseId;
            const rt = this.app.restTimers[exerciseId];
            if (!rt) return;

            const minutes = Math.max(0, Math.min(30, roundToHalf(parseFloat(el.textContent) || lastMinutes)));
            storage.updateExercise(this.dayIndex, exerciseId, { restMinutes: minutes });
            rt.setMinutes(minutes);
            this.updateRestDisplay();
        });
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                el.blur();
            }
        });
    }

    start(dayIndex) {
        this.dayIndex = dayIndex;
        this.exercises = storage.getExercisesForDay(dayIndex).map(ex => ({
            ...ex,
            choiceNames: [ex.name, ...(ex.alternatives || [])].filter(Boolean)
        }));
        this.exercises.forEach(ex => {
            const card = document.querySelector(`.exercise-record[data-exercise-id="${ex.id}"]`);
            const selected = card?.querySelector('.exercise-choice-btn.active')?.dataset.choice;
            if (selected) {
                ex.name = selected;
                card?.querySelectorAll('.exercise-variant').forEach(variant => variant.classList.toggle('active', variant.dataset.variantName === selected));
            }
        });
        this.steps = [];
        this.exercises.forEach((ex, ei) => {
            const setCount = Math.max(1, parseInt(ex.sets) || 1);
            for (let si = 0; si < setCount; si++) {
                this.steps.push({ ei, si, setCount });
            }
        });

        if (this.steps.length === 0) {
            alert('記録できる種目がありません');
            return;
        }

        this.stepIndex = Math.min(storage.getFocusProgress(dayIndex), Math.max(0, this.steps.length - 1));
        this.lockScreenActive = false;
        this.updateLockScreenButton();
        this.app.switchScreen('focusScreen');
        this.render();

        this.pollInterval = setInterval(() => {
            this.updateRestDisplay();
            this.updateTimerDisplay();
        }, 1000);
    }

    currentCardEl() {
        const step = this.steps[this.stepIndex];
        const ex = this.exercises[step.ei];
        return document.querySelector(`.exercise-record[data-exercise-id="${ex.id}"]`);
    }

    currentRow() {
        const step = this.steps[this.stepIndex];
        const card = this.currentCardEl();
        const variant = card?.querySelector('.exercise-variant.active') || card;
        const repsInput = variant?.querySelector(`.reps-input[data-set="${step.si}"]`);
        return repsInput ? repsInput.closest('.set-input-row') : null;
    }

    render() {
        const step = this.steps[this.stepIndex];
        const ex = this.exercises[step.ei];
        const card = this.currentCardEl();
        const row = this.currentRow();
        if (!card || !row) return;

        const variant = card.querySelector('.exercise-variant.active') || card;
        const isPerSetWeight = !!variant.querySelector('.per-set-weight-checkbox')?.checked;
        const repsInput = row.querySelector('.reps-input');
        const weightInput = isPerSetWeight ? row.querySelector('.set-weight-input') : variant.querySelector('.weight-input');

        const repsVal = repsInput.value !== '' ? repsInput.value : (repsInput.dataset.lastReps || repsInput.dataset.suggestedReps || '0');
        const weightVal = weightInput.value !== '' ? weightInput.value : (weightInput.dataset.lastWeight || '0');

        document.getElementById('focusExerciseName').textContent = ex.name || '種目';
        const choices = ex.choiceNames && ex.choiceNames.length ? ex.choiceNames : [ex.name, ...(ex.alternatives || [])].filter(Boolean);
        const hasChoice = choices.length > 1;
        const needsChoice = hasChoice && !this.selectedNames[ex.id];
        document.getElementById('focusScreen')?.classList.toggle('choosing', needsChoice);

        const selectChoice = (name) => {
            this.selectedNames[ex.id] = name;
            ex.name = name;
            const trainingCard = document.querySelector(`.exercise-record[data-exercise-id="${ex.id}"]`);
            trainingCard?.querySelectorAll('.exercise-choice-btn').forEach(item => item.classList.toggle('active', item.dataset.choice === ex.name));
            trainingCard?.querySelectorAll('.exercise-variant').forEach(item => item.classList.toggle('active', item.dataset.variantName === ex.name));
            this.render();
        };

        const splitBox = document.getElementById('focusChoiceSplitOptions');
        if (splitBox) {
            splitBox.innerHTML = needsChoice
                ? choices.map(name => `<button type="button" class="focus-choice-split-option" data-choice="${escapeAttr(name)}">${escapeAttr(name)}</button>`).join('')
                : '';
            splitBox.querySelectorAll('.focus-choice-split-option').forEach(btn => btn.addEventListener('click', () => selectChoice(btn.dataset.choice)));
        }

        const nameEl = document.getElementById('focusExerciseName');
        nameEl.classList.toggle('focus-exercise-name-changeable', hasChoice);
        nameEl.onclick = hasChoice ? () => { delete this.selectedNames[ex.id]; this.render(); } : null;

        const hintEl = document.getElementById('focusChoiceHint');
        if (hintEl) hintEl.textContent = hasChoice ? 'タップして種目を変更' : '';
        document.getElementById('focusSetLabel').textContent = `セット ${step.si + 1} / ${step.setCount}`;
        document.getElementById('focusWeightValue').textContent = weightVal;
        document.getElementById('focusRepsValue').textContent = repsVal;
        document.getElementById('focusProgress').textContent = `${this.stepIndex + 1} / ${this.steps.length}`;
        document.getElementById('focusPrevBtn').disabled = this.stepIndex === 0;
        document.getElementById('focusCompleteBtn').textContent =
            this.stepIndex === this.steps.length - 1 ? '完了して終了 ▶' : '次へ ▶';

        this.updateRestDisplay();
        this.updateTimerDisplay();
        // 種目名が長いとロック画面で残りセット数が見切れるため、数字だけを先頭に出す
        if (this.lockScreenActive) {
            lockScreenControl.updateMetadata({
                title: `${step.si + 1}/${step.setCount} ${ex.name || '種目'}`,
                artist: `${weightVal}kg × ${repsVal}回`,
                album: 'GymTracker'
            });
        }
    }

    toggleLockScreen() {
        if (this.lockScreenActive) {
            this.lockScreenActive = false;
            lockScreenControl.stop();
        } else {
            this.lockScreenActive = true;
            lockScreenControl.start({
                onRepsDown: () => this.adjustReps(-1),
                onRepsUp: () => this.adjustReps(1),
                onConfirm: () => this.completeStep(),
                onBack: () => this.goBack()
            });
            this.render();
        }
        this.updateLockScreenButton();
    }

    updateLockScreenButton() {
        const btn = document.getElementById('focusLockScreenBtn');
        if (btn) {
            btn.textContent = this.lockScreenActive ? '🔒 ロック画面操作: ON' : '🔓 ロック画面操作: OFF';
            btn.classList.toggle('active', this.lockScreenActive);
        }
        const hint = document.getElementById('focusHint');
        if (hint) {
            hint.textContent = this.lockScreenActive
                ? '💡 ロック画面の早戻し/早送りで回数±、再生ボタンで確定して次へ進めます'
                : '🎵 音楽を流したまま記録できます。ロック画面から操作したい場合はONに（他アプリの音楽は停止します）';
        }
    }

    isChoosing() {
        return !!document.getElementById('focusScreen')?.classList.contains('choosing');
    }

    adjustWeight(direction) {
        if (this.isChoosing()) return;
        const card = this.currentCardEl();
        if (!card) return;
        const variant = card.querySelector('.exercise-variant.active') || card;
        const isPerSetWeight = !!variant.querySelector('.per-set-weight-checkbox')?.checked;
        if (isPerSetWeight && !this.currentRow()) return;
        const btns = isPerSetWeight
            ? this.currentRow().querySelectorAll('.btn-weight-step-set')
            : variant.querySelectorAll('.btn-weight-step');
        const btn = direction < 0 ? btns[0] : btns[1];
        btn?.click();
        this.render();
    }

    adjustReps(direction) {
        if (this.isChoosing()) return;
        const row = this.currentRow();
        if (!row) return;
        const btns = row.querySelectorAll('.btn-reps-step');
        const btn = direction < 0 ? btns[0] : btns[1];
        btn?.click();
        this.render();
    }

    completeStep() {
        if (this.isChoosing()) return;
        const step = this.steps[this.stepIndex];
        const card = this.currentCardEl();
        const row = this.currentRow();
        if (!card || !row) return;

        const variant = card.querySelector('.exercise-variant.active') || card;
        const isPerSetWeight = !!variant.querySelector('.per-set-weight-checkbox')?.checked;
        const repsInput = row.querySelector('.reps-input');
        const weightInput = isPerSetWeight ? row.querySelector('.set-weight-input') : variant.querySelector('.weight-input');

        // 未入力のまま完了した場合は、前回値（無ければ目標回数レンジの下限）を今回の記録として確定させる
        if (repsInput.value === '' && (repsInput.dataset.lastReps || repsInput.dataset.suggestedReps)) {
            repsInput.value = repsInput.dataset.lastReps || repsInput.dataset.suggestedReps;
            repsInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (isPerSetWeight && weightInput.value === '' && weightInput.dataset.lastWeight) {
            weightInput.value = weightInput.dataset.lastWeight;
        }

        const exerciseId = card.dataset.exerciseId;

        if (this.stepIndex + 1 < this.steps.length) {
            // 次のステップが同じ種目の残りセットの場合だけ、その種目のレストタイマーを開始する。
            // 別の種目に移る場合はもう休む必要がないので、今の種目のタイマーも含めて全て止める。
            const nextStep = this.steps[this.stepIndex + 1];
            const staysOnSameExercise = nextStep.ei === step.ei;
            Object.entries(this.app.restTimers).forEach(([id, restTimer]) => {
                if (id !== exerciseId || !staysOnSameExercise) restTimer.stop();
            });
            if (staysOnSameExercise) this.app.restTimers[exerciseId]?.start();
            this.stepIndex++;
            storage.setFocusProgress(this.dayIndex, this.stepIndex);
            this.render();
        } else {
            this.finish();
        }
    }

    goBack() {
        if (this.stepIndex === 0) return;
        this.stepIndex--;
        storage.setFocusProgress(this.dayIndex, this.stepIndex);
        this.render();
    }

    toggleRest() {
        const card = this.currentCardEl();
        if (!card) return;
        this.app.restTimers[card.dataset.exerciseId]?.toggle();
    }

    updateTimerDisplay() {
        const el = document.getElementById('focusTimerValue');
        if (el) el.textContent = formatTime(timer.remaining);
    }

    updateRestDisplay() {
        const card = this.currentCardEl();
        if (!card) return;

        const countdownEl = card.querySelector('.rest-countdown');
        const rt = this.app.restTimers[card.dataset.exerciseId];
        const displayEl = document.getElementById('focusRestValue');
        const toggleBtn = document.getElementById('focusRestToggleBtn');
        const restRow = document.getElementById('focusRestRow');

        if (displayEl && countdownEl && document.activeElement !== displayEl) {
            displayEl.textContent = countdownEl.textContent;
        }
        if (toggleBtn) toggleBtn.textContent = rt?.isRunning ? '一時停止' : 'レスト開始';
        if (restRow) restRow.classList.toggle('rest-done', !!rt && !rt.isRunning && rt.remaining === 0);

        document.querySelectorAll('#focusRestPresets .focus-rest-preset-btn').forEach(btn => {
            btn.classList.toggle('active', !!rt && parseFloat(btn.dataset.minutes) * 60 === rt.duration);
        });
    }

    exit() {
        storage.setFocusProgress(this.dayIndex, this.stepIndex);
        this.lockScreenActive = false;
        lockScreenControl.stop();
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        this.app.switchScreen('trainingScreen');
    }

    finish() {
        storage.clearFocusProgress(this.dayIndex);
        this.lockScreenActive = false;
        lockScreenControl.stop();
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        this.app.finishTraining();
    }
}
