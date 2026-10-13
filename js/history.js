const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const DAY_LABELS_FULL = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

class History {
    constructor() {
        this.selectedDay = new Date().getDay();
        this.exerciseNames = [];
        this.editingName = null;
    }

    render(dayIndex) {
        if (dayIndex !== undefined && dayIndex !== this.selectedDay) {
            this.selectedDay = dayIndex;
            this.editingName = null;
        }

        this.renderTabs();
        this.renderLifetime();
        this.renderExerciseTables();
        this.renderSessions();
    }

    renderTabs() {
        const tabsContainer = document.getElementById('historyTabs');
        if (!tabsContainer) return;

        tabsContainer.innerHTML = DAY_LABELS.map((label, idx) => `
            <button class="tab-btn ${idx === this.selectedDay ? 'active' : ''}" data-day="${idx}">${label}</button>
        `).join('');

        tabsContainer.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.render(parseInt(btn.dataset.day));
            });
        });
    }

    renderLifetime() {
        const el = document.getElementById('historyLifetime');
        if (!el) return;
        const lifetimeVolume = getTotalLifetimeVolume();
        if (!lifetimeVolume) {
            el.textContent = '';
            return;
        }
        const fun = getFunVolumeComparison(lifetimeVolume);
        el.textContent = `記録開始からの総重量 ${lifetimeVolume.toLocaleString()}kg（${fun.unit}${fun.count}${fun.counter}分）`;
    }

    // 選択中の曜日のメニュー順に、記録のある種目を並べる（代替種目も含む）
    collectExerciseNames() {
        const names = [];
        const add = (name) => {
            if (name && !names.includes(name)) names.push(name);
        };
        storage.getExercisesForDay(this.selectedDay).forEach(ex => {
            add(ex.name);
            (ex.alternatives || []).forEach(add);
        });
        storage.getSessionsForDay(this.selectedDay).forEach(session => Object.keys(session.exercises || {}).forEach(add));

        const bests = storage.getPersonalBests();
        const day = this.selectedDay;
        return names.filter(name => bests[personalBestKey(name, day)]
            || storage.getExerciseHistory(name, null, historyDayFilter(name, day)).length > 0);
    }

    // 種目ごとに「横＝日付（新しい順）、縦＝セット」の表で数字を並べ、伸びがひと目で分かるようにする。
    // 一番左は最高記録（重量優先）で、✏️ から手動で修正できる。
    renderExerciseTables() {
        const container = document.getElementById('historyTables');
        if (!container) return;

        this.exerciseNames = this.collectExerciseNames();
        if (this.exerciseNames.length === 0) {
            container.innerHTML = `<p class="placeholder">${DAY_LABELS_FULL[this.selectedDay]}の記録はまだありません</p>`;
            return;
        }

        container.innerHTML = this.exerciseNames.map((name, idx) => this.buildExerciseTableHTML(name, idx)).join('');

        container.querySelectorAll('.btn-edit-best').forEach(btn => {
            btn.addEventListener('click', () => {
                const name = this.exerciseNames[parseInt(btn.dataset.idx, 10)];
                this.editingName = this.editingName === name ? null : name;
                this.renderExerciseTables();
            });
        });
        container.querySelectorAll('.best-editor').forEach(editor => this.attachBestEditorListeners(editor));
    }

    buildExerciseTableHTML(name, idx) {
        // 曜日ごとに分ける種目はこの曜日の記録だけ、共通種目（サイドレイズ・腕）は全曜日の記録を並べる
        const day = this.selectedDay;
        const shared = isSharedAcrossDays(name);
        const history = storage.getExerciseHistory(name, null, historyDayFilter(name, day)).slice(0, 40);
        const best = storage.getBestSetPairs(name, null, day) || [];
        const sessions = history.map(h => ({ date: h.date, pairs: recordSetPairs(h.data) }));
        const setCount = Math.max(best.length, ...sessions.map(s => s.pairs.length), 1);

        const headerCells = sessions.map(s => `<th>${this.formatShortDate(s.date)}</th>`).join('');
        const rows = Array.from({ length: setCount }, (_, i) => {
            const bestPair = best[i];
            const bestCell = bestPair
                ? `<td class="cell-best">${this.formatPairCell(bestPair)}</td>`
                : '<td class="cell-best cell-empty">-</td>';
            const cells = sessions.map((s, si) => {
                const pair = s.pairs[i];
                if (!pair || pair.reps == null) return '<td class="cell-empty">-</td>';
                const older = sessions.slice(si + 1).find(o => o.pairs[i]?.reps != null)?.pairs[i];
                const classes = [];
                if (older && isBetterSet(pair, older)) classes.push('cell-up');
                else if (older && isBetterSet(older, pair)) classes.push('cell-down');
                if (bestPair && pair.reps === bestPair.reps && (pair.weight ?? null) === (bestPair.weight ?? null)) classes.push('cell-is-best');
                return `<td class="${classes.join(' ')}">${this.formatPairCell(pair)}</td>`;
            }).join('');
            return `<tr><th class="col-set">${i + 1}</th>${bestCell}${cells}</tr>`;
        }).join('');

        const isEditing = this.editingName === name;
        return `
            <div class="history-exercise-card">
                <div class="history-exercise-head">
                    <span class="history-exercise-title">${escapeAttr(name)}<small class="history-scope">${shared ? '全曜日共通' : `${DAY_LABELS[day]}曜のみ`}</small></span>
                    <button type="button" class="btn-edit-best" data-idx="${idx}">${isEditing ? '閉じる' : '✏️ 最高記録を修正'}</button>
                </div>
                ${isEditing ? this.buildBestEditorHTML(name, idx, best, setCount, history[0]?.date) : ''}
                <div class="history-table-scroll">
                    <table class="history-table">
                        <thead><tr><th class="col-set">セット</th><th class="cell-best">最高</th>${headerCells}</tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;
    }

    buildBestEditorHTML(name, idx, best, setCount, latestDate) {
        const count = Math.max(setCount, 1);
        const rows = Array.from({ length: count }, (_, i) => this.buildBestEditorRowHTML(i, best[i])).join('');
        return `
            <div class="best-editor" data-idx="${idx}" data-latest-date="${latestDate || ''}">
                <p class="best-editor-help">各セットの最高記録を直接入力できます。保存した後の記録は、この値と比較して（重量優先で）更新されます。</p>
                <div class="best-editor-rows">${rows}</div>
                <div class="best-editor-actions">
                    <button type="button" class="btn-secondary btn-best-add-set">＋セット</button>
                    <button type="button" class="btn-secondary btn-best-reset">直近の記録にする</button>
                    <button type="button" class="btn-primary btn-best-save">保存</button>
                </div>
            </div>
        `;
    }

    buildBestEditorRowHTML(i, pair) {
        return `
            <div class="best-editor-row">
                <span class="best-editor-label">セット${i + 1}</span>
                <input type="number" class="best-weight" inputmode="decimal" min="0" placeholder="kg" value="${pair?.weight ?? ''}">
                <span>kg</span>
                <input type="number" class="best-reps" inputmode="numeric" min="0" placeholder="回" value="${pair?.reps ?? ''}">
                <span>回</span>
            </div>
        `;
    }

    attachBestEditorListeners(editor) {
        const name = this.exerciseNames[parseInt(editor.dataset.idx, 10)];
        const latestDate = editor.dataset.latestDate || toLocalDateStr();

        editor.querySelector('.btn-best-add-set')?.addEventListener('click', () => {
            const rowsEl = editor.querySelector('.best-editor-rows');
            rowsEl.insertAdjacentHTML('beforeend', this.buildBestEditorRowHTML(rowsEl.children.length, null));
        });

        editor.querySelector('.btn-best-reset')?.addEventListener('click', () => {
            const last = storage.getExerciseHistory(name, null, historyDayFilter(name, this.selectedDay))[0];
            if (!last) {
                alert('この種目の記録がありません');
                return;
            }
            if (!confirm(`${name}の最高記録を、直近（${this.formatDate(last.date)}）の記録に置き換えますか？`)) return;
            storage.setPersonalBestBase(name, recordSetPairs(last.data), last.date, this.selectedDay);
            this.editingName = null;
            this.renderExerciseTables();
        });

        editor.querySelector('.btn-best-save')?.addEventListener('click', () => {
            const sets = [...editor.querySelectorAll('.best-editor-row')].map(row => ({
                weight: row.querySelector('.best-weight').value,
                reps: row.querySelector('.best-reps').value
            }));
            // 今ある記録はこの値で上書きし、これより後の記録から比較・更新する
            storage.setPersonalBestBase(name, sets, latestDate, this.selectedDay);
            this.editingName = null;
            this.renderExerciseTables();
        });
    }

    formatPairCell(pair) {
        if (pair.weight == null) return `<span class="cell-reps-only">${pair.reps}回</span>`;
        return `<span class="cell-weight">${pair.weight}<small>kg</small></span><span class="cell-reps">${pair.reps}回</span>`;
    }

    renderSessions() {
        const container = document.getElementById('historySessions');
        if (!container) return;

        const sessions = storage.getSessionsForDay(this.selectedDay);

        if (sessions.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = sessions.map(session => {
            const dateLabel = this.formatDate(session.date);
            const exerciseRows = Object.keys(session.exercises).map(name => {
                const data = session.exercises[name];
                const summary = recordSetPairs(data).filter(p => p.reps != null).map(formatSetPair).join(' / ');
                return `
                    <div class="history-exercise-row">
                        <span class="history-exercise-name">${escapeAttr(name)}</span>
                        <span class="history-exercise-reps">${escapeAttr(summary) || '-'}</span>
                    </div>
                `;
            }).join('');

            return `
                <div class="history-session-card">
                    <div class="history-session-date">
                        <span>${dateLabel}</span>
                        <button type="button" class="btn-delete-session" data-date="${session.date}" aria-label="この記録を削除">🗑</button>
                    </div>
                    ${exerciseRows}
                </div>
            `;
        }).join('');

        container.querySelectorAll('.btn-delete-session').forEach(btn => {
            btn.addEventListener('click', () => {
                const dateStr = btn.dataset.date;
                if (!confirm(`${this.formatDate(dateStr)}の記録を削除しますか？`)) return;
                storage.deleteRecordForDate(dateStr, this.selectedDay);
                this.render(this.selectedDay);
            });
        });
    }

    formatShortDate(dateStr) {
        const [y, m, d] = dateStr.split('-').map(Number);
        const prefix = y !== new Date().getFullYear() ? `${String(y).slice(2)}/` : '';
        return `${prefix}${m}/${d}`;
    }

    formatDate(dateStr) {
        const [y, m, d] = dateStr.split('-').map(Number);
        return `${y}/${m}/${d}`;
    }
}

const history = new History();
