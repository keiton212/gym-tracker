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
