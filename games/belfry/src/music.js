/* 钟楼契约 · music.js
   音乐层。与音效分开走两条总线（沿用鼓点乒乓的三层 gain 做法：master / music / sfx）。
   每个主题是一个 createTrack(ctx, dest) 函数，返回 { stop }。主题可整体替换。

   关于业火影响音乐：实时合成的振荡器无法整体变速（没有全局 playbackRate），
   所以不做降调，改成业火高时在音乐总线上叠一层低频不谐和音。听感一样是"变沉"。 */
(function () {
  'use strict';
  var B = window.Belfry;

  var ctx = null;
  var musicBus = null;      // 音乐总线，受音量与淡入淡出控制
  var themeGain = null;     // 当前主题的独立增益，切换时对它做淡出
  var current = null;       // 当前 createTrack 返回的句柄
  var currentTheme = null;
  var fadeTimer = null;

  var THEMES = {};          // name -> createTrack(ctx, dest)
  var DEFAULT_VOLUME = 0.55;
  var volume = DEFAULT_VOLUME;

  // 业火叠加层
  var wardNodes = [];
  var wardLevel = 0;

  function ensure() {
    if (ctx) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      musicBus = ctx.createGain();
      musicBus.gain.value = volume;
      musicBus.connect(ctx.destination);
      themeGain = ctx.createGain();
      themeGain.gain.value = 1;
      themeGain.connect(musicBus);
      return true;
    } catch (e) { return false; }
  }

  function clearWardLayer() {
    for (var i = 0; i < wardNodes.length; i++) {
      try { wardNodes[i].stop(); } catch (e) { }
      try { wardNodes[i].disconnect(); } catch (e) { }
    }
    wardNodes.length = 0;
  }

  // 业火越高，叠的低鸣越响、越低
  function buildWardLayer() {
    if (!ctx || wardLevel <= 0) return;
    var base = 73.42 / (1 + wardLevel * 0.04);   // 业火升高则基频下沉
    var g = ctx.createGain();
    g.gain.value = 0.012 + wardLevel * 0.014;
    g.connect(musicBus);
    // 两个略失谐的正弦，制造不谐和的拍
    [1, 1.018].forEach(function (r) {
      var o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = base * r;
      o.connect(g);
      o.start();
      wardNodes.push(o);
    });
    wardNodes.push(g);
  }

  var api = {
    // 注册一个主题
    register: function (name, fn) {
      if (typeof fn !== 'function') return false;
      THEMES[name] = fn;
      return true;
    },

    themes: function () { return Object.keys(THEMES); },

    init: function () {
      if (!ensure()) return false;
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { } }
      return true;
    },

    setVolume: function (v) {
      volume = B.clamp(v, 0, 1);
      if (musicBus) musicBus.gain.value = volume;
    },

    getVolume: function () { return volume; },
    currentTheme: function () { return currentTheme; },

    // 切换主题。fade 秒内淡出旧的、淡入新的。同名主题不重启。
    setTheme: function (name, fade) {
      if (name === currentTheme && current) return true;
      if (!ensure()) return false;
      var fn = THEMES[name];
      if (!fn) return false;

      fade = fade == null ? 0.8 : fade;
      api.stop(fade, true);   // 淡出旧的，但保留总线

      var target = ctx.currentTime + fade;
      themeGain.gain.cancelScheduledValues(ctx.currentTime);
      themeGain.gain.setValueAtTime(0.0001, ctx.currentTime);

      try {
        current = fn(ctx, themeGain);
      } catch (e) {
        current = null;
        return false;
      }
      currentTheme = name;

      themeGain.gain.cancelScheduledValues(target - 0.01);
      themeGain.gain.setValueAtTime(0.0001, target - 0.01);
      themeGain.gain.linearRampToValueAtTime(1, target + 1.2);
      return true;
    },

    // keepBus=true 时只停当前主题，不断总线
    stop: function (fade, keepBus) {
      fade = fade == null ? 0.6 : fade;
      if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null; }
      if (current && current.stop) { try { current.stop(); } catch (e) { } }
      current = null;
      currentTheme = null;
      if (ctx && themeGain && !keepBus) {
        themeGain.gain.cancelScheduledValues(ctx.currentTime);
        themeGain.gain.setValueAtTime(themeGain.gain.value, ctx.currentTime);
        themeGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + fade);
      }
    },

    // 业火变化时调用；只在跨档时重建叠加层
    setWard: function (n) {
      n = Math.max(0, n | 0);
      if (n === wardLevel) return;
      wardLevel = n;
      clearWardLayer();
      if (ensure() && n > 0) buildWardLayer();
    },

    wardLevel: function () { return wardLevel; },

    // 一次性提示音走这里（与音效总线隔开）
    suspend: function () {
      if (ctx && ctx.state === 'running') { try { ctx.suspend(); } catch (e) { } }
    },
    resume: function () {
      if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { } }
    }
  };

  B.music = api;
})();
