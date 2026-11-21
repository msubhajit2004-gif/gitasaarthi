// The music engine must never stop the app from starting on a browser without Web Audio. Run: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = fs.readFileSync(path.join(__dirname, "..", "js", "audio_synth.js"), "utf8");

function load(win) {
  const sandbox = { window: win, Audio: function () { throw new Error("Audio must not be created without Web Audio"); }, console, setTimeout, clearTimeout };
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(SRC + "\n;this.__engine = window.audioEngine;", sandbox);
  return sandbox.__engine;
}

test("a browser without Web Audio: play() stays silent and does not throw", () => {
  const engine = load({});
  assert.doesNotThrow(() => engine.play());
  assert.equal(engine.isPlaying, false);
});

test("a browser where AudioContext construction throws: play() stays silent", () => {
  const engine = load({ AudioContext: function () { throw new Error("blocked"); } });
  assert.doesNotThrow(() => engine.play());
  assert.equal(engine.isPlaying, false);
});

test("toggle(), pause() and setVolume() are safe when sound is unavailable", () => {
  const engine = load({});
  assert.doesNotThrow(() => { engine.toggle(); engine.pause(); engine.setVolume(0.3); });
  assert.equal(engine.isPlaying, false);
});

test("the older webkit-prefixed name is still used when it is all there is", () => {
  let made = 0;
  function Fake() {
    made++;
    this.state = "running"; this.currentTime = 0; this.destination = {};
    const node = () => ({ connect() {}, gain: { setValueAtTime() {}, cancelScheduledValues() {}, linearRampToValueAtTime() {} }, frequency: { setValueAtTime() {} } });
    this.createGain = node; this.createAnalyser = () => ({ ...node(), fftSize: 0, smoothingTimeConstant: 0, frequencyBinCount: 0, getByteFrequencyData() {} });
    this.createBiquadFilter = node; this.createOscillator = () => ({ ...node(), start() {}, stop() {}, type: "" });
    this.resume = () => {};
  }
  const engine = load({ webkitAudioContext: Fake });
  assert.equal(engine.initContext(), true);
  assert.equal(made, 1);
});

// Music rights: the app ships only its own synthesized tanpura. A recording someone else made must not be
// bundled or served. To use a track you have the rights to, set engine.trackUrl yourself.
test("the engine does not default to a bundled recording", () => {
  const engine = load({});
  assert.ok(!engine.trackUrl, "trackUrl must be empty by default");
});

test("the repository ships no audio recordings", () => {
  const dir = path.join(__dirname, "..", "audio");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const recordings = files.filter((f) => /\.(webm|mp3|ogg|m4a|wav|flac|aac|opus)$/i.test(f));
  assert.deepEqual(recordings, []);
});
