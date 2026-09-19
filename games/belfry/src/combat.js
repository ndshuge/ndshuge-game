/* 钟楼契约 · combat.js
   伤害结算、圣烛光弹、命中反馈编排。
   命中瞬间四路齐发（画面 / 标记 / 声音 / 世界反应）在这里同帧触发。 */
(function () {
  'use strict';
  var B = window.Belfry;

  function Projectile(x, y, ux, uy, def) {
    this.x = x; this.y = y;
    this.ux = ux; this.uy = uy;
    this.def = def;
    this.life = def.life || 1.2;
    this.pierce = def.pierce || 0;
    this.hitIds = [];
    this.alive = true;
    this.r = 4;
    this.t = 0;
  }

  Projectile.prototype.update = function (dt, enemies, map, onHit) {
    this.t += dt;
    this.life -= dt;
    if (this.life <= 0) { this.alive = false; return; }
    var steps = 3;   // 高速弹分步检测，避免穿模
    for (var s = 0; s < steps; s++) {
      this.x += this.ux * this.def.speed * dt / steps;
      this.y += this.uy * this.def.speed * dt / steps;
      if (map.solidPx(this.x, this.y)) {
        this.alive = false;
        B.audio.play('hit', false);
        return;
      }
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        if (!e.alive) continue;
        if (this.hitIds.indexOf(e.uid) !== -1) continue;
        if (B.dist(this.x, this.y, e.x, e.y) < e.r + this.r) {
          this.hitIds.push(e.uid);
          onHit(e, this);
          if (this.pierce <= 0) { this.alive = false; return; }
          this.pierce -= 1;
        }
      }
    }
  };

  // 一次完整命中的四路反馈
  function landHit(game, enemy, dmg, dirX, dirY, opts) {
    opts = opts || {};
    var lethal = enemy.hp - dmg <= 0;

    // 世界反应：击退（由 enemy.hurt 内部记账）
    var kb = opts.kb == null ? 120 : opts.kb;

    // 声音
    B.audio.play('hit', !!opts.heavy);

    // 画面：震屏 + 顿帧
    B.feel.landHit({ heavy: !!opts.heavy, lethal: lethal, dir: Math.atan2(dirY, dirX) });

    // 粒子：火花（跟随敌人身上那处独占色）
    var col = enemy.stats.color;
    game.particles.burst(enemy.x, enemy.y, lethal ? 12 : 6, 90, col, 0.35, lethal ? 2 : 1);
    game.particles.burst(enemy.x, enemy.y, 4, 45, '#fff3b8', 0.18, 1);

    // 标记：伤害飘字
    game.floatTexts.push(B.FloatText(enemy.x, enemy.y - enemy.r - 2,
      String(Math.round(dmg)), lethal ? '#ffd27a' : '#fff3b8'));
    game.floatTexts[game.floatTexts.length - 1].life = 0.7;
    game.floatTexts[game.floatTexts.length - 1].max = 0.7;

    return lethal;
  }

  B.combat = {
    Projectile: Projectile,
    landHit: landHit,

    // 统一的伤害入口
    damage: function (game, enemy, dmg, dirX, dirY, opts) {
      if (!enemy.alive) return false;
      var lethal = landHit(game, enemy, dmg, dirX, dirY, opts);
      enemy.hurt(dmg, dirX, dirY, (opts && opts.kb) || 120);
      return lethal;
    }
  };
})();
