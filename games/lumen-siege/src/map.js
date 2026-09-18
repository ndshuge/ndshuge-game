/* LUMEN SIEGE - map: procedural world, baked ground layer, tile collision.
   The ground is baked once into an offscreen canvas so the render loop only blits a
   window-sized slice. Four quadrants get slightly different palettes so travelling
   the map actually reads as travelling. */
(function () {
  'use strict';
  var PG = (window.PG = window.PG || {});

  var EMPTY = 0, ROCK = 1, WALL = 2;

  /* Quadrant palettes: [base, speck, light] */
  var REGION_PAL = [
    ['#1b2430', '#232f3d', '#2b3c4d'],  /* NW  cold stone   */
    ['#16241b', '#1d3024', '#264232'],  /* NE  moss         */
    ['#241d16', '#302621', '#3d3126'],  /* SW  dry earth    */
    ['#1d1726', '#281f33', '#342741']   /* SE  blight       */
  ];

  var ROCK_PAL = { base: '#38445a', top: '#57687f', bot: '#1a2230', outline: '#0e1520' };
  /* Rock silhouettes inside a 2x2 tile block, as character matrices. */
  var ROCK_SHAPES = [
    ['1111', '1111', '1111', '1111'],
    ['.11.', '1111', '1111', '.11.'],
    ['1111', '1111', '.11.', '....'],
    ['..1.', '.111', '1111', '....']
  ];

  function World() {
    this.tw = PG.WORLD_TW;
    this.th = PG.WORLD_TH;
    this.w = PG.WORLD_W;
    this.h = PG.WORLD_H;
    this.tiles = new Uint8Array(this.tw * this.th);
    /* flow field: steps to the player per tile, plus the BFS queue. Both are plain
       typed arrays so a rebuild does not allocate. */
    this.flow = new Int32Array(this.tw * this.th);
    this.flowQueue = new Int32Array(this.tw * this.th);
    this.rng = new PG.Rng(1);
    this.ground = null;
  }

  World.prototype.idx = function (tx, ty) { return ty * this.tw + tx; };

  World.prototype.tileAt = function (tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.tw || ty >= this.th) return WALL;
    return this.tiles[ty * this.tw + tx];
  };

  World.prototype.isSolid = function (tx, ty) {
    return this.tileAt(tx, ty) !== EMPTY;
  };

  World.prototype.set = function (tx, ty, v) {
    if (tx < 0 || ty < 0 || tx >= this.tw || ty >= this.th) return;
    this.tiles[ty * this.tw + tx] = v;
  };

  /* ---------- generation ---------- */

  /*: Obstacle clusters. Kept low on purpose: the arena reads better open, and a
     sparse map is also what makes pathfinding around rocks legible instead of
     turning every fight into a corridor. */
  var CLUSTER_COUNT = 42;
  var PILLAR_COUNT = 3;

  World.prototype.generate = function (seed) {
    this.flow.fill(-1);
    this.rng = new PG.Rng(seed >>> 0);
    this.tiles.fill(EMPTY);

    var tw = this.tw, th = this.th, i, x, y;

    /* solid border, two tiles thick so nothing can squeeze through */
    for (y = 0; y < th; y++) {
      for (x = 0; x < tw; x++) {
        if (x < 2 || y < 2 || x >= tw - 2 || y >= th - 2) this.set(x, y, WALL);
      }
    }

    /* obstacle clusters: rocks placed as 2x2 blocks, never on top of the arena centre */
    var cx = tw >> 1, cy = th >> 1;
    var clusters = CLUSTER_COUNT;
    var attempts = 0;
    var placed = 0;
    while (placed < clusters && attempts < clusters * 12) {
      attempts++;
      var bx = this.rng.int(3, tw - 5);
      var by = this.rng.int(3, th - 5);
      /* keep a clear circle around the spawn point */
      if (PG.dist(bx, by, cx, cy) < 7) continue;
      /* and keep a clear band through the middle so quadrants connect */
      if (Math.abs(bx - cx) < 2 || Math.abs(by - cy) < 2) continue;

      var shape = ROCK_SHAPES[this.rng.int(0, ROCK_SHAPES.length - 1)];
      var solid = false;
      for (var sy = 0; sy < shape.length && !solid; sy++) {
        for (var sx = 0; sx < shape[sy].length; sx++) {
          if (shape[sy].charAt(sx) === '1' && this.isSolid(bx + sx, by + sy)) solid = true;
        }
      }
      if (solid) continue;

      for (var oy = 0; oy < shape.length; oy++) {
        for (var ox = 0; ox < shape[oy].length; ox++) {
          if (shape[oy].charAt(ox) === '1') this.set(bx + ox, by + oy, ROCK);
        }
      }
      placed++;
    }

    /* a few deliberate pillars, so the map has landmarks */
    for (i = 0; i < PILLAR_COUNT; i++) {
      var px = this.rng.int(10, tw - 10), py = this.rng.int(10, th - 10);
      if (PG.dist(px, py, cx, cy) < 9) continue;
      for (y = 0; y < 3; y++) {
        for (x = 0; x < 3; x++) {
          if (this.isSolid(px + x, py + y)) continue;
          this.set(px + x, py + y, ROCK);
        }
      }
    }
    return this;
  };

  /* ---------- baked ground ---------- */

  World.prototype.bake = function () {
    var c = document.createElement('canvas');
    c.width = this.w;
    c.height = this.h;
    var g = c.getContext('2d');
    var t = PG.TILE;
    var r = this.rng;

    for (var ty = 0; ty < this.th; ty++) {
      for (var tx = 0; tx < this.tw; tx++) {
        var tile = this.tiles[ty * this.tw + tx];
        var wx = tx * t, wy = ty * t;

        if (tile === WALL) {
          g.fillStyle = '#080b11';
          g.fillRect(wx, wy, t, t);
          g.fillStyle = '#26364a';
          g.fillRect(wx, wy, t, 2);
          continue;
        }

        var region = (wy > this.h / 2 ? 2 : 0) + (wx > this.w / 2 ? 1 : 0);
        var pal = REGION_PAL[region];
        g.fillStyle = pal[0];
        g.fillRect(wx, wy, t, t);

        /* faint checker to give the tile grid a readable rhythm */
        if (((tx + ty) & 1) === 0) {
          g.fillStyle = 'rgba(255,255,255,0.018)';
          g.fillRect(wx, wy, t, t);
        }

        /* speckle */
        var specks = 1 + (r.next() * 3 | 0);
        for (var s = 0; s < specks; s++) {
          g.fillStyle = r.next() < 0.3 ? pal[2] : pal[1];
          g.fillRect(wx + (r.next() * t | 0), wy + (r.next() * t | 0), 1, 1);
        }

        /* region-specific decoration */
        var roll = r.next();
        if (region === 0 && roll < 0.05) {           /* cracked stone */
          g.fillStyle = pal[1];
          g.fillRect(wx + 3, wy + 6, 6, 1);
          g.fillRect(wx + 7, wy + 7, 1, 3);
        } else if (region === 1 && roll < 0.09) {    /* moss tufts */
          g.fillStyle = '#2f5c3a';
          g.fillRect(wx + 4, wy + 9, 2, 2);
          g.fillRect(wx + 6, wy + 8, 1, 1);
        } else if (region === 2 && roll < 0.06) {    /* pebbles */
          g.fillStyle = pal[2];
          g.fillRect(wx + 9, wy + 4, 2, 2);
          g.fillRect(wx + 11, wy + 6, 1, 1);
        } else if (region === 3 && roll < 0.07) {    /* blight veins */
          g.fillStyle = '#3b2d55';
          g.fillRect(wx + 2, wy + 5, 1, 5);
          g.fillRect(wx + 3, wy + 9, 4, 1);
        }

        if (tile === ROCK) {
          g.fillStyle = ROCK_PAL.base;
          g.fillRect(wx, wy, t, t);
          g.fillStyle = ROCK_PAL.top;
          g.fillRect(wx, wy, t, 4);
          g.fillStyle = ROCK_PAL.bot;
          g.fillRect(wx, wy + t - 3, t, 3);
          g.fillStyle = ROCK_PAL.outline;
          g.fillRect(wx, wy, t, 1);
          g.fillRect(wx, wy + t - 1, t, 1);
          g.fillRect(wx, wy, 1, t);
          g.fillRect(wx + t - 1, wy, 1, t);
        }
      }
    }

    /* quadrant seams, a subtle hint that the map has regions */
    g.fillStyle = 'rgba(95,224,200,0.05)';
    g.fillRect(this.w / 2 - 1, 0, 2, this.h);
    g.fillRect(0, this.h / 2 - 1, this.w, 2);

    this.ground = c;
    return c;
  };

  /* ---------- flow field ----------
     One breadth-first pass from the player fills a step count for every walkable
     tile, and every enemy reads a direction out of it. That is the whole point: one
     cheap pass shared by the whole horde, instead of a search per body per frame. */

  World.prototype.buildFlow = function (targetPx, targetPy) {
    var tw = this.tw, th = this.th;
    var flow = this.flow;
    var queue = this.flowQueue;
    flow.fill(-1);

    var tx = PG.clamp(Math.floor(targetPx / PG.TILE), 0, tw - 1);
    var ty = PG.clamp(Math.floor(targetPy / PG.TILE), 0, th - 1);
    /* the player can stand on a rock-corner: nudge to a walkable tile */
    if (this.isSolid(tx, ty)) {
      var found = false;
      for (var r = 1; r <= 3 && !found; r++) {
        for (var oy = -r; oy <= r && !found; oy++) {
          for (var ox = -r; ox <= r; ox++) {
            if (!this.isSolid(tx + ox, ty + oy)) { tx += ox; ty += oy; found = true; break; }
          }
        }
      }
      if (!found) return;
    }

    var head = 0, tail = 0;
    var start = ty * tw + tx;
    flow[start] = 0;
    queue[tail++] = start;

    while (head < tail) {
      var idx = queue[head++];
      var step = flow[idx] + 1;
      var x = idx % tw;
      var y = (idx / tw) | 0;
      for (var dy = -1; dy <= 1; dy++) {
        var ny = y + dy;
        if (ny < 0 || ny >= th) continue;
        for (var dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          var nx = x + dx;
          if (nx < 0 || nx >= tw) continue;
          var n = ny * tw + nx;
          if (flow[n] !== -1) continue;
          /* EMPTY, not PG.TILE_EMPTY: that export was removed when the tile-type
             constants were cleaned up, and referencing it here made the test always
             true, so the whole field came out empty. */
          if (this.tiles[n] !== EMPTY) continue;
          /* no diagonal squeeze through a corner */
          if (dx && dy && (this.isSolid(x + dx, y) || this.isSolid(x, y + dy))) continue;
          flow[n] = step;
          queue[tail++] = n;
        }
      }
    }
  };

  /*: Direction to step from a world point toward the player, or null. Reads the
     field built by buildFlow, so it is a table lookup, not a search. */
  World.prototype.flowDir = function (px, py) {
    var tw = this.tw;
    var x = Math.floor(px / PG.TILE);
    var y = Math.floor(py / PG.TILE);
    if (x < 0 || y < 0 || x >= tw || y >= this.th) return null;
    var here = this.flow[y * tw + x];
    if (here < 0) {
      /* standing in a rock: step to any open neighbour, preferring the closest in */
      for (var dy0 = -1; dy0 <= 1; dy0++) {
        for (var dx0 = -1; dx0 <= 1; dx0++) {
          if (!dx0 && !dy0) continue;
          if (this.isSolid(x + dx0, y + dy0)) continue;
          if (this.flow[(y + dy0) * tw + (x + dx0)] >= 0) {
            return Math.atan2(dy0, dx0);
          }
        }
      }
      return null;
    }
    var best = null, bestD = here;
    for (var dy = -1; dy <= 1; dy++) {
      var ny = y + dy;
      if (ny < 0 || ny >= this.th) continue;
      for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var nx = x + dx;
        if (nx < 0 || nx >= tw) continue;
        if (this.isSolid(nx, ny)) continue;
        if (dx && dy && (this.isSolid(x + dx, y) || this.isSolid(x, y + dy))) continue;
        var d = this.flow[ny * tw + nx];
        if (d >= 0 && d < bestD) { bestD = d; best = Math.atan2(dy, dx); }
      }
    }
    return best;
  };

  /* ---------- collision ---------- */

  World.prototype.circleHits = function (x, y, r) {
    var t = PG.TILE;
    var x0 = Math.floor((x - r) / t), x1 = Math.floor((x + r) / t);
    var y0 = Math.floor((y - r) / t), y1 = Math.floor((y + r) / t);
    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        if (!this.isSolid(tx, ty)) continue;
        var nx = PG.clamp(x, tx * t, tx * t + t);
        var ny = PG.clamp(y, ty * t, ty * t + t);
        if (PG.dist2(x, y, nx, ny) < r * r) return true;
      }
    }
    return false;
  };

  /* Move a circle with per-axis resolution so walls produce sliding, not sticking.
     Sub-steps keep fast dash movement from tunnelling. */
  PG.moveCircle = function (world, o, dx, dy) {
    var len = Math.abs(dx) + Math.abs(dy);
    var steps = Math.max(1, Math.ceil(len / 2));
    var sx = dx / steps, sy = dy / steps;
    for (var i = 0; i < steps; i++) {
      if (sx) {
        if (!world.circleHits(o.x + sx, o.y, o.r)) o.x += sx; else sx = 0;
      }
      if (sy) {
        if (!world.circleHits(o.x, o.y + sy, o.r)) o.y += sy; else sy = 0;
      }
    }
  };

  PG.World = World;
})();
