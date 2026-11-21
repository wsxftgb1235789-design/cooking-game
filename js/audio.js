// 音效：WebAudio。首次触摸时解锁 AudioContext；有文件用文件，没有则合成占位。
// 接口：audio.play(name) / audio.setLoop(name, on) / audio.setEnabled(bool)。
import { SOUNDS, STORE, withV } from './config.js?v=v0.2.2';
import { load, save } from './storage.js?v=v0.2.2';

class AudioManager {
  constructor() {
    this.enabled = load(STORE.sound, true);
    this.buffers = {};
    this.raw = {};
    this.loops = {};
    this.unlocked = false;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = AC ? new AC() : null;
    if (this.ctx) {
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 1 : 0;
      this.master.connect(this.ctx.destination);
    }
    this.unlock = this.unlock.bind(this);
    ['pointerdown', 'touchend', 'keydown'].forEach((e) => window.addEventListener(e, this.unlock, { capture: true, passive: true }));
  }
  // 首次用户手势：resume + 播一个静音 buffer（部分安卓/iOS 需要）
  unlock() {
    if (!this.ctx || this.unlocked) return;
    this.ctx.resume().then(() => { this.unlocked = this.ctx.state === 'running'; }).catch(() => {});
    try { const b = this.ctx.createBuffer(1, 1, 22050); const s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.master); s.start(0); } catch (_) { /* ignore */ }
    this.unlocked = true;
  }
  // 预加载：下载并解码（suspended 状态下也能解码）
  async preload(onProgress, base = 'assets/audio/') {
    const names = Object.entries(SOUNDS).filter(([, f]) => f);
    let done = 0;
    const probe = document.createElement('audio');
    const ext = probe.canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'mp3';
    await Promise.all(names.map(async ([key, file]) => {
      try {
        if (!this.ctx) throw new Error('no WebAudio');
        let res = await fetch(withV(`${base}${file}.${ext}`));
        if (!res.ok && ext === 'ogg') res = await fetch(withV(`${base}${file}.mp3`));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ab = await res.arrayBuffer();
        this.buffers[key] = await new Promise((ok, bad) => this.ctx.decodeAudioData(ab, ok, bad));
      } catch (e) { console.warn(`[audio] ${file} 加载失败，改用合成占位`, e?.message || e); }
      done++; onProgress && onProgress(done, names.length);
    }));
  }
  get count() { return Object.values(SOUNDS).filter(Boolean).length; }
  setEnabled(on) {
    this.enabled = !!on; save(STORE.sound, this.enabled);
    if (this.master) this.master.gain.setTargetAtTime(this.enabled ? 1 : 0, this.ctx.currentTime, 0.01);
    if (!this.enabled) Object.keys(this.loops).forEach((k) => this.setLoop(k, false));
  }
  // 暂停时整体静音（不改用户开关）
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ctx && this.unlocked) this.ctx.resume().catch(() => {}); }
  play(name, vol = 1) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const buf = this.buffers[name];
    if (buf) {
      const s = this.ctx.createBufferSource(); const g = this.ctx.createGain();
      s.buffer = buf; g.gain.value = vol; s.connect(g); g.connect(this.master); s.start();
      return;
    }
    const synth = SYNTH[name] || SYNTH.click;
    synth(this.ctx, this.master, vol);
  }
  stopLoops() { Object.keys(this.loops).forEach((k) => this.setLoop(k, false)); }
  // 循环音（滋滋声）：on/off（WebAudio buffer loop，无缝）
  setLoop(name, on) {
    if (!this.ctx) return;
    const cur = this.loops[name];
    if (on && this.enabled && !cur && this.ctx.state === 'running') {
      this.loops[name] = this.buffers[name] ? loopBuffer(this.ctx, this.master, this.buffers[name]) : (LOOP_SYNTH[name] || (() => null))(this.ctx, this.master);
    } else if (!on && cur) { try { cur.stop(); } catch (_) { /* ignore */ } delete this.loops[name]; }
  }
}

function loopBuffer(ctx, out, buf) {
  const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(out); s.start(); return s;
}
function tone(ctx, out, { f = 440, f2, t = 0.15, type = 'sine', vol = 0.3, delay = 0 }) {
  const o = ctx.createOscillator(); const g = ctx.createGain(); const t0 = ctx.currentTime + delay;
  o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + t);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + t);
  o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + t + 0.02);
}
function noiseBuffer(ctx, sec) {
  const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate); const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b;
}
const SYNTH = {
  drop_pan: (c, o, v) => tone(c, o, { f: 180, f2: 90, t: 0.2, type: 'triangle', vol: 0.4 * v }),
  order_success: (c, o, v) => [523, 659, 784].forEach((f, i) => tone(c, o, { f, t: 0.18, vol: 0.25 * v, delay: i * 0.09 })),
  burnt: (c, o, v) => tone(c, o, { f: 140, f2: 70, t: 0.5, type: 'sawtooth', vol: 0.2 * v }),
  chop: (c, o, v) => tone(c, o, { f: 900, f2: 300, t: 0.06, type: 'square', vol: 0.15 * v }),
  order_new: (c, o, v) => { tone(c, o, { f: 1318, t: 0.25, vol: 0.18 * v }); tone(c, o, { f: 1046, t: 0.35, vol: 0.18 * v, delay: 0.12 }); },
  mistake: (c, o, v) => { tone(c, o, { f: 220, t: 0.15, type: 'square', vol: 0.15 * v }); tone(c, o, { f: 165, t: 0.25, type: 'square', vol: 0.15 * v, delay: 0.14 }); },
  result_win: (c, o, v) => [523, 659, 784, 1046].forEach((f, i) => tone(c, o, { f, t: 0.25, type: 'triangle', vol: 0.25 * v, delay: i * 0.12 })),
  result_fail: (c, o, v) => [392, 330, 262].forEach((f, i) => tone(c, o, { f, t: 0.3, type: 'triangle', vol: 0.25 * v, delay: i * 0.18 })),
  click: (c, o, v) => tone(c, o, { f: 660, t: 0.04, type: 'square', vol: 0.06 * v }),
  stir: (c, o, v) => tone(c, o, { f: 300, f2: 500, t: 0.08, type: 'triangle', vol: 0.12 * v }),
  reject: (c, o, v) => tone(c, o, { f: 200, f2: 150, t: 0.12, type: 'square', vol: 0.1 * v }),
  toss: (c, o, v) => tone(c, o, { f: 300, f2: 600, t: 0.12, type: 'triangle', vol: 0.15 * v }),
  ignite: (c, o, v) => tone(c, o, { f: 120, f2: 60, t: 0.25, type: 'sawtooth', vol: 0.12 * v })
};
const LOOP_SYNTH = {
  sizzle_low: (ctx, out) => LOOP_SYNTH.sizzle_high(ctx, out),
  sizzle_high: (ctx, out) => {
    const s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx, 2); s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3000;
    const g = ctx.createGain(); g.gain.value = 0.035;
    s.connect(f); f.connect(g); g.connect(out); s.start(); return s;
  }
};

export const audio = new AudioManager();
