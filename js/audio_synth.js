// ============================================================================
// GitaSaarthi - 432 Hz Meditative Ambience Synthesizer (Web Audio API)
// Authentic Indian Tanpura Drone + Harmonic Javari + Gentle Temple Bell Chimes
// Zero External Audio Downloads - 100% Client-Side Native Audio Synthesis
// ============================================================================

class AmbientAudioEngine {
  constructor() {
    this.audioCtx = null;
    this.isPlaying = false;
    this.masterGain = null;
    this.analyser = null;
    this.tanpuraNodes = [];
    this.bellTimer = null;
    this.volume = 0.6; // default 60%
    this.visualizerCanvas = null;
    this.visualizerCtx = null;
    this.animFrameId = null;

    // Tuning based on A4 = 432 Hz
    // Sa (C#3 equivalent tuned to 432Hz harmonic scale ~ 136.1 Hz - Cosmic Om Frequency)
    this.baseFreq = 136.1; // Sacred Om / 432Hz-aligned Earth vibration

    // Background track: a recording that loops. If it cannot load or play,
    // the synthesized tanpura drone below is used instead.
    this.trackUrl = "audio/krishna.webm";
    this.trackEl = null;
    this.trackFailed = false;
  }

  // Returns true when sound can be made. Some browsers and devices have no Web Audio at all; the page must
  // still start, so this reports it instead of throwing.
  initContext() {
    if (!this.audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) { this.unsupported = true; return false; }
      try { this.audioCtx = new Ctx(); } catch (e) { this.unsupported = true; return false; }

      // Master Gain
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.audioCtx.currentTime);

