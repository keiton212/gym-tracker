// 集中モード：今の種目・今のセットだけを大きく表示し、1タップ（またはロック画面操作）で
// 次のセット/種目へ自動で進める。実際の値の読み書きは通常のトレーニング画面のフォーム要素
// （storage連携・重量ステップ計算などをすでに持つ）に対してクリックを委譲することで二重実装を避ける。
class FocusMode {
    constructor(app) {
        this.app = app;
        this.exercises = [];
        this.steps = [];
        this.stepIndex = 0;
        this.pollInterval = null;
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
    }

    start(dayIndex) {
        this.exercises = storage.getExercisesForDay(dayIndex);
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

        this.stepIndex = 0;
        this.app.switchScreen('focusScreen');
        this.render();

        lockScreenControl.start({
            onRepsDown: () => this.adjustReps(-1),
            onRepsUp: () => this.adjustReps(1),
            onConfirm: () => this.completeStep(),
            onBack: () => this.goBack()
        });
        this.pollInterval = setInterval(() => this.updateRestDisplay(), 1000);
    }

    currentCardEl() {
        const step = this.steps[this.stepIndex];
        const ex = this.exercises[step.ei];
        return document.querySelector(`.exercise-record[data-exercise-id="${ex.id}"]`);
    }

    currentRow() {
        const step = this.steps[this.stepIndex];
        const card = this.currentCardEl();
        const repsInput = card?.querySelector(`.reps-input[data-set="${step.si}"]`);
        return repsInput ? repsInput.closest('.set-input-row') : null;
    }

    render() {
        const step = this.steps[this.stepIndex];
        const ex = this.exercises[step.ei];
        const card = this.currentCardEl();
        const row = this.currentRow();
        if (!card || !row) return;

        const isPerSetWeight = !!card.querySelector('.per-set-weight-checkbox')?.checked;
        const repsInput = row.querySelector('.reps-input');
        const weightInput = isPerSetWeight ? row.querySelector('.set-weight-input') : card.querySelector('.weight-input');

        const repsVal = repsInput.value !== '' ? repsInput.value : (repsInput.dataset.lastReps || repsInput.dataset.suggestedReps || '0');
        const weightVal = weightInput.value !== '' ? weightInput.value : (weightInput.dataset.lastWeight || '0');

        document.getElementById('focusExerciseName').textContent = ex.name || '種目';
        document.getElementById('focusSetLabel').textContent = `セット ${step.si + 1} / ${step.setCount}`;
        document.getElementById('focusWeightValue').textContent = weightVal;
        document.getElementById('focusRepsValue').textContent = repsVal;
        document.getElementById('focusProgress').textContent = `${this.stepIndex + 1} / ${this.steps.length}`;
        document.getElementById('focusPrevBtn').disabled = this.stepIndex === 0;
        document.getElementById('focusCompleteBtn').textContent =
            this.stepIndex === this.steps.length - 1 ? '完了して終了 ▶' : '完了 ▶';

        this.updateRestDisplay();
        // 種目名が長いとロック画面で残りセット数が見切れるため、数字だけを先頭に出す
        lockScreenControl.updateMetadata({
            title: `${step.si + 1}/${step.setCount} ${ex.name || '種目'}`,
            artist: `${weightVal}kg × ${repsVal}回`,
            album: 'GymTracker'
        });
    }

    adjustWeight(direction) {
        const card = this.currentCardEl();
        if (!card) return;
        const isPerSetWeight = !!card.querySelector('.per-set-weight-checkbox')?.checked;
        if (isPerSetWeight && !this.currentRow()) return;
        const btns = isPerSetWeight
            ? this.currentRow().querySelectorAll('.btn-weight-step-set')
            : card.querySelectorAll('.btn-weight-step');
        const btn = direction < 0 ? btns[0] : btns[1];
        btn?.click();
        this.render();
    }

    adjustReps(direction) {
        const row = this.currentRow();
        if (!row) return;
        const btns = row.querySelectorAll('.btn-reps-step');
        const btn = direction < 0 ? btns[0] : btns[1];
        btn?.click();
        this.render();
    }

    completeStep() {
        const step = this.steps[this.stepIndex];
        const card = this.currentCardEl();
        const row = this.currentRow();
        if (!card || !row) return;

        const isPerSetWeight = !!card.querySelector('.per-set-weight-checkbox')?.checked;
        const repsInput = row.querySelector('.reps-input');
        const weightInput = isPerSetWeight ? row.querySelector('.set-weight-input') : card.querySelector('.weight-input');

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
            this.app.restTimers[exerciseId]?.start();
            this.stepIndex++;
            this.render();
        } else {
            this.finish();
        }
    }

    goBack() {
        if (this.stepIndex === 0) return;
        this.stepIndex--;
        this.render();
    }

    toggleRest() {
        const card = this.currentCardEl();
        if (!card) return;
        this.app.restTimers[card.dataset.exerciseId]?.toggle();
    }

    updateRestDisplay() {
        const card = this.currentCardEl();
        if (!card) return;

        const countdownEl = card.querySelector('.rest-countdown');
        const rt = this.app.restTimers[card.dataset.exerciseId];
        const displayEl = document.getElementById('focusRestValue');
        const toggleBtn = document.getElementById('focusRestToggleBtn');
        const restRow = document.getElementById('focusRestRow');

        if (displayEl && countdownEl) displayEl.textContent = countdownEl.textContent;
        if (toggleBtn) toggleBtn.textContent = rt?.isRunning ? '一時停止' : 'レスト開始';
        if (restRow) restRow.classList.toggle('rest-done', !!rt && !rt.isRunning && rt.remaining === 0);
    }

    exit() {
        lockScreenControl.stop();
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        this.app.switchScreen('trainingScreen');
    }

    finish() {
        lockScreenControl.stop();
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        this.app.finishTraining();
    }
}
