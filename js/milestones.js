const TRAINING_START_DATE = new Date(2025, 7, 11); // 2025-08-11

function getDaysSinceStart(today = new Date()) {
    const start = new Date(TRAINING_START_DATE.getFullYear(), TRAINING_START_DATE.getMonth(), TRAINING_START_DATE.getDate());
    const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.floor((now - start) / 86400000) + 1;
}

function getMonthsSinceStart(today = new Date()) {
    let months = (today.getFullYear() - TRAINING_START_DATE.getFullYear()) * 12
        + (today.getMonth() - TRAINING_START_DATE.getMonth());
    if (today.getDate() < TRAINING_START_DATE.getDate()) months--;
    return Math.max(0, months);
}

function formatDurationSinceStart(today = new Date()) {
    const months = getMonthsSinceStart(today);
    const years = Math.floor(months / 12);
    const remMonths = months % 12;
    if (years === 0) return `${remMonths}ヶ月`;
    if (remMonths === 0) return `${years}年`;
    return `${years}年${remMonths}ヶ月`;
}

function isMilestoneDay(today = new Date()) {
    const days = getDaysSinceStart(today);
    if (days > 0 && days % 100 === 0) return true;
    if (today.getDate() === TRAINING_START_DATE.getDate()) return true;
    return false;
}

const FUN_VOLUME_UNITS = [
    { name: 'クジラ（ザトウクジラ）', kg: 30000, counter: '頭' },
    { name: '大型バス', kg: 14000, counter: '台' },
    { name: 'ゾウ', kg: 6000, counter: '頭' },
    { name: '軽自動車', kg: 700, counter: '台' }
];

function getFunVolumeComparison(totalKg) {
    for (const unit of FUN_VOLUME_UNITS) {
        const count = totalKg / unit.kg;
        if (count >= 1) {
            return { unit: unit.name, count: Math.round(count * 10) / 10, counter: unit.counter };
        }
    }
    const smallest = FUN_VOLUME_UNITS[FUN_VOLUME_UNITS.length - 1];
    return { unit: smallest.name, count: Math.round((totalKg / smallest.kg) * 10) / 10, counter: smallest.counter };
}

function getTotalLifetimeVolume() {
    const records = storage.getRecords();
    let total = 0;
    for (const dateStr in records) {
        for (const dayIdx in records[dateStr]) {
            total += calculateSessionVolume(records[dateStr][dayIdx]);
        }
    }
    return total;
}