      // Analyser for real-time visualizer
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.85;

      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);
    }

    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
    return true;
  }

  // Synthesize Tanpura Drone Strings (Sa - Pa - Sa - Sa fundamental drone)
  startDrone() {
    this.stopDrone();
    if (!this.initContext()) return;

    const t = this.audioCtx.currentTime;
    const sa = this.baseFreq;
    const pa = this.baseFreq * 1.5; // Perfect 5th (Pancham)
    const saHigh = this.baseFreq * 2.0; // Higher octave Sa
    const ni = this.baseFreq * 1.875; // Shuddha Nishad subtle undertone

    // Frequencies representing the 4 strings of a classical Tanpura:
    // String 1: Pa (or Ma/Ni), String 2 & 3: Sa (Mid), String 4: Kharaj Sa (Low)
    const stringFreqs = [
      { freq: pa, gain: 0.14, pan: -0.3, detune: 2 },
      { freq: saHigh, gain: 0.20, pan: -0.1, detune: -1.5 },
      { freq: saHigh, gain: 0.18, pan: 0.1, detune: 2.2 },
      { freq: sa, gain: 0.32, pan: 0.0, detune: 0 }
    ];

    // Create a rich Javari shimmer filter (warm acoustic buzz of string bridge)
    const javariFilter = this.audioCtx.createBiquadFilter();
    javariFilter.type = "lowpass";
    javariFilter.frequency.setValueAtTime(1400, t);
    javariFilter.Q.setValueAtTime(2.5, t);

    // LFO for organic breathing pulsation of the strings (strum cycle ~4.5 seconds)
    const lfo = this.audioCtx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(0.22, t); // gentle slow swell
    const lfoGain = this.audioCtx.createGain();
    lfoGain.gain.setValueAtTime(350, t);
    lfo.connect(lfoGain);
    lfoGain.connect(javariFilter.frequency);
    lfo.start(t);
    this.tanpuraNodes.push(lfo);

    // String Oscillators
    stringFreqs.forEach((string, idx) => {
      // Main Sawtooth Oscillator (gives rich string harmonics)
      const osc = this.audioCtx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(string.freq, t);
      osc.detune.setValueAtTime(string.detune, t);

      // Warmth Sub-oscillator (Sine for round low-end resonance)
      const sub = this.audioCtx.createOscillator();
      sub.type = "sine";
      sub.frequency.setValueAtTime(string.freq, t);

      const strGain = this.audioCtx.createGain();
      // Smooth fade in over 2 seconds to avoid any click
      strGain.gain.setValueAtTime(0.0001, t);
      strGain.gain.exponentialRampToValueAtTime(string.gain, t + 2.5);

      // Subtle string strumming volume modulation
      const strumLFO = this.audioCtx.createOscillator();
      strumLFO.frequency.setValueAtTime(0.25, t + (idx * 0.7)); // staggered phase
      const strumGain = this.audioCtx.createGain();
      strumGain.gain.setValueAtTime(string.gain * 0.25, t);
      strumLFO.connect(strumGain);
      strumGain.connect(strGain.gain);
      strumLFO.start(t);
      this.tanpuraNodes.push(strumLFO);

      // Panner for stereo spatial width
      if (this.audioCtx.createStereoPanner) {
        const panner = this.audioCtx.createStereoPanner();
        panner.pan.setValueAtTime(string.pan, t);
        osc.connect(strGain);
        sub.connect(strGain);
        strGain.connect(panner);
        panner.connect(javariFilter);
      } else {
        osc.connect(strGain);
        sub.connect(strGain);
        strGain.connect(javariFilter);
      }

      osc.start(t);
      sub.start(t);
      this.tanpuraNodes.push(osc, sub, strGain);
    });

    javariFilter.connect(this.masterGain);
    this.tanpuraNodes.push(javariFilter);

    // Schedule periodic gentle temple bell
    this.scheduleTempleBell();
  }

  stopDrone() {
    if (this.tanpuraNodes.length > 0) {
      const t = this.audioCtx ? this.audioCtx.currentTime : 0;
      this.tanpuraNodes.forEach(node => {
        try {
          if (node.stop) node.stop(t + 0.5);
          if (node.disconnect) node.disconnect();
        } catch (e) {
          // ignore already stopped nodes
        }
      });
      this.tanpuraNodes = [];
    }

    if (this.bellTimer) {
      clearInterval(this.bellTimer);
      this.bellTimer = null;
    }
  }

  // Synthesize a soothing Temple Bell Chime (Vedic Ghanta) using physical partials
  playTempleBell(pitchMultiplier = 1.0) {
    if (!this.audioCtx || this.audioCtx.state === "suspended") return;

    const t = this.audioCtx.currentTime;
    const fundamental = 540 * pitchMultiplier; // bell root frequency

    // Acoustic brass bell partials (ratios relative to fundamental)
    const partials = [
      { ratio: 1.0, gain: 0.35, decay: 4.8 },  // Hum
      { ratio: 2.0, gain: 0.25, decay: 4.0 },  // Prime
      { ratio: 2.76, gain: 0.20, decay: 3.2 }, // Tierce (minor 3rd)
      { ratio: 4.07, gain: 0.15, decay: 2.5 }, // Quint
      { ratio: 5.4, gain: 0.10, decay: 1.8 }   // Nominal
    ];

    partials.forEach(p => {
      const osc = this.audioCtx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(fundamental * p.ratio, t);

      const gain = this.audioCtx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      // Sharp attack (hammer strike)
      gain.gain.linearRampToValueAtTime(p.gain * 0.4, t + 0.015);
      // Long gentle exponential decay
      gain.gain.exponentialRampToValueAtTime(0.00001, t + p.decay);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + p.decay + 0.1);
    });
  }

  scheduleTempleBell() {
    if (this.bellTimer) clearInterval(this.bellTimer);
    // Strike bell initially after 5 seconds, then every 24 seconds
    setTimeout(() => {
      if (this.isPlaying) this.playTempleBell(1.0);
    }, 5000);

    this.bellTimer = setInterval(() => {
      if (this.isPlaying) {
        // Subtle variation in pitch for organic feel
        const pitch = 0.98 + Math.random() * 0.05;
        this.playTempleBell(pitch);
      }
    }, 24000);
  }

  toggle() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
    return this.isPlaying;
  }

  playTrack() {
    if (!this.trackEl) {
      const el = new Audio(this.trackUrl);
      el.loop = true;
      el.preload = "auto";
      el.addEventListener("error", () => this.fallbackToDrone());
      this.trackSrc = this.audioCtx.createMediaElementSource(el);
      this.trackSrc.connect(this.masterGain);
      this.trackEl = el;
    }
    const started = this.trackEl.play();
    if (started && started.catch) {
      started.catch((err) => {
        // Autoplay refused: not a broken file. Stay silent and let the page ask for a tap.
        if (err && err.name === "NotAllowedError") {
          this.pause();
          if (this.onBlocked) this.onBlocked();
        } else {
          this.fallbackToDrone();
        }
      });
    }
  }

  fallbackToDrone() {
    this.trackFailed = true;
    if (this.trackEl) { try { this.trackEl.pause(); } catch (e) {} }
    if (this.isPlaying) this.startDrone();
  }

  play() {
    if (!this.initContext()) { this.isPlaying = false; return; }
    this.isPlaying = true;
    if (this.trackUrl && !this.trackFailed) this.playTrack();
    else this.startDrone();
    this.startVisualizer();
  }

  pause() {
    this.stopDrone();
    if (this.trackEl) this.trackEl.pause();
    this.isPlaying = false;
    this.stopVisualizer();
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.audioCtx.currentTime);
    }
  }

  attachVisualizer(canvasElement) {
    this.visualizerCanvas = canvasElement;
    if (this.visualizerCanvas) {
      this.visualizerCtx = this.visualizerCanvas.getContext("2d");
    }
  }

  startVisualizer() {
    if (!this.visualizerCanvas || !this.visualizerCtx || !this.analyser) return;

    const canvas = this.visualizerCanvas;
    const ctx = this.visualizerCtx;
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      this.animFrameId = requestAnimationFrame(render);
      this.analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.2;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.9;

        ctx.fillStyle = "rgba(232, 135, 14, 0.85)";
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);

        x += barWidth;
      }
    };

    render();
  }

  stopVisualizer() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.visualizerCanvas && this.visualizerCtx) {
      this.visualizerCtx.clearRect(0, 0, this.visualizerCanvas.width, this.visualizerCanvas.height);
    }
  }
}

// Global instance
window.audioEngine = new AmbientAudioEngine();
