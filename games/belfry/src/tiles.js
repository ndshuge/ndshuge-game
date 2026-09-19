/* 钟楼契约 · tiles.js
   地图布局、地块网格、地面烘焙、碰撞。

   v2 美术升级（2026-09-18）：
     1. 每个基础 tile 有多个变体，按坐标哈希确定性选择，消除"重复贴图"感
     2. AO 环境光遮蔽：邻接实心块的地面内侧压暗两段，地形有厚度
     3. 交界过渡：草地与土/路相接处画不规则咬合边
     4. 装饰密度与种类提升（草丛 / 花 / 碎石 / 木桩 / 蘑菇 / 干裂）
     5. 墙面加砖缝与顶面亮条，树加体积感 */
(function () {
  'use strict';
  var B = window.Belfry;
  var T = B.TILE;

  var TT = {
    GRASS: 0, GRASS2: 1, PATH: 2, SOIL: 3, TILLED: 4, WATER: 5,
    WALL: 6, TREE: 7, STONE: 8, CRACK: 9, PLANK: 10, CRYPT: 11
  };
  B.TT = TT;

  var SOLID = {};
  SOLID[TT.WALL] = true; SOLID[TT.TREE] = true; SOLID[TT.WATER] = true;

  var DECO_NONE = 0, DECO_TUFT = 1, DECO_ROCK = 2, DECO_FLOWER = 3,
    DECO_STUMP = 4, DECO_MUSHROOM = 5, DECO_PEBBLE = 6, DECO_CRACK = 7, DECO_BUSH = 8;

  // 确定性哈希：同一坐标永远同一变体，不会每帧闪
  function hash(x, y, salt) {
    var n = (x * 374761393 + y * 668265263 + (salt || 0) * 1274126177) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  function Map(seed) {
    this.w = B.MAP_W;
    this.h = B.MAP_H;
    this.seed = seed >>> 0;
    this.rng = B.makeRng(this.seed);
    this.tiles = new Uint8Array(this.w * this.h);
    this.deco = new Uint8Array(this.w * this.h);
    this.cracks = [];
    this.baked = null;
    this.build();
  }

  Map.prototype.idx = function (x, y) { return y * this.w + x; };
  Map.prototype.get = function (x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return TT.WALL;
    return this.tiles[this.idx(x, y)];
  };
  Map.prototype.set = function (x, y, v) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.tiles[this.idx(x, y)] = v;
  };
  Map.prototype.solidAt = function (x, y) { return !!SOLID[this.get(x, y)]; };
  Map.prototype.solidPx = function (px, py) {
    return this.solidAt(Math.floor(px / T), Math.floor(py / T));
  };

  Map.prototype.build = function () {
    var rng = this.rng, x, y, i, r;

    // 底色全草，装饰不在此撒。装饰改成后面的成簇放置
    for (y = 0; y < this.h; y++) {
      for (x = 0; x < this.w; x++) {
        i = this.idx(x, y);
        this.tiles[i] = rng() < 0.5 ? TT.GRASS : TT.GRASS2;
        this.deco[i] = DECO_NONE;
      }
    }

    // 外圈围墙
    for (y = 0; y < this.h; y++) {
      for (x = 0; x < this.w; x++) {
        if (x < 3 || y < 3 || x >= this.w - 3 || y >= this.h - 3) {
          this.tiles[this.idx(x, y)] = TT.WALL;
          this.deco[this.idx(x, y)] = DECO_NONE;
        }
      }
    }

    // 农场区
    this.farmRect = { x0: 5, y0: 9, x1: 21, y1: 25 };
    for (y = this.farmRect.y0; y <= this.farmRect.y1; y++) {
      for (x = this.farmRect.x0; x <= this.farmRect.x1; x++) {
        i = this.idx(x, y);
        this.tiles[i] = TT.SOIL;
        r = rng();
        this.deco[i] = r < 0.05 ? DECO_ROCK : (r < 0.09 ? DECO_CRACK : DECO_NONE);
      }
    }

    for (x = 3; x < this.w - 3; x++) this.setAlong(x, 17, TT.PATH);
    for (y = 6; y < this.h - 3; y++) this.setAlong(23, y, TT.PATH);

    // 镇子广场：散装草地，不要棋盘
    for (y = 13; y <= 27; y++) {
      for (x = 25; x <= 44; x++) {
        i = this.idx(x, y);
        this.tiles[i] = (rng() < 0.42) ? TT.PATH : TT.GRASS;
        this.deco[i] = DECO_NONE;
      }
    }

    this.house = { x: 25, y: 8, w: 4, h: 4 };
    this.smithy = { x: 31, y: 8, w: 4, h: 4 };
    this.stamp(this.house);
    this.stamp(this.smithy);

    this.belfry = { x: 27, y: 20, w: 5, h: 5 };
    for (y = this.belfry.y; y < this.belfry.y + this.belfry.h; y++) {
      for (x = this.belfry.x; x < this.belfry.x + this.belfry.w; x++) {
        var edge = (x === this.belfry.x || y === this.belfry.y ||
          x === this.belfry.x + this.belfry.w - 1 || y === this.belfry.y + this.belfry.h - 1);
        this.tiles[this.idx(x, y)] = edge ? TT.WALL : TT.STONE;
        this.deco[this.idx(x, y)] = DECO_NONE;
      }
    }
    this.setAlong(this.belfry.x + 2, this.belfry.y, TT.STONE);

    for (y = 26; y <= 28; y++) {
      for (x = 38; x <= 44; x++) {
        if (rng() < 0.72) {
          this.tiles[this.idx(x, y)] = TT.CRACK;
          this.deco[this.idx(x, y)] = DECO_NONE;
        }
      }
    }
    this.cracks.push({ x: 41 * T, y: 27 * T });

    // 树林：改成一簇一簇的连株带，禁孤树
    for (i = 0; i < 9; i++) {
      var bx = B.randInt(rng, 4, this.w - 6);
      var by = B.randInt(rng, 4, this.h - 6);
      if (bx >= 23 && by >= 6 && by <= 28) continue;   // 让开镇子与钟楼
      var band = 2 + ((rng() * 3) | 0);                 // 2~4 连株
      for (var s = 0; s < band; s++) {
        var tx = bx + s, ty = by;
        var cur = this.tiles[this.idx(tx, ty)];
        if (cur !== TT.GRASS && cur !== TT.GRASS2) continue;
        if (this.nearPath(tx, ty, 2)) continue;
        this.tiles[this.idx(tx, ty)] = TT.TREE;
        this.deco[this.idx(tx, ty)] = DECO_NONE;
      }
    }

    // ---- 成簇装饰：7×7 网格撒簇心，簇内密、簇外近乎空 ----
    scatterDeco(this, rng);
  };

  // 成簇装饰。规则（来自美术指导）：
  //   7×7 网格，hash<0.38 放簇心；簇内距心 ≤2 概率 0.55、边缘 0.25；簇外基础概率 0.015
  //   路边 2 格内密度 ×2.5；同型不连续超过 2 格；农场与夜战区留白
  var DECO_KINDS = [DECO_TUFT, DECO_FLOWER, DECO_PEBBLE, DECO_MUSHROOM, DECO_ROCK, DECO_TUFT, DECO_FLOWER];

  function scatterDeco(map, rng) {
    var CL = 7, W = map.w, H = map.h;
    for (var cy = 0; cy < H; cy += CL) {
      for (var cx = 0; cx < W; cx += CL) {
        var isCore = hash(cx, cy, 501) < 0.38;
        var mx = cx + 3, my = cy + 3;
        for (var y = cy; y < Math.min(cy + CL, H); y++) {
          for (var x = cx; x < Math.min(cx + CL, W); x++) {
            var t = map.tiles[map.idx(x, y)];
            if (t !== TT.GRASS && t !== TT.GRASS2) continue;
            // 农场与夜战区（裂口附近）不撒，保战斗可读性
            if (y >= map.farmRect.y0 && y <= map.farmRect.y1 &&
              x >= map.farmRect.x0 && x <= map.farmRect.x1) continue;
            if (x >= 36 && y >= 24) continue;

            var d = Math.max(Math.abs(x - mx), Math.abs(y - my));
            var p = isCore ? (d <= 2 ? 0.55 : 0.22) : 0.015;
            if (map.nearPath(x, y, 2)) p *= 2.5;
            if (rng() > p) continue;

            // 同型不连续超过 2 格
            var kind = DECO_KINDS[(hash(x, y, 601) * DECO_KINDS.length) | 0];
            var l1 = x >= 1 ? map.deco[map.idx(x - 1, y)] : 0;
            var l2 = x >= 2 ? map.deco[map.idx(x - 2, y)] : 0;
            var u1 = y >= 1 ? map.deco[map.idx(x, y - 1)] : 0;
            if (kind === l1 && kind === l2) kind = kind === DECO_TUFT ? DECO_FLOWER : DECO_TUFT;
            if (kind === u1 && kind === (y >= 2 ? map.deco[map.idx(x, y - 2)] : 0)) {
              kind = kind === DECO_PEBBLE ? DECO_ROCK : DECO_PEBBLE;
            }
            map.deco[map.idx(x, y)] = kind;
          }
        }
      }
    }

    // 农场边的灌木带，给场景加轮廓
    var fr = map.farmRect;
    for (var bx = fr.x0 - 1; bx <= fr.x1 + 1; bx++) {
      if (hash(bx, fr.y0 - 1, 7) < 0.42) map.deco[map.idx(bx, fr.y0 - 1)] = DECO_BUSH;
    }
    for (var by = fr.y0; by <= fr.y1; by++) {
      if (hash(fr.x1 + 1, by, 9) < 0.42) map.deco[map.idx(fr.x1 + 1, by)] = DECO_BUSH;
    }
  }

  Map.prototype.setAlong = function (x, y, v) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    var i = this.idx(x, y);
    if (this.tiles[i] === TT.WALL || this.tiles[i] === TT.TREE) return;
    this.tiles[i] = v;
    this.deco[i] = DECO_NONE;
  };

  Map.prototype.nearPath = function (x, y, r) {
    for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
      if (this.get(x + dx, y + dy) === TT.PATH) return true;
    }
    return false;
  };

  Map.prototype.stamp = function (b) {
    for (var y = b.y; y < b.y + b.h; y++) {
      for (var x = b.x; x < b.x + b.w; x++) {
        var edge = (x === b.x || y === b.y || x === b.x + b.w - 1 || y === b.y + b.h - 1);
        this.tiles[this.idx(x, y)] = edge ? TT.WALL : TT.PLANK;
        this.deco[this.idx(x, y)] = DECO_NONE;
      }
    }
  };

  /* ============================================================
     地面烘焙
     ============================================================ */
  Map.prototype.bake = function () {
    var w = this.w * T, h = this.h * T;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    var P = B.pal.farm, C = B.pal.crypt;

    var self = this, x, y, i;
    // 图集可用则地面走 Kenney 素材，不可用退回程序化绘制
    var useAtlas = !!(B.atlas && B.atlas.has('town'));

    // ---- 第一遍：地形本体 ----
    for (y = 0; y < this.h; y++) {
      for (x = 0; x < this.w; x++) {
        i = this.idx(x, y);
        var t = this.tiles[i], d = this.deco[i];
        var px = x * T, py = y * T;
        var v = hash(x, y, 1);

        if (useAtlas) {
          this.drawAtlasTile(g, t, x, y, px, py);
        } else switch (t) {
          case TT.GRASS: case TT.GRASS2:
            g.fillStyle = P.grassA;
            g.fillRect(px, py, T, T);
            // 棋盘微差（专项做法：半透明白 0.018 叠）
            if ((x + y) & 1) { g.fillStyle = 'rgba(255,255,255,0.018)'; g.fillRect(px, py, T, T); }
            // 三档草纹，位置随变体
            g.fillStyle = P.grassB;
            g.fillRect(px + ((v * 12) | 0), py + ((hash(x, y, 2) * 12) | 0), 2, 1);
            g.fillStyle = P.grassC;
            g.fillRect(px + ((hash(x, y, 3) * 13) | 0), py + ((hash(x, y, 4) * 13) | 0), 1, 2);
            if (v > 0.78) { g.fillStyle = P.leafB; g.fillRect(px + 4, py + 10, 1, 3); g.fillRect(px + 5, py + 11, 1, 2); }
            break;

          case TT.PATH:
            g.fillStyle = P.path;
            g.fillRect(px, py, T, T);
            g.fillStyle = P.pathD;
            for (var s = 0; s < 3; s++) {
              var sx = (hash(x, y, 10 + s) * 12) | 0, sy = (hash(x, y, 20 + s) * 12) | 0;
              g.fillRect(px + sx, py + sy, 2, 1);
            }
            g.fillStyle = 'rgba(0,0,0,0.06)';
            g.fillRect(px, py, T, 1);
            break;

          case TT.SOIL:
            g.fillStyle = P.soilA;
            g.fillRect(px, py, T, T);
            g.fillStyle = P.soilB;
            g.fillRect(px + ((v * 10) | 0), py + ((hash(x, y, 5) * 10) | 0), 5, 2);
            g.fillStyle = 'rgba(0,0,0,0.07)';
            g.fillRect(px, py + T - 1, T, 1);
            break;

          case TT.TILLED:
            g.fillStyle = P.tilled;
            g.fillRect(px, py, T, T);
            g.fillStyle = P.soilB;
            for (var fy = 2; fy < T; fy += 4) g.fillRect(px, py + fy, T, 1);
            g.fillStyle = 'rgba(0,0,0,0.16)';
            g.fillRect(px, py + 1, T, 1);
            g.fillRect(px, py + 5, T, 1);
            g.fillRect(px, py + 9, T, 1);
            g.fillRect(px, py + 13, T, 1);
            break;

          case TT.WATER:
            g.fillStyle = C.miasma;
            g.fillRect(px, py, T, T);
            g.fillStyle = C.miasmaSoft;
            g.fillRect(px + 2, py + 6, 8, 1);
            g.fillRect(px + 6, py + 12, 6, 1);
            break;

          case TT.WALL: {
            var topFace = !self.solidAt(x, y - 1);
            g.fillStyle = P.stoneB;
            g.fillRect(px, py, T, T);
            // 砖缝：错缝排布
            g.fillStyle = 'rgba(0,0,0,0.22)';
            for (var by = 0; by < T; by += 5) {
              g.fillRect(px, py + by, T, 1);
            }
            var off = ((y / 5) | 0) % 2 ? 0 : 8;
            g.fillStyle = 'rgba(0,0,0,0.18)';
            g.fillRect(px + off, py, 1, 5);
            g.fillRect(px + ((off + 8) % 16), py + 5, 1, 5);
            g.fillRect(px + off, py + 10, 1, 5);
            g.fillStyle = P.stoneA;
            g.fillRect(px + 1, py + 1, T - 2, 1);
            if (topFace) {
              g.fillStyle = P.stoneC;
              g.fillRect(px, py, T, 2);
              g.fillStyle = 'rgba(255,255,255,0.10)';
              g.fillRect(px, py, T, 1);
            }
            break;
          }

          case TT.TREE: {
            g.fillStyle = P.grassB; g.fillRect(px, py, T, T);
            // 树干
            g.fillStyle = P.woodB; g.fillRect(px + 7, py + 9, 3, 7);
            g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(px + 7, py + 9, 1, 7);
            // 冠层：三层错位，带亮部
            g.fillStyle = P.leafB;
            g.fillRect(px + 2, py + 2, 12, 9);
            g.fillRect(px + 1, py + 4, 14, 5);
            g.fillStyle = P.leafA;
            g.fillRect(px + 3, py + 3, 9, 3);
            g.fillRect(px + 4, py + 6, 5, 2);
            g.fillStyle = 'rgba(0,0,0,0.22)';
            g.fillRect(px + 2, py + 10, 12, 1);
            break;
          }

          case TT.STONE:
            g.fillStyle = P.stoneC; g.fillRect(px, py, T, T);
            g.fillStyle = P.stoneA; g.fillRect(px, py + T - 3, T, 3);
            g.fillStyle = 'rgba(0,0,0,0.10)';
            g.fillRect(px, py + 8, T, 1);
            break;

          case TT.PLANK:
            g.fillStyle = P.woodB; g.fillRect(px, py, T, T);
            g.fillStyle = P.woodA; g.fillRect(px, py + 1, T, 6); g.fillRect(px, py + 9, T, 6);
            g.fillStyle = P.woodC; g.fillRect(px, py + 1, T, 1); g.fillRect(px, py + 9, T, 1);
            g.fillStyle = 'rgba(0,0,0,0.20)';
            g.fillRect(px, py + 7, T, 1); g.fillRect(px, py + 15, T, 1);
            break;

          case TT.CRACK:
            g.fillStyle = C.floorB; g.fillRect(px, py, T, T);
            g.fillStyle = C.floorC;
            g.fillRect(px + 2, py + 3, 4, 2); g.fillRect(px + 8, py + 8, 5, 2);
            g.fillStyle = 'rgba(0,0,0,0.28)';
            g.fillRect(px + 4, py + 6, 1, 4); g.fillRect(px + 11, py + 2, 1, 3);
            break;

          case TT.CRYPT:
            g.fillStyle = C.floorA; g.fillRect(px, py, T, T);
            break;
        }

        // ---- 装饰叠加 ----
        if (d !== DECO_NONE) this.drawDeco(g, px, py, d, x, y, v);
      }
    }

    // ---- 第二、三遍（过渡与 AO）只服务于程序化绘制；
    //      走图集时不能叠，否则两套调色板打架，画面发脏 ----
    if (!useAtlas) {
      for (y = 0; y < this.h; y++) {
        for (x = 0; x < this.w; x++) {
          var tt = this.tiles[this.idx(x, y)];
          if (tt !== TT.SOIL && tt !== TT.PATH) continue;
          var above = this.get(x, y - 1);
          if (above === TT.GRASS || above === TT.GRASS2) {
            g.fillStyle = P.grassA;
            for (var bx = 0; bx < T; bx += 2) {
              var depth = 1 + ((hash(x, y, 30 + bx) * 3) | 0);
              g.fillRect(x * T + bx, y * T, 2, depth);
            }
            g.fillStyle = 'rgba(0,0,0,0.10)';
            g.fillRect(x * T, y * T + 3, T, 1);
          }
          var left = this.get(x - 1, y);
          if (left === TT.GRASS || left === TT.GRASS2) {
            g.fillStyle = P.grassA;
            for (var byy = 0; byy < T; byy += 2) {
              g.fillRect(x * T, y * T + byy, 1 + ((hash(x, y, 40 + byy) * 3) | 0), 2);
            }
          }
        }
      }

      // ---- 第三遍：AO 环境光遮蔽。让墙根、树下有厚度 ----
      for (y = 0; y < this.h; y++) {
        for (x = 0; x < this.w; x++) {
          if (this.solidAt(x, y)) continue;
          var px2 = x * T, py2 = y * T;
          var A1 = 'rgba(0,0,0,0.26)', A2 = 'rgba(0,0,0,0.12)';
          if (this.solidAt(x, y - 1)) {
            g.fillStyle = A1; g.fillRect(px2, py2, T, 2);
            g.fillStyle = A2; g.fillRect(px2, py2 + 2, T, 2);
          }
          if (this.solidAt(x, y + 1)) {
            g.fillStyle = A1; g.fillRect(px2, py2 + T - 2, T, 2);
            g.fillStyle = A2; g.fillRect(px2, py2 + T - 4, T, 2);
          }
          if (this.solidAt(x - 1, y)) {
            g.fillStyle = A1; g.fillRect(px2, py2, 2, T);
            g.fillStyle = A2; g.fillRect(px2 + 2, py2, 2, T);
          }
          if (this.solidAt(x + 1, y)) {
            g.fillStyle = A1; g.fillRect(px2 + T - 2, py2, 2, T);
            g.fillStyle = A2; g.fillRect(px2 + T - 4, py2, 2, T);
          }
          if (this.solidAt(x - 1, y - 1)) { g.fillStyle = A2; g.fillRect(px2, py2, 3, 3); }
          if (this.solidAt(x + 1, y - 1)) { g.fillStyle = A2; g.fillRect(px2 + T - 3, py2, 3, 3); }
          if (this.solidAt(x - 1, y + 1)) { g.fillStyle = A2; g.fillRect(px2, py2 + T - 3, 3, 3); }
          if (this.solidAt(x + 1, y + 1)) { g.fillStyle = A2; g.fillRect(px2 + T - 3, py2 + T - 3, 3, 3); }
        }
      }
    }

    // ---- 第四遍：静态世界物烘进地面，不再每帧重画 ----
    // 墓穴裂口：软边径向光晕（以前是 52×24 硬边色块）
    var ccx = 41 * T + 8, ccy = 27 * T + 8, ccr = 46;
    if (g.createRadialGradient) {
      var mg = g.createRadialGradient(ccx, ccy, 0, ccx, ccy, ccr);
      mg.addColorStop(0, 'rgba(176,80,35,0.55)');
      mg.addColorStop(0.55, 'rgba(176,80,35,0.20)');
      mg.addColorStop(1, 'rgba(176,80,35,0)');
      g.fillStyle = mg;
      g.fillRect(ccx - ccr, ccy - ccr, ccr * 2, ccr * 2);
    }

    // 钟楼门：双扇木门 + 门框
    var bfx = (this.belfry.x + 2) * T + 2, bfy = this.belfry.y * T;
    g.fillStyle = P.woodB;
    g.fillRect(bfx, bfy, 12, T);
    g.fillStyle = P.woodA;
    g.fillRect(bfx + 1, bfy + 1, 4, T - 2);
    g.fillRect(bfx + 7, bfy + 1, 4, T - 2);
    g.fillStyle = P.stoneC;
    g.fillRect(bfx, bfy, 12, 3);
    g.fillStyle = C.ember;
    g.fillRect(bfx + 3, bfy + 9, 2, 2);
    g.fillRect(bfx + 8, bfy + 9, 2, 2);

    // 铁匠铺炉火：带光晕的火口
    var ffx = this.smithy.x * T + 6, ffy = (this.smithy.y + this.smithy.h - 1) * T + 4;
    if (g.createRadialGradient) {
      var fg = g.createRadialGradient(ffx + 5, ffy + 5, 0, ffx + 5, ffy + 5, 22);
      fg.addColorStop(0, 'rgba(255,176,102,0.55)');
      fg.addColorStop(1, 'rgba(255,140,66,0)');
      g.fillStyle = fg;
      g.fillRect(ffx - 17, ffy - 17, 44, 44);
    }
    g.fillStyle = C.emberOuter; g.fillRect(ffx, ffy, 10, 10);
    g.fillStyle = C.emberDeep; g.fillRect(ffx + 1, ffy + 1, 8, 8);
    g.fillStyle = C.ember; g.fillRect(ffx + 3, ffy + 3, 4, 4);
    g.fillStyle = C.holyBolt; g.fillRect(ffx + 4, ffy + 4, 2, 2);

    // 墙顶受光与底部压暗：图集 tile 自身没有顶面高光
    for (y = 0; y < this.h; y++) {
      for (x = 0; x < this.w; x++) {
        if (this.tiles[this.idx(x, y)] !== TT.WALL) continue;
        if (this.solidAt(x, y - 1)) continue;
        g.fillStyle = 'rgba(255,246,222,0.16)';
        g.fillRect(x * T, y * T, T, 2);
        g.fillStyle = 'rgba(0,0,0,0.26)';
        g.fillRect(x * T, y * T + T - 2, T, 2);
      }
    }

    // ---- 第五遍：焦点道具。每 20×12 格视野恰有一个≥ 2×2 格的视觉焦点 ----
    // 农场中央的水井
    this.well = { x: 13, y: 12 };
    (function (gx, gy) {
      var wx = gx * T, wy = gy * T;
      // 石圈
      g.fillStyle = P.stoneB; g.fillRect(wx - 2, wy - 2, T + 4, T + 4);
      g.fillStyle = P.stoneA; g.fillRect(wx, wy, T, T);
      g.fillStyle = P.stoneC; g.fillRect(wx, wy, T, 2);
      // 井口
      g.fillStyle = '#1b2029'; g.fillRect(wx + 3, wy + 3, T - 6, T - 6);
      g.fillStyle = C.miasma; g.fillRect(wx + 4, wy + 4, T - 8, T - 8);
      g.fillStyle = C.miasmaSoft; g.fillRect(wx + 6, wy + 8, 4, 1);
      // 木架与横梁
      g.fillStyle = P.woodB; g.fillRect(wx + 2, wy - 9, 2, 9); g.fillRect(wx + 12, wy - 9, 2, 9);
      g.fillStyle = P.woodA; g.fillRect(wx + 1, wy - 11, 14, 3);
      g.fillStyle = P.woodC; g.fillRect(wx + 1, wy - 11, 14, 1);
      // 绳与桶
      g.fillStyle = '#c4b795'; g.fillRect(wx + 7, wy - 8, 1, 6);
      g.fillStyle = P.woodB; g.fillRect(wx + 5, wy - 2, 5, 4);
      g.fillStyle = P.woodA; g.fillRect(wx + 5, wy - 2, 5, 1);
      // 底部投影
      g.fillStyle = 'rgba(20,16,10,0.22)';
      g.fillRect(wx - 1, wy + T + 1, T + 2, 2);
    })(13, 12);

    // 镇子广场的石碑
    (function (gx, gy) {
      var sx = gx * T, sy = gy * T;
      g.fillStyle = P.stoneB; g.fillRect(sx + 2, sy + 6, 12, 10);
      g.fillStyle = P.stoneA; g.fillRect(sx + 3, sy + 4, 10, 12);
      g.fillStyle = P.stoneC; g.fillRect(sx + 3, sy + 4, 10, 2);
      g.fillStyle = 'rgba(0,0,0,0.30)';
      g.fillRect(sx + 5, sy + 8, 6, 1); g.fillRect(sx + 5, sy + 11, 4, 1);
      g.fillStyle = 'rgba(20,16,10,0.22)';
      g.fillRect(sx + 1, sy + 16, 14, 2);
    })(33, 22);

    return c;
  };

  // 图集映射：每个地块类型给一组候选索引，按坐标哈希确定性选一个
  // 索引来自对三个图集的逐格分析（均色 / 填充率），不是猜的
  var ATLAS_TILE = {};
  ATLAS_TILE[TT.GRASS] = [['town', 0], ['town', 1], ['town', 2]];
  ATLAS_TILE[TT.GRASS2] = [['town', 43], ['town', 2], ['town', 1]];
  ATLAS_TILE[TT.PATH] = [['town', 12], ['town', 13], ['town', 14]];
  ATLAS_TILE[TT.SOIL] = [['farm', 12], ['farm', 13], ['farm', 24]];
  ATLAS_TILE[TT.TILLED] = [['farm', 36], ['farm', 37]];
  ATLAS_TILE[TT.WATER] = [['town', 48], ['town', 49]];
  ATLAS_TILE[TT.WALL] = [['dungeon', 0], ['dungeon', 1], ['dungeon', 2]];
  ATLAS_TILE[TT.STONE] = [['dungeon', 36], ['dungeon', 37]];
  ATLAS_TILE[TT.CRACK] = [['dungeon', 9], ['dungeon', 10]];
  ATLAS_TILE[TT.PLANK] = [['town', 72], ['town', 73]];
  ATLAS_TILE[TT.CRYPT] = [['dungeon', 40]];

  Map.prototype.drawAtlasTile = function (g, t, x, y, px, py) {
    var cand = ATLAS_TILE[t];
    if (!cand) return;
    // 变体盐按地块类型区分，避免不同材质在同一条格线上相位对齐
    var pick = cand[(hash(x, y, 77 + t * 13) * cand.length) | 0];
    B.atlas.draw(g, pick[0], pick[1], px, py);
  };

  Map.prototype.drawDeco = function (g, px, py, d, x, y, v) {
    var P = B.pal.farm, C = B.pal.crypt;
    switch (d) {
      case DECO_TUFT:
        g.fillStyle = P.grassC;
        g.fillRect(px + 4, py + 9, 1, 3);
        g.fillRect(px + 6, py + 8, 1, 4);
        g.fillRect(px + 8, py + 10, 1, 2);
        g.fillStyle = P.leafB;
        g.fillRect(px + 7, py + 11, 1, 2);
        break;
      case DECO_FLOWER:
        g.fillStyle = P.leafB; g.fillRect(px + 7, py + 9, 1, 4);
        g.fillStyle = v > 0.5 ? P.ashwheat[2] : P.moongrape[2];
        g.fillRect(px + 6, py + 7, 3, 2);
        g.fillStyle = '#fff3b8'; g.fillRect(px + 7, py + 7, 1, 1);
        break;
      case DECO_PEBBLE:
        g.fillStyle = P.stoneB; g.fillRect(px + 5, py + 10, 3, 2);
        g.fillStyle = P.stoneA; g.fillRect(px + 6, py + 10, 1, 1);
        break;
      case DECO_ROCK:
        g.fillStyle = P.stoneB; g.fillRect(px + 4, py + 7, 8, 5);
        g.fillStyle = P.stoneA; g.fillRect(px + 5, py + 6, 5, 3);
        g.fillStyle = P.stoneC; g.fillRect(px + 6, py + 6, 2, 1);
        g.fillStyle = 'rgba(0,0,0,0.30)'; g.fillRect(px + 4, py + 11, 8, 1);
        break;
      case DECO_CRACK:
        g.fillStyle = 'rgba(0,0,0,0.20)';
        g.fillRect(px + 3, py + 4, 6, 1); g.fillRect(px + 8, py + 5, 1, 4);
        g.fillRect(px + 5, py + 8, 4, 1);
        break;
      case DECO_BUSH:
        g.fillStyle = P.leafB; g.fillRect(px + 2, py + 6, 12, 8);
        g.fillStyle = P.leafA; g.fillRect(px + 3, py + 5, 9, 4);
        g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(px + 2, py + 13, 12, 1);
        if (hash(x, y, 60) < 0.35) {
          g.fillStyle = P.moongrape[2]; g.fillRect(px + 6, py + 7, 2, 2);
        }
        break;
    }
  };

  B.Map = Map;
  B.DECO = { NONE: DECO_NONE, TUFT: DECO_TUFT, ROCK: DECO_ROCK, FLOWER: DECO_FLOWER, BUSH: DECO_BUSH };
})();
