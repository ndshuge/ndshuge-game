/* 钟楼契约 · player.js
   玩家：移动、冲刺、挥砍 / 射击、体力、受伤。
   所有反馈通过 B.feel 弹出，不在这里画东西。 */
(function () {
  'use strict';
  var B = window.Belfry;

  function Player(map) {
    this.map = map;
    var c = map.farmRect;
    this.x = (c.x0 + 2) * B.TILE + 8;
    this.y = (c.y0 + 2) * B.TILE + 8;
    this.r = 6;
    this.speed = 82;
    this.hp = 100; this.maxHp = 100;
    this.stamina = 100; this.maxStamina = 100;

    this.facing = 1;          // 1 右 / -1 左
    this.aim = 0;
    this.weapon = 'hammer1';

    this.attackCd = 0;
    this.swingT = 0;          // 挥砍动画剩余
    this.swingArc = 0;
    this.invuln = 0;

    this.dashT = 0;
    this.dashCd = 0;
    this.stepT = 0;
    this.dead = false;

    this.hitThisSwing = [];   // 同一次挥砍不重复命中
  }

  Player.prototype.R = function () { return this.r; };

  Player.prototype.takeDamage = function (n, fromX, fromY) {
    if (this.invuln > 0 || this.dead) return false;
    this.hp -= n;
    this.invuln = 0.7;
    B.feel.hurt();
    var a = Math.atan2(this.y - fromY, this.x - fromX);
    this.x += Math.cos(a) * 8;
    this.y += Math.sin(a) * 8;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    return true;
  };

  Player.prototype.move = function (dt, ax, ay) {
    if (this.dead) return;
    var sp = this.speed;
    if (this.dashT > 0) sp *= 3.1;
    var nx = this.x + ax * sp * dt;
    var ny = this.y + ay * sp * dt;
    // 分轴碰撞：撞墙时贴边滑动
    if (!this.blocked(nx, this.y)) this.x = nx;
    if (!this.blocked(this.x, ny)) this.y = ny;
  };

  Player.prototype.blocked = function (x, y) {
    var r = this.r, m = this.map;
    return m.solidPx(x - r, y - r) || m.solidPx(x + r, y - r) ||
      m.solidPx(x - r, y + r) || m.solidPx(x + r, y + r);
  };

  Player.prototype.dash = function () {
    if (this.dashCd > 0 || this.dead) return false;
    this.dashT = 0.16;
    this.dashCd = 1.1;
    this.invuln = Math.max(this.invuln, 0.26);
    return true;
  };

  Player.prototype.tryAttack = function () {
    if (this.dead) return null;
    if (this.attackCd > 0) return null;
    var w = B.weapons.get(this.weapon);
    this.attackCd = w.cd;
    this.hitThisSwing = [];
    if (w.kind === 'melee') {
      this.swingT = 0.2;
      this.swingArc = w.arc;
      B.feel.swing(w.heavy);
      B.audio.play('swing');
      return { kind: 'melee', def: w };
    }
    B.feel.fire();
    B.audio.play('swing');
    return { kind: 'ranged', def: w };
  };

  // 近战判定：以 aim 为中心的扇形
  Player.prototype.meleeHit = function (enemies) {
    var w = B.weapons.get(this.weapon);
    var hits = [];
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!e.alive) continue;
      if (this.hitThisSwing.indexOf(e.uid) !== -1) continue;
      var dx = e.x - this.x, dy = e.y - this.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > w.range + e.r) continue;
      var a = Math.atan2(dy, dx);
      if (Math.abs(B.angDiff(a, this.aim)) > w.arc / 2) continue;
      this.hitThisSwing.push(e.uid);
      hits.push({ enemy: e, angle: a, dist: d });
    }
    return hits;
  };

  Player.prototype.update = function (dt) {
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.swingT > 0) this.swingT -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.dashT > 0) this.dashT -= dt;

    // 体力：白天消耗，夜里缓慢恢复
    var moving = false;
    if (this.stamina < this.maxStamina) this.stamina = Math.min(this.maxStamina, this.stamina + dt * 4);
    return moving;
  };

  // 白天农活消耗体力，返回是否够
  Player.prototype.spendStamina = function (n) {
    if (this.stamina < n) return false;
    this.stamina -= n;
    return true;
  };

  B.Player = Player;
})();
