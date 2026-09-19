/* 钟楼契约 · bond.js
   契约系统：全作唯一的创新机制。
   业火 Ward 不是滑条，是资产负债表：
     - 每缚一个契约，ward 永久 +1，夜里强度立即上一个台阶
     - 契约者每天掉活力，活力归零就在白天叛变
     - 让它们打夜战会让活力掉得更快，和"让它们干活"抢同一份活力池 */
(function () {
  'use strict';
  var B = window.Belfry;

  // ---------- 数值口径（集中在这里，方便调） ----------
  var CFG = {
    wardPerBind: 1,
    intensityPerWard: 0.18,    // 夜晚强度倍率 = 1 + ward * this
    spawnPerWard: 0.12,        // 刷新速率倍率
    bossEarlyPerWard: 3,       // 每 3 点业火，BOSS 提前一天
    baseBondSlots: 2,
    maxBondSlots: 5,
    soulPerVigor: 0.2,         // 1 点活力要 0.2 魂火
    guardWear: 15,             // 夜战额外消耗
    betrayThreshold: 0
  };

  // 各类契约者的日磨损与工作能力
  var TYPES = {
    thrall:     { name: '骸仆', wear: 12, till: 1.0, water: 1.0, reap: 1.0, guard: 0.6, hp: 26 },
    gravewing:  { name: '坟蝠', wear: 16, till: 0.4, water: 1.2, reap: 0.6, guard: 0.9, hp: 18 },
    cairn:      { name: '墓守', wear: 22, till: 1.8, water: 0.5, reap: 1.6, guard: 1.6, hp: 54 },
    wailer:     { name: '哀鸣者', wear: 18, till: 0.3, water: 0.6, reap: 0.3, guard: 1.2, hp: 22 }
  };

  var nextId = 1;

  function Bonded(typeId, day) {
    var t = TYPES[typeId] || TYPES.thrall;
    this.id = nextId++;
    this.type = typeId;
    this.name = t.name;
    this.vigor = 100;
    this.maxVigor = 100;
    this.wear = t.wear;
    this.joinedDay = day;
    this.work = 'idle';        // idle / till / water / reap
    this.nightRole = 'guard';  // guard / rest
    this.hp = t.hp;
    this.maxHp = t.hp;
    this.alive = true;
    this.x = 0; this.y = 0;
  }

  Bonded.prototype.ratio = function () { return B.clamp(this.vigor / this.maxVigor, 0, 1); };
  Bonded.prototype.isFrail = function () { return this.ratio() <= 0.34; };
  Bonded.prototype.stats = function () { return TYPES[this.type] || TYPES.thrall; };

  function Bonds() {
    this.list = [];
    this.ward = 0;
    this.totalBonds = 0;
    this.slots = CFG.baseBondSlots;
    this.betrayedToday = [];
  }

  // ---------- 缚契 ----------
  Bonds.prototype.canBind = function () {
    return this.list.length < this.slots;
  };

  // 返回新生契约者，或 null（名额满）
  Bonds.prototype.bind = function (typeId, day) {
    if (!this.canBind()) return null;
    var b = new Bonded(typeId, day);
    this.list.push(b);
    this.ward += CFG.wardPerBind;
    this.totalBonds += 1;
    return b;
  };

  // ---------- 业火对夜晚的影响 ----------
  Bonds.prototype.intensityMul = function () { return 1 + this.ward * CFG.intensityPerWard; };
  Bonds.prototype.spawnMul = function () { return 1 + this.ward * CFG.spawnPerWard; };
  Bonds.prototype.bossEarlyDays = function () { return Math.floor(this.ward / CFG.bossEarlyPerWard); };
  Bonds.prototype.pressureLabel = function () {
    var pct = Math.round((this.intensityMul() - 1) * 100);
    return pct <= 0 ? '与昨夜持平' : '比昨夜强 ' + pct + '%';
  };

  // ---------- 磨损与叛变 ----------
  // 返回今天叛变的契约者数组
  Bonds.prototype.dailyWear = function () {
    this.betrayedToday = [];
    for (var i = this.list.length - 1; i >= 0; i--) {
      var b = this.list[i];
      var cost = b.wear + (b.nightRole === 'guard' ? CFG.guardWear : 0);
      b.vigor -= cost;
      if (b.vigor <= CFG.betrayThreshold) {
        b.alive = false;
        this.list.splice(i, 1);
        this.betrayedToday.push(b);
      }
    }
    return this.betrayedToday;
  };

  // ---------- 喂养 ----------
  Bonds.prototype.feedCost = function (b, amount) {
    var need = Math.min(amount, b.maxVigor - b.vigor);
    return Math.ceil(need * CFG.soulPerVigor);
  };

  // 花魂火恢复活力。soulAvail 是玩家手上的魂火
  Bonds.prototype.feed = function (b, soulAvail) {
    var missing = b.maxVigor - b.vigor;
    if (missing <= 0) return 0;
    var canRestore = Math.floor(soulAvail / CFG.soulPerVigor);
    var restore = Math.min(missing, canRestore);
    var cost = Math.ceil(restore * CFG.soulPerVigor);
    b.vigor = Math.min(b.maxVigor, b.vigor + restore);
    return cost;
  };

  // 一键喂养全部（按虚弱优先）
  Bonds.prototype.feedAll = function (soulAvail) {
    var order = this.list.slice().sort(function (a, c) { return a.ratio() - c.ratio(); });
    var left = soulAvail, spent = 0;
    for (var i = 0; i < order.length && left > 0; i++) {
      var c = this.feed(order[i], left);
      left -= c; spent += c;
    }
    return spent;
  };

  // ---------- 降业火 ----------
  Bonds.prototype.reduceWard = function (n) {
    this.ward = Math.max(0, this.ward + (n || -1));
    return this.ward;
  };

  // ---------- 夜战 ----------
  // 出战契约者的战力总和（也决定它们今晚掉多少活力）
  Bonds.prototype.combatPower = function () {
    var p = 0;
    for (var i = 0; i < this.list.length; i++) {
      var b = this.list[i];
      if (b.nightRole === 'guard') p += b.stats().guard * b.ratio();
    }
    return p;
  };

  // ---------- 工作分配 ----------
  // 把契约者分配给某类活，返回分配成功的数量
  Bonds.prototype.assign = function (work) {
    for (var i = 0; i < this.list.length; i++) this.list[i].work = work;
    return this.list.length;
  };

  // 某类活的合计效率（农场用）
  Bonds.prototype.efficiency = function (work) {
    var e = 0;
    for (var i = 0; i < this.list.length; i++) {
      var b = this.list[i];
      if (b.work !== work) continue;
      e += (b.stats()[work] || 0) * b.ratio();
    }
    return e;
  };

  Bonds.prototype.upgradeSlots = function () {
    this.slots = Math.min(CFG.maxBondSlots, this.slots + 1);
    return this.slots;
  };

  B.bonds = {
    CFG: CFG,
    TYPES: TYPES,
    Bonds: Bonds,
    Bonded: Bonded,
    create: function () { return new Bonds(); }
  };
})();
