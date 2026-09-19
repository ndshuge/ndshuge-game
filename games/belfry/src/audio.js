/* 钟楼契约 · audio.js
   全部音效由 Web Audio 现场合成，零音频资源。
   中世纪音色取向：钟、铁锤、鲁特琴、低沉嗡鸣。 */
(function () {
  'use strict';
  var B = window.Belfry;

  var ctx = null;
  var master = null;
  var muted = false;
  var ready = false;

  function ensure() {
    if (ctx) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.32;
      master.connect(ctx.destination);
      ready = true;
      return true;
    } catch (e) { return false; }
  }

  function now() { return ctx.currentTime; }

  // 一个基础音：波形 + 频率包络 + 幅度包络
  function tone(opts) {
    if (!ready && !ensure()) return;
    var t0 = now() + (opts.delay || 0);
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.f0, t0);
    if (opts.f1 != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.f1), t0 + (opts.sweep || opts.dur));
    }
    var peak = opts.gain == null ? 0.5 : opts.gain;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (opts.atk || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    var node = osc;
    if (opts.filter) {
      var bq = ctx.createBiquadFilter();
      bq.type = opts.filter;
      bq.frequency.value = opts.cutoff || 900;
      bq.Q.value = opts.q || 1;
      node.connect(bq); node = bq;
    }
    node.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + opts.dur + 0.02);
  }

  // 噪声脉冲（打击瞬态、脚步、沙沙）
  function noise(opts) {
    if (!ready && !ensure()) return;
    var dur = opts.dur || 0.12;
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var bq = ctx.createBiquadFilter();
    bq.type = opts.filter || 'bandpass';
    bq.frequency.value = opts.cutoff || 1200;
    bq.Q.value = opts.q || 1.2;
    var g = ctx.createGain();
    g.gain.value = opts.gain == null ? 0.4 : opts.gain;
    src.connect(bq); bq.connect(g); g.connect(master);
    src.start(now() + (opts.delay || 0));
  }

  // 钟：非谐分音堆叠 + 长衰减。这是本作的签名音。
  function bell(f0, dur, gain, delay) {
    if (!ready && !ensure()) return;
    var ratios = [0.5, 1.0, 1.19, 1.56, 2.00, 2.66, 3.01, 4.10];
    var gains = [0.55, 1.00, 0.66, 0.44, 0.32, 0.22, 0.16, 0.10];
    var decays = [1.0, 1.0, 0.72, 0.55, 0.42, 0.30, 0.24, 0.16];
    for (var i = 0; i < ratios.length; i++) {
      tone({
        type: 'sine',
        f0: f0 * ratios[i],
        dur: dur * decays[i],
        gain: gain * gains[i],
        atk: 0.004,
        delay: delay || 0
      });
    }
  }

  var SFX = {
    // 挥砍：噪声扫频 + 高频下坠
    swing: function () {
      noise({ dur: 0.1, filter: 'bandpass', cutoff: 2600, q: 0.9, gain: 0.16 });
      tone({ type: 'triangle', f0: 900, f1: 320, dur: 0.09, gain: 0.1 });
    },
    // 命中：瞬态 + 体 + 低频 thump + 方波 crack，四层叠
    hit: function (heavy) {
      noise({ dur: 0.05, filter: 'highpass', cutoff: 3200, gain: 0.22 });
      noise({ dur: 0.11, filter: 'bandpass', cutoff: 700, q: 0.8, gain: 0.3 });
      tone({ type: 'sine', f0: heavy ? 150 : 210, f1: 60, dur: 0.13, gain: 0.34 });
      tone({ type: 'square', f0: heavy ? 320 : 420, f1: 160, dur: 0.05, gain: 0.09 });
    },
    // 斩杀：一记短促钟，资源到手
    rend: function () {
      bell(880, 0.55, 0.2, 0);
      noise({ dur: 0.07, filter: 'bandpass', cutoff: 1800, gain: 0.14 });
    },
    // 缚契：低频嗡鸣上升 + 反向钟，要有"签下合约"的压迫感
    bind: function () {
      tone({ type: 'sawtooth', f0: 70, f1: 156, dur: 0.85, gain: 0.2, filter: 'lowpass', cutoff: 620, q: 3 });
      tone({ type: 'sine', f0: 55, f1: 110, dur: 0.9, gain: 0.26 });
      bell(392, 1.6, 0.16, 0.12);
      noise({ dur: 0.5, filter: 'bandpass', cutoff: 300, q: 0.7, gain: 0.1, delay: 0.05 });
    },
    // 契约者叛变：钟声走音
    betray: function () {
      bell(300, 1.4, 0.24, 0);
      tone({ type: 'sawtooth', f0: 190, f1: 62, dur: 0.7, gain: 0.16, filter: 'lowpass', cutoff: 500, q: 2 });
      noise({ dur: 0.4, filter: 'lowpass', cutoff: 420, gain: 0.18 });
    },
    plant: function () {
      noise({ dur: 0.09, filter: 'lowpass', cutoff: 900, gain: 0.2 });
      tone({ type: 'sine', f0: 520, f1: 660, dur: 0.09, gain: 0.1 });
    },
    harvest: function () {
      // 五声音阶上行两音，收获的即时满足
      tone({ type: 'triangle', f0: 587, dur: 0.11, gain: 0.16 });
      tone({ type: 'triangle', f0: 880, dur: 0.14, gain: 0.14, delay: 0.07 });
    },
    till: function () {
      noise({ dur: 0.14, filter: 'lowpass', cutoff: 620, gain: 0.26 });
      tone({ type: 'sine', f0: 120, f1: 78, dur: 0.15, gain: 0.2 });
    },
    hurt: function () {
      tone({ type: 'square', f0: 300, f1: 120, dur: 0.16, gain: 0.2, filter: 'lowpass', cutoff: 900 });
      noise({ dur: 0.1, filter: 'bandpass', cutoff: 500, q: 0.7, gain: 0.2 });
    },
    step: function () {
      noise({ dur: 0.035, filter: 'lowpass', cutoff: 700, gain: 0.07 });
    },
    waveStart: function () {
      bell(196, 2.4, 0.26, 0);
      bell(147, 2.8, 0.2, 0.35);
    },
    dawn: function () {
      bell(523, 2.0, 0.18, 0);
      bell(392, 2.4, 0.16, 0.3);
      bell(659, 1.6, 0.12, 0.6);
    },
    select: function () {
      tone({ type: 'triangle', f0: 740, dur: 0.07, gain: 0.14 });
    },
    deny: function () {
      tone({ type: 'square', f0: 200, f1: 150, dur: 0.12, gain: 0.16, filter: 'lowpass', cutoff: 700 });
    },
    levelup: function () {
      [523, 659, 784, 1046].forEach(function (f, i) {
        tone({ type: 'triangle', f0: f, dur: 0.22, gain: 0.13, delay: i * 0.07 });
      });
    }
  };

  B.audio = {
    init: function () {
      ensure();
      if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { } }
    },
    play: function (name, arg) {
      if (muted) return;
      if (!ready && !ensure()) return;
      var fn = SFX[name];
      if (fn) { try { fn(arg); } catch (e) { } }
    },
    bell: function (f0, dur, gain) { if (!muted) { bell(f0, dur, gain); } },
    toggleMute: function () {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.32;
      B.save.write({ muted: muted });
      return muted;
    },
    isMuted: function () { return muted; },
    // 页面失焦时降噪
    suspend: function () { if (ctx && ctx.state === 'running') { try { ctx.suspend(); } catch (e) { } } },
    resume: function () { if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { } } }
  };

  var s = B.save.read();
  muted = !!s.muted;
})();
