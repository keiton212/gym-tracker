// レスト時間のワンタップ変更用プリセット（分）
const REST_PRESETS = [1, 1.5, 2, 2.5, 3];

// メニュー枠内の種目（メイン/代替）ごとの重量を取り出す。
// 代替種目の重量は exercise.altWeights に種目名キーで保存する。
// 別の種目なので、未設定でもメインの重量は流用しない（流用すると2種目の重量が混ざる）。
function getVariantWeight(exercise, name) {
    if (name !== exercise.name && Array.isArray(exercise.alternatives) && exercise.alternatives.includes(name)) {
        return exercise.altWeights?.[name] ?? '';
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
