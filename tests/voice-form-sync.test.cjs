const { test } = require('node:test');
const assert = require('node:assert/strict');
const sync = require('../js/voice-form-sync.js');

test('findMenuExercise matches name and alternatives', () => {
  const exercises = [
    { id: '1', name: 'ベンチプレス', alternatives: ['スミスベンチ'], sets: '3', perSetWeight: true }
  ];
  assert.equal(sync.findMenuExercise(exercises, 'ベンチプレス')?.id, '1');
  assert.equal(sync.findMenuExercise(exercises, 'スミスベンチ')?.id, '1');
  assert.equal(sync.findMenuExercise(exercises, 'スクワット'), null);
});

test('mergeVoiceSetsIntoDraft fills spoken rows and keeps later draft rows', () => {
  const existing = {
    weight: '70',
    sets: [
      { weight: '70', reps: '8' },
      { weight: '70', reps: '8' },
      { weight: '70', reps: '8' }
    ]
  };
  const voice = [
    { weight: 75, reps: 6 },
    { weight: 75, reps: 7 },
    { weight: 72.5, reps: 10 }
  ];
  const merged = sync.mergeVoiceSetsIntoDraft(existing, voice, 3);
  assert.deepEqual(merged.sets, [
    { weight: '75', reps: '6' },
    { weight: '75', reps: '7' },
    { weight: '72.5', reps: '10' }
  ]);
  assert.equal(merged.weight, '75');
});

test('mergeVoiceSetsIntoDraft preserves trailing draft when fewer voice sets', () => {
  const existing = {
    weight: '70',
    sets: [
      { weight: '70', reps: '8' },
      { weight: '70', reps: '7' },
      { weight: '65', reps: '10' }
    ]
  };
  const voice = [{ weight: 75, reps: 6 }];
  const merged = sync.mergeVoiceSetsIntoDraft(existing, voice, 3);
  assert.deepEqual(merged.sets, [
    { weight: '75', reps: '6' },
    { weight: '70', reps: '7' },
    { weight: '65', reps: '10' }
  ]);
});

test('desiredSetCount expands to spoken length up to 10', () => {
  const exercise = { sets: '3', perSetWeight: false };
  const voice = [
    { weight: 75, reps: 6 },
    { weight: 75, reps: 7 },
    { weight: 72.5, reps: 10 },
    { weight: 70, reps: 8 }
  ];
  assert.equal(sync.desiredSetCount(exercise, voice, null), 4);
  assert.equal(sync.needsPerSetWeight(voice), true);
  assert.equal(sync.needsPerSetWeight([{ weight: 75, reps: 6 }, { weight: 75, reps: 7 }]), false);
});
