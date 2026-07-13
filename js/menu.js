function buildMenuEditCardHTML(exercise, isFirst, isLast) {
    return `
        <div class="exercise-record menu-edit-card" data-exercise-id="${exercise.id}">
            <div class="exercise-record-header">
                <div class="reorder-buttons">
                    <button class="btn-reorder btn-reorder-up" aria-label="上に移動" ${isFirst ? 'disabled' : ''}>▲</button>
                    <button class="btn-reorder btn-reorder-down" aria-label="下に移動" ${isLast ? 'disabled' : ''}>▼</button>
                </div>
                <input type="text" class="exercise-name-input" value="${escapeAttr(exercise.name)}" placeholder="種目名">
                <button class="btn-delete-exercise" aria-label="削除">🗑</button>
            </div>
            <div class="rest-timer-row">
                <label>レスト</label>
                <span class="rest-countdown" role="button" tabindex="0">${exercise.restMinutes ?? 2}分</span>
            </div>
            <div class="exercise-record-info">
                ${exercise.perSetWeight ? '' : `
                <div>重量:
                    <button type="button" class="btn-weight-step" data-delta="-2.5" aria-label="重量を減らす">−</button>
                    <input type="number" class="weight-input" value="${escapeAttr(exercise.weight)}" min="0" inputmode="decimal">
                    <button type="button" class="btn-weight-step" data-delta="2.5" aria-label="重量を増やす">＋</button>
                kg</div>`}
                <div>セット数: <input type="number" class="sets-input" value="${escapeAttr(exercise.sets)}" min="1" max="10" inputmode="numeric"></div>
            </div>
            <label class="per-set-weight-toggle">
                <input type="checkbox" class="per-set-weight-checkbox" ${exercise.perSetWeight ? 'checked' : ''}> セットごとに重量を変える
            </label>
        </div>
    `;
}

class MenuEditor {
    constructor() {
        this.selectedDay = new Date().getDay();
    }

    render(dayIndex) {
        if (dayIndex !== undefined) this.selectedDay = dayIndex;
        this.renderTabs();
        this.renderExercises();
    }

    renderTabs() {
        const container = document.getElementById('menuTabs');
        if (!container) return;

        container.innerHTML = DAY_LABELS.map((label, idx) => `
            <button class="tab-btn ${idx === this.selectedDay ? 'active' : ''}" data-day="${idx}">${label}</button>
        `).join('');

        container.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.render(parseInt(btn.dataset.day)));
        });
    }

    renderExercises() {
        const dayIndex = this.selectedDay;
        const menu = storage.getMenu();
        const dayMenu = menu[dayIndex] || { status: '', exercises: [] };

        const label = document.getElementById('menuDayLabel');
        if (label) {
            label.textContent = dayMenu.status ? `${DAY_LABELS_FULL[dayIndex]} - ${dayMenu.status}` : DAY_LABELS_FULL[dayIndex];
        }

        const exercises = dayMenu.exercises || [];
        const container = document.getElementById('menuExerciseList');
        if (!container) return;

        if (exercises.length === 0) {
            container.innerHTML = `<p class="placeholder">まだ種目がありません。「＋種目を追加」から追加してください</p>`;
            return;
        }

        container.innerHTML = exercises
            .map((ex, idx) => buildMenuEditCardHTML(ex, idx === 0, idx === exercises.length - 1))
            .join('');

        container.querySelectorAll('.menu-edit-card').forEach(cardEl => {
            this.attachCardListeners(dayIndex, cardEl);
        });
    }

    attachCardListeners(dayIndex, cardEl) {
        const exerciseId = cardEl.dataset.exerciseId;
        const nameInput = cardEl.querySelector('.exercise-name-input');

        nameInput.addEventListener('change', (e) => {
            storage.updateExercise(dayIndex, exerciseId, { name: e.target.value.trim() });
        });

        const weightInput = cardEl.querySelector('.weight-input');
        if (weightInput) {
            weightInput.addEventListener('change', (e) => {
                storage.updateExercise(dayIndex, exerciseId, { weight: e.target.value });
            });

            cardEl.querySelectorAll('.btn-weight-step').forEach(btn => {
                btn.addEventListener('click', () => {
                    const delta = parseFloat(btn.dataset.delta);
                    const current = parseFloat(weightInput.value) || 0;
                    const next = Math.max(0, Math.round((current + delta) * 10) / 10);
                    weightInput.value = next;
                    storage.updateExercise(dayIndex, exerciseId, { weight: String(next) });
                });
            });
        }

        cardEl.querySelector('.sets-input').addEventListener('change', (e) => {
            const count = Math.max(1, Math.min(10, parseInt(e.target.value) || 1));
            e.target.value = count;
            storage.updateExercise(dayIndex, exerciseId, { sets: String(count) });
        });

        const restEl = cardEl.querySelector('.rest-countdown');
        restEl.addEventListener('click', () => {
            const exercise = storage.getExercisesForDay(dayIndex).find(e => e.id === exerciseId);
            const currentMinutes = exercise?.restMinutes ?? 2;

            const input = document.createElement('input');
            input.type = 'number';
            input.step = '0.5';
            input.min = '0';
            input.max = '30';
            input.inputMode = 'decimal';
            input.className = 'inline-time-edit inline-time-edit-small';
            input.value = currentMinutes;
            restEl.replaceWith(input);
            input.focus();
            input.select();

            const commit = () => {
                const minutes = Math.max(0, Math.min(30, roundToHalf(parseFloat(input.value) || 0)));
                input.replaceWith(restEl);
                restEl.textContent = `${minutes}分`;
                storage.updateExercise(dayIndex, exerciseId, { restMinutes: minutes });
            };
            input.addEventListener('blur', commit);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') input.blur();
            });
        });

        cardEl.querySelector('.per-set-weight-checkbox').addEventListener('change', (e) => {
            storage.updateExercise(dayIndex, exerciseId, { perSetWeight: e.target.checked });
            this.renderExercises();
        });

        cardEl.querySelector('.btn-reorder-up').addEventListener('click', () => {
            storage.reorderExercise(dayIndex, exerciseId, -1);
            this.renderExercises();
        });

        cardEl.querySelector('.btn-reorder-down').addEventListener('click', () => {
            storage.reorderExercise(dayIndex, exerciseId, 1);
            this.renderExercises();
        });

        cardEl.querySelector('.btn-delete-exercise').addEventListener('click', () => {
            const name = nameInput.value || 'この種目';
            if (!confirm(`${name}を削除しますか？`)) return;
            storage.deleteExercise(dayIndex, exerciseId);
            this.renderExercises();
        });
    }

    addExercise() {
        const dayIndex = this.selectedDay;
        storage.addExerciseToDay(dayIndex, {});
        this.renderExercises();

        const cards = document.querySelectorAll('.menu-edit-card');
        const last = cards[cards.length - 1];
        if (!last) return;
        last.querySelector('.exercise-name-input')?.focus();
        last.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

const menuEditor = new MenuEditor();
