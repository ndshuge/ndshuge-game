/* 钟楼契约 · enemies.js
   四种敌人，行为互相区分，不是换皮。 */
(function () {
  'use strict';
  var B = window.Belfry;

  var STATS = {
    thrall:    { name: '骸仆', hp: 22, r: 5, speed: 34, dmg: 8,  soul: 3,  color: '#46e0a0' },
    gravewing: { name: '坟蝠', hp: 16, r: 6, speed: 48, dmg: 7,  soul: 4,  color: '#ff6a9a' },
    cairn:     { name: '墓守', hp: 58, r: 8, speed: 22, dmg: 15, soul: 9,  color: '#ffb066' },
    wailer:    { name: '哀鸣者', hp: 20, r: 6, speed: 18, dmg: 5, soul: 6,  color: '#7ddfff' }
  };

  var uid = 1;

  function Enemy(type, x, y, tier) {
    var S = STATS[type] || STATS.thrall;
    this.uid = uid++;
    this.type = type;
    this.stats = S;
    this.x = x; this.y = y;
    this.hp = Math.round(S.hp * tier);
    this.maxHp = this.hp;
    this.r = S.r;
    this.speed = S.speed;
    this.dmg = Math.round(S.dmg * tier);
    this.soul = S.soul;

    this.alive = true;
    this.state = 'walk';
    this.t = 0;
    this.flash = 0;         // 受击闪白剩余
    this.kbx = 0; this.kby = 0;
    this.birthCd = 0.45;    // 出生无敌，避免落地即被打
    this.phase = Math.random() * Math.PI * 2;
    this.raged = false;
    this.buffT = 0;
    this.spawnBurst = true;
  }

  Enemy.prototype.hurt = function (dmg, dirX, dirY, kb) {
    if (!this.alive) return false;
    this.hp -= dmg;
    this.flash = 0.1;
    this.kbx += dirX * kb;
    this.kby += dirY * kb;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    return true;
  };

  // 返回是否打到了玩家（交给 game 层结算伤害）
  Enemy.prototype.update = function (dt, player, map, others) {
    if (!this.alive) return false;
    if (this.flash > 0) this.flash -= dt;
    if (this.birthCd > 0) this.birthCd -= dt;
    if (this.buffT > 0) this.buffT -= dt;

    this.t += dt;
    this.phase += dt;

    var dx = player.x - this.x, dy = player.y - this.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / dist, uy = dy / dist;
    var sp = this.speed * (this.buffT > 0 ? 1.35 : 1) * (this.raged ? 1.5 : 1);

    var mvx = 0, mvy = 0;

    switch (this.type) {
      case 'thrall':
        // 稳定追踪 + 蛇形摆动
        var sway = Math.sin(this.phase * 3.4) * 0.35;
        mvx = ux + (-uy) * sway;
        mvy = uy + (ux) * sway;
        break;

      case 'gravewing':
        // 绕行 -> 蓄力 -> 俯冲
        if (this.state === 'walk') {
          if (dist < 96) { this.state = 'charge'; this.t = 0; }
          else { mvx = ux + (-uy) * 0.5; mvy = uy + (ux) * 0.5; }
        } else if (this.state === 'charge') {
          mvx = ux * 0.25; mvy = uy * 0.25;
          if (this.t > 0.55) {
            this.state = 'dive'; this.t = 0;
            this.dvx = ux; this.dvy = uy;
          }
        } else {
          mvx = this.dvx * 2.4; mvy = this.dvy * 2.4;
          if (this.t > 0.5) { this.state = 'walk'; this.t = 0; }
        }
        break;

      case 'cairn':
        mvx = ux; mvy = uy;
        if (!this.raged && this.hp < this.maxHp * 0.5) this.raged = true;
        break;

      case 'wailer':
        // 站桩吟唱，太近就退
        if (dist < 70) { mvx = -ux; mvy = -uy; }
        else if (dist > 130) { mvx = ux * 0.6; mvy = uy * 0.6; }
        if (this.t > 2.4) {   // 周期性给周围敌人加攻速
          this.t = 0;
          for (var k = 0; k < others.length; k++) {
            var o = others[k];
            if (o === this || !o.alive) continue;
            if (B.dist(o.x, o.y, this.x, this.y) < 110) o.buffT = 4.5;
          }
          this.sang = true;
        }
        break;
    }

    // 位移 + 击退
    var nx = this.x + mvx * sp * dt + this.kbx * dt;
    var ny = this.y + mvy * sp * dt + this.kby * dt;
    if (!this.solidAt(map, nx, this.y)) this.x = nx;
    if (!this.solidAt(map, this.x, ny)) this.y = ny;
    this.kbx *= Math.exp(-dt * 9);
    this.kby *= Math.exp(-dt * 9);

    // 触碰玩家
    if (dist < this.r + player.R() && this.birthCd <= 0) return true;
    return false;
  };

  Enemy.prototype.solidAt = function (map, x, y) {
    var r = this.r * 0.7;
    return map.solidPx(x - r, y - r) || map.solidPx(x + r, y - r) ||
      map.solidPx(x - r, y + r) || map.solidPx(x + r, y + r);
  };

  Enemy.prototype.hitRect = function () {
    return { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 };
  };

  // ---------- 波次生成 ----------
  function composition(day, wave, ward) {
    var pool = ['thrall'];
    if (day >= 2 || ward >= 1) pool.push('gravewing');
    if (day >= 4 || ward >= 3) pool.push('cairn');
    if (day >= 5 || ward >= 4) pool.push('wailer');
    void wave;
    return pool;
  }

  function spawnWave(cracks, count, tier, day, wave, ward) {
    var rng = B.makeRng((day * 977 + wave * 131 + Math.floor(Date.now() % 9973)) >>> 0);
    var pool = composition(day, wave, ward);
    var out = [];
    for (var i = 0; i < count; i++) {
      var t = B.pick(rng, pool);
      var c = B.pick(rng, cracks);
      var a = rng() * Math.PI * 2;
      var rad = B.randRange(rng, 6, 30);
      out.push(new Enemy(t, c.x + Math.cos(a) * rad, c.y + Math.sin(a) * rad, tier));
    }
    return out;
  }

  B.enemies = {
    STATS: STATS,
    Enemy: Enemy,
    spawnWave: spawnWave,
    composition: composition
  };
})();
