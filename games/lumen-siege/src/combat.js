/* LUMEN SIEGE - combat: projectiles (both directions), hit resolution, pickups. */
(function () {
  'use strict';
  var PG = (window.PG = window.PG || {});

  var MAX_PROJECTILES = 700;
  var MAX_GEMS = 400;
  var HOMING_RANGE = 230;
  var RICOCHET_RANGE = 190;

  /* ============================ projectiles ============================ */

  function Projectile() {
    this.active = false;
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.r = 3;
    this.damage = 0;
    this.pierce = 0;
    this.life = 0;
    this.angle = 0;
    this.knock = 0;
    this.homing = 0;
    this.bounce = 0;
    this.burn = 0;
    this.chain = 0;
    this.chainTargets = 1;
    this.chainMul = 1;
    this.mark = 0;
    this.crit = false;
    this.split = 0;
    this.splitMul = 0.45;
    this.isSplit = false;
    this.execute = 0;
    this.chill = 0;
    this.freeze = 0;
    this.ricochet = 0;
    this.ricochetPower = 0;
    this.splitChain = 0;
    this.boomerang = false;
    this.travel = 0;
    this.traveled = 0;
    this.returning = false;
    /* incoming fire */
    this.hostile = false;
    this.web = false;
    this.acid = false;
    this.hit = [];
  }

  function Projectiles() {
    this.items = [];
    for (var i = 0; i < MAX_PROJECTILES; i++) this.items.push(new Projectile());
    this.cursor = 0;
  }

  Projectiles.prototype.spawn = function (x, y, angle, speed, damage, opts) {
    opts = opts || {};
    var p = null;
    for (var i = 0; i < MAX_PROJECTILES; i++) {
      var cand = this.items[(this.cursor + i) % MAX_PROJECTILES];
      if (!cand.active) { p = cand; this.cursor = (this.cursor + i + 1) % MAX_PROJECTILES; break; }
    }
    if (!p) return null;
    p.active = true;
    p.x = x; p.y = y;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.angle = angle;
    p.r = opts.r || 3;
    p.damage = damage;
    p.pierce = opts.pierce || 0;
    p.knock = opts.knock || 0;
    p.life = opts.life || 1.4;
    p.homing = opts.homing || 0;
    p.bounce = opts.bounce || 0;
    p.burn = opts.burn || 0;
    p.chain = opts.chain || 0;
    p.chainTargets = opts.chainTargets || 1;
    p.chainMul = opts.chainMul == null ? 1 : opts.chainMul;
    p.mark = opts.mark || 0;
    p.crit = !!opts.crit;
    p.split = opts.split || 0;
    p.splitMul = opts.splitMul == null ? 0.45 : opts.splitMul;
    p.isSplit = !!opts.isSplit;
    p.execute = opts.execute || 0;
    p.chill = opts.chill || 0;
    p.freeze = opts.freeze || 0;
    p.ricochet = opts.ricochet || 0;
    p.ricochetPower = opts.ricochetPower || 0;
    p.splitChain = opts.splitChain || 0;
    p.boomerang = !!opts.boomerang;
    p.travel = opts.travel || 0;
    p.traveled = 0;
    p.returning = false;
    p.hostile = !!opts.hostile;
    p.web = !!opts.web;
    p.acid = !!opts.acid;
    p.hit.length = 0;
    return p;
  };

  Projectiles.prototype.update = function (dt, game) {
    var world = game.world;
    var enemies = game.enemies;

    for (var i = 0; i < MAX_PROJECTILES; i++) {
      var p = this.items[i];
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }

      if (p.boomerang) {
        var bspeed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (!p.returning) {
          p.traveled += bspeed * dt;
          if (p.traveled >= p.travel) {
            p.returning = true;
            p.hit.length = 0;
            game.sparks(p.x, p.y, p.angle, 4, '#9feaff');
          }
        } else {
          var pa = Math.atan2(game.player.y - p.y, game.player.x - p.x);
          p.vx = Math.cos(pa) * bspeed;
          p.vy = Math.sin(pa) * bspeed;
          p.angle = pa;
          if (PG.dist2(p.x, p.y, game.player.x, game.player.y) < 140) {
            p.active = false;
            continue;
          }
        }
      }

      if (p.homing > 0 && !p.hostile) {
        var target = game.findNearestEnemy(p.x, p.y, HOMING_RANGE, null);
        if (target) {
          var want = Math.atan2(target.y - p.y, target.x - p.x);
          var cur = Math.atan2(p.vy, p.vx);
          var da = PG.angleDelta(cur, want);
          var maxTurn = p.homing * dt;
          var turn = da > maxTurn ? maxTurn : (da < -maxTurn ? -maxTurn : da);
          var na = cur + turn;
          var hs = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
          p.vx = Math.cos(na) * hs;
          p.vy = Math.sin(na) * hs;
          p.angle = na;
        }
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (world.circleHits(p.x, p.y, p.r)) {
        var bounced = false;
        if (p.bounce > 0) {
          var backX = p.x - p.vx * dt, backY = p.y - p.vy * dt;
          if (!world.circleHits(backX, p.y, p.r)) {
            p.x = backX; p.vx = -p.vx; bounced = true;
          } else if (!world.circleHits(p.x, backY, p.r)) {
            p.y = backY; p.vy = -p.vy; bounced = true;
          } else {
            p.x = backX; p.y = backY; p.vx = -p.vx; p.vy = -p.vy; bounced = true;
          }
          if (bounced) {
            p.bounce--;
            p.life = Math.max(p.life, 0.35);
            p.hit.length = 0;
            p.angle = Math.atan2(p.vy, p.vx);
            game.sparks(p.x, p.y, p.angle, 2, '#9feaff');
          }
        }
        if (!bounced) {
          game.sparks(p.x, p.y, p.angle, p.hostile ? 3 : 3, p.hostile ? '#ff9a8a' : '#8fd8f0');
          p.active = false;
          continue;
        }
      }

      /* incoming fire only cares about the player */
      if (p.hostile) {
        var pl = game.player;
        if (pl && !pl.dead) {
          var pr = p.r + pl.r;
          if (PG.dist2(p.x, p.y, pl.x, pl.y) <= pr * pr) {
            var landed = pl.takeDamage(p.damage, p.x, p.y, game);
            if (p.web) {
              pl.slowT = 1.6;
              pl.slowFactor = 0.45;
              game.sparks(pl.x, pl.y, 0, 5, '#c8b4ff');
            }
            p.active = false;
            continue;
          }
        }
        continue;
      }

      for (var e = 0; e < enemies.length; e++) {
        var en = enemies[e];
        if (en.dead || en.spawnT > 0) continue;
        if (p.hit.indexOf(en.id) >= 0) continue;
        var rr = p.r + en.r;
        if (PG.dist2(p.x, p.y, en.x, en.y) > rr * rr) continue;

        var dmg = p.damage;
        if (p.execute > 0 && en.hp <= en.maxHp * p.execute) dmg = en.hp + 1;

        if (p.mark > 0) {
          en.mark = Math.min(5, (en.mark || 0) + 1);
          dmg *= 1 + en.mark * p.mark;
        }

        game.damageEnemy(en, dmg, p.angle, p.knock, p.crit, p.execute,
          p.isSplit ? 'split' : 'shot');

        if (!en.dead) {
          if (p.burn > 0) en.burn = Math.max(en.burn || 0, p.burn);
          if (p.chill > 0) { en.chillT = 1.2; en.chillFactor = p.chill; }
          if (p.freeze > 0) { en.freezeT = Math.max(en.freezeT, p.freeze); en.freezeHits = 0; }
          if (p.chain > 0 && PG.rng.next() < p.chain) {
            game.chainLightning(en, p.chainTargets, dmg * 0.6 * p.chainMul);
          }

          /* element reaction: burning and chilled at once snap-freezes */
          if (en.burn > 0 && en.chillT > 0) {
            en.burn = 0;
            en.chillT = 0;
            en.freezeT = Math.max(en.freezeT, 1.6);
            en.freezeHits = 0;
            game.elementReaction(en.x, en.y, 'freeze');
          }
        }

        /* split: a burst of smaller shards. With splitChain the shards shatter once
           more, but that second generation can never split again, so it cannot run away. */
        if (p.split > 0 && (!p.isSplit || p.splitChain > 0)) {
          var ssp = Math.max(90, Math.sqrt(p.vx * p.vx + p.vy * p.vy) * 0.7);
          for (var s = 0; s < p.split; s++) {
            var sa = p.angle + (s / p.split) * Math.PI * 2;
            this.spawn(p.x, p.y, sa, ssp, p.damage * p.splitMul, {
              life: 0.35, r: 2, isSplit: true, freeze: p.freeze * 0.5,
              split: p.isSplit ? 0 : Math.max(2, Math.round(p.split / 2)),
              splitMul: p.splitMul * 0.7,
              ricochetPower: p.ricochetPower
            });
          }
        }

        p.hit.push(en.id);

        /* ricochet: the same shot keeps flying to a new target */
        /* ricochet: the same shot keeps flying, and with ricochetPower every hop
           makes it hit harder */
        if (p.ricochet > 0) {
          var hop = game.findNearestEnemy(p.x, p.y, RICOCHET_RANGE, p.hit);
          if (hop) {
            p.ricochet--;
            var ha = Math.atan2(hop.y - p.y, hop.x - p.x);
            var hspeed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
            p.vx = Math.cos(ha) * hspeed;
            p.vy = Math.sin(ha) * hspeed;
            p.angle = ha;
            p.life = Math.max(p.life, 0.45);
            if (p.ricochetPower > 0) p.damage *= 1 + p.ricochetPower;
            game.lightningBolt(p.x, p.y, hop.x, hop.y);
            break;
          }
        }

        if (p.pierce > 0) {
          p.pierce--;
          p.damage *= 0.85;
        } else {
          p.active = false;
          break;
        }
      }
    }
  };

  Projectiles.prototype.draw = function (ctx, camX, camY) {
    for (var i = 0; i < MAX_PROJECTILES; i++) {
      var p = this.items[i];
      if (!p.active) continue;
      var x = Math.round(p.x - camX);
      var y = Math.round(p.y - camY);

      if (p.hostile) {
        var hc = p.web ? '#c8b4ff' : '#ff8f7a';
        ctx.fillStyle = p.web ? 'rgba(200,180,255,0.30)' : 'rgba(255,120,100,0.30)';
        ctx.fillRect(x - 3, y - 3, 6, 6);
        ctx.fillStyle = hc;
        ctx.fillRect(x - 1, y - 1, 3, 3);
        ctx.fillStyle = '#fff3e0';
        ctx.fillRect(x, y, 1, 1);
        continue;
      }

      var core = p.crit ? '#fff0b8' : (p.freeze > 0 ? '#c6ecff' : '#d6f7ff');
      var glow = p.crit ? '#ffcf5c' : (p.freeze > 0 ? '#7fc8ff' : '#7fd8ff');
      var s = p.r >= 4 ? 2 : 1;

      ctx.fillStyle = p.crit ? 'rgba(255,205,92,0.30)' : 'rgba(120,210,255,0.28)';
      ctx.fillRect(x - Math.round(Math.cos(p.angle) * 5) - 1, y - Math.round(Math.sin(p.angle) * 5) - 1, 3, 3);

      if (p.boomerang) {
        var spin = p.angle * 6;
        var dx = Math.cos(spin) * 3, dy = Math.sin(spin) * 3;
        ctx.fillStyle = core;
        ctx.fillRect(x - Math.round(dx), y - Math.round(dy), 2, 2);
        ctx.fillRect(x + Math.round(dx) - 1, y + Math.round(dy) - 1, 2, 2);
        ctx.fillStyle = glow;
        ctx.fillRect(x - 1, y - 1, 3, 3);
        continue;
      }

      ctx.fillStyle = core;
      ctx.fillRect(x - s, y - s, s * 2 + 1, s * 2 + 1);
      ctx.fillStyle = glow;
      ctx.fillRect(x - s - 1, y, 1, 1);
      ctx.fillRect(x + s + 1, y, 1, 1);
      ctx.fillRect(x, y - s - 1, 1, 1);
      ctx.fillRect(x, y + s + 1, 1, 1);
    }
  };

  Projectiles.prototype.clear = function () {
    for (var i = 0; i < MAX_PROJECTILES; i++) this.items[i].active = false;
  };

  Projectiles.prototype.countActive = function () {
    var n = 0;
    for (var i = 0; i < MAX_PROJECTILES; i++) if (this.items[i].active) n++;
    return n;
  };

  /* ============================ pickups ============================ */

  function Gem() {
    this.active = false;
    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.value = 1;
    this.kind = 'xp';
    this.r = 4;
    this.phase = 0;
    this.t = 0;
  }

  function Gems() {
    this.items = [];
    for (var i = 0; i < MAX_GEMS; i++) this.items.push(new Gem());
    this.cursor = 0;
  }

  Gems.prototype.spawn = function (x, y, value, kind) {
    for (var i = 0; i < MAX_GEMS; i++) {
      var g = this.items[(this.cursor + i) % MAX_GEMS];
      if (g.active) continue;
      this.cursor = (this.cursor + i + 1) % MAX_GEMS;
      g.active = true;
      g.x = x; g.y = y;
      var d = PG.randDir();
      var s = PG.rand(18, 42);
      g.vx = d.x * s; g.vy = d.y * s;
      g.value = value;
      g.kind = kind || 'xp';
      g.r = 4;
      g.phase = PG.rand(0, Math.PI * 2);
      g.t = 0;
      return g;
    }
    return null;
  };

  Gems.prototype.update = function (dt, player, game) {
    var range = player.pickupRange;
    var range2 = range * range;
    for (var i = 0; i < MAX_GEMS; i++) {
      var g = this.items[i];
      if (!g.active) continue;
      g.t += dt;
      g.phase += dt * 6;

      var d2 = PG.dist2(g.x, g.y, player.x, player.y);

      if (d2 < range2) {
        var d = Math.sqrt(d2) || 1;
        var pull = PG.lerp(240, 620, 1 - d / range);
        g.vx = ((player.x - g.x) / d) * pull;
        g.vy = ((player.y - g.y) / d) * pull;
      } else {
        var drag = Math.pow(0.86, dt * 60);
        g.vx *= drag; g.vy *= drag;
      }

      g.x += g.vx * dt;
      g.y += g.vy * dt;

      if (d2 < 100) {
        g.active = false;
        if (g.kind === 'heal') {
          player.heal(g.value);
          PG.Audio.play('pick');
          for (var k = 0; k < 6; k++) {
            var a = PG.rand(0, Math.PI * 2);
            game.particles.spawn(player.x, player.y, Math.cos(a) * 40, Math.sin(a) * 40,
              0.35, 2, '#ff8f9a', { drag: 0.87, glow: true });
          }
        } else {
          player.gainXp(g.value, game);
        }
      }
    }
  };

  Gems.prototype.draw = function (ctx, camX, camY) {
    for (var i = 0; i < MAX_GEMS; i++) {
      var g = this.items[i];
      if (!g.active) continue;
      var bob = Math.round(Math.sin(g.phase) * 1.5);
      var sprite = g.kind === 'heal' ? 'heartgem' : 'gem';
      var glowColor = g.kind === 'heal' ? '#ff8f9a' : '#63d98a';
      PG.Sprites.draw(ctx, sprite, g.x, g.y + bob, camX, camY, 0, 1, false);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = glowColor;
      ctx.fillRect(Math.round(g.x - camX) - 3, Math.round(g.y - camY) - 3, 7, 7);
      ctx.globalAlpha = 1;
    }
  };

  Gems.prototype.clear = function () {
    for (var i = 0; i < MAX_GEMS; i++) this.items[i].active = false;
  };

  PG.Projectiles = Projectiles;
  PG.Gems = Gems;
})();
