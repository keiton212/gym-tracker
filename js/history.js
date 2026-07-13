const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const DAY_LABELS_FULL = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

class History {
    constructor() {
        this.selectedDay = new Date().getDay();
    }

    render(dayIndex) {
        if (dayIndex !== undefined) this.selectedDay = dayIndex;

        this.renderTabs();
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
                    <div class="history-session-date">${dateLabel}</div>
                    ${exerciseRows}
                </div>
            `;
        }).join('');
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
