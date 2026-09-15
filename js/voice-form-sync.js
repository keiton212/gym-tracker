/* Merge voice sets into training-screen drafts without wiping other exercises. */
(() => {
    'use strict';

    function findMenuExercise(exercises, name) {
        return (exercises || []).find(ex =>
            ex.name === name || (Array.isArray(ex.alternatives) && ex.alternatives.includes(name))
        ) || null;
    }

    function needsPerSetWeight(voiceSets = []) {
        if (voiceSets.length <= 1) return true;
        const first = String(voiceSets[0]?.weight ?? '');
        return voiceSets.some(s => String(s.weight ?? '') !== first);
    }

    function desiredSetCount(exercise, voiceSets = [], existingDraft) {
        const menuCount = Math.max(1, parseInt(exercise?.sets, 10) || 1);
        const draftCount = Array.isArray(existingDraft?.sets) ? existingDraft.sets.length : 0;
        const voiceCount = voiceSets.length;
        return Math.max(1, Math.min(10, Math.max(menuCount, draftCount, voiceCount)));
    }

    function normalizeDraftRow(row, fallbackWeight = '') {
        if (row && typeof row === 'object') {
            return {
                weight: row.weight === undefined || row.weight === null ? '' : String(row.weight),
                reps: row.reps === undefined || row.reps === null ? '' : String(row.reps)
            };
        }
        if (row === undefined || row === null || row === '') {
            return { weight: fallbackWeight === undefined || fallbackWeight === null ? '' : String(fallbackWeight), reps: '' };
        }
        return {
            weight: fallbackWeight === undefined || fallbackWeight === null ? '' : String(fallbackWeight),
            reps: String(row)
        };
    }

    function mergeVoiceSetsIntoDraft(existingDraft, voiceSets = [], rowCount) {
        const count = Math.max(1, Math.min(10, rowCount || voiceSets.length || 1));
        const rows = [];
        for (let i = 0; i < count; i++) {
            if (i < voiceSets.length) {
                rows.push({
                    weight: String(voiceSets[i].weight ?? ''),
                    reps: String(voiceSets[i].reps ?? '')
                });
            } else {
                rows.push(normalizeDraftRow(existingDraft?.sets?.[i], existingDraft?.weight || ''));
            }
        }
        return {
            weight: String(voiceSets[0]?.weight ?? existingDraft?.weight ?? ''),
            sets: rows
        };
    }

    const api = {
        findMenuExercise,
        needsPerSetWeight,
        desiredSetCount,
        mergeVoiceSetsIntoDraft,
        normalizeDraftRow
    };
    globalThis.VoiceFormSync = api;
    if (typeof module !== 'undefined') module.exports = api;
})();
