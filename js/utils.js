// レスト時間のワンタップ変更用プリセット（分）
const REST_PRESETS = [1, 1.5, 2, 2.5, 3];

// メニュー枠内の種目（メイン/代替）ごとの重量を取り出す。
// 代替種目の重量は exercise.altWeights に種目名キーで保存し、未設定ならメインの重量を初期値にする。
function getVariantWeight(exercise, name) {
    if (Array.isArray(exercise.alternatives) && exercise.alternatives.includes(name)) {
        return exercise.altWeights?.[name] ?? exercise.weight;
    }
    return exercise.weight;
}

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

// 「8/17」のような月/日表記を返す（記録日の表示用）
function formatMonthDay(date) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
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

// 1種目分の記録から総重量（重量×回数の合計）を計算する
function calculateExerciseVolume(rec) {
    let volume = 0;
    if (rec.perSetWeight) {
        (rec.sets || []).forEach(s => {
            const w = parseFloat(s?.weight) || 0;
            const r = parseFloat(s?.reps) || 0;
            volume += w * r;
        });
    } else {
        const w = parseFloat(rec.weight) || 0;
        (rec.sets || []).forEach(s => {
            const r = parseFloat(s) || 0;
            volume += w * r;
        });
    }
    return Math.round(volume);
}

// 1セッション分の記録から総ボリューム（重量×回数の合計）を計算する
function calculateSessionVolume(exercises) {
    return Object.values(exercises || {}).reduce((sum, rec) => sum + calculateExerciseVolume(rec), 0);
}

// 1種目分の記録から、指定したセット番号（0始まり）の回数を取り出す。未入力なら null
function getSetReps(rec, setIndex) {
    const entry = rec.sets?.[setIndex];
    const raw = rec.perSetWeight ? entry?.reps : entry;
    if (raw === undefined || raw === '') return null;
    const reps = parseFloat(raw);
    return isNaN(reps) ? null : reps;
}

// 1種目分の記録から、指定したセット番号（0始まり）の重量を取り出す。未入力なら null
// （perSetWeightでなければ全セット共通の重量、perSetWeightならそのセット固有の重量）
function getSetWeight(rec, setIndex) {
    const raw = rec.perSetWeight ? rec.sets?.[setIndex]?.weight : rec.weight;
    if (raw === undefined || raw === null || raw === '') return null;
    const weight = parseFloat(raw);
    return isNaN(weight) ? null : weight;
}

// セットごとの推移グラフで使う色（セット1, セット2, ...の順）
const CHART_SERIES_COLORS = ['#667eea', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

// 複数系列（種目のセットごとの回数推移など）を1つの折れ線グラフにまとめてSVGとして生成する。
// 各点にweightを持たせておくと、前回からセットの重量が変わった地点だけ◆マーク＋重量ラベルで強調する
// （回数だけ見ると「重量を上げたから回数が減った」のか「単に伸び悩んでいる」のか区別できないため）
function buildMultiLineChartSVG(seriesList, labels) {
    const width = 300;
    const height = 100;
    const paddingTop = 18;
    const paddingBottom = 10;
    const paddingX = 10;

    const isValid = (y) => y !== null && y !== undefined && !isNaN(y);
    const seriesWithData = seriesList.filter(s => s.points.some(p => isValid(p.y)));
    if (seriesWithData.length === 0) return '<p class="chart-empty">データなし</p>';

    const allValues = seriesWithData.flatMap(s => s.points.filter(p => isValid(p.y)).map(p => p.y));
    const min = Math.min(...allValues, 0);
    const max = Math.max(...allValues);
    const range = (max - min) || 1;
    const stepX = labels.length > 1 ? (width - paddingX * 2) / (labels.length - 1) : 0;
    const toY = (v) => height - paddingBottom - ((v - min) / range) * (height - paddingTop - paddingBottom);

    let hasWeightChangeMark = false;

    const linesHTML = seriesWithData.map((s, si) => {
        const color = CHART_SERIES_COLORS[si % CHART_SERIES_COLORS.length];
        let prevWeight; // undefined = まだ重量の基準がない（このセットの最初の記録）

        const coords = s.points
            .map((p, i) => {
                if (!isValid(p.y)) return null;
                const weight = (p.weight !== null && p.weight !== undefined && !isNaN(p.weight)) ? p.weight : null;
                const isWeightMark = weight !== null && (prevWeight === undefined || weight !== prevWeight);
                if (weight !== null) prevWeight = weight;
                return { x: paddingX + stepX * i, y: toY(p.y), weight, isWeightMark };
            })
            .filter(Boolean);
        if (coords.length === 0) return '';

        const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
        const markers = coords.map(c => {
            if (c.isWeightMark) {
                hasWeightChangeMark = true;
                const half = 3.2;
                const cx = c.x.toFixed(1);
                const cy = c.y.toFixed(1);
                const points = `${cx},${(c.y - half).toFixed(1)} ${(c.x + half).toFixed(1)},${cy} ${cx},${(c.y + half).toFixed(1)} ${(c.x - half).toFixed(1)},${cy}`;
                return `<polygon points="${points}" fill="${color}"></polygon>
                    <text x="${cx}" y="${(c.y - half - 3).toFixed(1)}" font-size="7" fill="${color}" text-anchor="middle">${c.weight}kg</text>`;
            }
            return `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="2.5" fill="${color}"></circle>`;
        }).join('');
        return `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="2"></path>${markers}`;
    }).join('');

    const legend = seriesWithData.map((s, si) => {
        const color = CHART_SERIES_COLORS[si % CHART_SERIES_COLORS.length];
        return `<span class="chart-legend-item"><span class="chart-legend-dot" style="background:${color}"></span>${escapeAttr(s.label)}</span>`;
    }).join('');
    const weightHint = hasWeightChangeMark ? '<div class="chart-weight-hint">◆ = 重量が変わったセット（数値は変更後の重量）</div>' : '';

    return `
        <svg viewBox="0 0 ${width} ${height}" class="trend-chart" preserveAspectRatio="none">${linesHTML}</svg>
        <div class="chart-legend">${legend}</div>
        ${weightHint}
        <div class="chart-range-labels">
            <span>${escapeAttr(labels[0] ?? '')}</span>
            <span>${escapeAttr(labels[labels.length - 1] ?? '')}</span>
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
