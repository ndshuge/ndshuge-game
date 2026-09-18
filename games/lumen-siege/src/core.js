/* LUMEN SIEGE - core: constants, math helpers, deterministic RNG, particle pool. */
(function () {
  'use strict';
  var PG = (window.PG = window.PG || {});

  PG.VIEW_W = 480;
  PG.VIEW_H = 270;

  PG.TILE = 16;
  PG.WORLD_TW = 100;
  PG.WORLD_TH = 75;
  PG.WORLD_W = PG.WORLD_TW * PG.TILE;
  PG.WORLD_H = PG.WORLD_TH * PG.TILE;

  /* ---------- math ---------- */

  PG.clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };
  PG.lerp = function (a, b, t) { return a + (b - a) * t; };
  PG.dist = function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); };
  PG.dist2 = function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };

  /* Distance from a point to a line segment: used by the held beam. */
  PG.distToSegment = function (px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    var len2 = dx * dx + dy * dy;
    var t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    var cx = x1 + dx * t, cy = y1 + dy * t;
    return Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
  };

  /* Exponential smoothing that is independent of frame rate. */
  PG.damp = function (a, b, rate, dt) { return PG.lerp(a, b, 1 - Math.exp(-rate * dt)); };

  /* Shortest signed angular difference, in radians. */
  PG.angleDelta = function (from, to) {
    var d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };

  /* ---------- RNG (mulberry32: small, fast, seedable) ---------- */

  PG.Rng = function (seed) {
    this.s = (seed >>> 0) || 0x9e3779b9;
  };
  PG.Rng.prototype.next = function () {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    var t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  PG.Rng.prototype.range = function (a, b) { return a + this.next() * (b - a); };
  PG.Rng.prototype.int = function (a, b) { return Math.floor(this.range(a, b + 1)); };
  PG.Rng.prototype.pick = function (arr) { return arr[this.int(0, arr.length - 1)]; };

  PG.rng = new PG.Rng((Date.now() ^ 0x5f3759df) >>> 0);

  PG.rand = function (a, b) { return PG.rng.range(a, b); };
  PG.randInt = function (a, b) { return PG.rng.int(a, b); };
  PG.randDir = function () { var a = PG.rng.range(0, Math.PI * 2); return { x: Math.cos(a), y: Math.sin(a) }; };

  /* ---------- particles ---------- */

  PG.Particle = function () {
    this.active = false;
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.life = 0; this.max = 1;
    this.size = 1; this.color = '#fff';
    this.drag = 0.9; this.glow = false;
  };

  PG.Particles = function (cap) {
    this.cap = cap || 900;
    this.items = [];
    for (var i = 0; i < this.cap; i++) this.items.push(new PG.Particle());
    this.cursor = 0;
  };

  PG.Particles.prototype.spawn = function (x, y, vx, vy, life, size, color, opts) {
    /* Ring-buffer: when we run out, the oldest particle is recycled. */
    var p = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.cap;
    p.active = true;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = p.max = life;
    p.size = size; p.color = color;
    p.drag = (opts && opts.drag) || 0.88;
    p.glow = !!(opts && opts.glow);
    return p;
  };

  PG.Particles.prototype.update = function (dt) {
    for (var i = 0; i < this.cap; i++) {
      var p = this.items[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      var d = Math.pow(p.drag, dt * 60);
      p.vx *= d; p.vy *= d;
    }
  };

  PG.Particles.prototype.draw = function (ctx, camX, camY) {
    for (var i = 0; i < this.cap; i++) {
      var p = this.items[i];
      if (!p.active) continue;
      var a = p.life / p.max;
      ctx.globalAlpha = a < 0.35 ? a / 0.35 : 1;
      ctx.fillStyle = p.color;
      var s = Math.max(1, Math.round(p.size * (0.5 + a * 0.5)));
      ctx.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), s, s);
    }
    ctx.globalAlpha = 1;
  };

  /* ---------- misc ---------- */

  PG.fmtTime = function (seconds) {
    var s = Math.max(0, Math.floor(seconds));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  };

  PG.store = {
    get: function (key, fallback) {
      try {
        var raw = window.localStorage.getItem(key);
        if (raw === null) return fallback;
        var parsed = JSON.parse(raw);
        return parsed === null || parsed === undefined ? fallback : parsed;
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage disabled */ }
    }
  };
})();
