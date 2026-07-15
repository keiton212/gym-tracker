function escapeAttr(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function roundToHalf(value) {
    return Math.round(value * 2) / 2;
}

// 過去記録が無い種目の回数初期値として使う、目標回数レンジ（例:"5-8"）の下限値
function parseRepsRangeLower(repsRange) {
    const match = String(repsRange ?? '').match(/\d+/);
    return match ? parseInt(match[0]) : null;
}

function selectElementText(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

function placeCaretAtEnd(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

// contenteditable な要素の中身を数字（＋任意で小数点）だけに制限する
function sanitizeNumericContentEditable(el, allowDecimal) {
    const text = el.textContent;
    let sanitized = allowDecimal ? text.replace(/[^0-9.]/g, '') : text.replace(/[^0-9]/g, '');

    if (allowDecimal) {
        const firstDot = sanitized.indexOf('.');
        if (firstDot !== -1) {
            sanitized = sanitized.slice(0, firstDot + 1) + sanitized.slice(firstDot + 1).replace(/\./g, '');
        }
    }

    if (sanitized !== text) {
        el.textContent = sanitized;
        placeCaretAtEnd(el);
    }
    return sanitized;
}

// 1セッション分の記録から総ボリューム（重量×回数の合計）を計算する
function calculateSessionVolume(exercises) {
    let totalVolume = 0;
    Object.values(exercises || {}).forEach(rec => {
        if (rec.perSetWeight) {
            (rec.sets || []).forEach(s => {
                const w = parseFloat(s?.weight) || 0;
                const r = parseFloat(s?.reps) || 0;
                totalVolume += w * r;
            });
        } else {
            const w = parseFloat(rec.weight) || 0;
            (rec.sets || []).forEach(s => {
                const r = parseFloat(s) || 0;
                totalVolume += w * r;
            });
        }
    });
    return Math.round(totalVolume);
}

// 1種目分の記録から、その日のグラフ用の代表重量を取り出す（セットごと重量の場合は最大値）
function extractDisplayWeight(data) {
    if (data.perSetWeight) {
        const weights = (data.sets || [])
            .map(s => parseFloat(s?.weight))
            .filter(w => !isNaN(w));
        return weights.length ? Math.max(...weights) : null;
    }
    const w = parseFloat(data.weight);
    return isNaN(w) ? null : w;
}

// シンプルな折れ線グラフ（重量推移など）をSVGとして生成する
function buildLineChartSVG(points) {
    const width = 300;
    const height = 70;
    const padding = 10;

    const valid = points.filter(p => p.y !== null && p.y !== undefined && !isNaN(p.y));
    if (valid.length === 0) return '<p class="chart-empty">データなし</p>';

    const values = valid.map(p => p.y);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const stepX = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;

    const coords = points.map((p, i) => {
        const x = padding + stepX * i;
        const y = (p.y === null || p.y === undefined || isNaN(p.y))
            ? null
            : height - padding - ((p.y - min) / range) * (height - padding * 2);
        return { x, y, value: p.y };
    }).filter(c => c.y !== null);

    const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const dots = coords.map(c => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3" fill="#667eea"></circle>`).join('');

    const first = points[0];
    const last = points[points.length - 1];

    return `
        <svg viewBox="0 0 ${width} ${height}" class="trend-chart" preserveAspectRatio="none">
            <path d="${pathD}" fill="none" stroke="#667eea" stroke-width="2"></path>
            ${dots}
        </svg>
        <div class="chart-range-labels">
            <span>${escapeAttr(first.x)}: ${first.y ?? '-'}kg</span>
            <span>${escapeAttr(last.x)}: ${last.y ?? '-'}kg</span>
        </div>
    `;
}

// シンプルな棒グラフ（週/月ボリュームなど）をSVGとして生成する
function buildBarChartSVG(bars) {
    if (bars.length === 0) return '<p class="chart-empty">データなし</p>';

    const width = 300;
    const height = 90;
    const padding = 6;
    const labelHeight = 14;
    const bodyHeight = height - labelHeight;
    const gap = 4;
    const barWidth = (width - padding * 2 - gap * (bars.length - 1)) / bars.length;
    const max = Math.max(...bars.map(b => b.value), 1);

    const parts = bars.map((b, i) => {
        const x = padding + i * (barWidth + gap);
        const h = max > 0 ? (b.value / max) * (bodyHeight - 12) : 0;
        const y = bodyHeight - h;
        return `
            <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="#667eea"></rect>
            <text x="${(x + barWidth / 2).toFixed(1)}" y="${(y - 3).toFixed(1)}" font-size="8" fill="#6b7280" text-anchor="middle">${Math.round(b.value)}</text>
            <text x="${(x + barWidth / 2).toFixed(1)}" y="${height - 2}" font-size="8" fill="#9ca3af" text-anchor="middle">${escapeAttr(b.label)}</text>
        `;
    }).join('');

    return `<svg viewBox="0 0 ${width} ${height}" class="volume-chart" preserveAspectRatio="none">${parts}</svg>`;
}
