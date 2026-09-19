/* 钟楼契约 · farm.js
   耕作层：地块网格、开垦 / 播种 / 浇水 / 收获、契约者自动劳动。 */
(function () {
  'use strict';
  var B = window.Belfry;

  function Farm(map) {
    this.map = map;
    this.plots = [];
    this.byKey = {};
    this.build();
  }

  Farm.prototype.build = function () {
    var r = this.map.farmRect;
    for (var y = r.y0; y <= r.y1; y++) {
      for (var x = r.x0; x <= r.x1; x++) {
        var p = {
          x: x, y: y,
          tilled: false,
          watered: false,
          crop: null,
          growth: 0,
          reservedBy: 0        // 被哪个契约者认领（避免多个劳工抢同一块）
        };
        this.plots.push(p);
        this.byKey[x + ',' + y] = p;
      }
    }
  };

  Farm.prototype.at = function (x, y) { return this.byKey[x + ',' + y] || null; };

  // 像素坐标 -> 地块
  Farm.prototype.atPx = function (px, py) {
    return this.at(Math.floor(px / B.TILE), Math.floor(py / B.TILE));
  };

  // ---------- 玩家操作 ----------

  // 开垦：荒地 -> 耕地
  Farm.prototype.till = function (plot) {
    if (!plot || plot.tilled) return false;
    plot.tilled = true;
    this.map.set(plot.x, plot.y, B.TT.TILLED);
    return true;
  };

  Farm.prototype.plant = function (plot, cropId) {
    if (!plot || !plot.tilled) return false;
    if (plot.crop) return false;
    return B.crops.plant(plot, cropId);
  };

  Farm.prototype.water = function (plot) {
    if (!plot || !plot.crop) return false;
    if (plot.watered) return false;
    plot.watered = true;
    return true;
  };

  Farm.prototype.harvest = function (plot) {
    if (!plot || !B.crops.isRipe(plot)) return null;
    var out = B.crops.harvest(plot);
    plot.crop = null;
    plot.growth = 0;
    plot.watered = false;
    return out;
  };

  // ---------- 契约者自动劳动 ----------
  // 返回一个待办地块，供实体层让劳工去执行。kind: till / water / reap
  Farm.prototype.nextJob = function (kind) {
    for (var i = 0; i < this.plots.length; i++) {
      var p = this.plots[i];
      if (p.reservedBy) continue;
      if (kind === 'till' && !p.tilled) return p;
      if (kind === 'water' && p.crop && !p.watered) return p;
      if (kind === 'reap' && B.crops.isRipe(p)) return p;
    }
    return null;
  };

  // 劳工到点执行
  Farm.prototype.doJob = function (plot, kind) {
    if (!plot) return false;
    if (kind === 'till') return this.till(plot);
    if (kind === 'water') return this.water(plot);
    if (kind === 'reap') { this.harvest(plot); return true; }
    return false;
  };

  // 剩余工作量（给 UI 显示"今天还能干多少"）
  Farm.prototype.pending = function () {
    var untilled = 0, unwatered = 0, ripe = 0;
    for (var i = 0; i < this.plots.length; i++) {
      var p = this.plots[i];
      if (!p.tilled) untilled++;
      else if (p.crop && !p.watered) unwatered++;
      if (B.crops.isRipe(p)) ripe++;
    }
    return { untilled: untilled, unwatered: unwatered, ripe: ripe };
  };

  Farm.prototype.counts = function () {
    var planted = 0, tilled = 0;
    for (var i = 0; i < this.plots.length; i++) {
      if (this.plots[i].tilled) tilled++;
      if (this.plots[i].crop) planted++;
    }
    return { tilled: tilled, planted: planted, total: this.plots.length };
  };

  // ---------- 每日生长结算 ----------
  // 返回今天长了一格的作物数
  Farm.prototype.dailyGrow = function () {
    var grown = 0;
    for (var i = 0; i < this.plots.length; i++) {
      if (B.crops.grow(this.plots[i], this.plots[i].watered)) grown++;
    }
    return grown;
  };

  B.Farm = Farm;
})();
