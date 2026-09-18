/* LUMEN SIEGE - game: run lifecycle, spawning, difficulty ramp, world orchestration.
   Nothing here reaches outside the browser: no network, no assets, no build step. */
(function () {
  'use strict';
  var PG = (window.PG = window.PG || {});

  var SHAKE_MARGIN = 10;

  function Game(ctx) {
    this.ctx = ctx;
    this.state = 'menu';           /* menu | playing | upgrade | pause | dead */
    this.world = null;
    this.player = null;
    this.enemies = [];
    this.projectiles = new PG.Projectiles();
    this.gems = new PG.Gems();
    this.particles = new PG.Particles(1100);

    this.camX = 0; this.camY = 0;
    this.time = 0;
    this.kills = 0;
    this.tier = 1;
    this.spawnTimer = 0;
    this.pendingLevelUps = 0;
    this.currentOffers = [];
    this.upgradePhase = 'offense';

    this.shakeAmount = 0;
    this.shakeTime = 0;

    this.wells = [];
    this.mines = [];
    this.clouds = [];
    this.hostiles = new PG.Projectiles();
    this.heartTimer = 0.6;
    this.lastShakeAt = -1;
    this.flowTimer = 0;

    this.vignette = null;
    this.records = { bestTime: 0, bestLevel: 1, bestKills: 0 };

    this._explodeDepth = 0;
  }

  /* ---------- persistence ---------- */

  Game.prototype.loadSettings = function () {
    var s = PG.store.get('lumen.settings.v1', { muted: false });
    PG.Audio.setMuted(!!s.muted);
  };

  Game.prototype.loadRecords = function () {
    this.records = PG.store.get('lumen.records.v1', { bestTime: 0, bestLevel: 1, bestKills: 0 });
  };

  /* ---------- run lifecycle ---------- */

  Game.prototype.newRun = function () {
    this.world = new PG.World().generate((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    this.world.bake();

    var cx = this.world.w / 2;
    var cy = this.world.h / 2;
    this.player = new PG.Player(cx, cy);

    this.enemies.length = 0;
    this.projectiles.clear();
    this.gems.clear();
    this.particles = new PG.Particles(1100);

    this.camX = PG.clamp(cx - PG.VIEW_W / 2, SHAKE_MARGIN, this.world.w - PG.VIEW_W - SHAKE_MARGIN);
    this.camY = PG.clamp(cy - PG.VIEW_H / 2, SHAKE_MARGIN, this.world.h - PG.VIEW_H - SHAKE_MARGIN);

    this.time = 0;
    this.kills = 0;
    this.tier = 1;
    this.spawnTimer = 0.35;
    this.pendingLevelUps = 0;
    this.currentOffers = [];
    this.upgradePhase = 'offense';
    this.shakeAmount = 0;
    this.shakeTime = 0;
    this.wells.length = 0;
    this.mines.length = 0;
    this.clouds.length = 0;
    this.hostiles.clear();
    this.heartTimer = 0.6;
    this.lastShakeAt = -1;
    this.flowTimer = 0;
    this.world.buildFlow(cx, cy);

    /* Opening crowd. Three was too thin to read as a threat: with the first wave also
       waiting 1.2s, the first second or two were effectively an empty arena. Five
       placed off-screen gives the player something to do immediately without
       dogpiling someone who is still learning the controls. */
    var placed = 0;
    for (var t = 0; t < 16 && placed < 5; t++) {
      var s = this.findSpawnPoint(150 + t * 12, 240 + t * 26, 14);
      if (s) { this.addEnemy('crawler', s.x, s.y, false); placed++; }
    }

    this.state = 'playing';
    PG.Input.reset();
    PG.Audio.resetMusic();
    PG.Audio.resetCombo();
    PG.UI.resetHud();
    PG.UI.showHud(true);
    PG.UI.showScreen(null);
  };

  Game.prototype.toMenu = function () {
    this.state = 'menu';
    /* Drop the arena, otherwise the frozen last frame shows through the menu overlay. */
    this.world = null;
    this.player = null;
    this.enemies.length = 0;
    this.projectiles.clear();
    this.gems.clear();
    PG.UI.showHud(false);
    PG.UI.showScreen('start');
    PG.UI.renderRecords(this.records);
  };

  Game.prototype.onPlayerDeath = function () {
    this.state = 'dead';
    this.shake(4.5, 0.5);
    PG.Audio.play('death');

    var p = this.player;
    for (var i = 0; i < 40; i++) {
      var d = PG.randDir();
      var sp = PG.rand(30, 170);
      this.particles.spawn(p.x, p.y, d.x * sp, d.y * sp, PG.rand(0.4, 1.0), PG.rand(1, 3),
        i % 3 === 0 ? '#bfeeff' : '#2b7f9c', { drag: 0.9, glow: true });
    }

    var stats = { time: this.time, kills: this.kills, level: p.level };
    var isNew = false;
    if (stats.time > this.records.bestTime) { this.records.bestTime = stats.time; isNew = true; }
    if (stats.kills > this.records.bestKills) { this.records.bestKills = stats.kills; isNew = true; }
    if (stats.level > this.records.bestLevel) { this.records.bestLevel = stats.level; isNew = true; }
    PG.store.set('lumen.records.v1', this.records);

    PG.UI.showHud(false);
    PG.UI.renderResult(stats, isNew);
    window.setTimeout(function () { PG.UI.showScreen('dead'); }, 620);
  };

  /* ---------- difficulty ---------- */

  Game.prototype.tierFor = function () { return Math.min(12, 1 + Math.floor(this.time / 24)); };
  Game.prototype.spawnIntervalFor = function (tier) { return Math.max(0.30, 1.15 - (tier - 1) * 0.09); };
  Game.prototype.maxAliveFor = function (tier) { return Math.min(72, 20 + (tier - 1) * 6); };
  Game.prototype.hpMultFor = function (tier) {
    /* Steeper after the mid game. The late-game complaint was that everything melted:
       a flat slope meant a fully built player deleted each wave on contact. */
    var base = 1 + (tier - 1) * 0.17;
    if (tier > 6) base += (tier - 6) * 0.15;
    return base;
  };
  Game.prototype.dmgMultFor = function (tier) {
    /* Raised alongside the new baseline survivability (3%/s regen and a rechargeable
       shield layer): without it the opening becomes a no-lose walk. */
    var base = 1 + (tier - 1) * 0.13;
    if (tier > 6) base += (tier - 6) * 0.08;
    return base;
  };

  Game.prototype.pickType = function (tier) {
    var w = {
      crawler: Math.max(0.30, 1 - tier * 0.055),
      zipper: tier >= 2 ? 0.50 : 0,
      spitter: tier >= 2 ? 0.34 : 0,
      bloater: tier >= 3 ? 0.30 : 0,
      bulwark: tier >= 4 ? 0.34 : 0,
      splitter: tier >= 5 ? 0.28 : 0,
      weaver: tier >= 6 ? 0.26 : 0,
      colossus: tier >= 7 ? 0.20 : 0,
      shielder: tier >= 8 ? 0.26 : 0,
      turret: tier >= 9 ? 0.22 : 0
    };
    var total = 0, k;
    for (k in w) total += w[k];
    var roll = PG.rng.next() * total;
    for (k in w) {
      roll -= w[k];
      if (roll <= 0) return k;
    }
    return 'crawler';
  };

  /*: Chance that a spawn is elite. Zero until the mid game, then it climbs. */
  Game.prototype.eliteChanceFor = function (tier) {
    if (tier < 5) return 0;
    return Math.min(0.24, (tier - 4) * 0.05);
  };

  /* An open tile far enough away that it is off-screen.

     `clearance` is the free radius the spot must offer. It used to be a hard-coded 12,
     which was fine for the small archetypes and silently too small for the big ones:
     the colossus has radius 11, and an elite multiplies that by 1.35 to 14.85, so an
     elite colossus could be placed in a gap it did not fit into and wedge there. */
  Game.prototype.findSpawnPoint = function (minD, maxD, clearance) {
    var p = this.player;
    var need = clearance || 12;
    for (var i = 0; i < 40; i++) {
      var a = PG.rand(0, Math.PI * 2);
      var d = PG.rand(minD, maxD);
      var x = p.x + Math.cos(a) * d;
      var y = p.y + Math.sin(a) * d;
      if (x < 40 || y < 40 || x > this.world.w - 40 || y > this.world.h - 40) continue;
      if (this.world.circleHits(x, y, need)) continue;
      var sx = x - this.camX;
      var sy = y - this.camY;
      if (sx > -24 && sx < PG.VIEW_W + 24 && sy > -24 && sy < PG.VIEW_H + 24) continue;
      return { x: x, y: y };
    }
    return null;
  };

  /* How much room a given archetype needs, including the elite size-up. */
  Game.prototype.clearanceFor = function (type, elite) {
    var def = PG.ENEMY_DEFS[type];
    var r = def ? def.r : 5;
    if (elite) r *= 1.35;
    /* Margin covers the drawn sprite, not just the collision circle: at +4 a body
       could be legally placed with its artwork overlapping the rock it then had to
       squeeze past, which reads as "spawned inside a wall". */
    return Math.ceil(r) + 8;
  };

  Game.prototype.addEnemy = function (type, x, y, forceElite) {
    /* The caller may have already decided elite-ness to size the spawn clearance;
       rolling again here would let the two disagree. */
    var elite = forceElite === undefined
      ? PG.rng.next() < this.eliteChanceFor(this.tier)
      : forceElite;
    var e = new PG.Enemy(type, x, y, this.hpMultFor(this.tier), this.dmgMultFor(this.tier), elite);
    /* Enemies get tougher with the tier, so they have to be worth more xp too:
       otherwise a long run starves and the levelling curve feels like a wall. */
    e.xp = Math.max(1, Math.round(e.xp * (1 + 0.16 * (this.tier - 1))));
    this.enemies.push(e);
    /* ground burst so the spawn is announced */
    for (var i = 0; i < 7; i++) {
      var a = PG.rand(0, Math.PI * 2);
      var sp = PG.rand(20, 70);
      this.particles.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, PG.rand(0.2, 0.45), 2, '#4a5c70', { drag: 0.86 });
    }
    return e;
  };

  /* ---------- combat callbacks ---------- */

  Game.prototype.sparks = function (x, y, angle, count, color) {
    for (var i = 0; i < count; i++) {
      var a = angle + PG.rand(-0.9, 0.9);
      var sp = PG.rand(30, 110);
      this.particles.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, PG.rand(0.1, 0.28),
        PG.rand(1, 2), color, { drag: 0.85, glow: true });
    }
  };

  /* Shake is punctuation, not a background state: a cooldown so dense events cannot
     refresh it every frame, plus a hard cap. Previously every shot called shake, so
     in a real fight the screen never settled. */
  Game.prototype.shake = function (amount, duration) {
    if (this.time - this.lastShakeAt < 0.18) return;
    this.lastShakeAt = this.time;
    var capped = Math.min(amount, 4.5);
    if (capped > this.shakeAmount) this.shakeAmount = capped;
    if (duration > this.shakeTime) this.shakeTime = duration;
  };

  Game.prototype.damageEnemy = function (e, amount, angle, knock, crit, execute, source) {
    if (e.dead) return;

    /* shielder: the facing side is armoured, so you have to come around it */
    if (e.type === 'shielder') {
      var facing = Math.abs(PG.angleDelta(e.angle, angle + Math.PI));
      if (facing < 1.2) {
        amount *= 0.15;
        this.sparks(e.x - Math.cos(angle) * 6, e.y - Math.sin(angle) * 6, angle, 2, '#8fd0f5');
      }
    }

    /* frozen targets take extra and shatter after enough hits */
    if (e.freezeT > 0) {
      amount *= 1.5;
      e.freezeHits = (e.freezeHits || 0) + 1;
      if (e.freezeHits >= 3) {
        amount = e.hp + 1;
        this.sparks(e.x, e.y, 0, 14, '#bfe9ff');
        PG.Audio.play('boom');
      }
    }

    e.hp -= amount;
    e.flash = 0.09;

    var resist = e.type === 'bulwark' ? 0.25 : (e.type === 'zipper' ? 1.15 : 1);
    if (knock) {
      e.kvx += Math.cos(angle) * knock * resist;
      e.kvy += Math.sin(angle) * knock * resist;
    }

    this.sparks(e.x, e.y, angle, 3, '#ffe9c4');
    PG.Audio.play(crit ? 'crit' : 'hit');

    if (this.player) {
      this.player.registerHit();
      /* Time stop only rolls for a direct hit from the player's own weapon. It used
         to roll on every damage event, which meant a split volley of eight shards
         rolled eight times and a full-screen bullet storm froze the field constantly.
         Secondary sources (shards, orbit, dash, explosions, thorns, chain) never roll. */
      if (source === 'shot' && this.player.timeStopChance > 0
          && PG.rng.next() < this.player.timeStopChance) {
        this.freezeAll(0.34);
      }
    }

    if (e.hp <= 0) this.killEnemy(e);
  };

  /* Element reaction feedback: the payoff for stacking two damage types. */
  Game.prototype.elementReaction = function (x, y, kind) {
    var color = kind === 'freeze' ? '#bfe9ff' : '#ffd76a';
    for (var i = 0; i < 18; i++) {
      var a = (i / 18) * Math.PI * 2;
      this.particles.spawn(x, y, Math.cos(a) * 120, Math.sin(a) * 120,
        0.38, 3, color, { drag: 0.85, glow: true });
    }
    this.shake(1.5, 0.12);
    PG.Audio.play('shield');
  };

  /* Time stop: every enemy on the field is held for a moment. */
  Game.prototype.freezeAll = function (seconds) {
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (e.dead) continue;
      e.freezeT = Math.max(e.freezeT, seconds);
    }
    this.shake(2.2, 0.2);
    PG.Audio.play('chain');
  };

  /* Incoming fire. There are archetypes that refuse to close in, so the player
     needs something to dodge at range. */
  Game.prototype.enemyShot = function (x, y, angle, speed, damage, opts) {
    opts = opts || {};
    var p = this.hostiles.spawn(x, y, angle, speed, damage, {
      r: opts.web ? 4 : 3,
      life: 3.4,
      hostile: true,
      web: !!opts.web,
      acid: !!opts.acid
    });
    if (p) PG.Audio.play('shot');
    return p;
  };

  /* Bloater detonation: hurts the player at contact range, and pops on death. */
  Game.prototype.bloaterBurst = function (e, fromDeath) {
    if (e.burst) return;
    e.burst = true;
    var radius = 58;
    var p = this.player;
    if (p && !p.dead) {
      var d = PG.dist(p.x, p.y, e.x, e.y);
      if (d < radius) {
        p.takeDamage(Math.round(e.damage * 1.6), e.x, e.y, this);
      }
    }
    for (var i = 0; i < 20; i++) {
      var a = (i / 20) * Math.PI * 2;
      this.particles.spawn(e.x, e.y, Math.cos(a) * 160, Math.sin(a) * 160,
        0.32, 3, i % 3 === 0 ? '#ffc46a' : '#ff7a4a', { drag: 0.84, glow: true });
    }
    this.shake(2.6, 0.2);
    PG.Audio.play('boom');
    if (!fromDeath) {
      e.hp = 0;
      this.killEnemy(e);
    }
  };

  /* Shield break sends a ring of shards outward. */
  Game.prototype.shieldNova = function (x, y, count) {
    for (var i = 0; i < count; i++) {
      var a = (i / count) * Math.PI * 2 + PG.rand(-0.1, 0.1);
      this.projectiles.spawn(x, y, a, 195, 15,
        { life: 0.62, r: 3, knock: 50, mark: this.player ? this.player.markPower : 0 });
    }
    PG.Audio.play('boom');
  };

  Game.prototype.dropMine = function (x, y, damage) {
    this.mines.push({ x: x, y: y, damage: damage, t: 0, arm: 0.45 });
    if (this.mines.length > 26) this.mines.shift();
  };

  Game.prototype.updateMines = function (dt) {
    for (var i = this.mines.length - 1; i >= 0; i--) {
      var m = this.mines[i];
      m.t += dt;
      if (m.arm > 0) { m.arm -= dt; continue; }
      var hit = false;
      for (var k = 0; k < this.enemies.length; k++) {
        var e = this.enemies[k];
        if (e.dead || e.spawnT > 0) continue;
        var rr = e.r + 8;
        if (PG.dist2(m.x, m.y, e.x, e.y) > rr * rr) continue;
        hit = true;
        break;
      }
      if (hit) {
        this.explode(m.x, m.y, 46, m.damage);
        this.mines.splice(i, 1);
      }
    }
  };

  Game.prototype.addCloud = function (x, y, radius, damage) {
    this.clouds.push({ x: x, y: y, r: radius, damage: damage, t: 4.5, max: 4.5 });
    if (this.clouds.length > 14) this.clouds.shift();
  };

  Game.prototype.updateClouds = function (dt) {
    for (var i = this.clouds.length - 1; i >= 0; i--) {
      var c = this.clouds[i];
      c.t -= dt;
      if (c.t <= 0) { this.clouds.splice(i, 1); continue; }
      for (var k = 0; k < this.enemies.length; k++) {
        var e = this.enemies[k];
        if (e.dead || e.spawnT > 0) continue;
        if (PG.dist2(c.x, c.y, e.x, e.y) > c.r * c.r) continue;
        e.hp -= c.damage * dt;
        e.flash = Math.max(e.flash, 0.04);
        if (e.hp <= 0) this.killEnemy(e);
      }
      if (Math.random() < 0.35) {
        this.particles.spawn(c.x + PG.rand(-c.r, c.r), c.y + PG.rand(-c.r, c.r),
          PG.rand(-6, 6), PG.rand(-14, -4), 0.7, 2, '#7fdc8a', { drag: 0.98 });
      }
    }
  };

  Game.prototype.drawDeployables = function (ctx, camX, camY) {
    var i;
    for (i = 0; i < this.clouds.length; i++) {
      var c = this.clouds[i];
      var k = Math.min(1, c.t / 0.8);
      ctx.globalAlpha = 0.16 * k;
      ctx.fillStyle = '#7fdc8a';
      var n = 14;
      for (var q = 0; q < n; q++) {
        var qa = (q / n) * Math.PI * 2 + c.t * 0.6;
        ctx.fillRect(Math.round(c.x - camX + Math.cos(qa) * c.r),
          Math.round(c.y - camY + Math.sin(qa) * c.r), 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    for (i = 0; i < this.mines.length; i++) {
      var m = this.mines[i];
      var mx = Math.round(m.x - camX);
      var my = Math.round(m.y - camY);
      var blink = m.arm > 0 || Math.floor(m.t * 8) % 2 === 0;
      ctx.fillStyle = blink ? '#ffd76a' : '#8a6a2a';
      ctx.fillRect(mx - 3, my - 2, 6, 5);
      ctx.fillStyle = '#3a2c10';
      ctx.fillRect(mx - 1, my - 1, 2, 2);
    }
  };

  /* A gravity well: drags enemies inward and grinds them while it lasts.
     Damage is applied directly rather than through damageEnemy, so a well does
     not flood the screen with sparks and sound on every tick. */
  Game.prototype.openWell = function (x, y, radius, damage) {
    this.wells.push({ x: x, y: y, r: radius, t: 1.3, max: 1.3, damage: damage });
    if (this.wells.length > 4) this.wells.shift();
    PG.Audio.play('chain');
    this.shake(1.3, 0.1);
  };

  Game.prototype.updateWells = function (dt) {
    for (var i = this.wells.length - 1; i >= 0; i--) {
      var w = this.wells[i];
      w.t -= dt;
      if (w.t <= 0) { this.wells.splice(i, 1); continue; }

      var pulse = 0.55 + 0.45 * Math.sin(w.t * 20);
      for (var k = 0; k < this.enemies.length; k++) {
        var e = this.enemies[k];
        if (e.dead || e.spawnT > 0) continue;
        var d = PG.dist(e.x, e.y, w.x, w.y);
        if (d > w.r) continue;
        var a = Math.atan2(w.y - e.y, w.x - e.x);
        var pull = (1 - d / w.r) * 240 * pulse;
        PG.moveCircle(this.world, e, Math.cos(a) * pull * dt, Math.sin(a) * pull * dt);
        e.hp -= w.damage * dt;
        e.flash = Math.max(e.flash, 0.05);
        if (e.hp <= 0) this.killEnemy(e);
      }
    }
  };

  Game.prototype.drawWells = function (ctx, camX, camY) {
    for (var i = 0; i < this.wells.length; i++) {
      var w = this.wells[i];
      var cx = Math.round(w.x - camX);
      var cy = Math.round(w.y - camY);
      var k = w.t / w.max;
      ctx.globalAlpha = 0.55 * k;
      ctx.fillStyle = '#a98bff';
      var n = 18;
      for (var s = 0; s < n; s++) {
        var a = (s / n) * Math.PI * 2 + (1 - k) * 7;
        var rr = w.r * (0.3 + 0.7 * (1 - k));
        ctx.fillRect(cx + Math.round(Math.cos(a) * rr), cy + Math.round(Math.sin(a) * rr), 2, 2);
      }
      ctx.fillStyle = '#e2d6ff';
      ctx.fillRect(cx - 1, cy - 1, 3, 3);
      ctx.globalAlpha = 1;
    }
  };

  Game.prototype.killEnemy = function (e) {
    if (e.dead) return;
    e.dead = true;
    this.kills++;

    var big = e.type === 'bulwark';
    var burst = big ? 22 : 12;
    for (var i = 0; i < burst; i++) {
      var a = PG.rand(0, Math.PI * 2);
      var sp = PG.rand(30, big ? 190 : 130);
      this.particles.spawn(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp,
        PG.rand(0.25, 0.7), PG.rand(1, big ? 3 : 2),
        i % 4 === 0 ? '#ffffff' : (big ? '#a86fbb' : '#d8543f'),
        { drag: 0.87, glow: true });
    }

    this.gems.spawn(e.x, e.y, e.xp);
    if (big) {
      this.gems.spawn(e.x + 3, e.y, Math.max(1, Math.round(e.xp / 3)));
      this.shake(2.0, 0.14);
      PG.Audio.play('bigkill');
    } else {
      PG.Audio.play('kill');
    }

    /* on-kill upgrades */
    var p = this.player;
    if (p) {
      if (p.lifesteal > 0) p.heal(p.lifesteal);
      if (p.lootChance > 0 && PG.rng.next() < p.lootChance) {
        this.gems.spawn(e.x + PG.rand(-7, 7), e.y + PG.rand(-7, 7), 8, 'heal');
      }
      if (p.explodeRadius > 0) {
        /* shattering a frozen enemy turns the pop into a much bigger one */
        var radius = p.explodeRadius * (e.freezeT > 0 ? 1.8 : 1);
        this.explode(e.x, e.y, radius, p.explodeDamage * p.damageMultiplier());
        if (e.freezeT > 0) this.elementReaction(e.x, e.y, 'shatter');
      }
      if (p.poisonRadius > 0) {
        this.addCloud(e.x, e.y, p.poisonRadius, p.poisonDamage);
      }
      /* a kill sprays shards outward: the payoff for fighting inside a pack */
      if (p.shrapnel > 0) {
        var sdmg = p.shrapnelDamage * p.damageMultiplier();
        for (var sh = 0; sh < p.shrapnel; sh++) {
          var sha = (sh / p.shrapnel) * Math.PI * 2 + PG.rand(-0.2, 0.2);
          this.projectiles.spawn(e.x, e.y, sha, 175, sdmg,
            { life: 0.4, r: 2.5, knock: 30, isSplit: true });
        }
      }
    }

    /* a splitter leaves smaller copies behind */
    if (e.type === 'splitter') {
      var count = e.def.spawns;
      for (var s = 0; s < count; s++) {
        var sa = (s / count) * Math.PI * 2 + PG.rand(-0.3, 0.3);
        var nx = e.x + Math.cos(sa) * 16;
        var ny = e.y + Math.sin(sa) * 16;
        if (this.world.circleHits(nx, ny, 6)) continue;
        var child = this.addEnemy('crawler', nx, ny);
        child.spawnT = 0.12;
        child.maxHp = Math.max(6, Math.round(child.maxHp * 0.55));
        child.hp = child.maxHp;
        child.r = 3;
      }
    }

    /* a bloater pops even when you are the one who killed it */
    if (e.type === 'bloater') this.bloaterBurst(e, true);
  };

  /* ---------- upgrade-driven area effects ---------- */

  Game.prototype.findNearestEnemy = function (x, y, maxDist, exclude) {
    var best = null;
    var bestD = maxDist * maxDist;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (e.dead || e.spawnT > 0) continue;
      if (exclude && exclude.indexOf(e.id) >= 0) continue;
      var d = PG.dist2(x, y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  };

  Game.prototype.lightningBolt = function (x1, y1, x2, y2) {
    var steps = Math.max(3, Math.round(PG.dist(x1, y1, x2, y2) / 5));
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      this.particles.spawn(
        PG.lerp(x1, x2, t) + PG.rand(-2, 2),
        PG.lerp(y1, y2, t) + PG.rand(-2, 2),
        0, 0, 0.18, 2, '#cfe9ff', { drag: 0.6, glow: true });
    }
  };

  Game.prototype.chainLightning = function (from, targets, damage) {
    var seen = [from.id];
    var current = from;
    for (var t = 0; t < targets; t++) {
      var next = this.findNearestEnemy(current.x, current.y, 140, seen);
      if (!next) break;
      this.lightningBolt(current.x, current.y, next.x, next.y);
      var a = Math.atan2(next.y - current.y, next.x - current.x);
      this.damageEnemy(next, damage, a, 0);
      seen.push(next.id);
      current = next;
    }
    PG.Audio.play('chain');
  };

  /* Capped recursion depth: explosion kills can chain, but must not recurse forever. */
  Game.prototype.explode = function (x, y, radius, damage) {
    if (this._explodeDepth >= 3) return;
    this._explodeDepth++;

    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (e.dead || e.spawnT > 0) continue;
      var rr = radius + e.r;
      if (PG.dist2(x, y, e.x, e.y) > rr * rr) continue;
      this.damageEnemy(e, damage, Math.atan2(e.y - y, e.x - x), 70);
    }

    var n = Math.max(8, Math.round(radius));
    for (var k = 0; k < n; k++) {
      var ang = (k / n) * Math.PI * 2;
      this.particles.spawn(x + Math.cos(ang) * 4, y + Math.sin(ang) * 4,
        Math.cos(ang) * radius * 4, Math.sin(ang) * radius * 4,
        0.3, 2, '#ffb46a', { drag: 0.82, glow: true });
    }
    this.shake(1.6, 0.16);
    PG.Audio.play('boom');

    this._explodeDepth--;
  };

  Game.prototype.thornsBurst = function (x, y, damage) {
    var radius = 34;
    var rr0 = radius * radius;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (e.dead || e.spawnT > 0) continue;
      if (PG.dist2(x, y, e.x, e.y) > rr0) continue;
      this.damageEnemy(e, damage, Math.atan2(e.y - y, e.x - x), 90);
    }
    for (var k = 0; k < 12; k++) {
      var a = (k / 12) * Math.PI * 2;
      this.particles.spawn(x, y, Math.cos(a) * 130, Math.sin(a) * 130,
        0.26, 2, '#ffb0a0', { drag: 0.85, glow: true });
    }
    PG.Audio.play('hit');
  };

  Game.prototype.shieldBreak = function (x, y) {
    for (var i = 0; i < 14; i++) {
      var a = (i / 14) * Math.PI * 2;
      this.particles.spawn(x, y, Math.cos(a) * 95, Math.sin(a) * 95,
        0.3, 2, '#7fe4ff', { drag: 0.85, glow: true });
    }
    this.shake(1.4, 0.1);
    PG.Audio.play('shield');
  };

  Game.prototype.secondWind = function (x, y) {
    for (var i = 0; i < 30; i++) {
      var a = PG.rand(0, Math.PI * 2);
      var sp = PG.rand(40, 180);
      this.particles.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        PG.rand(0.4, 0.9), 3, '#fff0b8', { drag: 0.9, glow: true });
    }
    this.shake(3.2, 0.35);
    PG.Audio.play('levelup');
  };

  Game.prototype.queueLevelUp = function () {
    this.pendingLevelUps++;
  };

  /* Two pools, one card each. A level should never be able to offer you two stat
     bumps and nothing to do with them. */
  Game.prototype.openUpgrade = function () {
    this.pendingLevelUps--;
    this.showUpgradeScreen();
  };

  /* One card, three choices. The two-pool version handed over two upgrades per
     level, which doubled the growth rate and fed a kill-fast -> level-fast ->
     kill-faster loop. The pool tags stay on the upgrades (they are useful
     vocabulary) but selection is single-pool again. */
  Game.prototype.openUpgrade = function () {
    this.pendingLevelUps--;
    this.showUpgradeScreen();
  };

  Game.prototype.showUpgradeScreen = function () {
    this.state = 'upgrade';
    var rng = new PG.Rng((Date.now() ^ (this.kills * 2654435761) ^ this.pendingLevelUps) >>> 0);
    var count = 3 + this.player.extraChoices;
    this.currentOffers = PG.Upgrades.roll(this.player, count, rng, 'any');
    this.offerGroups = null;
    PG.UI.renderUpgrades(this.currentOffers);
    PG.UI.showScreen('upgrade');
    PG.Audio.play('levelup');
  };

  Game.prototype.chooseUpgrade = function (list) {
    var ups = Array.isArray(list) ? list : [list];
    for (var i = 0; i < ups.length; i++) {
      if (ups[i]) this.player.applyUpgrade(ups[i]);
    }
    this.finishUpgrade();
  };

  Game.prototype.finishUpgrade = function () {
    if (this.pendingLevelUps > 0) {
      this.openUpgrade();
      return;
    }
    this.state = 'playing';
    PG.UI.showScreen(null);
    PG.UI.showHud(true);
  };

  /* ---------- update ---------- */

  Game.prototype.blocksDefaultKeys = function () {
    return this.state === 'playing' || this.state === 'upgrade';
  };

  /*: Whether a pointer gesture should be interpreted as gameplay input. */
  Game.prototype.acceptsPointer = function () {
    return this.state === 'playing';
  };

  /* Music grows in three stages off survival time, with a push from a live streak.
     It never drops below 1 while playing: the groove should be there from the start,
     not fade in after a minute. */
  Game.prototype.musicIntensity = function () {
    if (this.state === 'menu') return 1;
    var level = 1 + Math.floor(this.time / 45);
    if (PG.Audio.combo() >= 8) level += 1;
    return PG.clamp(level, 1, 3);
  };

  Game.prototype.update = function (dt) {
    if (this.state === 'menu' || this.state === 'pause') {
      this.particles.update(dt);
      return;
    }

    if (this.state === 'dead') {
      this.particles.update(dt);
      this.decayShake(dt);
      return;
    }

    if (this.state === 'upgrade') return;

    /* --- playing --- */
    this.time += dt;
    this.tier = this.tierFor();

    if (this.player.dead) { this.onPlayerDeath(); return; }

    this.player.update(dt, this);

    /* Rebuild the shared flow field before the horde reads it. Once per 0.25s, and
       only while playing: one BFS pass serves every enemy, so this stays cheap even
       with a full screen of them. */
    this.flowTimer -= dt;
    if (this.flowTimer <= 0) {
      this.flowTimer = 0.25;
      this.world.buildFlow(this.player.x, this.player.y);
    }

    for (var i = 0; i < this.enemies.length; i++) {
      this.enemies[i].update(dt, this);
    }
    this.separateEnemies();

    this.projectiles.update(dt, this);
    this.hostiles.update(dt, this);
    this.gems.update(dt, this.player, this);
    this.updateWells(dt);
    this.updateMines(dt);
    this.updateClouds(dt);
    this.particles.update(dt);

    /* low health gets a pulse: the run should sound like it is in trouble */
    if (this.player.hp / this.player.maxHp < 0.3) {
      this.heartTimer -= dt;
      if (this.heartTimer <= 0) {
        PG.Audio.play('heartbeat');
        this.heartTimer = 1.3;
      }
    } else {
      this.heartTimer = 0.5;
    }

    this.resolveContact();

    /* --- spawning --- */
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.spawnIntervalFor(this.tier);
      var alive = this.enemies.length;
      var cap = this.maxAliveFor(this.tier);
      var batch = 1 + (this.tier > 3 ? PG.randInt(0, 1) : 0);
      for (var b = 0; b < batch && alive + b < cap; b++) {
        var kind = this.pickType(this.tier);
        var isElite = PG.rng.next() < this.eliteChanceFor(this.tier);
        var spot = this.findSpawnPoint(190, 300, this.clearanceFor(kind, isElite));
        if (!spot) spot = this.findSpawnPoint(190, 320, this.clearanceFor(kind, isElite));
        if (!spot) continue;
        this.addEnemy(kind, spot.x, spot.y, isElite);
      }
    }

    /* compress the dead out of the enemy list without allocating */
    var w = 0;
    for (var k = 0; k < this.enemies.length; k++) {
      if (!this.enemies[k].dead) this.enemies[w++] = this.enemies[k];
    }
    this.enemies.length = w;

    this.updateCamera(dt);
    this.decayShake(dt);

    if (this.pendingLevelUps > 0) this.openUpgrade();

    PG.UI.updateHud(this);
  };

  /* Light mutual separation so a pack reads as a pack instead of one sprite.
     Runs every other frame and nudges positions directly: routing each nudge
     through tile collision made a full screen of elites cost hundreds of thousands
     of tile lookups per frame, which was the visible stutter. */
  Game.prototype.separateEnemies = function () {
    var list = this.enemies;
    this._sepFrame = (this._sepFrame || 0) + 1;
    if (this._sepFrame % 2) return;
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (a.dead || a.spawnT > 0) continue;
      for (var j = i + 1; j < list.length; j++) {
        var b = list[j];
        if (b.dead || b.spawnT > 0) continue;
        var dx = b.x - a.x, dy = b.y - a.y;
        var min = a.r + b.r;
        var d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 <= 0.0001) continue;
        var d = Math.sqrt(d2);
        var push = (min - d) * 0.5;
        var ux = dx / d, uy = dy / d;
        a.x -= ux * push; a.y -= uy * push;
        b.x += ux * push; b.y += uy * push;
      }
    }
  };

  Game.prototype.resolveContact = function () {
    var p = this.player;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (e.dead || e.spawnT > 0) continue;
      var rr = e.r + p.r + 1;
      if (PG.dist2(p.x, p.y, e.x, e.y) > rr * rr) continue;
      var res = p.takeDamage(e.damage, e.x, e.y, this);
      if (res) {
        if (res === 'saved') {
          /* secondWind has already announced itself */
        } else if (res === 'shield') {
          PG.Audio.play('hit');
        } else {
          PG.Audio.play('hurt');
          this.shake(3.0, 0.2);
          this.sparks(p.x, p.y, Math.atan2(p.y - e.y, p.x - e.x), 8, '#ff8f7a');
        }
      }
      /* both parties get pushed apart */
      var d = PG.dist(p.x, p.y, e.x, e.y) || 1;
      var ux = (e.x - p.x) / d, uy = (e.y - p.y) / d;
      e.kvx += ux * 70;
      e.kvy += uy * 70;
    }
  };

  Game.prototype.updateCamera = function (dt) {
    var p = this.player;
    /* lead the camera slightly toward where the player is aiming */
    var leadX = (PG.Input.mouse.x - PG.VIEW_W / 2) * 0.12;
    var leadY = (PG.Input.mouse.y - PG.VIEW_H / 2) * 0.12;
    var tx = p.x + leadX - PG.VIEW_W / 2;
    var ty = p.y + leadY - PG.VIEW_H / 2;
    this.camX = PG.damp(this.camX, tx, 9, dt);
    this.camY = PG.damp(this.camY, ty, 9, dt);
    this.camX = PG.clamp(this.camX, SHAKE_MARGIN, this.world.w - PG.VIEW_W - SHAKE_MARGIN);
    this.camY = PG.clamp(this.camY, SHAKE_MARGIN, this.world.h - PG.VIEW_H - SHAKE_MARGIN);
  };

  Game.prototype.decayShake = function (dt) {
    if (this.shakeTime > 0) this.shakeTime -= dt;
    if (this.shakeTime <= 0) {
      this.shakeTime = 0;
      this.shakeAmount = PG.damp(this.shakeAmount, 0, 16, dt);
      if (this.shakeAmount < 0.05) this.shakeAmount = 0;
    }
  };

  /* ---------- render ---------- */

  Game.prototype.buildVignette = function () {
    var c = document.createElement('canvas');
    c.width = PG.VIEW_W; c.height = PG.VIEW_H;
    var g = c.getContext('2d');
    /* Softened because a CRT overlay (DOM layer) adds its own screen-space
       falloff on top: the in-world vignette only needs to ground the arena
       edges, not double-crush the corners. */
    var grad = g.createRadialGradient(
      PG.VIEW_W / 2, PG.VIEW_H / 2, 64,
      PG.VIEW_W / 2, PG.VIEW_H / 2, 300
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.46)');
    g.fillStyle = grad;
    g.fillRect(0, 0, PG.VIEW_W, PG.VIEW_H);
    this.vignette = c;
  };

  /* On-screen thumb feedback, drawn in screen space above the vignette so the world
     can never obscure it. None of this is a touch target: the whole canvas is the
     control surface, these marks only show where the thumbs currently are. */
  Game.prototype.drawTouchControls = function (ctx) {
    var Input = PG.Input;
    if (!Input.touchActive || !Input.touchActive()) return;

    var stick = Input.stick();
    if (stick) {
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#9feaff';
      for (var i = 0; i < 18; i++) {
        var a = (i / 18) * Math.PI * 2;
        ctx.fillRect(Math.round(stick.ox + Math.cos(a) * stick.radius) - 1,
          Math.round(stick.oy + Math.sin(a) * stick.radius) - 1, 2, 2);
      }
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#e6fbff';
      ctx.fillRect(Math.round(stick.ox + stick.dx) - 3, Math.round(stick.oy + stick.dy) - 3, 6, 6);
      ctx.globalAlpha = 1;
    }

    var aim = Input.aim();
    if (aim && this.player) {
      /* a dashed line from the lantern out to the aim thumb */
      var px = Math.round(this.player.x - this.camX);
      var py = Math.round(this.player.y - this.camY);
      var dx = aim.x - px;
      var dy = aim.y - py;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / len, uy = dy / len;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#9feaff';
      for (var d = 14; d < len; d += 10) {
        ctx.fillRect(Math.round(px + ux * d), Math.round(py + uy * d), 2, 2);
      }
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = '#e6fbff';
      var cxp = Math.round(aim.x), cyp = Math.round(aim.y);
      ctx.fillRect(cxp - 5, cyp - 1, 4, 2);
      ctx.fillRect(cxp + 2, cyp - 1, 4, 2);
      ctx.fillRect(cxp - 1, cyp - 5, 2, 4);
      ctx.fillRect(cxp - 1, cyp + 2, 2, 4);
      ctx.globalAlpha = 1;
    }
  };

  Game.prototype.render = function () {
    var ctx = this.ctx;
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, PG.VIEW_W, PG.VIEW_H);

    if (!this.world) return;

    var shakeX = 0, shakeY = 0;
    if (this.shakeAmount > 0) {
      shakeX = PG.rand(-this.shakeAmount, this.shakeAmount);
      shakeY = PG.rand(-this.shakeAmount, this.shakeAmount);
      shakeX = Math.round(shakeX); shakeY = Math.round(shakeY);
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);

    var cx = Math.floor(this.camX);
    var cy = Math.floor(this.camY);
    ctx.drawImage(
      this.world.ground,
      cx - SHAKE_MARGIN, cy - SHAKE_MARGIN,
      PG.VIEW_W + SHAKE_MARGIN * 2, PG.VIEW_H + SHAKE_MARGIN * 2,
      -SHAKE_MARGIN, -SHAKE_MARGIN,
      PG.VIEW_W + SHAKE_MARGIN * 2, PG.VIEW_H + SHAKE_MARGIN * 2
    );

    this.gems.draw(ctx, cx, cy);
    this.drawWells(ctx, cx, cy);
    this.drawDeployables(ctx, cx, cy);

    /* y-sorted actors so overlapping sprites occlude correctly */
    var actors = this.enemies.slice();
    if (this.player && !this.player.dead) actors.push(this.player);
    actors.sort(function (a, b) { return a.y - b.y; });
    for (var i = 0; i < actors.length; i++) actors[i].draw(ctx, cx, cy);

    this.projectiles.draw(ctx, cx, cy);
    this.hostiles.draw(ctx, cx, cy);
    this.particles.draw(ctx, cx, cy);

    ctx.restore();

    if (this.vignette) ctx.drawImage(this.vignette, 0, 0);

    this.drawTouchControls(ctx);

    /* low-health warning rim */
    if (this.state === 'playing' && this.player) {
      var ratio = this.player.hp / this.player.maxHp;
      if (ratio < 0.35) {
        var k = (1 - ratio / 0.35);
        ctx.globalAlpha = 0.16 + 0.26 * k * (0.6 + 0.4 * Math.sin(this.time * 9));
        ctx.fillStyle = '#c1201a';
        ctx.fillRect(0, 0, PG.VIEW_W, 3);
        ctx.fillRect(0, PG.VIEW_H - 3, PG.VIEW_W, 3);
        ctx.fillRect(0, 0, 3, PG.VIEW_H);
        ctx.fillRect(PG.VIEW_W - 3, 0, 3, PG.VIEW_H);
        ctx.globalAlpha = 1;
      }
    }
  };

  PG.Game = Game;
})();
