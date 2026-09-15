const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('gym-native-audio exposes helpers without Capacitor', () => {
  const code = fs.readFileSync(path.join(__dirname, '../js/gym-native-audio.js'), 'utf8');
  const sandbox = { globalThis: {}, console, atob: (s) => Buffer.from(s, 'base64').toString('binary') };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox);
  assert.equal(sandbox.GymNativeAudio.isNativeApp(), false);
  assert.equal(sandbox.GymNativeAudio.available(), false);
});

test('voice-workout source includes native capture path', () => {
  const src = fs.readFileSync(path.join(__dirname, '../js/voice-workout.js'), 'utf8');
  assert.match(src, /useNativeCapture/);
  assert.match(src, /GymNativeAudio/);
  assert.match(src, /録音中（アプリ・音楽同時OK）/);
  assert.match(src, /captureStartedAt/);
  assert.match(src, /releaseCapture/);
  assert.match(src, /openMicStream/);
  // recording must be armed only after the capture pipeline is ready
  assert.match(src, /Arm recording only after the capture pipeline is live/);
  // spurious iOS mute must not hard-stop capture
  assert.match(src, /spurious "mute"/);
});
