/* audio.js — 灵汐大陆声音引擎（v5）
   程序化音效 + 事件旋律 + TTS 中文台词，零外部素材。
   静音开关持久化 localStorage.hp_mute；浏览器需一次用户手势解锁音频。 */
'use strict';

const Sfx = (() => {
  let ctx = null;
  let muted = localStorage.getItem('hp_mute') === '1';

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // 单音：freq 频率 / dur 时长(秒) / type 波形 / vol 音量 / delay 延迟 / slide 滑音终值
  function tone(freq, dur, opt) {
    const o = opt || {};
    const c = ac();
    if (!c || muted) return;
    const t0 = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(Math.max(30, freq), t0);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + o.slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.vol || 0.16, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  // 噪声爆（受击/暴击的冲击感）
  function noise(dur, opt) {
    const o = opt || {};
    const c = ac();
    if (!c || muted) return;
    const t0 = c.currentTime + (o.delay || 0);
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.setValueAtTime(o.vol || 0.22, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = o.freq || 900;
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t0);
  }

  const api = {
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      localStorage.setItem('hp_mute', muted ? '1' : '0');
      if (!muted) { ac(); api.tap(); }
      return muted;
    },
    unlock() { ac(); },

    tap()    { tone(880, 0.06, { type: 'triangle', vol: 0.09 }); },
    feed()   { tone(523, 0.11, { type: 'triangle' }); tone(659, 0.11, { type: 'triangle', delay: 0.09 }); tone(784, 0.22, { type: 'triangle', delay: 0.18, vol: 0.2 }); },
    coin()   { tone(988, 0.08, { type: 'square', vol: 0.1 }); tone(1319, 0.24, { type: 'square', delay: 0.08, vol: 0.12 }); },
    heal()   { [392, 494, 587, 784].forEach((f, i) => tone(f, 0.18, { type: 'sine', delay: i * 0.09, vol: 0.14 })); },
    hit()    { noise(0.14, { vol: 0.24 }); tone(140, 0.12, { type: 'sawtooth', vol: 0.12, slide: -60 }); },
    crit()   { noise(0.2, { vol: 0.3, freq: 1400 }); tone(180, 0.16, { type: 'sawtooth', vol: 0.16, slide: -100 }); tone(1568, 0.2, { type: 'square', delay: 0.03, vol: 0.09 }); },
    dodge()  { tone(700, 0.18, { type: 'sine', vol: 0.1, slide: 500 }); },
    faint()  { tone(330, 0.3, { type: 'sawtooth', vol: 0.12, slide: -200 }); },
    levelup() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { type: 'triangle', delay: i * 0.09, vol: 0.16 })); tone(1319, 0.34, { type: 'triangle', delay: 0.36, vol: 0.18 }); },
    evolve() {
      // 进化：上行音阶 + 结尾闪亮和弦
      const scale = [392, 440, 494, 523, 587, 659, 784];
      scale.forEach((f, i) => tone(f, 0.15, { type: 'triangle', delay: i * 0.1, vol: 0.15 }));
      [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.5, { type: 'sine', delay: 0.72 + i * 0.02, vol: 0.12 }));
      tone(196, 0.9, { type: 'sawtooth', delay: 0.72, vol: 0.05, slide: 100 });
    },
    victory() {
      // 胜利号角
      [[523, 0], [523, 0.12], [523, 0.24], [659, 0.4], [784, 0.6], [1047, 0.84]].forEach(([f, d]) => tone(f, d > 0.6 ? 0.5 : 0.14, { type: 'square', delay: d, vol: 0.11 }));
    },
    defeat() { [[392, 0], [370, 0.22], [349, 0.44], [311, 0.66]].forEach(([f, d]) => tone(f, 0.28, { type: 'triangle', delay: d, vol: 0.12 })); },

    // TTS 中文台词（重大事件配音；设备语音包不同，音色各异）
    speak(text) {
      if (muted || !window.speechSynthesis) return;
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'zh-CN'; u.rate = 1.05; u.pitch = 1.15; u.volume = 0.9;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      } catch (e) { /* 静默失败 */ }
    }
  };
  return api;
})();

// 首次任意手势解锁音频（移动端浏览器策略）
document.addEventListener('pointerdown', () => Sfx.unlock(), { once: true });
