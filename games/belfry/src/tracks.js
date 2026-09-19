/* 钟楼契约 · tracks.js
   曲库。四个主题，共用一套合成原语（避免风格漂移，也避免四份代码各写一遍）。

   night  = 融合版（A 的音色与调度 + B 的和声与低音 + D 的段落 + C 的留白），鼠哥 2026-09-18 选定
   day    = 白天农场。温吞、稀疏、五声音阶、木质感，参考星露谷与我的世界的留白
   dusk   = 黄昏。低音线入场，钟声动机先现，渐强的不安
   ending = 结局。只剩钟与长混响，旋律撤掉

   所有主题签名统一为 createTrack(ctx, dest) -> { stop }，由 music.js 调度。 */
(function () {
  'use strict';
  var B = window.Belfry;

  /* ============================================================
     共用合成原语
     ============================================================ */
  function kit(ctx, dest) {
    var k = {};
    var out = ctx.createGain(); out.gain.value = 0.85; out.connect(dest);
    var tone = ctx.createBiquadFilter();
    tone.type = 'lowpass'; tone.frequency.value = 5200; tone.Q.value = 0.4;
    tone.connect(out);
    var dry = ctx.createGain(); dry.connect(tone);

    var delay = ctx.createDelay(1.5); delay.delayTime.value = 0.75;
    var fb = ctx.createGain(); fb.gain.value = 0.31;
    var damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 1500;
    var wet = ctx.createGain(); wet.gain.value = 0.34;
    var busWet = ctx.createGain(); busWet.connect(delay);
    delay.connect(damp); damp.connect(fb); fb.connect(delay);
    delay.connect(wet); wet.connect(tone);

    var live = [];
    k.out = out; k.live = live;

    k.send = function (node, amt) {
      node.connect(dry);
      if (amt > 0) { var g = ctx.createGain(); g.gain.value = amt; node.connect(g); g.connect(busWet); }
    };

    var nLen = Math.floor(ctx.sampleRate * 2);
    var noiseBuf = ctx.createBuffer(1, nLen, ctx.sampleRate);
    var nd = noiseBuf.getChannelData(0);
    for (var i = 0; i < nLen; i++) nd[i] = Math.random() * 2 - 1;
    k.noiseBuf = noiseBuf;

    // 钟：非谐分音，每个分音独立衰减。分音越多铜感越好。
    var PARTS = [1, 2.0, 2.76, 5.4, 8.93], PAMP = [1, 0.55, 0.34, 0.18, 0.09];
    k.bell = function (t, base, vel, body) {
      body = body || 6.5;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vel, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + body);
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
      g.connect(lp); k.send(lp, 0.6);
      for (var j = 0; j < PARTS.length; j++) {
        var o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.value = base * PARTS[j];
        var v = ctx.createGain(); v.gain.value = PAMP[j];
        o.connect(v); v.connect(g);
        var dec = body / (1 + j * 0.55);
        o.start(t); o.stop(t + dec + 0.1);
      }
    };

    // 鲁特琴：三角波 + 1.002 锯波拍频（弦的轻微失谐）
    k.pluck = function (t, f, dur, vel) {
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vel, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.1;
      lp.frequency.setValueAtTime(Math.min(f * 7, 4600), t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(f * 2.2, 420), t + dur * 0.7);
      var o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
      var o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f * 1.002;
      var m2 = ctx.createGain(); m2.gain.value = 0.26;
      o1.connect(lp); o2.connect(m2); m2.connect(lp);
      lp.connect(g); k.send(g, 0.35);
      o1.start(t); o2.start(t);
      o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
      var ns = ctx.createBufferSource(); ns.buffer = noiseBuf;
      var nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.Q.value = 1.3;
      nf.frequency.value = Math.min(f * 4.5, 6000);
      var ng = ctx.createGain();
      ng.gain.setValueAtTime(vel * 0.5, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      ns.connect(nf); nf.connect(ng); ng.connect(dry);
      ns.start(t, Math.random() * 1.5, 0.08);
    };

    // 柔琴：给白天用的温吞版，起音慢，没有拨弦瞬态
    k.soft = function (t, f, dur, vel) {
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vel, t + 0.09);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
      lp.frequency.setValueAtTime(1200, t);
      lp.frequency.exponentialRampToValueAtTime(700, t + dur);
      var o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      var o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
      var m2 = ctx.createGain(); m2.gain.value = 0.12;
      o.connect(lp); o2.connect(m2); m2.connect(lp);
      lp.connect(g); k.send(g, 0.30);
      o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    };

    // 低音：正弦 + 高八度三角波，照顾小音箱
    k.bass = function (t, f, dur, vel) {
      var g = ctx.createGain(), g2 = ctx.createGain();
      var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      var o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vel, t + 0.6);
      g.gain.setValueAtTime(vel, t + Math.max(0.7, dur - 0.9));
      g.gain.linearRampToValueAtTime(0, t + dur);
      g2.gain.setValueAtTime(0, t);
      g2.gain.linearRampToValueAtTime(vel * 0.26, t + 0.6);
      g2.gain.setValueAtTime(vel * 0.26, t + Math.max(0.7, dur - 0.9));
      g2.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(g); g.connect(dry);
      o2.connect(g2); g2.connect(dry);
      o.start(t); o2.start(t);
      o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
    };

    // 远处的锤
    k.hammer = function (t, vel) {
      var ns = ctx.createBufferSource(); ns.buffer = noiseBuf;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.value = 240; bp.Q.value = 5;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vel, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      ns.connect(bp); bp.connect(g); k.send(g, 0.5);
      ns.start(t, Math.random() * 1.5, 0.35);
      var o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(190, t);
      o.frequency.exponentialRampToValueAtTime(120, t + 0.25);
      var og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(vel * 0.6, t + 0.004);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(og); k.send(og, 0.3);
      o.start(t); o.stop(t + 0.3);
    };

    // 雾：带通噪声 + 两个 LFO（一个调音量、一个调中心频率），让它自己呼吸
    k.fog = function (t, level, fadeIn) {
      var ns = ctx.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.value = 420; bp.Q.value = 0.6;
      var g = ctx.createGain(); g.gain.value = 0;
      g.gain.linearRampToValueAtTime(level, t + (fadeIn || 6));
      ns.connect(bp); bp.connect(g); k.send(g, 0.25);
      var l1 = ctx.createOscillator(); l1.frequency.value = 0.045;
      var a1 = ctx.createGain(); a1.gain.value = level * 0.36;
      l1.connect(a1); a1.connect(g.gain);
      var l2 = ctx.createOscillator(); l2.frequency.value = 0.031;
      var a2 = ctx.createGain(); a2.gain.value = 180;
      l2.connect(a2); a2.connect(bp.frequency);
      ns.start(t); l1.start(t); l2.start(t);
      live.push(ns, l1, l2);
    };

    k.close = function () {
      var now = ctx.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(out.gain.value, now);
      out.gain.linearRampToValueAtTime(0.0001, now + 0.35);
      for (var i = 0; i < live.length; i++) { try { live[i].stop(now + 0.4); } catch (e) { } }
      setTimeout(function () { try { out.disconnect(); tone.disconnect(); } catch (e) { } }, 600);
    };

    return k;
  }

  function fq(n) { return 293.66 * Math.pow(2, n / 12); }   // D4 = 0

  // 前瞻调度：25ms 一查，提前 0.2s 排谱
  function runBars(ctx, BARS, barDur, schedule, onEnd) {
    var bar = 0, next = ctx.currentTime + 0.1, dead = false;
    var timer = setInterval(function () {
      if (dead) return;
      while (next < ctx.currentTime + 0.2) {
        schedule(bar % BARS, next);
        next += barDur;
        bar++;
      }
    }, 25);
    return {
      stop: function () { dead = true; clearInterval(timer); if (onEnd) onEnd(); }
    };
  }

  /* ============================================================
     night —— 融合版（鼠哥选定）
     和声：Dm | Dm | Bb | F | Gm | Dm    第 5 小节到 D5 是顶点
     段落：引子 / 主题 / 中段 / 呼应
     ============================================================ */
  function night(ctx, dest) {
    var SPB = 1, BEATS = 4, BARS = 6;
    var k = kit(ctx, dest);
    var T0 = ctx.currentTime + 0.1;
    k.fog(T0, 0.085, 6);

    var D3 = -12, A3 = -3, D4 = 0, F4 = 3, G4 = 5, A4 = 7, Bb4 = 8, C5 = 10, D5 = 12;
    var BASSES = [-24, -24, -16, -19, -21, -24];
    var LUTE = [
      [[0.0, D4, 1.6, .46], [3.0, A3, 1.0, .28]],
      [[0.0, D4, 1.2, .44], [1.5, F4, 1.0, .32], [3.0, A4, 1.0, .30]],
      [[0.0, Bb4, 1.4, .42], [2.0, A4, 1.0, .30], [3.0, F4, 1.0, .28]],
      [[0.0, C5, 1.2, .42], [1.5, A4, 0.9, .30], [2.5, F4, 0.9, .28], [3.5, C5, 0.9, .32]],
      [[0.0, D5, 1.2, .40], [1.5, C5, 0.9, .30], [2.5, Bb4, 1.0, .30], [3.5, G4, 1.0, .28]],
      [[0.0, A4, 1.6, .34], [2.5, F4, 1.2, .28], [3.5, D4, 1.6, .30]]
    ];
    var HAMMER = { 2: [3.0, .06], 4: [1.8, .055] };

    var runner = runBars(ctx, BARS, BEATS * SPB, function (i, t) {
      k.bass(t, fq(BASSES[i]), BEATS * SPB + 0.05, 0.15);
      var line = LUTE[i];
      for (var j = 0; j < line.length; j++) {
        k.pluck(t + line[j][0] * SPB, fq(line[j][1]), line[j][2] * SPB, line[j][3]);
      }
      if (i === 0) k.bell(t, fq(D3), 0.28);
      if (i === 5) k.bell(t + SPB * 3.5, fq(A3), 0.16);
      if (HAMMER[i]) k.hammer(t + HAMMER[i][0] * SPB, HAMMER[i][1]);
    }, k.close);

    return { stop: function () { runner.stop(); } };
  }

  /* ============================================================
     day —— 白天农场。温吞、稀疏、五声音阶、木质感
     参考星露谷与我的世界的留白：一小节常常只有两个音
     ============================================================ */
  function day(ctx, dest) {
    var SPB = 1.05, BEATS = 4, BARS = 6;
    var k = kit(ctx, dest);
    var T0 = ctx.currentTime + 0.1;
    k.fog(T0, 0.045, 8);

    // D 大调五声：D E F# A B
    var Fs3 = -7, A3 = -3, B3 = -2, D4 = 0, E4 = 2, Fs4 = 4, A4 = 7, B4 = 9, D5 = 12;
    var BASSES = [-24, -24, -24, -17, -17, -24];
    var MEL = [
      [[0.0, D4, 2.0, .30], [2.5, Fs4, 1.2, .24]],
      [[0.0, A4, 1.6, .28], [2.5, B4, 1.4, .25]],
      [[0.0, Fs4, 1.8, .26], [2.5, E4, 1.2, .22]],
      [[0.0, B4, 2.2, .26], [3.0, A4, 1.0, .22]],
      [[0.0, D5, 1.8, .28], [2.5, B4, 1.4, .24]],
      [[0.0, A4, 2.4, .26], [3.0, Fs4, 1.0, .20], [3.6, D4, 1.2, .18]]
    ];

    var runner = runBars(ctx, BARS, BEATS * SPB, function (i, t) {
      k.bass(t, fq(BASSES[i]), BEATS * SPB + 0.05, 0.13);
      var line = MEL[i];
      for (var j = 0; j < line.length; j++) {
        k.soft(t + line[j][0] * SPB, fq(line[j][1]), line[j][2] * SPB, line[j][3]);
      }
      // 白天只有很轻的一记远钟，在每轮开场
      if (i === 0) k.bell(t + 0.5, fq(-12), 0.09, 5);
      if (i === 3) k.hammer(t + 2.2, 0.035);
    }, k.close);

    return { stop: function () { runner.stop(); } };
  }

  /* ============================================================
     dusk —— 黄昏。低音线入场，钟声动机先现，渐强
     ============================================================ */
  function dusk(ctx, dest) {
    var SPB = 1.0, BEATS = 4, BARS = 4;
    var k = kit(ctx, dest);
    var T0 = ctx.currentTime + 0.1;
    k.fog(T0, 0.06, 4);

    var D3 = -12, F3 = -5, A3 = -3, D4 = 0, Bb3 = -4;
    // 低音线逐小节下压
    var BASSES = [-24, -28, -31, -26];
    // 钟声动机：同一个小三度来回，越来越密
    var BELLS = [[0], [0, 2.5], [0, 1.5, 3.0], [0, 1.0, 2.0, 3.0]];

    var runner = runBars(ctx, BARS, BEATS * SPB, function (i, t) {
      k.bass(t, fq(BASSES[i]), BEATS * SPB + 0.05, 0.16);
      var b = BELLS[i];
      for (var j = 0; j < b.length; j++) {
        k.bell(t + b[j] * SPB, fq(j % 2 ? A3 : D3), 0.12 + i * 0.03, 4.5 - i * 0.5);
      }
      // 单音拨弦作为心跳
      k.pluck(t + 1.8 * SPB, fq(i % 2 ? F3 : D4), 1.0, 0.16 + i * 0.02);
      void Bb3;
    }, k.close);

    return { stop: function () { runner.stop(); } };
  }

  /* ============================================================
     ending —— 结局。只剩钟与长混响，旋律撤掉
     ============================================================ */
  function ending(ctx, dest) {
    var k = kit(ctx, dest);
    var T0 = ctx.currentTime + 0.1;

    // 极慢的三记钟，然后静默
    k.bell(T0 + 0.3, fq(-12), 0.26, 9);
    k.bell(T0 + 9, fq(-16), 0.20, 9);
    k.bell(T0 + 18, fq(-12), 0.22, 9);
    // 一层极薄的雾，撑住空间
    k.fog(T0, 0.035, 5);

    return {
      stop: function () { k.close(); }
    };
  }

  B.music.register('night', night);
  B.music.register('day', day);
  B.music.register('dusk', dusk);
  B.music.register('ending', ending);
})();
