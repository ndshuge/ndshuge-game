/* 钟楼契约 · atlas.js
   外部素材层：加载 Kenney Tiny 系列图集（CC0），做一次轻度调色后缓存成离屏 canvas，
   供 tiles.js / sprites.js 按索引切图。

   素材来源与许可：
     Kenney · Tiny Town / Tiny Farm / Tiny Dungeon
     https://kenney.nl/assets/tiny-town  ·  Tiny Farm  ·  Tiny Dungeon
     License: Creative Commons CC0 1.0（公共领域，可商用，无需署名）
     16×16 tile，图集 192×176，12 列 11 行。

   调色理由：Kenney 原色是明快的卡通风。本作基调冷郁，所以做一次轻度变换
   （降饱和 18%、明度压缩、按色相轻微偏冷），保住它的像素细节，又贴回游戏的世界观。
   夜晚的压暗不由这里负责，交给渲染层的乘色层。 */
(function () {
  'use strict';
  var B = window.Belfry;

  var COLS = 12, ROWS = 11, TS = 16;

  var PACKS = {
    town: { src: 'assets/town.png', img: null, canvas: null },
    farm: { src: 'assets/farm.png', img: null, canvas: null },
    dungeon: { src: 'assets/dungeon.png', img: null, canvas: null }
  };

  var loaded = 0, total = 0, failed = 0;

  // ---------- 颜色变换 ----------
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    var d = max - min;
    if (d > 1e-6) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return [h, s, l];
  }

  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }

  function hsl2rgb(h, s, l) {
    if (s < 1e-6) { var v = Math.round(l * 255); return [v, v, v]; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    return [
      Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
      Math.round(hue2rgb(p, q, h) * 255),
      Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
    ];
  }

  // 轻度中世纪化。数值来自美术指导：s×0.92（原来 0.82 太灰）、亮度上限提到 0.82。
  // 绿色系往黄绿偏（星露谷那种暖草），蓝色系往青灰偏。
  function grade(r, g, b) {
    var hsl = rgb2hsl(r, g, b);
    var h = hsl[0], s = hsl[1], l = hsl[2];

    s *= 0.92;
    l = 0.06 + l * 0.88;
    if (l > 0.82) l = 0.82 + (l - 0.82) * 0.5;

    var deg = h * 360;
    if (deg > 80 && deg < 170) { h += (95 - deg) * 0.00035; s *= 1.02; }
    else if (deg >= 170 && deg < 280) { h += (210 - deg) * 0.00022; s *= 0.94; }

    return hsl2rgb((h % 1 + 1) % 1, Math.min(1, s), Math.max(0, Math.min(1, l)));
  }

  function process(pack) {
    var img = pack.img;
    var c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    var g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    var data;
    try {
      data = g.getImageData(0, 0, c.width, c.height);
    } catch (e) {
      // 某些环境下 file:// 会禁 getImageData，那就退化成原图不调色
      pack.canvas = c;
      return;
    }
    var d = data.data;
    for (var i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;
      var out = grade(d[i], d[i + 1], d[i + 2]);
      d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2];
    }
    try { g.putImageData(data, 0, 0); } catch (e) { }
    pack.canvas = c;
  }

  var api = {
    COLS: COLS, ROWS: ROWS, TILE: TS,

    load: function (onDone) {
      var names = Object.keys(PACKS);
      total = names.length;
      loaded = 0; failed = 0;
      // 无 Image 的环境（无头测试 / 极端降级）：直接报失败，调用方退回程序化绘制
      if (typeof Image === 'undefined') {
        failed = total;
        if (onDone) onDone(failed);
        return;
      }
      names.forEach(function (name) {
        var pack = PACKS[name];
        var img = new Image();
        img.onload = function () {
          pack.img = img;
          process(pack);
          loaded++;
          if (loaded + failed >= total && onDone) onDone(failed);
        };
        img.onerror = function () {
          failed++;
          if (loaded + failed >= total && onDone) onDone(failed);
        };
        img.src = pack.src;
      });
    },

    ready: function () { return loaded + failed >= total && total > 0; },
    failedCount: function () { return failed; },
    has: function (name) { return !!(PACKS[name] && PACKS[name].canvas); },

    // 按索引切一格画到 ctx
    draw: function (ctx, name, index, x, y, night) {
      var pack = PACKS[name];
      if (!pack || !pack.canvas) return false;
      var sx = (index % COLS) * TS, sy = ((index / COLS) | 0) * TS;
      ctx.drawImage(pack.canvas, sx, sy, TS, TS, Math.round(x), Math.round(y), TS, TS);
      void night;
      return true;
    },

    // 取出一格作为独立 canvas（给精灵用）
    slice: function (name, index) {
      var pack = PACKS[name];
      if (!pack || !pack.canvas) return null;
      var sx = (index % COLS) * TS, sy = ((index / COLS) | 0) * TS;
      var c = document.createElement('canvas');
      c.width = TS; c.height = TS;
      var g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(pack.canvas, sx, sy, TS, TS, 0, 0, TS, TS);
      return c;
    }
  };

  B.atlas = api;
})();
