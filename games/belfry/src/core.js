/* 钟楼契约 BELL & BOND · core.js
   常量、数学、种子随机、粒子、存档。零依赖。 */
(function () {
  'use strict';

  var B = (window.Belfry = window.Belfry || {});

  // ---------- 逻辑分辨率 ----------
  // 512×288 = 32×18 格（16px tile，双整除，16:9）。
  // 原 640×360 一屏 40×22.5 格，角色只占屏高 4.4%，参照 Undertale 的 10%、星露谷的 9~12%，
  // 视角太远是「简陋感」的主因之一。512×288 后角色占 5.6%，整数倍取 2/3/5 均可。
  B.VIEW_W = 512;
  B.VIEW_H = 288;
  B.TILE = 16;

  // ---------- 世界尺寸（tile 数） ----------
  B.MAP_W = 48;
  B.MAP_H = 32;

  // ---------- 昼夜时长（秒） ----------
  B.PHASE_LEN = {
    dawn: 12,
    day: 150,
    dusk: 20,
    night: 150,
    settle: 14
  };

  B.TOTAL_DAYS = 14;

  // ---------- 数学 ----------
  B.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  B.lerp = function (a, b, t) { return a + (b - a) * t; };
  B.dist2 = function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  B.dist = function (ax, ay, bx, by) { return Math.sqrt(B.dist2(ax, ay, bx, by)); };
  B.angleTo = function (ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); };
  B.sign = function (v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); };

  // 角度差归一到 [-PI, PI]
  B.angDiff = function (a, b) {
    var d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };

  // ---------- 种子随机（mulberry32） ----------
  B.makeRng = function (seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  B.pick = function (rng, arr) { return arr[(rng() * arr.length) | 0]; };
  B.randRange = function (rng, a, b) { return a + rng() * (b - a); };
  B.randInt = function (rng, a, b) { return a + ((rng() * (b - a + 1)) | 0); };

  // ---------- 着色工具：hex -> rgb，乘色与混色 ----------
  B.hexToRgb = function (hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };
  B.rgbToHex = function (r, g, b) {
    var c = function (v) { v = B.clamp(v | 0, 0, 255); return (v < 16 ? '0' : '') + v.toString(16); };
    return '#' + c(r) + c(g) + c(b);
  };
  // 乘色：保留色相，压暗。夜晚转换用它而不是减亮度（减亮度会发灰）
  B.mulColor = function (hex, factor, tint) {
    var c = B.hexToRgb(hex);
    var r = c.r * factor, g = c.g * factor, b = c.b * factor;
    if (tint) { r = B.lerp(r, tint.r, tint.t); g = B.lerp(g, tint.g, tint.t); b = B.lerp(b, tint.b, tint.t); }
    return B.rgbToHex(r, g, b);
  };

  // ---------- 粒子系统 ----------
  function Particles() { this.list = []; }
  Particles.prototype.spawn = function (x, y, vx, vy, life, color, size) {
    if (this.list.length > 900) return;
    this.list.push({ x: x, y: y, vx: vx, vy: vy, life: life, max: life, color: color, size: size || 2 });
  };
  // 环形爆散
  Particles.prototype.burst = function (x, y, n, speed, color, life, size) {
    for (var i = 0; i < n; i++) {
      var a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      var s = speed * (0.45 + Math.random() * 0.8);
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.7), color, size);
    }
  };
  Particles.prototype.update = function (dt) {
    var l = this.list;
    for (var i = l.length - 1; i >= 0; i--) {
      var p = l[i];
      p.life -= dt;
      if (p.life <= 0) { l.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.92; p.vy *= 0.92;
    }
  };
  Particles.prototype.draw = function (ctx, cam) {
    var l = this.list;
    for (var i = 0; i < l.length; i++) {
      var p = l[i];
      var t = p.life / p.max;
      ctx.globalAlpha = t > 0.7 ? 1 : t / 0.7;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - cam.x), Math.round(p.y - cam.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  };
  Particles.prototype.clear = function () { this.list.length = 0; };
  B.Particles = Particles;

  // ---------- 飘字 ----------
  B.FloatText = function (x, y, text, color) {
    return { x: x, y: y, text: text, color: color || '#ffe9b0', life: 0.9, max: 0.9 };
  };

  // ---------- 存档 ----------
  var SAVE_KEY = 'belfry.save.v1';
  B.save = {
    read: function () {
      try {
        var raw = window.localStorage && window.localStorage.getItem(SAVE_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (e) { return {}; }
    },
    write: function (data) {
      try {
        if (!window.localStorage) return;
        var cur = B.save.read();
        for (var k in data) cur[k] = data[k];
        window.localStorage.setItem(SAVE_KEY, JSON.stringify(cur));
      } catch (e) { /* 无 localStorage 时静默降级 */ }
    }
  };

  // ---------- 事件总线（UI 与逻辑解耦） ----------
  // 注意：emit 必须遍历快照。如果监听器在回调里新增监听器（例如 restart 会重建 Game
  // 并重新注册），直接遍历活数组会一直往后走到新元素上，永远不结束。
  B.bus = (function () {
    var map = {};
    return {
      on: function (name, fn) { (map[name] = map[name] || []).push(fn); },
      off: function (name, fn) {
        var l = map[name];
        if (!l) return;
        var i = l.indexOf(fn);
        if (i !== -1) l.splice(i, 1);
      },
      emit: function (name, payload) {
        var l = map[name];
        if (!l || !l.length) return;
        var snap = l.slice();
        for (var i = 0; i < snap.length; i++) snap[i](payload);
      },
      clear: function () { map = {}; }
    };
  })();
})();
