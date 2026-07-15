const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const DAY_LABELS_FULL = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

class History {
    constructor() {
        this.selectedDay = new Date().getDay();
    }

    render(dayIndex) {
        if (dayIndex !== undefined) this.selectedDay = dayIndex;

        this.renderTabs();
        this.renderTrends();
        this.renderSessions();
        this.renderVolumeStats();
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

    renderSessions() {
        const container = document.getElementById('historySessions');
        if (!container) return;

        const sessions = storage.getSessionsForDay(this.selectedDay);

        if (sessions.length === 0) {
            container.innerHTML = `<p class="placeholder">${DAY_LABELS_FULL[this.selectedDay]}の記録はまだありません</p>`;
            return;
        }

        container.innerHTML = sessions.map(session => {
            const dateLabel = this.formatDate(session.date);
            const exerciseRows = Object.keys(session.exercises).map(name => {
                const data = session.exercises[name];

                if (data.perSetWeight) {
                    const validSets = (data.sets || []).filter(s => s && (s.weight !== '' || s.reps !== ''));
                    return validSets.map((s, idx) => `
                        <div class="history-exercise-row">
                            <span class="history-exercise-name">${idx === 0 ? name : ''}</span>
                            <span class="history-exercise-weight">${s.weight || '-'}kg</span>
                            <span class="history-exercise-reps">${s.reps || '-'}回</span>
                        </div>
                    `).join('');
                }

                const reps = (data.sets || []).filter(r => r !== undefined && r !== '').join(', ');
                return `
                    <div class="history-exercise-row">
                        <span class="history-exercise-name">${name}</span>
                        <span class="history-exercise-weight">${data.weight || '-'}kg</span>
                        <span class="history-exercise-reps">${reps || '-'}</span>
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

    // 選択中の曜日について、種目ごとの重量推移グラフを描画する
    renderTrends() {
        const container = document.getElementById('historyTrends');
        if (!container) return;

        const sessions = storage.getSessionsForDay(this.selectedDay).slice().sort((a, b) => new Date(a.date) - new Date(b.date));

        if (sessions.length === 0) {
            container.innerHTML = '';
            return;
        }

        const byExercise = {};
        sessions.forEach(session => {
            Object.keys(session.exercises).forEach(name => {
                const weight = extractDisplayWeight(session.exercises[name]);
                if (!byExercise[name]) byExercise[name] = [];
                byExercise[name].push({ x: this.formatDate(session.date), y: weight });
            });
        });

        container.innerHTML = Object.keys(byExercise).map(name => `
            <div class="trend-card">
                <div class="trend-title">${name}</div>
                ${buildLineChartSVG(byExercise[name])}
            </div>
        `).join('');
    }

    // 週ごと・月ごとの総ボリューム（全曜日合算）を棒グラフで描画する
    renderVolumeStats() {
        const container = document.getElementById('historyVolumeStats');
        if (!container) return;

        const records = storage.getRecords();
        const weekly = {};
        const monthly = {};

        for (const dateStr in records) {
            for (const dayIdx in records[dateStr]) {
                const volume = calculateSessionVolume(records[dateStr][dayIdx]);
                if (volume <= 0) continue;

                const d = new Date(dateStr);

                const weekStart = new Date(d);
                const diffToMonday = (weekStart.getDay() + 6) % 7;
                weekStart.setDate(weekStart.getDate() - diffToMonday);
                const wKey = weekStart.toISOString().split('T')[0];
                if (!weekly[wKey]) {
                    weekly[wKey] = { label: `${weekStart.getMonth() + 1}/${weekStart.getDate()}`, value: 0, sortDate: weekStart };
                }
                weekly[wKey].value += volume;

                const mKey = `${d.getFullYear()}-${d.getMonth() + 1}`;
                if (!monthly[mKey]) {
                    monthly[mKey] = { label: `${d.getFullYear()}/${d.getMonth() + 1}`, value: 0, sortDate: new Date(d.getFullYear(), d.getMonth(), 1) };
                }
                monthly[mKey].value += volume;
            }
        }

        const weeklyArr = Object.values(weekly).sort((a, b) => a.sortDate - b.sortDate).slice(-8);
        const monthlyArr = Object.values(monthly).sort((a, b) => a.sortDate - b.sortDate).slice(-6);

        if (weeklyArr.length === 0) {
            container.innerHTML = '';
            return;
        }

        const lifetimeVolume = getTotalLifetimeVolume();
        const fun = getFunVolumeComparison(lifetimeVolume);

        container.innerHTML = `
            <div class="volume-stat-block">
                <div class="trend-title">自己記録開始から総重量: ${lifetimeVolume}kg（${fun.unit}${fun.count}${fun.counter}分）</div>
            </div>
            <div class="volume-stat-block">
                <div class="trend-title">週ごとの総ボリューム</div>
                ${buildBarChartSVG(weeklyArr)}
            </div>
            <div class="volume-stat-block">
                <div class="trend-title">月ごとの総ボリューム</div>
                ${buildBarChartSVG(monthlyArr)}
            </div>
        `;
    }

    formatDate(dateStr) {
        const date = new Date(dateStr);
        const y = date.getFullYear();
        const m = date.getMonth() + 1;
        const d = date.getDate();
        return `${y}/${m}/${d}`;
    }
}

const history = new History();
