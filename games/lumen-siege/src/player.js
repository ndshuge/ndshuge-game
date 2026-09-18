/* LUMEN SIEGE - player: movement, aiming, dashing, shooting, damage and progression.
   The lantern in the player's hand is both the character's facing cue and the muzzle. */
(function () {
  'use strict';
  var PG = (window.PG = window.PG || {});

  var BASE = {
    /* body */
    maxHp: 100,
    speed: 82,
    /* gun */
    damage: 12,
    fireInterval: 0.30,
    bulletSpeed: 215,
    bulletLife: 1.05,
    bulletRadius: 3,
    multi: 1,
    pierce: 0,
    spreadStep: 0.115,
    critChance: 0,
    critMult: 2,
    homing: 0,
    bounce: 0,
    /* on-hit / on-kill */
    burnDps: 0,
    chainChance: 0,
    chainTargets: 1,
    chainDamageMul: 1,
    markPower: 0,
    explodeRadius: 0,
    explodeDamage: 18,
    knock: 90,
    freezePower: 0,
    ricochet: 0,
    /* ricochet grows the shot instead of just redirecting it */
    ricochetPower: 0,
    /* one kill sprays a ring of shards */
    shrapnel: 0,
    shrapnelDamage: 0,
    /* shards from a split can split again, one extra generation */
    splitChain: 0,
    /* every Nth shot fires a full ring instead of a cone */
    ringEvery: 0,
    /* orbiting shuriken */
    orbitCount: 0,
    orbitRadius: 34,
    orbitSpeed: 2.8,
    orbitDamage: 14,
    /* boomerang */
    boomerangCount: 0,
    boomerangInterval: 1.4,
    boomerangDamageMul: 1.8,
    /* self-firing sentinel */
    sentinelCount: 0,
    sentinelInterval: 0.8,
    sentinelDamageMul: 0.7,
    /* gravity well */
    wellRadius: 0,
    wellInterval: 4.5,
    wellDamage: 34,
    /* beam */
    laserDps: 0,
    /* aura */
    auraRadius: 0,
    auraDamage: 0,
    /* deployment */
    mineDamage: 0,
    mineInterval: 0,
    poisonRadius: 0,
    poisonDamage: 0,
    /* summon */
    mirrorCount: 0,
    /* rhythm */
    overchargeEvery: 0,
    frenzyPower: 0,
    /* defence */
    shieldNova: 0,
    timeStopChance: 0,
    /* on-hit riders */
    splitCount: 0,
    splitDamageMul: 0.55,
    executeThreshold: 0,
    chillFactor: 0,
    /* dash */
    dashDistance: 54,
    dashDuration: 0.15,
    dashCooldown: 1.5,
    dashBurn: 0,
    dashImpact: 0,
    /* defence. Both of these are baseline now, not upgrades: every run starts with
       3%/s regeneration and one rechargeable shield layer. */
    regen: 0,
    regenPct: 0.03,
    shieldMax: 1,
    shieldRegen: 5,
    thorns: 0,
    lifesteal: 0,
    secondWind: 0,
    berserk: 0,
    hurtInvuln: 0.75,
    contactPush: 130,
    /* economy */
    pickupRange: 30,
    xpMult: 1,
    lootChance: 0,
    extraChoices: 0,
    enemySlow: 0
  };

  function Player(x, y) {
    this.x = x; this.y = y;
    this.r = 5;
    this.vx = 0; this.vy = 0;
    this.kvx = 0; this.kvy = 0;
    this.angle = 0;

    for (var key in BASE) this[key] = BASE[key];

    this.hp = this.maxHp;

    this.fireTimer = 0;
    this.invuln = 0;
    this.hurtFlash = 0;
    this.dashing = false;
    this.dashTime = 0;
    this.dashCd = 0;
    this.dashDirX = 1; this.dashDirY = 0;
    this.dashTrail = 0;

    this.shield = this.shieldMax;
    this.shieldTimer = this.shieldRegen;
    this.shieldPhase = 0;

    this.orbitAngle = 0;
    this.orbitHitCd = 0;

    this.boomerangTimer = 0.8;
    this.sentinelTimer = 0;
    this.sentinelAngle = 0;
    this.wellTimer = 3.0;
    this.mineTimer = 1.0;
    this.mirrorAngle = 0;
    this.mirrorTimer = 0;

    this.hitStreak = 0;
    this.overchargeReady = false;
    this.frenzyT = 0;
    this.slowT = 0;
    this.slowFactor = 0;
    this.laserHeat = 0;
    this.shotCount = 0;
    /* live earn-rate tracking: the next level's cost is derived from how fast the
       player is actually earning, so a fast run cannot chain levels forever */
    this.xpRate = 0;
    this.xpRateAt = 0;
    this.xpSinceSample = 0;
    this.lastXpAt = 0;

    this.walkPhase = 0;
    this.level = 1;
    this.xp = 0;
    this.xpToNext = this.demandFor(1);

    this.upgrades = {};
    this.dead = false;
  }

  /* A level now hands over two cards (one per pool), so the demand is raised to
     match. Otherwise the growth rate simply doubles and the run flattens out. */
  /* A level is one card again, so the demand returns to the single-pool curve. */
  /*: Level-up spacing the curve aims to keep above, in seconds. */
  Player.MIN_LEVEL_GAP = 10;

  /* Cost of reaching a given level.

     The floor is the plain curve. On top of it, the cost must be at least as much as
     the player earns in MIN_LEVEL_GAP seconds, which is what turns "at least N seconds
     between levels" into arithmetic rather than a rule. Early on the earn rate is low
     so the floor wins and the curve feels untouched; once a built player is clearing
     waves, the rate term takes over and the spacing opens up on its own.

     Deliberately continuous: no threshold, no visible step, nothing to notice. The
     value is only recomputed when a level is actually taken, so the xp bar never
     jitters and the player never sees the number move underneath them. */
  Player.prototype.demandFor = function (level) {
    var base = 7 + level * 4.2 + Math.pow(level, 1.12);
    var fromRate = this.xpRate * Player.MIN_LEVEL_GAP;
    return Math.floor(Math.max(base, fromRate));
  };

  Player.prototype.gainXp = function (value, game) {
    /* sample the earn rate over half-second windows, smoothed so one big pickup
       cannot swing the whole curve */
    var now = game ? game.time : 0;
    var elapsed = now - this.xpRateAt;
    if (elapsed >= 0.5) {
      var instant = (this.xpSinceSample + value) / elapsed;
      this.xpRate = this.xpRate * 0.6 + instant * 0.4;
      this.xpSinceSample = 0;
      this.xpRateAt = now;
    } else {
      this.xpSinceSample += value;
    }

    this.xp += value * this.xpMult;
    this.lastXpAt = now;
    var guard = 0;
    while (this.xp >= this.xpToNext && guard++ < 60) {
      this.xp -= this.xpToNext;
      this.level++;
      this.xpToNext = this.demandFor(this.level);
      game.queueLevelUp();
    }
  };

  Player.prototype.applyUpgrade = function (up) {
    up.apply(this);
    this.upgrades[up.id] = (this.upgrades[up.id] || 0) + 1;
  };

  Player.prototype.heal = function (amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  };

  Player.prototype.damageMultiplier = function () {
    if (this.berserk <= 0) return 1;
    return 1 + this.berserk * (1 - this.hp / this.maxHp);
  };

  /* ---------- damage ---------- */

  Player.prototype.takeDamage = function (amount, fromX, fromY, game) {
    if (this.dead) return false;

    if (this.shield > 0) {
      this.shield -= 1;
      this.shieldTimer = this.shieldRegen;
      this.invuln = Math.max(this.invuln, 0.45);
      this.hurtFlash = 0.16;
      if (game) {
        game.shieldBreak(this.x, this.y);
        if (this.shieldNova > 0) game.shieldNova(this.x, this.y, this.shieldNova);
      }
      return 'shield';
    }

    if (this.invuln > 0) return false;

    if (this.hp - amount <= 0 && this.secondWind > 0) {
      this.secondWind -= 1;
      this.hp = Math.max(1, Math.round(this.maxHp * 0.4));
      this.invuln = 1.8;
      this.hurtFlash = 0.45;
      if (game) game.secondWind(this.x, this.y);
      return 'saved';
    }

    this.hp -= amount;
    this.invuln = BASE.hurtInvuln;
    this.hurtFlash = 0.22;
    var d = PG.dist(this.x, this.y, fromX, fromY) || 1;
    this.kvx += ((this.x - fromX) / d) * BASE.contactPush;
    this.kvy += ((this.y - fromY) / d) * BASE.contactPush;

    if (this.thorns > 0 && game) game.thornsBurst(this.x, this.y, this.thorns);

    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    return true;
  };

  /* ---------- update ---------- */

  Player.prototype.update = function (dt, game) {
    if (this.dead) return;
    var world = game.world;
    var Input = PG.Input;

    var mwx = Input.mouse.x + game.camX;
    var mwy = Input.mouse.y + game.camY;
    this.angle = Math.atan2(mwy - this.y, mwx - this.x);

    if (this.invuln > 0) this.invuln -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.frenzyT > 0) this.frenzyT -= dt;
    if (this.slowT > 0) this.slowT -= dt;
    /* Drop a stale sample rather than decaying it. A per-frame decay fights the
       sampler and settles around 88% of the true rate, which silently turns a 15s
       floor into 13s. Forgetting a cold sample keeps the number honest. */
    if (this.xpRate > 0 && game && this.lastXpAt > 0 && game.time - this.lastXpAt > 5) {
      this.xpRate = 0;
    }
    if (this.regen > 0 && this.hp < this.maxHp) this.heal(this.regen * dt);
    /* percentage regeneration scales with the health pool, so it stays relevant
       after a pile of max-hp upgrades instead of becoming a rounding error */
    if (this.regenPct > 0 && this.hp < this.maxHp) {
      this.heal(this.maxHp * this.regenPct * dt);
    }

    this.shieldPhase += dt * 3.2;
    if (this.shieldMax > 0 && this.shield < this.shieldMax) {
      this.shieldTimer -= dt;
      if (this.shieldTimer <= 0) {
        this.shield += 1;
        this.shieldTimer = this.shieldRegen;
        game.sparks(this.x, this.y, 0, 1, '#7fe4ff');
      }
    }

    var ax = Input.axis();
    var moving = ax.x !== 0 || ax.y !== 0;

    if (Input.pressed('Space') && this.dashCd <= 0 && !this.dashing) {
      var ddx = ax.x, ddy = ax.y;
      if (ddx === 0 && ddy === 0) { ddx = Math.cos(this.angle); ddy = Math.sin(this.angle); }
      var dl = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
      this.dashDirX = ddx / dl;
      this.dashDirY = ddy / dl;
      this.dashing = true;
      this.dashTime = this.dashDuration;
      this.dashCd = this.dashCooldown;
      this.dashTrail = 0;
      this.invuln = Math.max(this.invuln, this.dashDuration + 0.06);
      PG.Audio.play('dash');
      game.shake(1.1, 0.08);
      for (var i = 0; i < 8; i++) {
        var a = this.angle + Math.PI + PG.rand(-0.6, 0.6);
        var sp = PG.rand(40, 110);
        game.particles.spawn(this.x, this.y, Math.cos(a) * sp, Math.sin(a) * sp,
          PG.rand(0.18, 0.36), 2, '#8fe6ff', { drag: 0.86, glow: true });
      }
    }

    var speedScale = this.slowT > 0 ? 1 - this.slowFactor : 1;

    if (this.dashing) {
      this.dashTime -= dt;
      var dashSpeed = this.dashDistance / this.dashDuration;
      PG.moveCircle(world, this, this.dashDirX * dashSpeed * dt, this.dashDirY * dashSpeed * dt);
      this.dashTouch(dt, game);
      this.dashTrail += dt;
      if (this.dashTrail > 0.02) {
        this.dashTrail = 0;
        var trailColor = this.dashBurn > 0 ? '#ff9a5c' : '#4fbfe0';
        game.particles.spawn(this.x, this.y, PG.rand(-14, 14), PG.rand(-14, 14),
          0.3, 3, trailColor, { drag: 0.9, glow: true });
      }
      if (this.dashTime <= 0) this.dashing = false;
    } else {
      var tvx = ax.x * this.speed * speedScale;
      var tvy = ax.y * this.speed * speedScale;
      this.vx = PG.damp(this.vx, tvx, 24, dt);
      this.vy = PG.damp(this.vy, tvy, 24, dt);
      PG.moveCircle(world, this, (this.vx + this.kvx) * dt, (this.vy + this.kvy) * dt);
    }

    var kd = Math.pow(0.015, dt);
    this.kvx *= kd; this.kvy *= kd;

    if (moving && !this.dashing) {
      this.walkPhase += dt;
      if (this.walkPhase > 0.13) {
        this.walkPhase = 0;
        game.particles.spawn(this.x + PG.rand(-2, 2), this.y + 2, PG.rand(-8, 8), PG.rand(-6, 2),
          0.28, 1, '#4a5c70', { drag: 0.86 });
      }
    }

    this.updateOrbitals(dt, game);
    this.updateSecondaryWeapons(dt, game);
    this.updateAura(dt, game);
    this.updateLaser(dt, game);

    var interval = this.fireInterval * (this.frenzyT > 0 ? 1 - this.frenzyPower : 1);
    this.fireTimer -= dt;
    if (PG.Input.mouse.down && this.fireTimer <= 0) {
      this.shoot(game);
      this.fireTimer = Math.max(0.04, interval);
    }
  };

  /* A standing damage field around the player. */
  Player.prototype.updateAura = function (dt, game) {
    if (this.auraRadius <= 0) return;
    var r2 = this.auraRadius * this.auraRadius;
    for (var i = 0; i < game.enemies.length; i++) {
      var e = game.enemies[i];
      if (e.dead || e.spawnT > 0) continue;
      if (PG.dist2(this.x, this.y, e.x, e.y) > r2) continue;
      e.hp -= this.auraDamage * dt;
      e.flash = Math.max(e.flash, 0.04);
      if (e.hp <= 0) game.killEnemy(e);
    }
  };

  /* Held beam: pierces everything along the aim line, at a steady dps. */
  Player.prototype.updateLaser = function (dt, game) {
    if (this.laserDps <= 0 || !PG.Input.mouse.down) {
      this.laserHeat = Math.max(0, this.laserHeat - dt * 0.8);
      return;
    }
    var len = 190;
    var ex = this.x + Math.cos(this.angle) * len;
    var ey = this.y + Math.sin(this.angle) * len;
    var dealt = 0;
    for (var i = 0; i < game.enemies.length; i++) {
      var e = game.enemies[i];
      if (e.dead || e.spawnT > 0) continue;
      if (PG.distToSegment(e.x, e.y, this.x, this.y, ex, ey) > e.r + 2) continue;
      e.hp -= this.laserDps * dt;
      e.flash = Math.max(e.flash, 0.05);
      dealt++;
      if (e.hp <= 0) game.killEnemy(e);
    }
    if (dealt > 0 && Math.random() < 0.25) {
      var t = PG.rand(0.2, 0.9);
      game.particles.spawn(
        PG.lerp(this.x, ex, t), PG.lerp(this.y, ey, t) + PG.rand(-2, 2),
        0, 0, 0.2, 2, '#ffd0f0', { drag: 0.7, glow: true });
    }
  };

  Player.prototype.dashTouch = function (dt, game) {
    if (this.dashImpact <= 0 && this.dashBurn <= 0) return;
    var reach = this.r + 8;
    for (var i = 0; i < game.enemies.length; i++) {
      var e = game.enemies[i];
      if (e.dead || e.spawnT > 0) continue;
      var rr = reach + e.r;
      if (PG.dist2(this.x, this.y, e.x, e.y) > rr * rr) continue;
      var dir = Math.atan2(this.dashDirY, this.dashDirX);
      if (this.dashImpact > 0 && e.dashCd <= 0) {
        game.damageEnemy(e, this.dashImpact, dir, 150);
        e.dashCd = 0.45;
      } else if (this.dashBurn > 0) {
        game.damageEnemy(e, this.dashBurn * dt, dir, 0);
      }
    }
  };

  Player.prototype.updateOrbitals = function (dt, game) {
    if (this.orbitCount <= 0) return;
    this.orbitAngle += this.orbitSpeed * dt;
    var n = this.orbitCount;
    var step = (Math.PI * 2) / n;
    for (var i = 0; i < n; i++) {
      var a = this.orbitAngle + i * step;
      var ox = this.x + Math.cos(a) * this.orbitRadius;
      var oy = this.y + Math.sin(a) * this.orbitRadius;
      for (var k = 0; k < game.enemies.length; k++) {
        var e = game.enemies[k];
        if (e.dead || e.spawnT > 0 || e.orbCd > 0) continue;
        var rr = e.r + 5;
        if (PG.dist2(ox, oy, e.x, e.y) > rr * rr) continue;
        game.damageEnemy(e, this.orbitDamage * this.damageMultiplier(), a, 55);
        e.orbCd = 0.3;
        game.sparks(ox, oy, a, 3, '#dff6ff');
      }
    }
  };

  Player.prototype.updateSecondaryWeapons = function (dt, game) {
    if (this.boomerangCount > 0) {
      this.boomerangTimer -= dt;
      if (this.boomerangTimer <= 0) {
        this.throwBoomerangs(game);
        this.boomerangTimer = this.boomerangInterval;
      }
    }
    if (this.sentinelCount > 0) {
      this.sentinelAngle += dt * 1.15;
      this.sentinelTimer -= dt;
      if (this.sentinelTimer <= 0) {
        this.sentinelFire(game);
        this.sentinelTimer = this.sentinelInterval;
      }
    }
    if (this.wellRadius > 0) {
      this.wellTimer -= dt;
      if (this.wellTimer <= 0) {
        game.openWell(this.x, this.y, this.wellRadius, this.wellDamage);
        this.wellTimer = this.wellInterval;
      }
    }
    if (this.mineDamage > 0) {
      this.mineTimer -= dt;
      if (this.mineTimer <= 0) {
        this.mineTimer = this.mineInterval;
        game.dropMine(this.x, this.y, this.mineDamage);
      }
    }
    if (this.mirrorCount > 0) {
      this.mirrorAngle += dt * 1.6;
      this.mirrorTimer -= dt;
      if (this.mirrorTimer <= 0) {
        this.mirrorTimer = Math.max(0.16, this.fireInterval * 0.85);
        this.mirrorFire(game);
      }
    }
  };

  Player.prototype.throwBoomerangs = function (game) {
    var n = this.boomerangCount;
    for (var i = 0; i < n; i++) {
      var a = this.angle + (i - (n - 1) / 2) * 0.45;
      game.projectiles.spawn(this.x, this.y, a, this.bulletSpeed * 1.05,
        this.damage * this.boomerangDamageMul * this.damageMultiplier(), {
          pierce: 99, knock: this.knock * 0.7, life: 4.0, r: 4,
          boomerang: true, travel: 148
        });
    }
    PG.Audio.play('dash');
  };

  Player.prototype.sentinelFire = function (game) {
    var target = game.findNearestEnemy(this.x, this.y, 230, null);
    if (!target) return;
    for (var i = 0; i < this.sentinelCount; i++) {
      var a = this.sentinelAngle + (i * Math.PI * 2) / this.sentinelCount;
      var ox = this.x + Math.cos(a) * 22;
      var oy = this.y + Math.sin(a) * 22;
      var aim = Math.atan2(target.y - oy, target.x - ox);
      game.projectiles.spawn(ox, oy, aim, this.bulletSpeed * 0.95,
        this.damage * this.sentinelDamageMul * this.damageMultiplier(), {
          pierce: 0, knock: this.knock * 0.4, life: 1.1, r: 2.5
        });
    }
    PG.Audio.play('pick');
  };

  /* The mirror fires your shot backwards, so movement becomes firepower. */
  Player.prototype.mirrorFire = function (game) {
    for (var i = 0; i < this.mirrorCount; i++) {
      var a = this.mirrorAngle + (i * Math.PI * 2) / this.mirrorCount;
      var mx = this.x + Math.cos(a) * 26;
      var my = this.y + Math.sin(a) * 26;
      var away = Math.atan2(my - this.y, mx - this.x);
      game.projectiles.spawn(mx, my, away, this.bulletSpeed * 0.9,
        this.damage * 0.55 * this.damageMultiplier(), {
          pierce: this.pierce, knock: this.knock * 0.5, life: this.bulletLife * 0.9,
          r: this.bulletRadius, homing: this.homing * 0.6, bounce: this.bounce,
          mark: this.markPower, crit: false
        });
    }
  };

  Player.prototype.shoot = function (game) {
    var base = this.angle;
    var mx = this.x + Math.cos(base) * 6;
    var my = this.y + Math.sin(base) * 6;
    var mult = this.damageMultiplier();
    /* overcharge: a streak of hits loads the next shot into something bigger */
    var charged = this.overchargeReady;
    if (charged) {
      this.overchargeReady = false;
      this.hitStreak = 0;
      game.shake(3.4, 0.16);
      PG.Audio.play('boom');
    }

    /* ring shot: every Nth volley sprays evenly around the player */
    this.shotCount++;
    var ring = this.ringEvery > 0 && this.shotCount % this.ringEvery === 0;
    if (ring) {
      PG.Audio.play('boom');
      game.shake(1.6, 0.12);
    }

    var n = ring ? Math.max(10, this.multi * 3) : this.multi;

    for (var i = 0; i < n; i++) {
      var a = ring
        ? base + (i / n) * Math.PI * 2
        : base + (i - (n - 1) / 2) * BASE.spreadStep;
      var dmg = this.damage * mult * (charged ? 3.2 : 1) * (ring ? 0.7 : 1);
      var crit = this.critChance > 0 && PG.rng.next() < this.critChance;
      if (crit) dmg *= this.critMult;
      game.projectiles.spawn(mx, my, a, this.bulletSpeed * (charged ? 1.15 : 1), dmg, {
        pierce: this.pierce + (charged ? 3 : 0),
        knock: this.knock * (charged ? 1.8 : 1),
        life: this.bulletLife * (charged ? 1.2 : 1),
        r: this.bulletRadius + (charged ? 4 : 0),
        homing: this.homing,
        bounce: this.bounce + (charged ? 1 : 0),
        burn: this.burnDps,
        chain: this.chainChance,
        chainTargets: this.chainTargets,
        chainMul: this.chainDamageMul,
        mark: this.markPower,
        split: this.splitCount + (charged ? 3 : 0),
        splitMul: this.splitDamageMul,
        splitChain: this.splitChain,
        execute: this.executeThreshold,
        chill: this.chillFactor,
        freeze: this.freezePower,
        ricochet: this.ricochet + (charged ? 2 : 0),
        ricochetPower: this.ricochetPower,
        crit: crit
      });
    }

    game.sparks(mx, my, base, charged ? 8 : 3, charged ? '#ffd76a' : '#cdf3ff');
    if (charged) game.shake(1.6, 0.08);
    PG.Audio.play('shot');
  };

  /* Called by the game on every landed hit: drives overcharge. */
  Player.prototype.registerHit = function () {
    if (this.overchargeEvery <= 0) return;
    this.hitStreak++;
    if (this.hitStreak >= this.overchargeEvery) this.overchargeReady = true;
  };

  /* ---------- draw ---------- */

  Player.prototype.draw = function (ctx, camX, camY) {
    if (this.dead) return;
    var alpha = 1;
    if (this.invuln > 0 && !this.dashing) {
      alpha = 0.35 + 0.65 * Math.abs(Math.sin(this.invuln * 26));
    }

    var sx = Math.round(this.x - camX);
    var sy = Math.round(this.y - camY);

    /* aura */
    if (this.auraRadius > 0) {
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#ff8a4a';
      var steps = 22;
      for (var q = 0; q < steps; q++) {
        var qa = (q / steps) * Math.PI * 2 + this.shieldPhase * 0.4;
        ctx.fillRect(Math.round(sx + Math.cos(qa) * this.auraRadius),
          Math.round(sy + Math.sin(qa) * this.auraRadius), 2, 2);
      }
      ctx.globalAlpha = 1;
    }

    /* beam */
    if (this.laserDps > 0 && PG.Input.mouse.down) {
      var ex = Math.cos(this.angle) * 190;
      var ey = Math.sin(this.angle) * 190;
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#ffd0f0';
      ctx.fillRect(sx, sy, 1, 1);
      var stepsL = 40;
      for (var b = 1; b <= stepsL; b++) {
        var t = b / stepsL;
        var jitter = Math.sin(b * 1.7 + this.shieldPhase * 6) * 1.4;
        ctx.fillRect(Math.round(sx + ex * t + Math.cos(this.angle + Math.PI / 2) * jitter),
          Math.round(sy + ey * t + Math.sin(this.angle + Math.PI / 2) * jitter), 2, 2);
      }
      ctx.globalAlpha = 1;
    }

    if (this.dashing) {
      var speed = this.dashDistance / this.dashDuration;
      for (var i = 1; i <= 3; i++) {
        var tt = i * 0.022;
        PG.Sprites.draw(ctx, 'player',
          this.x - this.dashDirX * speed * tt,
          this.y - this.dashDirY * speed * tt,
          camX, camY, 0, 0.34 / i, false);
      }
    }

    /* The shield is now a baseline ability the player always has, so it has to be
       unmistakable at a glance, not a faint ring easy to miss mid-fight. */
    if (this.shield > 0) {
      var pulse = 0.6 + 0.4 * Math.sin(this.shieldPhase * 2);
      ctx.globalAlpha = 0.55 + 0.35 * pulse;
      ctx.fillStyle = '#9feaff';
      var ringR = 13;
      for (var s = 0; s < 14; s++) {
        var sa = (s / 14) * Math.PI * 2 + this.shieldPhase * 0.7;
        ctx.fillRect(Math.round(sx + Math.cos(sa) * ringR), Math.round(sy + Math.sin(sa) * ringR), 2, 2);
      }
      /* a second, dimmer ring per extra charge */
      if (this.shield > 1) {
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#cdf3ff';
        for (var s2 = 0; s2 < 16; s2++) {
          var sa2 = (s2 / 16) * Math.PI * 2 - this.shieldPhase * 0.5;
          ctx.fillRect(Math.round(sx + Math.cos(sa2) * 17), Math.round(sy + Math.sin(sa2) * 17), 2, 2);
        }
      }
      /* corner arcs so the boundary reads even when the ring is partly off-screen */
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#7fe4ff';
      ctx.fillRect(sx - ringR - 2, sy - 1, 3, 2);
      ctx.fillRect(sx + ringR, sy - 1, 3, 2);
      ctx.fillRect(sx - 1, sy - ringR - 2, 2, 3);
      ctx.fillRect(sx - 1, sy + ringR, 2, 3);
      ctx.globalAlpha = 1;
    }

    PG.Sprites.draw(ctx, 'player', this.x, this.y, camX, camY, 0, alpha, this.hurtFlash > 0);

    if (this.orbitCount > 0) {
      var step = (Math.PI * 2) / this.orbitCount;
      for (var k = 0; k < this.orbitCount; k++) {
        var oa = this.orbitAngle + k * step;
        PG.Sprites.draw(ctx, 'shuriken',
          this.x + Math.cos(oa) * this.orbitRadius,
          this.y + Math.sin(oa) * this.orbitRadius,
          camX, camY, this.orbitAngle * 2.4, 1, false);
      }
    }

    if (this.sentinelCount > 0) {
      var sstep = (Math.PI * 2) / this.sentinelCount;
      for (var q2 = 0; q2 < this.sentinelCount; q2++) {
        var qa2 = this.sentinelAngle + q2 * sstep;
        var qx = Math.round(this.x - camX + Math.cos(qa2) * 22);
        var qy = Math.round(this.y - camY + Math.sin(qa2) * 22);
        ctx.fillStyle = '#e6fbff';
        ctx.fillRect(qx - 2, qy - 2, 4, 4);
        ctx.fillStyle = '#5fe0c8';
        ctx.fillRect(qx - 3, qy - 1, 1, 2);
        ctx.fillRect(qx + 3, qy - 1, 1, 2);
        ctx.fillRect(qx - 1, qy - 3, 2, 1);
        ctx.fillRect(qx - 1, qy + 3, 2, 1);
      }
    }

    if (this.mirrorCount > 0) {
      var mstep = (Math.PI * 2) / this.mirrorCount;
      for (var m = 0; m < this.mirrorCount; m++) {
        var ma = this.mirrorAngle + m * mstep;
        var mmx = Math.round(sx + Math.cos(ma) * 26);
        var mmy = Math.round(sy + Math.sin(ma) * 26);
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#c9a6ff';
        ctx.fillRect(mmx - 3, mmy - 4, 6, 8);
        ctx.fillStyle = '#efe0ff';
        ctx.fillRect(mmx - 2, mmy - 3, 4, 6);
        ctx.globalAlpha = 1;
      }
    }

    /* lantern */
    var lx = Math.round(Math.cos(this.angle) * 6);
    var ly = Math.round(Math.sin(this.angle) * 6);
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = this.overchargeReady ? '#ffd76a' : '#7fe4ff';
    ctx.fillRect(sx + lx * 2 - 2, sy + ly * 2 - 2, 4, 4);
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.overchargeReady ? '#fff3d0' : '#e6fbff';
    ctx.fillRect(sx + lx - 1, sy + ly - 1, 2, 2);
    ctx.fillStyle = this.overchargeReady ? '#ffc14e' : '#8fdcf5';
    ctx.fillRect(sx + lx - 2, sy + ly, 1, 1);
    ctx.fillRect(sx + lx + 2, sy + ly, 1, 1);
  };

  PG.Player = Player;
  PG.PLAYER_BASE = BASE;
})();
