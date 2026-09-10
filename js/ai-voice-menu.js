(() => {
    const weight = value => value === '' || value == null || value === '-' ? '重量未設定' : Number(value) === 0 ? '自重' : `${value}kg`;
    function describe(record) {
        return (record?.sets || []).flatMap(set => {
            const reps = record.perSetWeight ? set?.reps : set;
            return reps === '' || reps == null ? [] : [`${weight(record.perSetWeight ? set.weight : record.weight)} × ${reps}回`];
        }).join(' ／ ');
    }
    function previous(records, name, day, before) {
        for (const date of Object.keys(records).filter(d => d < before).sort().reverse()) {
            const data = records[date]?.[day]?.[name];
            if (describe(data)) return `${date}：${describe(data)}`;
        }
        return 'この曜日の過去の記録はありません';
    }
    const api = { weight, describe, previous };
    globalThis.VoiceMenu = api; if (typeof module !== 'undefined') module.exports = api;
})();
