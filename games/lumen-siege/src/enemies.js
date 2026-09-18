/* LUMEN SIEGE - enemies: eight archetypes with genuinely different behaviour.
 *
 *   crawler  steady tracker with a weaving gait
 *   zipper   keeps its distance, winds up, then lunges; stunned if it hits a wall
 *   spitter  refuses to close in, lobs acid from range
 *   bloater  slow bomb that arms at contact range and detonates
 *   bulwark  armoured slab, turns lazily, enrages below half health
 *   splitter bursts into smaller copies when killed
 *   weaver   spits slowing webs and keeps its distance
 *   shielder immune from the front; you have to get around it
 *
 * Only four of them use a pixel sprite. The rest are drawn procedurally so the
 * roster could expand without waiting on new art.
 */
(function () {
  'use strict';
  var PG = (window.PG = window.PG || {});

  var nextId = 1;

  var DEFS = {
    crawler:  { hp: 24, speed: 37, r: 4, damage: 8,  xp: 3,  sprite: 'crawler',  tier: 1 },
    zipper:   { hp: 13, speed: 30, r: 4, damage: 6,  xp: 4,  sprite: 'zipper',   tier: 2, dashSpeed: 170 },
    spitter:  { hp: 30, speed: 26, r: 5, damage: 7,  xp: 6,  sprite: null,       tier: 2, keep: 170, fireInterval: 2.2 },
    bloater:  { hp: 48, speed: 25, r: 7, damage: 10, xp: 7,  sprite: null,       tier: 3, fuse: 1.0 },
    bulwark:  { hp: 78, speed: 17, r: 7, damage: 16, xp: 9,  sprite: 'bulwark',  tier: 4 },
    splitter: { hp: 42, speed: 30, r: 6, damage: 9,  xp: 6,  sprite: null,       tier: 5, spawns: 3 },
    weaver:   { hp: 34, speed: 28, r: 5, damage: 8,  xp: 7,  sprite: null,       tier: 6, webInterval: 2.6 },
    shielder: { hp: 66, speed: 22, r: 7, damage: 13, xp: 10, sprite: null,       tier: 8 },
    /* late-game pressure: these two exist so the back half cannot be cleared by
       holding the fire button while standing still */
    colossus: { hp: 280, speed: 13, r: 11, damage: 28, xp: 28, sprite: null,      tier: 7 },
    turret:   { hp: 130, speed: 0,  r: 9, damage: 11, xp: 24, sprite: null,      tier: 9, fireInterval: 1.5 }
  };

  /*: An elite is the same archetype with real weight: it hits harder, takes a lot
     more, moves a little slower, and pays out enough xp to be worth the detour. Its
     job is to change what the player does, not to be a bigger sack of health. */
  var ELITE = {
    hp: 2.6,
    damage: 1.5,
    radius: 1.35,
    xp: 3.2,
    speed: 0.92
  };

  function Enemy(type, x, y, hpMult, dmgMult, elite) {
    var d = DEFS[type];
    this.id = nextId++;
    this.type = type;
    this.def = d;
    this.elite = !!elite;
    this.x = x; this.y = y;
    this.r = d.r;
    this.maxHp = Math.round(d.hp * hpMult);
    this.hp = this.maxHp;
    this.speed = d.speed;
    this.damage = Math.round(d.damage * dmgMult);
    this.xp = d.xp;
    this.sprite = d.sprite;

    if (this.elite) {
      this.maxHp = Math.round(this.maxHp * ELITE.hp);
      this.hp = this.maxHp;
      this.damage = Math.round(this.damage * ELITE.damage);
      this.r = this.r * ELITE.radius;
      this.xp = Math.round(this.xp * ELITE.xp);
      this.speed *= ELITE.speed;
    }

    this.angle = 0;
    this.kvx = 0; this.kvy = 0;
    this.flash = 0;
    this.dead = false;
    this.spawnT = 0.45;
    this.t = 0;
    this.phase = PG.rand(0, Math.PI * 2);

    /* timers written by the player's effects */
    this.orbCd = 0;
    this.dashCd = 0;
    this.mark = 0;
    this.burn = 0;
    this.chillT = 0;
    this.chillFactor = 0;
    this.freezeT = 0;      /* fully held: no movement, no attack */
    this.freezeHits = 0;
    this.speedMul = 1;

    /* per-archetype timers */
    this.fireT = PG.rand(0.4, 1.8);
    this.fuseT = null;

    /* stuck detection: enemies walk straight at the player and only slide along
       walls, so one can end up grinding against an obstacle forever. Watching for
       a lack of net movement and then committing to a side-step is the cheap fix. */
    this.lastX = x; this.lastY = y;
    this.stuckT = 0;
    this.detourT = 0;
    this.detourDir = 1;

    /* zipper state machine */
    this.state = 'approach';
    this.stateT = PG.rand(0.1, 0.8);
    this.lockAngle = 0;
  }

  Enemy.prototype.update = function (dt, game) {
    this.t += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.orbCd > 0) this.orbCd -= dt;
    if (this.dashCd > 0) this.dashCd -= dt;

    if (this.spawnT > 0) {
      this.spawnT -= dt;
      return;
    }

    /* freezing stops everything, including burning */
    if (this.freezeT > 0) {
      this.freezeT -= dt;
      if (this.t % 0.3 < dt) game.sparks(this.x, this.y, 0, 1, '#bfe9ff');
      return;
    }

    if (this.burn > 0) {
      this.hp -= this.burn * dt;
      if (this.t % 0.22 < dt) game.sparks(this.x, this.y, 0, 1, '#ff9a5c');
      if (this.hp <= 0) { game.killEnemy(this); return; }
    }

    if (this.chillT > 0) this.chillT -= dt;
    this.speedMul = (1 - game.player.enemySlow) * (this.chillT > 0 ? 1 - this.chillFactor : 1);

    var fn = this['update' + this.type.charAt(0).toUpperCase() + this.type.slice(1)];
    if (fn) fn.call(this, dt, game);

    this.updateStuck(dt, game);

    if (this.kvx || this.kvy) {
      PG.moveCircle(game.world, this, this.kvx * dt, this.kvy * dt);
      var kd = Math.pow(0.008, dt);
      this.kvx *= kd; this.kvy *= kd;
      if (Math.abs(this.kvx) < 1) this.kvx = 0;
      if (Math.abs(this.kvy) < 1) this.kvy = 0;
    }
  };

  /* ---------- behaviours ---------- */

  Enemy.prototype.updateCrawler = function (dt, game) {
    var p = game.player;
    var weave = Math.sin(this.t * 3.1 + this.phase) * 0.42;
    this.angle = Math.atan2(p.y - this.y, p.x - this.x) + weave;
    var s = this.speed * this.speedMul * (1 + Math.sin(this.t * 6 + this.phase) * 0.08);
    PG.moveCircle(game.world, this, Math.cos(this.angle) * s * dt, Math.sin(this.angle) * s * dt);
  };

  Enemy.prototype.updateZipper = function (dt, game) {
    var p = game.player;
    this.stateT -= dt;

    if (this.state === 'approach') {
      var a = Math.atan2(p.y - this.y, p.x - this.x);
      this.angle = a;
      var zs = this.speed * this.speedMul;
      PG.moveCircle(game.world, this, Math.cos(a) * zs * dt, Math.sin(a) * zs * dt);
      var d = PG.dist(this.x, this.y, p.x, p.y);
      if (d < 115 && this.stateT <= 0) {
        this.state = 'wind';
        this.stateT = 0.42;
      }
    } else if (this.state === 'wind') {
      this.angle = Math.atan2(p.y - this.y, p.x - this.x);
      this.lockAngle = this.angle;
      if (this.stateT <= 0) {
        this.state = 'dash';
        this.stateT = 0.30;
      }
    } else if (this.state === 'dash') {
      var bx = this.x, by = this.y;
      var sp = this.def.dashSpeed * this.speedMul;
      PG.moveCircle(game.world, this, Math.cos(this.lockAngle) * sp * dt, Math.sin(this.lockAngle) * sp * dt);
      if (Math.abs(this.x - bx) + Math.abs(this.y - by) < 0.05) {
        this.state = 'stun';
        this.stateT = 0.55;
        game.sparks(this.x, this.y, this.lockAngle, 6, '#ffe08a');
      } else if (this.stateT <= 0) {
        this.state = 'recover';
        this.stateT = 0.34;
      }
    } else if (this.state === 'recover') {
      if (this.stateT <= 0) { this.state = 'approach'; this.stateT = PG.rand(0.25, 0.9); }
    } else if (this.state === 'stun') {
      if (this.stateT <= 0) { this.state = 'recover'; this.stateT = 0.3; }
    }
  };

  /* Refuses to close in: holds a ring at `keep` and lobs acid over it. */
  Enemy.prototype.updateSpitter = function (dt, game) {
    var p = game.player;
    var a = Math.atan2(p.y - this.y, p.x - this.x);
    var d = PG.dist(this.x, this.y, p.x, p.y);
    this.angle = a;
    var s = this.speed * this.speedMul;

    if (d > this.def.keep + 24) {
      PG.moveCircle(game.world, this, Math.cos(a) * s * dt, Math.sin(a) * s * dt);
    } else if (d < this.def.keep - 24) {
      PG.moveCircle(game.world, this, -Math.cos(a) * s * dt, -Math.sin(a) * s * dt);
    } else {
      var side = a + Math.PI / 2 * (this.phase > Math.PI ? 1 : -1);
      PG.moveCircle(game.world, this, Math.cos(side) * s * 0.7 * dt, Math.sin(side) * s * 0.7 * dt);
    }

    this.fireT -= dt;
    if (this.fireT <= 0 && d < 280) {
      this.fireT = this.def.fireInterval;
      game.enemyShot(this.x, this.y, a, 132, this.damage, { acid: true });
    }
  };

  /* Slow bomb: arms only at contact range, then detonates. Killing it early is
     rewarded, which is the whole point of the archetype. */
  Enemy.prototype.updateBloater = function (dt, game) {
    var p = game.player;
    var a = Math.atan2(p.y - this.y, p.x - this.x);
    this.angle = a;
    var s = this.speed * this.speedMul * (this.fuseT == null ? 1 : 0.35);
    PG.moveCircle(game.world, this, Math.cos(a) * s * dt, Math.sin(a) * s * dt);

    var d = PG.dist(this.x, this.y, p.x, p.y);
    if (d < 48) {
      if (this.fuseT == null) {
        this.fuseT = this.def.fuse;
        PG.Audio.play('chain');
      }
      this.fuseT -= dt;
      if (tickLoop(this.t)) game.sparks(this.x, this.y, 0, 1, '#ffb46a');
      if (this.fuseT <= 0) game.bloaterBurst(this);
    }
  };

  /* Keeps a gap and spits webs: the slow makes every other enemy more dangerous. */
  Enemy.prototype.updateWeaver = function (dt, game) {
    var p = game.player;
    var a = Math.atan2(p.y - this.y, p.x - this.x);
    var d = PG.dist(this.x, this.y, p.x, p.y);
    this.angle = a;
    var s = this.speed * this.speedMul;
    if (d > 120) {
      PG.moveCircle(game.world, this, Math.cos(a) * s * dt, Math.sin(a) * s * dt);
    } else if (d < 84) {
      PG.moveCircle(game.world, this, -Math.cos(a) * s * dt, -Math.sin(a) * s * dt);
    }

    this.fireT -= dt;
    if (this.fireT <= 0 && d < 250) {
      this.fireT = this.def.webInterval;
      game.enemyShot(this.x, this.y, a, 96, Math.round(this.damage * 0.5), { web: true });
    }
  };

  /* A wall of hit points that will not be outrun, only out-manoeuvred. */
  Enemy.prototype.updateColossus = function (dt, game) {
    var p = game.player;
    var target = Math.atan2(p.y - this.y, p.x - this.x);
    this.angle += PG.angleDelta(this.angle, target) * Math.min(1, dt * 1.1);
    var s = this.speed * this.speedMul;
    PG.moveCircle(game.world, this, Math.cos(this.angle) * s * dt, Math.sin(this.angle) * s * dt);
  };

  /* Immobile, so it never chases: it denies an area and forces the player to spend
     a detour on it while everything else closes in. */
  Enemy.prototype.updateTurret = function (dt, game) {
    var p = game.player;
    var a = Math.atan2(p.y - this.y, p.x - this.x);
    this.angle = a;
    var d = PG.dist(this.x, this.y, p.x, p.y);
    this.fireT -= dt;
    if (this.fireT <= 0 && d < 330) {
      this.fireT = this.def.fireInterval;
      for (var i = -1; i <= 1; i++) {
        game.enemyShot(this.x + Math.cos(a) * 10, this.y + Math.sin(a) * 10,
          a + i * 0.22, 190, this.damage, { acid: true });
      }
    }
  };

  Enemy.prototype.updateBulwark = function (dt, game) {
    var p = game.player;
    var target = Math.atan2(p.y - this.y, p.x - this.x);
    this.angle += PG.angleDelta(this.angle, target) * Math.min(1, dt * 2.4);
    var enraged = this.hp < this.maxHp * 0.5;
    var s = this.speed * this.speedMul * (enraged ? 1.4 : 1);
    PG.moveCircle(game.world, this, Math.cos(this.angle) * s * dt, Math.sin(this.angle) * s * dt);
  };

  Enemy.prototype.updateSplitter = function (dt, game) {
    var p = game.player;
    var a = Math.atan2(p.y - this.y, p.x - this.x) + Math.sin(this.t * 2.2 + this.phase) * 0.2;
    this.angle = a;
    var s = this.speed * this.speedMul;
    PG.moveCircle(game.world, this, Math.cos(a) * s * dt, Math.sin(a) * s * dt);
  };

  /* Walks straight at you and never turns: front armour means circling it. */
  Enemy.prototype.updateShielder = function (dt, game) {
    var p = game.player;
    var target = Math.atan2(p.y - this.y, p.x - this.x);
    this.angle += PG.angleDelta(this.angle, target) * Math.min(1, dt * 3.0);
    var s = this.speed * this.speedMul;
    PG.moveCircle(game.world, this, Math.cos(this.angle) * s * dt, Math.sin(this.angle) * s * dt);
  };

  /* If a body barely moved for a while, it is grinding on something. Push it
     sideways for a moment so it slides free instead of pinning itself. */
  Enemy.prototype.updateStuck = function (dt, game) {
    if (this.speed <= 0) return;            /* turrets are meant to sit still */
    var moved = Math.abs(this.x - this.lastX) + Math.abs(this.y - this.lastY);
    this.lastX = this.x; this.lastY = this.y;

    if (this.detourT > 0) {
      this.detourT -= dt;
      var a = Math.atan2(game.player.y - this.y, game.player.x - this.x)
        + this.detourDir * (Math.PI / 2);
      var s = this.speed * this.speedMul;
      PG.moveCircle(game.world, this, Math.cos(a) * s * dt, Math.sin(a) * s * dt);
      return;
    }

    if (moved < this.speed * this.speedMul * dt * 0.35) {
      this.stuckT += dt;
    } else {
      this.stuckT = 0;
    }
    if (this.stuckT > 0.45) {
      this.stuckT = 0;
      this.detourT = PG.rand(0.30, 0.65);
      this.detourDir = PG.rng.next() < 0.5 ? 1 : -1;
    }
  };

  function tickLoop(t) { return t % 0.16 < 1 / 60; }

  /* ---------- draw ---------- */

  Enemy.prototype.draw = function (ctx, camX, camY) {
    if (this.dead) return;
    var spawn = this.spawnT > 0;
    var alpha = spawn ? PG.clamp(1 - this.spawnT / 0.45, 0.15, 1) : 1;
    var flash = this.flash > 0;
    var angle = this.type === 'zipper' ? this.angle : 0;

    var px = Math.round(this.x - camX);
    var py = Math.round(this.y - camY);

    if (this.type === 'zipper' && this.state === 'wind') {
      var k = 1 - this.stateT / 0.42;
      ctx.globalAlpha = 0.25 + 0.55 * k;
      ctx.fillStyle = '#fff3b0';
      var rad = 4 + k * 5;
      ctx.fillRect(px - rad, py - 1, rad * 2, 2);
      ctx.fillRect(px - 1, py - rad, 2, rad * 2);
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = alpha;
    if (this.sprite) {
      PG.Sprites.draw(ctx, this.sprite, this.x, this.y, camX, camY, angle, 1, flash);
    } else {
      drawShape(ctx, this, px, py, flash);
    }
    ctx.globalAlpha = 1;

    /* Elites wear a gold ring so the threat level is visible before contact. */
    if (this.elite) {
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(this.t * 3);
      ctx.strokeStyle = '#ffd76a';
      var er = Math.round(this.r) + 3;
      for (var s2 = 0; s2 < 12; s2++) {
        var sa2 = (s2 / 12) * Math.PI * 2 + this.t * 0.6;
        ctx.fillStyle = '#ffd76a';
        ctx.fillRect(px + Math.round(Math.cos(sa2) * er), py + Math.round(Math.sin(sa2) * er), 2, 2);
      }
      ctx.globalAlpha = 1;
    }

    if (this.type === 'bulwark' && this.hp < this.maxHp) {
      var bx = px - 7, by = py - 11;
      ctx.fillStyle = '#1a0f1e';
      ctx.fillRect(bx - 1, by - 1, 16, 4);
      ctx.fillStyle = '#a86fbb';
      ctx.fillRect(bx, by, Math.round(14 * Math.max(0, this.hp / this.maxHp)), 2);
    }

    /* frozen enemies get a visible shell so the state is unmistakable */
    if (this.freezeT > 0) {
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#bfe9ff';
      var fr = this.r + 3;
      ctx.fillRect(px - fr, py - fr, fr * 2, 1);
      ctx.fillRect(px - fr, py + fr, fr * 2, 1);
      ctx.fillRect(px - fr, py - fr, 1, fr * 2);
      ctx.fillRect(px + fr, py - fr, 1, fr * 2);
      ctx.globalAlpha = 1;
    }

    if (this.mark > 0) {
      var mx = px - (this.mark * 2) + 1;
      var my = py - (this.type === 'bulwark' ? 15 : 9);
      ctx.fillStyle = '#ffe9a8';
      for (var m = 0; m < this.mark; m++) ctx.fillRect(mx + m * 2, my, 1, 2);
    }
  };

  /* Procedural shapes for the archetypes that have no pixel sprite yet. */
  function drawShape(ctx, e, px, py, flash) {
    var body = flash ? '#ffffff' : null;
    var arm = e.fuseT != null && Math.floor(e.t * 12) % 2 === 0;

    if (e.type === 'spitter') {
      ctx.fillStyle = body || '#5d3a86';
      ctx.fillRect(px - 5, py - 5, 10, 10);
      ctx.fillStyle = body || '#8a5fc0';
      ctx.fillRect(px - 4, py - 4, 8, 8);
      ctx.fillStyle = body || (arm ? '#ff8f7a' : '#d8b4ff');
      var mx = Math.round(Math.cos(e.angle) * 5);
      var my = Math.round(Math.sin(e.angle) * 5);
      ctx.fillRect(px + mx - 2, py + my - 2, 4, 4);
      ctx.fillStyle = body || '#1a0f1e';
      ctx.fillRect(px - 2, py - 3, 1, 1);
      ctx.fillRect(px + 2, py - 3, 1, 1);
      return;
    }

    if (e.type === 'bloater') {
      var pulse = arm ? 1 : 0;
      ctx.fillStyle = body || (arm ? '#c25a3a' : '#7a4a2a');
      ctx.fillRect(px - 7 + pulse, py - 7 + pulse, 14 - pulse * 2, 14 - pulse * 2);
      ctx.fillStyle = body || (arm ? '#ff9a6a' : '#a86a3a');
      ctx.fillRect(px - 5, py - 5, 10, 10);
      ctx.fillStyle = body || '#ffe08a';
      ctx.fillRect(px - 3, py - 2, 2, 2);
      ctx.fillRect(px + 2, py - 2, 2, 2);
      ctx.fillStyle = body || '#3a2418';
      ctx.fillRect(px - 1, py + 3, 3, 1);
      return;
    }

    if (e.type === 'splitter') {
      ctx.fillStyle = body || '#2f6b4a';
      ctx.fillRect(px - 6, py - 5, 12, 10);
      ctx.fillStyle = body || '#4fa86f';
      ctx.fillRect(px - 4, py - 4, 8, 8);
      ctx.fillStyle = body || '#1d4430';
      ctx.fillRect(px - 1, py - 4, 1, 8);
      ctx.fillRect(px - 4, py - 1, 8, 1);
      ctx.fillStyle = body || '#d8ffe4';
      ctx.fillRect(px - 3, py - 3, 1, 1);
      ctx.fillRect(px + 2, py - 3, 1, 1);
      return;
    }

    if (e.type === 'weaver') {
      ctx.fillStyle = body || '#3d2b52';
      ctx.fillRect(px - 3, py - 6, 6, 12);
      ctx.fillStyle = body || '#9a7ac0';
      ctx.fillRect(px - 2, py - 5, 4, 10);
      ctx.fillStyle = body || '#6b4f8a';
      for (var w = -1; w <= 1; w++) {
        var leg = Math.sin(e.t * 8 + w) * 1.5;
        ctx.fillRect(px - 6, Math.round(py + leg), 3, 1);
        ctx.fillRect(px + 3, Math.round(py - leg), 3, 1);
      }
      ctx.fillStyle = body || '#ffe08a';
      ctx.fillRect(px - 1, py - 4, 1, 1);
      ctx.fillRect(px + 1, py - 4, 1, 1);
      return;
    }

    if (e.type === 'shielder') {
      ctx.fillStyle = body || '#243a52';
      ctx.fillRect(px - 6, py - 6, 12, 12);
      ctx.fillStyle = body || '#3f6f9a';
      ctx.fillRect(px - 5, py - 5, 10, 10);
      /* the shield sits on the facing side: it is the readable weak-point cue */
      var hx = Math.round(Math.cos(e.angle) * 6);
      var hy = Math.round(Math.sin(e.angle) * 6);
      ctx.fillStyle = body || '#8fd0f5';
      ctx.fillRect(px + hx - 3, py + hy - 3, 6, 6);
      ctx.fillStyle = body || '#e6fbff';
      ctx.fillRect(px + hx - 1, py + hy - 1, 3, 3);
      ctx.fillStyle = body || '#0d1b28';
      ctx.fillRect(px - 3, py - 3, 1, 1);
      ctx.fillRect(px + 2, py - 3, 1, 1);
      return;
    }

    if (e.type === 'colossus') {
      ctx.fillStyle = body || '#2b2030';
      ctx.fillRect(px - 11, py - 11, 22, 22);
      ctx.fillStyle = body || '#4a3a52';
      ctx.fillRect(px - 9, py - 9, 18, 18);
      ctx.fillStyle = body || '#6b5478';
      ctx.fillRect(px - 7, py - 7, 14, 14);
      /* a heavy spine reads as mass without needing detail */
      ctx.fillStyle = body || '#20161f';
      ctx.fillRect(px - 1, py - 9, 2, 18);
      ctx.fillRect(px - 9, py - 1, 18, 2);
      ctx.fillStyle = body || (arm ? '#ff8f7a' : '#ffd76a');
      ctx.fillRect(px - 4, py - 4, 3, 3);
      ctx.fillRect(px + 2, py - 4, 3, 3);
      return;
    }

    if (e.type === 'turret') {
      ctx.fillStyle = body || '#22303f';
      ctx.fillRect(px - 9, py - 9, 18, 18);
      ctx.fillStyle = body || '#3d556e';
      ctx.fillRect(px - 7, py - 7, 14, 14);
      ctx.fillStyle = body || '#0f1a24';
      ctx.fillRect(px - 5, py - 5, 10, 10);
      /* the barrel points at you: the threat direction is always readable */
      var bx2 = Math.round(Math.cos(e.angle) * 12);
      var by2 = Math.round(Math.sin(e.angle) * 12);
      ctx.fillStyle = body || (arm ? '#ffb46a' : '#7fd8ff');
      ctx.fillRect(px + bx2 - 2, py + by2 - 2, 5, 5);
      ctx.fillRect(px + Math.round(bx2 * 0.55) - 2, py + Math.round(by2 * 0.55) - 2, 4, 4);
      ctx.fillStyle = body || '#ffe08a';
      ctx.fillRect(px - 2, py - 2, 4, 4);
      return;
    }

    ctx.fillStyle = body || '#d8543f';
    ctx.fillRect(px - 4, py - 4, 8, 8);
  }

  PG.Enemy = Enemy;
  PG.ENEMY_DEFS = DEFS;
})();
