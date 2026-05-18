// Lightweight WebAudio synth — all SFX procedurally generated, no assets.
// Game uses single shared AudioBus.

export type SfxName =
  | "shoot" | "dash" | "hit" | "death" | "heal" | "sword"
  | "enemyShoot" | "enemySlash" | "shieldUp" | "sniperCharge" | "enemyDie"
  | "trap" | "gate" | "tick" | "victory" | "timeout" | "menu" | "pause"
  | "bossSpawn" | "bossSlam";

class AudioBus {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  sfxGain: GainNode | null = null;
  musicGain: GainNode | null = null;
  enabled = true;
  master = 0.75;
  sfx = 0.8;
  music = 0.55;
  private bossNodes: { osc: OscillatorNode; gain: GainNode }[] = [];
  private bossInt: number | null = null;
  private lastFire: Record<string, number> = {};

  ensure() {
    if (this.ctx) return this.ctx;
    try {
      const Ctx = (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      this.ctx = new Ctx();
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.applyVolumes();
    } catch { /* no audio */ }
    return this.ctx;
  }

  setVolumes(v: { master?: number; sfx?: number; music?: number; enabled?: boolean }) {
    if (v.master !== undefined) this.master = v.master;
    if (v.sfx !== undefined) this.sfx = v.sfx;
    if (v.music !== undefined) this.music = v.music;
    if (v.enabled !== undefined) this.enabled = v.enabled;
    this.applyVolumes();
  }
  private applyVolumes() {
    if (!this.masterGain || !this.sfxGain || !this.musicGain) return;
    this.masterGain.gain.value = this.enabled ? this.master : 0;
    this.sfxGain.gain.value = this.sfx;
    this.musicGain.gain.value = this.music;
  }

  resume() { this.ctx?.resume?.(); }

  // throttle to prevent audio spam
  private canFire(key: string, ms: number): boolean {
    const now = performance.now();
    if ((this.lastFire[key] ?? 0) + ms > now) return false;
    this.lastFire[key] = now;
    return true;
  }

  play(name: SfxName) {
    const ctx = this.ensure();
    if (!ctx || !this.sfxGain || !this.enabled) return;
    const t = ctx.currentTime;
    const out = this.sfxGain;
    switch (name) {
      case "shoot": {
        if (!this.canFire("shoot", 60)) return;
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "square"; o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(220, t + 0.08);
        g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.12);
        break;
      }
      case "dash": {
        const o = ctx.createOscillator(); const g = ctx.createGain(); const f = ctx.createBiquadFilter();
        f.type = "highpass"; f.frequency.value = 600;
        o.type = "sawtooth"; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(800, t + 0.18);
        g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + 0.25);
        break;
      }
      case "hit": {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "sawtooth"; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.18);
        g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.25);
        break;
      }
      case "death": {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "sawtooth"; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(40, t + 1.4);
        g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
        o.connect(g).connect(out); o.start(t); o.stop(t + 1.6);
        // glitch noise
        const noise = this.noiseBuffer(0.8);
        const src = ctx.createBufferSource(); src.buffer = noise;
        const ng = ctx.createGain(); ng.gain.setValueAtTime(0.25, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
        src.connect(ng).connect(out); src.start(t);
        break;
      }
      case "heal": {
        for (let i = 0; i < 3; i++) {
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.type = "sine"; o.frequency.value = 440 * Math.pow(1.5, i);
          g.gain.setValueAtTime(0, t + i * 0.06); g.gain.linearRampToValueAtTime(0.12, t + i * 0.06 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.25);
          o.connect(g).connect(out); o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.3);
        }
        break;
      }
      case "sword": {
        if (!this.canFire("sword", 80)) return;
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "triangle"; o.frequency.setValueAtTime(1200, t); o.frequency.exponentialRampToValueAtTime(400, t + 0.12);
        g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.14);
        break;
      }
      case "enemyShoot": {
        if (!this.canFire("eshoot", 60)) return;
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "square"; o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
        g.gain.setValueAtTime(0.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.12);
        break;
      }
      case "enemySlash": {
        if (!this.canFire("eslash", 90)) return;
        const noise = this.noiseBuffer(0.15);
        const src = ctx.createBufferSource(); src.buffer = noise;
        const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 2500;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        src.connect(f).connect(g).connect(out); src.start(t);
        break;
      }
      case "shieldUp": {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(220, t); o.frequency.linearRampToValueAtTime(660, t + 0.3);
        g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.4);
        break;
      }
      case "sniperCharge": {
        if (!this.canFire("schar", 300)) return;
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(1800, t + 0.5);
        g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.6);
        break;
      }
      case "enemyDie": {
        if (!this.canFire("edie", 30)) return;
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "triangle"; o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(80, t + 0.25);
        g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.32);
        break;
      }
      case "trap": {
        if (!this.canFire("trap", 200)) return;
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "square"; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
        g.gain.setValueAtTime(0.28, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.4);
        break;
      }
      case "gate": {
        for (let i = 0; i < 4; i++) {
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.type = "sawtooth"; o.frequency.value = 110 * (i + 1);
          g.gain.setValueAtTime(0, t + i * 0.08); g.gain.linearRampToValueAtTime(0.1, t + i * 0.08 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.4);
          o.connect(g).connect(out); o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.45);
        }
        break;
      }
      case "tick": {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "square"; o.frequency.value = 1400;
        g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.06);
        break;
      }
      case "victory": {
        const notes = [523, 659, 784, 1047];
        notes.forEach((f, i) => {
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.type = "triangle"; o.frequency.value = f;
          g.gain.setValueAtTime(0, t + i * 0.12); g.gain.linearRampToValueAtTime(0.18, t + i * 0.12 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.5);
          o.connect(g).connect(out); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.55);
        });
        break;
      }
      case "timeout": {
        for (let i = 0; i < 6; i++) {
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.type = "square"; o.frequency.value = 200 - i * 20;
          g.gain.setValueAtTime(0, t + i * 0.15); g.gain.linearRampToValueAtTime(0.25, t + i * 0.15 + 0.04);
          g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.14);
          o.connect(g).connect(out); o.start(t + i * 0.15); o.stop(t + i * 0.15 + 0.16);
        }
        break;
      }
      case "menu": {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(440, t); o.frequency.linearRampToValueAtTime(880, t + 0.08);
        g.gain.setValueAtTime(0.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.13);
        break;
      }
      case "pause": {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(660, t); o.frequency.exponentialRampToValueAtTime(220, t + 0.2);
        g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.25);
        break;
      }
      case "bossSpawn": {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "sawtooth"; o.frequency.setValueAtTime(60, t); o.frequency.exponentialRampToValueAtTime(220, t + 1.0);
        g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
        o.connect(g).connect(out); o.start(t); o.stop(t + 1.2);
        break;
      }
      case "bossSlam": {
        const noise = this.noiseBuffer(0.4);
        const src = ctx.createBufferSource(); src.buffer = noise;
        const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 250;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        src.connect(f).connect(g).connect(out); src.start(t);
        break;
      }
    }
  }

  private noiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    return buf;
  }

  startBossMusic() {
    const ctx = this.ensure(); if (!ctx || !this.musicGain || this.bossInt !== null) return;
    const out = this.musicGain;
    // arpeggio pattern, dark synth
    const pattern = [110, 138.59, 164.81, 138.59, 110, 207.65, 164.81, 138.59];
    let step = 0;
    const bassOsc = ctx.createOscillator(); const bassGain = ctx.createGain();
    bassOsc.type = "sawtooth"; bassOsc.frequency.value = 55;
    bassGain.gain.value = 0.18; bassOsc.connect(bassGain).connect(out); bassOsc.start();
    this.bossNodes.push({ osc: bassOsc, gain: bassGain });
    const tick = () => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const f = pattern[step % pattern.length];
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "square"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.2);
      step++;
    };
    this.bossInt = window.setInterval(tick, 220);
  }

  stopBossMusic() {
    if (this.bossInt !== null) { clearInterval(this.bossInt); this.bossInt = null; }
    for (const { osc, gain } of this.bossNodes) {
      try { gain.gain.setValueAtTime(gain.gain.value, this.ctx!.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + 0.4);
        osc.stop(this.ctx!.currentTime + 0.45); } catch { /* ignore */ }
    }
    this.bossNodes = [];
  }
}

export const audio = new AudioBus();