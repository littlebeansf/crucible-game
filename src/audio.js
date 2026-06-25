/* =====================================================================
   CRUCIBLE — Audio engine (Web Audio API, zero asset files)
   ---------------------------------------------------------------------
   Everything here is synthesised at runtime with oscillators + noise +
   gain envelopes, so it works completely offline and inside a sandboxed
   published iframe (no network fetches, no audio files to host).

   Public surface (used by main.js):
     audio.init()                  — lazily create the AudioContext (called on first gesture)
     audio.setMuted(bool)          — master mute (persisted by caller)
     audio.setVolume(0..1)         — master volume (persisted by caller)
     audio.isMuted()/.volume()
     audio.setMusic(bool)          — toggle the ambient music bed
     audio.musicOn()
     audio.sfx(name)               — fire a one-shot sound effect by name
     audio.resume()                — resume the context (gesture handlers)

   SFX names: discover, combine, achievement, scene, reaction, sizzle,
              bubble, freeze, click, error
   ===================================================================== */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;       // master gain -> destination
    this.sfxBus = null;       // sfx gain -> master
    this.musicBus = null;     // music gain -> master
    this._muted = false;
    this._vol = 0.7;
    this._music = true;
    this._musicNodes = null;  // running ambient graph
    this._musicTimer = null;  // scheduler interval
    this._started = false;    // whether music has been kicked off
  }

  // ---- lifecycle ---------------------------------------------------------
  init() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;                 // fail soft on ancient browsers
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this._muted ? 0 : this._vol;
    this.master.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this._music ? 0.34 : 0;
    this.musicBus.connect(this.master);
    return this.ctx;
  }

  resume() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  // ---- master controls ---------------------------------------------------
  setMuted(m) {
    this._muted = !!m;
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.linearRampToValueAtTime(this._muted ? 0 : this._vol, t + 0.08);
    }
  }
  isMuted() { return this._muted; }

  setVolume(v) {
    this._vol = Math.max(0, Math.min(1, v));
    if (this.master && !this._muted) {
      const t = this.ctx.currentTime;
      this.master.gain.linearRampToValueAtTime(this._vol, t + 0.08);
    }
  }
  volume() { return this._vol; }

  // ---- ambient music bed -------------------------------------------------
  setMusic(on) {
    this._music = !!on;
    if (!this.ctx) return;
    if (this._music) {
      this.musicBus.gain.linearRampToValueAtTime(0.34, this.ctx.currentTime + 0.4);
      if (!this._started) this._startMusic();
    } else {
      this.musicBus.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.4);
    }
  }
  musicOn() { return this._music; }

  /* A slow, dark, evolving pad — a root drone plus a lazy arpeggio drawn
     from a minor-ish scale. Scheduled in bars so it loops forever without
     any audio files. */
  _startMusic() {
    if (!this.ctx || this._started) return;
    this._started = true;
    const ctx = this.ctx;

    // --- continuous low drone (two slightly detuned saws through a lowpass)
    const drone = ctx.createGain();
    drone.gain.value = 0.0;
    drone.connect(this.musicBus);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    lp.Q.value = 6;
    lp.connect(drone);
    const root = 55; // A1
    const o1 = ctx.createOscillator(); o1.type = "sawtooth"; o1.frequency.value = root;
    const o2 = ctx.createOscillator(); o2.type = "sawtooth"; o2.frequency.value = root * 1.005;
    o1.connect(lp); o2.connect(lp);
    o1.start(); o2.start();
    drone.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 3);

    // slow filter sweep gives the drone life
    const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 220;
    lfo.connect(lfoGain); lfoGain.connect(lp.frequency); lfo.start();

    this._musicNodes = { drone, o1, o2, lp, lfo, lfoGain };

    // --- arpeggio scheduler (A minor pentatonic-ish, sparse + airy) -------
    const scale = [220.00, 261.63, 293.66, 329.63, 392.00, 440.00]; // A3..A4
    let step = 0;
    const tick = () => {
      if (!this.ctx) return;
      // only ring a note ~60% of the time → feels organic, not robotic
      if (this._music && Math.random() < 0.62) {
        const f = scale[(step * 2 + (Math.random() < 0.3 ? 1 : 0)) % scale.length]
                  * (Math.random() < 0.25 ? 2 : 1);
        this._pluck(f, 0.16, this.musicBus, "triangle", 1.4);
      }
      step++;
    };
    // ~92 bpm eighth-ish notes (650ms)
    this._musicTimer = setInterval(tick, 650);
  }

  // A soft synth pluck used by the arpeggio and several SFX.
  _pluck(freq, gain, dest, type = "sine", dur = 0.4) {
    const ctx = this.ctx; if (!ctx) return;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // short burst of filtered noise (sizzles, bubbles, sprays)
  _noise(dur, gain, filterType, freq, dest) {
    const ctx = this.ctx; if (!ctx) return;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = filterType || "bandpass"; f.frequency.value = freq || 1200; f.Q.value = 1.2;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.sfxBus);
    src.start(t); src.stop(t + dur + 0.02);
  }

  // ---- one-shot SFX ------------------------------------------------------
  sfx(name) {
    if (!this.ctx || this._muted) return;
    this.resume();
    const bus = this.sfxBus;
    switch (name) {
      case "discover": {              // bright rising 3-note sparkle
        this._pluck(523.25, 0.22, bus, "triangle", 0.28);
        setTimeout(() => this._pluck(659.25, 0.22, bus, "triangle", 0.28), 90);
        setTimeout(() => this._pluck(783.99, 0.24, bus, "triangle", 0.5), 180);
        break;
      }
      case "combine": {               // soft two-note confirm
        this._pluck(392.0, 0.2, bus, "sine", 0.22);
        setTimeout(() => this._pluck(587.33, 0.2, bus, "sine", 0.3), 70);
        break;
      }
      case "achievement": {           // fanfare arpeggio
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((f, i) => setTimeout(() => this._pluck(f, 0.24, bus, "triangle", 0.5), i * 100));
        break;
      }
      case "scene": {                 // warm "whoosh in" — swept noise + low note
        this._noise(0.5, 0.18, "lowpass", 900, bus);
        this._pluck(196.0, 0.18, bus, "sine", 0.6);
        setTimeout(() => this._pluck(293.66, 0.18, bus, "sine", 0.5), 120);
        break;
      }
      case "reaction": {              // generic alchemical "ping"
        this._pluck(880, 0.16, bus, "sine", 0.25);
        break;
      }
      case "sizzle": {                // lava/steam hiss
        this._noise(0.45, 0.14, "highpass", 2600, bus);
        break;
      }
      case "bubble": {                // boiling blip
        this._pluck(420 + Math.random() * 120, 0.12, bus, "sine", 0.14);
        break;
      }
      case "freeze": {                // crystalline shimmer
        this._pluck(1244.5, 0.12, bus, "triangle", 0.4);
        setTimeout(() => this._pluck(1567.98, 0.1, bus, "triangle", 0.5), 60);
        break;
      }
      case "click": {                 // UI tick
        this._pluck(660, 0.08, bus, "square", 0.05);
        break;
      }
      case "error": {                 // low buzz
        this._pluck(140, 0.16, bus, "sawtooth", 0.18);
        break;
      }
      default: break;
    }
  }
}
