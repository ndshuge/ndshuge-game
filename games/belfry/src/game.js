/* 钟楼契约 · game.js
   编排层：状态机、昼夜流转、波次、剧情触发、渲染编排。
   渲染顺序：地面 -> 实体 -> 夜幕(乘色) -> 光源(lighter) -> 瘴雾 -> HUD。 */
(function () {
  'use strict';
  var B = window.Belfry;

  var W = B.VIEW_W, H = B.VIEW_H;

  function Game(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.map = new B.Map(20260918);
    this.map.baked = this.map.bake();
    this.farm = new B.Farm(this.map);
    this.player = new B.Player(this.map);
    this.dn = new B.DayNight();
    this.bonds = B.bonds.create();
    this.particles = new B.Particles();
    this.floatTexts = [];
    this.enemies = [];
    this.projectiles = [];
    this.cam = { x: 0, y: 0 };

    this.state = 'intro';
    this.introScreen = 0;
    this.soulfire = 0;
    this.steel = 0;
    this.favor = { marta: 0, otto: 0, nico: 0 };
    this.flags = {};
    this.wave = 0;
    this.waveTimer = 0;
    this.nightSurge = false;
    this.selectedSeed = 'ashwheat';
    this.selectedWeapon = null;

    this.toast = null;
    this.pendingAct = null;
    this.ending = null;
    this.silenceCost = 120;

    this.tickAcc = 0;
    this._bindBus();
  }

  // ---------- 小工具 ----------
  Game.prototype.msg = function (text, kind) {
    this.toast = { text: text, kind: kind || 'info', life: 2.2, max: 2.2 };
  };

  Game.prototype.wardText = function () {
    return this.bonds.ward > 0 ? ('业火 ' + this.bonds.ward) : '无契';
  };

  Game.prototype.cameraFollow = function () {
    var tx = this.player.x - W / 2, ty = this.player.y - H / 2;
    var maxX = this.map.w * B.TILE - W, maxY = this.map.h * B.TILE - H;
    this.cam.x = B.clamp(tx, 0, Math.max(0, maxX));
    this.cam.y = B.clamp(ty, 0, Math.max(0, maxY));
    // 震屏叠加（顿帧时也保留）
    var o = B.feel.offset();
    this.cam.x += o.x; this.cam.y += o.y;
  };

  // ---------- 昼夜事件 ----------
  Game.prototype.onPhase = function (phase) {
    if (phase === 'dusk') {
      B.audio.play('waveStart');
      B.music.setTheme('dusk', 1.2);
      this.msg('钟要响了。', 'warn');
      this.wave = 0;
    } else if (phase === 'night') {
      B.music.setTheme('night', 1.5);
      this.startNight();
    } else if (phase === 'dawn') {
      B.music.setTheme('day', 1.6);
      this.startDay();
    } else if (phase === 'settle') {
      this.settle();
    } else if (phase === 'newday') {
      this.startDay();
    } else if (phase === 'gameover') {
      this.finish();
    }
  };

  Game.prototype.startDay = function () {
    B.audio.play('dawn');
    this.enemies.length = 0;
    this.projectiles.length = 0;

    // 契约磨损与叛变
    var betrayed = this.bonds.dailyWear();
    for (var i = 0; i < betrayed.length; i++) {
      var b = betrayed[i];
      B.audio.play('betray');
      this.spawnBetrayer(b);
    }
    if (betrayed.length) this.msg(betrayed.length + ' 个契约者在这个早晨站起来了。', 'bad');

    // 作物生长
    var grown = this.farm.dailyGrow();
    if (grown) this.msg(grown + ' 株作物长了一格。', 'good');

    // 晨间低语
    if (this.flags.morningWhisper) {
      var w = B.story.whispers[Math.min(this.dn.day - 1, B.story.whispers.length - 1)];
      this.msg('钟灵：' + w, 'spirit');
    }

    // 剧情
    var act = B.story.actForDay(this.dn.day);
    if (act && !this.shownAct(act.key)) {
      this.pendingAct = act;
      this.state = 'dialogue';
    }
  };

  Game.prototype.shownAct = function (key) {
    return !!this.flags['act_' + key];
  };

  Game.prototype.markAct = function (key) { this.flags['act_' + key] = true; };

  Game.prototype.applyActEffect = function (eff) {
    if (!eff) return;
    if (eff.flag) this.flags[eff.flag] = true;
    if (eff.morningWhisper) this.flags.morningWhisper = true;
    if (eff.muteSpirit) this.flags.morningWhisper = false;
    if (eff.intelFree) this.flags.intelFree = (this.flags.intelFree || 0) + eff.intelFree;
    if (eff.vigorRestore) {
      for (var i = 0; i < this.bonds.list.length; i++) {
        var b = this.bonds.list[i];
        b.vigor = Math.min(b.maxVigor, b.vigor + eff.vigorRestore);
      }
    }
    if (eff.betrayNextDay) this.flags.betrayNextDay = true;
    if (eff.supplyDaily) this.flags.supplyDaily = eff.supplyDaily;
    if (eff.waveBonus) this.flags.waveBonus = eff.waveBonus;
    if (eff.ward) this.bonds.reduceWard(eff.ward);
    if (eff.weaponTier) this.flags.weaponTierBonus = (this.flags.weaponTierBonus || 0) + eff.weaponTier;
    if (eff.nightSurge) this.flags.nightSurge = true;
    if (eff.extraEpilogue) this.flags.extraEpilogue = true;
    if (eff.coldEnding) this.flags.coldEnding = true;
    if (eff.rel) {
      for (var k in eff.rel) this.favor[k] = (this.favor[k] || 0) + eff.rel[k];
    }
  };

  Game.prototype.spawnBetrayer = function (bonded) {
    var c = this.map.farmRect;
    var x = (c.x0 + 3 + Math.random() * 12) * B.TILE;
    var y = (c.y0 + 3 + Math.random() * 12) * B.TILE;
    var e = new B.enemies.Enemy(bonded.type, x, y, 1);
    e.betrayer = true;
    this.enemies.push(e);
  };

  Game.prototype.startNight = function () {
    this.wave = 0;
    this.waveTimer = 0;
    this.nightSurge = !!this.flags.nightSurge;
    this.spawnNextWave();
  };

  Game.prototype.spawnNextWave = function () {
    this.wave++;
    var tier = 1 + (this.dn.day - 1) * 0.16 + this.bonds.ward * 0.13;
    var base = 3 + Math.floor(this.dn.day * 0.7) + this.wave * 2;
    var count = Math.round(base * this.bonds.spawnMul());
    if (this.wave === 1 && this.flags.waveBonus) count += this.flags.waveBonus;
    if (this.flags.supplyDaily) this.steel += this.flags.supplyDaily;
    var list = B.enemies.spawnWave(this.map.cracks, count, tier, this.dn.day, this.wave, this.bonds.ward);
    for (var i = 0; i < list.length; i++) this.enemies.push(list[i]);

    // BOSS：第 7 天的钟灵回声（第三波），第 14 天的最初的契约者（第一波）
    var bossKind = null;
    if (this.dn.day === 7 && this.wave === 3) bossKind = 'echo';
    if (this.dn.day >= B.TOTAL_DAYS && this.wave === 1) bossKind = 'first';
    if (bossKind && !this.bossSpawned) {
      this.bossSpawned = true;
      var c = this.map.cracks[0];
      var boss = new B.enemies.Enemy('cairn', c.x, c.y - 24, tier);
      boss.isBoss = true;
      boss.bossKind = bossKind;
      boss.name = bossKind === 'echo' ? '钟灵回声' : '最初的契约者';
      boss.hp = boss.maxHp = bossKind === 'echo' ? 320 : 520;
      boss.r = 12;
      boss.speed *= 0.82;
      boss.soul = 60;
      boss.summonT = 3;
      this.enemies.push(boss);
      this.boss = boss;
      B.audio.bell(110, 3.0, 0.3);
      this.msg(boss.name + ' 从裂口里站了起来。', 'bad');
    }
    this.waveTimer = 26;
  };

  // ---------- 结算 ----------
  Game.prototype.settle = function () {
    B.audio.play('dawn');
    this.pendingSettle = true;
    this.dn.paused = true;   // 等玩家确认今日的账
  };

  Game.prototype.finish = function () {
    var ending = B.story.resolveEnding({
      soulfire: this.soulfire,
      totalBonds: this.bonds.totalBonds,
      silenceCost: this.silenceCost
    });
    this.ending = ending;
    this.state = 'ending';
    B.music.setTheme('ending', 2.5);
  };

  // ---------- 交互（K 键） ----------
  Game.prototype.interact = function () {
    var p = this.player;

    // 夜里：缚契 / 斩杀由击败后弹出，不在此
    if (this.dn.isNight()) return;

    // 钟楼门口 -> 剧情 / 结局
    var bf = this.map.belfry;
    var bx = (bf.x + 2) * B.TILE + 8, by = (bf.y - 1) * B.TILE + 8;
    if (B.dist(p.x, p.y, bx, by) < 26) {
      this.msg('钟楼的门关着。它只在第十二夜自己开。', 'info');
      return;
    }

    // 铁匠铺 -> 升级武器
    var sm = this.map.smithy;
    var sx = (sm.x + 2) * B.TILE + 8, sy = (sm.y + sm.h) * B.TILE + 8;
    if (B.dist(p.x, p.y, sx, sy) < 30) { this.tryUpgradeWeapon(); return; }

    // 地块操作
    var plot = this.farm.atPx(p.x, p.y);
    if (plot) {
      if (!plot.tilled) {
        if (this.player.spendStamina(6) && this.farm.till(plot)) {
          B.audio.play('till'); this.particles.burst(p.x, p.y, 5, 40, B.pal.farm.soilA, 0.3, 1);
        }
        return;
      }
      if (!plot.crop) {
        var cost = B.crops.seedCost(this.selectedSeed);
        if (this.soulfire < cost) { this.msg('魂火不够，种不下。', 'bad'); B.audio.play('deny'); return; }
        if (this.player.spendStamina(4) && this.farm.plant(plot, this.selectedSeed)) {
          this.soulfire -= cost;
          B.audio.play('plant');
        }
        return;
      }
      if (!plot.watered) {
        if (this.player.spendStamina(3) && this.farm.water(plot)) B.audio.play('plant');
        return;
      }
      if (B.crops.isRipe(plot)) { this.doHarvest(plot); return; }
      this.msg('还没熟。', 'info');
      return;
    }

    // 镇民
    for (var i = 0; i < B.story.villagers.length; i++) {
      var v = B.story.villagers[i];
      if (B.dist(p.x, p.y, this.npcPos(v.id).x, this.npcPos(v.id).y) < 28) { this.talkTo(v.id); return; }
    }
  };

  Game.prototype.npcPos = function (id) {
    var sm = this.map.smithy;
    if (id === 'marta') return { x: (sm.x + 2) * B.TILE, y: (sm.y + sm.h + 1) * B.TILE };
    if (id === 'otto') return { x: 22 * B.TILE, y: 24 * B.TILE };
    return { x: 30 * B.TILE, y: 26 * B.TILE };
  };

  Game.prototype.doHarvest = function (plot) {
    var out = this.farm.harvest(plot);
    if (!out) return;
    this.soulfire += out.soul;
    this.steel += out.steel;
    if (out.ward) this.bonds.reduceWard(out.ward);
    if (out.vigorRestore) {
      for (var i = 0; i < this.bonds.list.length; i++) {
        var b = this.bonds.list[i];
        b.vigor = Math.min(b.maxVigor, b.vigor + out.vigorRestore);
      }
    }
    B.audio.play('harvest');
    this.particles.burst(this.player.x, this.player.y - 6, 8, 55, B.pal.farm.grassC, 0.5, 1);
    this.floatTexts.push(B.FloatText(this.player.x, this.player.y - 14, '+' + out.soul, '#ffd27a'));
    this.msg('收了 ' + out.name + '。', 'good');
  };

  Game.prototype.tryUpgradeSlots = function () {
    // 扩契约名额：花魂火与钢，最多到 5
    if (this.bonds.slots >= 5) { this.msg('名额已经到顶了。', 'info'); return; }
    var cost = { soul: 25 + this.bonds.slots * 15, steel: 3 + this.bonds.slots };
    if (this.soulfire < cost.soul || this.steel < cost.steel) {
      this.msg('扩名额要 ' + cost.soul + ' 魂火、' + cost.steel + ' 钢。', 'bad');
      B.audio.play('deny');
      return;
    }
    this.soulfire -= cost.soul;
    this.steel -= cost.steel;
    var n = this.bonds.upgradeSlots();
    B.audio.play('levelup');
    this.msg('契约名额扩到 ' + n + '。', 'good');
  };

  Game.prototype.tryUpgradeWeapon = function () {
    var next = B.weapons.upgrade(this.player.weapon);
    if (!next) { this.msg('这把已经到顶了。', 'info'); return; }
    var c = B.weapons.costOf(next);
    if (this.soulfire < c.soul || this.steel < c.steel) {
      this.msg('要 ' + c.soul + ' 魂火、' + c.steel + ' 钢。', 'bad');
      B.audio.play('deny');
      return;
    }
    this.soulfire -= c.soul;
    this.steel -= c.steel;
    this.player.weapon = next;
    B.audio.play('levelup');
    this.msg('换上了 ' + B.weapons.get(next).name + '。', 'good');
  };

  Game.prototype.talkTo = function (id) {
    var tier = B.story.tierOf(id, this.favor[id] || 0);
    this.msg(B.story.villager(id).name + '：' + B.story.lineOf(id, tier), 'npc');
    this.favor[id] = (this.favor[id] || 0) + 1;
  };

  // ---------- 击败后的斩 / 缚 ----------
  Game.prototype.onEnemyDefeated = function (e) {
    // 白天叛变的契约者不参与斩/缚
    if (e.betrayer) return;
    this.pendingBind = e;
    this.state = 'bind';
  };

  Game.prototype.chooseBind = function (bindIt) {
    var e = this.pendingBind;
    this.pendingBind = null;
    this.state = 'play';
    if (!e) return;
    if (bindIt) {
      if (!this.bonds.canBind()) { this.msg('名额满了。先扩农场。', 'bad'); B.audio.play('deny'); return; }
      var b = this.bonds.bind(e.type, this.dn.day);
      // 契约者入农场，不在墓穴裂口
      var fr = this.map.farmRect;
      b.x = (fr.x0 + 1 + Math.random() * (fr.x1 - fr.x0 - 2)) * B.TILE;
      b.y = (fr.y0 + 1 + Math.random() * (fr.y1 - fr.y0 - 2)) * B.TILE;
      b.job = null;
      B.audio.play('bind');
      this.particles.burst(b.x, b.y, 14, 60, B.pal.crypt.ghost, 0.7, 1);
      this.msg(e.stats.name + ' 签了。业火 ' + this.bonds.ward + '。', 'warn');
    } else {
      this.soulfire += e.soul;
      B.audio.play('rend');
      this.floatTexts.push(B.FloatText(e.x, e.y - 8, '+' + e.soul, '#ffd27a'));
      this.msg('斩了。+' + e.soul + ' 魂火。', 'good');
    }
  };

  // ---------- 更新 ----------
  Game.prototype.update = function (dt) {
    var i;

    if (this.state === 'intro' || this.state === 'ending' || this.state === 'dead') return;
    if (this.pendingSettle) { this.particles.update(dt); return; }   // 结算时冻结世界
    if (this.state === 'bind') return;   // 等玩家选

    // 玩家阵亡：立即停世界并切界面
    if (this.player.dead) {
      this.state = 'dead';
      B.audio.play('betray');
      B.music.stop(1.6);
      this.particles.burst(this.player.x, this.player.y - 6, 18, 80, B.pal.ui.blood, 0.9, 2);
      return;
    }

    if (this.toast) {
      this.toast.life -= dt;
      if (this.toast.life <= 0) this.toast = null;
    }

    // 昼夜推进
    var ph = this.dn.update(dt);
    if (ph) this.onPhase(ph);

    var p = this.player;
    var ax = 0, ay = 0;
    if (this.state !== 'dialogue') {
      var a = B.input.axis();
      ax = a.x; ay = a.y;
      if (B.input.justPressed('act')) this.interact();
      if (B.input.justPressed('attack')) this.doAttack();
      if (B.input.justPressed('dash')) {
        if (p.dash()) {
          B.audio.play('swing');
          this.particles.burst(p.x, p.y + 4, 8, 70, B.pal.crypt.ghost, 0.35, 1);
        }
      }
      if (B.input.justPressed('upgrade')) this.tryUpgradeSlots();
      if (B.input.justPressed('bond') && this.bonds.list.length) this.bonds.feedAll(this.soulfire);
    }
    p.move(dt, ax, ay);
    this.playerMoving = (ax !== 0 || ay !== 0);
    if (this.playerMoving && !p.dead) {
      p.stepT += dt;
      if (p.stepT > 0.34) { p.stepT = 0; B.audio.play('step'); }
      // 行走两帧：交替 player_idle（腿并）与 player_walk（腿分）
      this.walkT = (this.walkT || 0) + dt;
      if (this.walkT > 0.16) { this.walkT = 0; this.walkFrame = !this.walkFrame; }
    } else {
      this.walkT = 0;
      this.walkFrame = false;
    }
    if (ax !== 0) p.facing = ax > 0 ? 1 : -1;
    p.update(dt);

    // 瞄准
    var m = B.input.mouse;
    p.aim = Math.atan2(m.y + this.cam.y - p.y, m.x + this.cam.x - p.x);

    // 契约者自动劳动（白天）
    if (this.dn.isDay() && this.bonds.list.length) this.laborTick(dt);

    // 弹丸
    for (i = this.projectiles.length - 1; i >= 0; i--) {
      var pr = this.projectiles[i];
      (function (self, proj) {
        proj.update(dt, self.enemies, self.map, function (e) {
          B.combat.damage(self, e, proj.def.dmg, proj.ux, proj.uy, { kb: proj.def.kb });
          if (!e.alive) self.onEnemyDefeated(e);
        });
      })(this, pr);
      if (!pr.alive) this.projectiles.splice(i, 1);
    }

    // 敌人
    for (i = this.enemies.length - 1; i >= 0; i--) {
      var e = this.enemies[i];
      if (!e.alive) {
        if (e.isBoss) {
          this.soulfire += e.soul;
          this.particles.burst(e.x, e.y, 30, 130, B.pal.crypt.ember, 1.2, 2);
          this.msg(e.name + ' 散了。+' + e.soul + ' 魂火。', 'good');
          this.boss = null;
        }
        this.enemies.splice(i, 1);
        continue;
      }
      // BOSS 周期性召唤
      if (e.isBoss && e.bossKind === 'echo') {
        e.summonT -= dt;
        if (e.summonT <= 0 && this.enemies.length < 30) {
          e.summonT = 7;
          for (var s = 0; s < 3; s++) {
            this.enemies.push(new B.enemies.Enemy('wailer', e.x + (s - 1) * 20, e.y + 10, 1.2));
          }
          this.msg('它又叫了三声。', 'bad');
          B.audio.bell(196, 1.4, 0.18);
        }
      }
      var touched = e.update(dt, p, this.map, this.enemies);
      if (touched) p.takeDamage(e.dmg, e.x, e.y);
    }

    // 波次
    if (this.dn.isNight()) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0 && this.enemies.length < 26) this.spawnNextWave();
    }

    this.particles.update(dt);

    // 飘尘：白天缓慢浮起的光尘，夜里变成雾里的尘
    this.updateMotes(dt);
    for (i = this.floatTexts.length - 1; i >= 0; i--) {
      var ft = this.floatTexts[i];
      ft.life -= dt; ft.y -= dt * 18;
      if (ft.life <= 0) this.floatTexts.splice(i, 1);
    }

    // 业火变化同步到音乐（升高则叠一层下沉的非谐低鸣）
    if (this._lastWard !== this.bonds.ward) {
      this._lastWard = this.bonds.ward;
      B.music.setWard(this.bonds.ward);
    }

    this.cameraFollow();
  };

  Game.prototype.laborTick = function (dt) {
    // 实体模型：每个契约者自己走到地块上干活，看得见
    var bonds = this.bonds.list;
    for (var i = 0; i < bonds.length; i++) {
      var b = bonds[i];
      if (!b.alive) continue;

      // 没活就去接一件。优先级：收割 > 浇水 > 开垦
      if (!b.job) {
        var kinds = ['reap', 'water', 'till'];
        for (var k = 0; k < kinds.length; k++) {
          if (!b.stats()[kinds[k]]) continue;
          var plot = this.farm.nextJob(kinds[k]);
          if (plot) {
            plot.reservedBy = b.id;
            b.job = plot;
            b.jobKind = kinds[k];
            b.work = kinds[k];
            break;
          }
        }
      }

      if (!b.job) continue;

      var tx = b.job.x * B.TILE + 8, ty = b.job.y * B.TILE + 8;
      var d = B.dist(b.x, b.y, tx, ty);
      if (d < 5) {
        // 到点开工
        this.farm.doJob(b.job, b.jobKind);
        if (b.jobKind === 'reap') {
          var v = 2 + Math.round(b.stats().reap);
          this.soulfire += v;
          this.particles.burst(tx, ty, 5, 45, B.pal.farm.grassC, 0.45, 1);
          this.floatTexts.push(B.FloatText(tx, ty - 6, '+' + v, '#ffd27a'));
        } else {
          this.particles.burst(tx, ty, 3, 30, B.pal.farm.soilA, 0.3, 1);
        }
        b.job.reservedBy = 0;
        b.job = null;
        b.jobKind = null;
      } else {
        var a = Math.atan2(ty - b.y, tx - b.x);
        var sp = 24 * (0.6 + b.ratio());
        b.x += Math.cos(a) * sp * dt;
        b.y += Math.sin(a) * sp * dt;
        b.bobT = (b.bobT || 0) + dt * 9;
      }
    }
  };

  Game.prototype.doAttack = function () {
    var r = this.player.tryAttack();
    if (!r) return;
    if (r.kind === 'melee') {
      var hits = this.player.meleeHit(this.enemies);
      for (var i = 0; i < hits.length; i++) {
        var h = hits[i];
        var dx = Math.cos(h.angle), dy = Math.sin(h.angle);
        B.combat.damage(this, h.enemy, r.def.dmg, dx, dy, { kb: r.def.kb, heavy: r.def.heavy });
        if (!h.enemy.alive) this.onEnemyDefeated(h.enemy);
      }
    } else {
      this.projectiles.push(new B.combat.Projectile(
        this.player.x, this.player.y,
        Math.cos(this.player.aim), Math.sin(this.player.aim), r.def));
    }
  };

  // ---------- 渲染 ----------
  Game.prototype.render = function () {
    var g = this.g, cam = this.cam, i;

    g.fillStyle = B.pal.crypt.floorA;
    g.fillRect(0, 0, W, H);

    g.save();
    g.translate(-Math.round(cam.x), -Math.round(cam.y));
    g.imageSmoothingEnabled = false;

    // 地面（只烘焙一次，白昼色）
    g.drawImage(this.map.baked, 0, 0);

    // 墓地裂口：光晕已烘进地面
    // 建筑标记：门与炉火已烘进地面（drawLandmarks 不再每帧重画）

    // 作物
    for (i = 0; i < this.farm.plots.length; i++) this.drawPlot(g, this.farm.plots[i]);

    // 契约者、敌人、玩家统一按 y 排序后绘制，高低关系才成立
    var ents = [];
    for (i = 0; i < this.bonds.list.length; i++) {
      var bb = this.bonds.list[i];
      ents.push({ y: bb.y, kind: 'bond', ref: bb });
    }
    for (i = 0; i < this.enemies.length; i++) {
      var ee = this.enemies[i];
      ents.push({ y: ee.y, kind: 'enemy', ref: ee });
    }
    ents.push({ y: this.player.y, kind: 'player', ref: this.player });
    ents.sort(function (a, c) { return a.y - c.y; });

    // 所有影子先统一画完，避免后画的实体影子盖住先画的实体
    for (i = 0; i < ents.length; i++) {
      var en = ents[i];
      if (en.kind === 'bond') this.shadowFor(g, en.ref.x, en.ref.y + 4, 10);
      else if (en.kind === 'enemy') this.shadowFor(g, en.ref.x, en.ref.y + en.ref.r, Math.round(en.ref.r * 2.3));
      else this.shadowFor(g, en.ref.x, en.ref.y + 6, 12);
    }

    for (i = 0; i < ents.length; i++) {
      var it = ents[i];
      if (it.kind === 'bond') this.drawBonded(g, it.ref);
      else if (it.kind === 'enemy') this.drawEnemy(g, it.ref);
      else this.drawPlayer(g);
    }

    // 弹丸
    for (i = 0; i < this.projectiles.length; i++) {
      var pr = this.projectiles[i];
      g.fillStyle = B.pal.crypt.holyBolt;
      g.fillRect(Math.round(pr.x) - 2, Math.round(pr.y) - 2, 4, 4);
      g.fillStyle = B.pal.crypt.ember;
      g.fillRect(Math.round(pr.x) - 1, Math.round(pr.y) - 1, 2, 2);
    }

    // 粒子
    this.particles.draw(g, cam);

    g.restore();

    // ---- 夜幕：全屏乘色层（乘蓝而非黑罩） ----
    var a = B.pal.veilAlpha(this.dn.vigor);
    if (a > 0.002) {
      g.globalCompositeOperation = 'multiply';
      g.globalAlpha = a;
      g.fillStyle = B.pal.nightMul;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }

    // ---- 夜里把暗部抬蓝 ----
    this.drawNightLift(g);

    // ---- 光源层：lighter，夜里唯一免乘的暖光 ----
    this.drawLights(g);

    // ---- 飘尘 ----
    this.drawMotes(g);

    // ---- 昼：方向光 + 环境暖光；阳光斑 ----
    this.drawDirectionalLight(g);
    this.drawAmbient(g);
    this.drawSunPatches(g);

    // ---- 瘴雾层 ----
    this.drawMiasma(g);

    // ---- 后处理：暗角 ----
    this.drawVignette(g);

    // ---- 世界层 UI：血条 / 飘字 / 预警。
    //      放在暗角之后，与 HUD 同等待遇，不被乘色与暗角压暗 ----
    this.drawWorldUI(g);

    // ---- 界面层：结算 > 覆盖界面 > HUD ----
    if (this.pendingSettle) {
      B.ui.drawSettle(g, this);
    } else if (this.state === 'intro' || this.state === 'dialogue' ||
               this.state === 'bind' || this.state === 'ending') {
      B.ui.drawOverlay(g, this);
    } else {
      B.ui.drawHUD(g, this);
    }
    if (this.toast && !this.pendingSettle) B.ui.drawToast(g, this.toast);
  };

  Game.prototype.drawPlot = function (g, p) {
    if (!p.crop) return;
    var T = B.TILE;
    var px = p.x * T + 8, py = p.y * T + 8;
    var col = B.crops.colorsAt(p.crop, p.growth);
    var ripe = B.crops.isRipe(p);
    g.fillStyle = B.pal.farm.leafB;
    g.fillRect(px - 1, py + 1, 1, 4);
    g.fillRect(px + 1, py + 1, 1, 4);
    g.fillStyle = col;
    // 尺寸只取偶数，避免落在半像素上被抗锯齿糊掉
    var sz = ripe ? 4 : (p.growth >= 2 ? 4 : 2);
    g.fillRect(px - sz / 2, py + 1 - sz, sz, sz);
    if (p.watered) {
      g.fillStyle = 'rgba(120,160,200,0.30)';
      g.fillRect(p.x * T + 1, p.y * T + 1, T - 2, T - 2);
    }
  };

  Game.prototype.drawLandmarks = function (g) {
    var T = B.TILE;
    // 钟楼门
    var bf = this.map.belfry;
    g.fillStyle = B.pal.crypt.ember;
    g.fillRect((bf.x + 2) * T + 4, bf.y * T + 4, 8, 8);
    // 铁匠铺炉火
    var sm = this.map.smithy;
    g.fillStyle = B.pal.crypt.emberDeep;
    g.fillRect((sm.x + 1) * T + 4, (sm.y + sm.h) * T - 6, 8, 6);
  };

  // 方向光：光从左上来。左上暖、右下冷，一条线性渐变搞定
  Game.prototype.drawDirectionalLight = function (g) {
    var k = 1 - this.dn.vigor;
    if (k <= 0.02 || !g.createLinearGradient) return;
    var grd = g.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, 'rgba(255,237,189,' + (0.09 * k).toFixed(3) + ')');
    grd.addColorStop(0.5, 'rgba(255,237,189,0)');
    grd.addColorStop(1, 'rgba(108,116,180,' + (0.17 * k).toFixed(3) + ')');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
  };

  // 环境暖光：soft-light 提亮中调，不带颜色偏移，比直接加法安全
  Game.prototype.drawAmbient = function (g) {
    var k = 1 - this.dn.vigor;
    if (k <= 0.05) return;
    g.globalCompositeOperation = 'soft-light';
    g.fillStyle = 'rgba(255,240,210,' + (0.16 * k).toFixed(3) + ')';
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
  };

  // 夜幕之后的抬蓝层：把暗部推向蓝，而不是单纯变黑
  Game.prototype.drawNightLift = function (g) {
    var k = this.dn.vigor;
    if (k < 0.45) return;
    g.globalCompositeOperation = 'screen';
    g.fillStyle = 'rgba(70,90,160,' + (0.08 * k).toFixed(3) + ')';
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
  };

  // 找出玩家附近可以操作的东西，返回 {x, y, label} 或 null
  Game.prototype.interactPrompt = function () {
    var p = this.player, T = B.TILE;
    if (this.dn.isNight() || this.state !== 'play') return null;

    // 钟楼门
    var bf = this.map.belfry;
    var bx = (bf.x + 2) * T + 8, by = (bf.y - 1) * T + 8;
    if (B.dist(p.x, p.y, bx, by) < 26) return { x: bx, y: by - 6, label: '空格  查看钟楼' };

    // 铁匠铺
    var sm = this.map.smithy;
    var sx = (sm.x + 2) * T + 8, sy = (sm.y + sm.h) * T + 8;
    if (B.dist(p.x, p.y, sx, sy) < 30) return { x: sx, y: sy - 6, label: '空格  锻造' };

    // 镇民
    for (var v = 0; v < B.story.villagers.length; v++) {
      var np = this.npcPos(B.story.villagers[v].id);
      if (B.dist(p.x, p.y, np.x, np.y) < 28) return { x: np.x, y: np.y - 22, label: '空格  交谈' };
    }

    // 地块
    var plot = this.farm.atPx(p.x, p.y);
    if (plot) {
      var px = plot.x * T + 8, py = plot.y * T - 2;
      if (!plot.tilled) return { x: px, y: py, label: '空格  开垦' };
      if (!plot.crop) return { x: px, y: py, label: '空格  播种' };
      if (!plot.watered) return { x: px, y: py, label: '空格  浇水' };
      if (B.crops.isRipe(plot)) return { x: px, y: py, label: '空格  收获' };
      return { x: px, y: py, label: '还在长' };
    }
    return null;
  };

  // 脚下的影子（统一入口，便于把绘制顺序收到实体之前）
  // 白天：光源在左上，影向右下偏 (+2,+2)；夜里无方向光，影居中且更重
  Game.prototype.shadowFor = function (g, x, y, w) {
    var night = this.dn.vigor > 0.5;
    var dx = night ? 0 : 2, dy = night ? 0 : 2;
    var rgb = night ? '0,0,0' : '20,16,10';
    g.fillStyle = 'rgba(' + rgb + ',' + (night ? 0.35 : 0.25) + ')';
    g.fillRect(Math.round(x - w / 2) + dx, Math.round(y - 1) + dy, w, 3);
    g.fillStyle = 'rgba(' + rgb + ',' + (night ? 0.16 : 0.12) + ')';
    g.fillRect(Math.round(x - w / 2 - 1) + dx, Math.round(y) + dy, w + 2, 1);
  };

  // 世界坐标的世界层 UI：血条、飘字、蓄力预警
  Game.prototype.drawWorldUI = function (g) {
    var cam = this.cam, i;
    var ox = -Math.round(cam.x), oy = -Math.round(cam.y);

    g.save();
    g.translate(ox, oy);

    // 契约者活力条：加黑底描边，低活力闪烁
    for (i = 0; i < this.bonds.list.length; i++) {
      var b = this.bonds.list[i];
      var w = 14, r = b.ratio();
      var bx = Math.round(b.x - w / 2), by = Math.round(b.y - 22);
      g.fillStyle = 'rgba(6,8,13,0.75)';
      g.fillRect(bx - 1, by - 1, w + 2, 4);
      var col = r > 0.6 ? '#9fe8dc' : (r > 0.34 ? '#ffb066' : '#a93044');
      if (r <= 0.34 && Math.floor(performance.now() / 220) % 2 === 0) col = '#ff8c42';
      g.fillStyle = col;
      g.fillRect(bx, by, Math.round(w * r), 2);
    }

    // 墓守与 BOSS 血条
    for (i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (e.type !== 'cairn' || !e.alive) continue;
      var s = B.sprites.get('cairn', this.dn.vigor > 0.5);
      if (!s) continue;
      var ew = e.isBoss ? 30 : 18;
      var ex = Math.round(e.x - ew / 2), ey = Math.round(e.y - s.h + e.r - 6);
      g.fillStyle = 'rgba(6,8,13,0.75)';
      g.fillRect(ex - 1, ey - 1, ew + 2, 4);
      g.fillStyle = e.raged ? '#ff8c42' : '#ffb066';
      g.fillRect(ex, ey, Math.round(ew * (e.hp / e.maxHp)), 2);
      if (e.isBoss) {
        g.font = '9px "Microsoft YaHei","PingFang SC",sans-serif';
        g.fillStyle = '#ffd27a';
        g.textAlign = 'center';
        g.fillText(e.name, Math.round(e.x), ey - 4);
        g.textAlign = 'left';
      }
    }

    // 坟蝠蓄力预警：必须看得见，所以不跟世界一起吃乘色
    for (i = 0; i < this.enemies.length; i++) {
      var g2 = this.enemies[i];
      if (g2.type !== 'gravewing' || g2.state !== 'charge') continue;
      g.fillStyle = B.pal.crypt.emberDeep;
      g.globalAlpha = 0.55 + Math.sin(performance.now() / 60) * 0.3;
      g.fillRect(Math.round(g2.x) - 9, Math.round(g2.y) - 2, 18, 3);
      g.globalAlpha = 1;
    }

    // 飘字：带描边，否则落在同色光源里直接消失
    for (i = 0; i < this.floatTexts.length; i++) {
      var ft = this.floatTexts[i];
      g.globalAlpha = B.clamp(ft.life / ft.max, 0, 1);
      g.font = 'bold 9px Consolas,monospace';
      g.textAlign = 'center';
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(6,8,13,0.85)';
      g.strokeText(ft.text, Math.round(ft.x), Math.round(ft.y));
      g.fillStyle = ft.color;
      g.fillText(ft.text, Math.round(ft.x), Math.round(ft.y));
      g.textAlign = 'left';
      g.globalAlpha = 1;
    }

    g.restore();
  };

  Game.prototype.drawBonded = function (g, b) {
    var night = this.dn.vigor > 0.5;
    var s = B.sprites.get('ghost', night);
    if (!s) return;
    var bob = Math.sin((b.bobT || 0) + b.id) * 1.6;
    var y = b.y + bob;
    // 不再整体透明，避免影子从身体里透出来；用半透明感靠颜色本身
    g.drawImage(s.base, Math.round(b.x - 8), Math.round(y - 16));
  };

  Game.prototype.drawEnemy = function (g, e) {
    var s = B.sprites.get(e.type, this.dn.vigor > 0.5);
    if (!s) return;
    var img = (e.flash > 0 && s.flash) ? s.flash : s.base;
    var w = s.w, h = s.h;
    if (e.flash > 0) {
      // 受击形变：纵向压 12%、横向拉 6%，配合闪白，读起来就是"被打了一拳"
      g.save();
      g.translate(Math.round(e.x), Math.round(e.y - h + e.r + h));
      g.scale(1.06, 0.88);
      g.drawImage(img, -Math.round(w / 2), -h);
      g.restore();
    } else {
      var bobY = e.type === 'gravewing' ? Math.sin(performance.now() / 180 + e.uid) * 1.5 : 0;
      g.drawImage(img, Math.round(e.x - w / 2), Math.round(e.y - h + e.r + bobY));
    }
    if (e.betrayer) {
      g.fillStyle = '#a93044';
      g.fillRect(Math.round(e.x) - 1, Math.round(e.y) - h + e.r - 9, 2, 2);
    }
  };

  Game.prototype.drawPlayer = function (g) {
    var p = this.player;
    if (p.dead) return;
    var name;
    if (p.swingT > 0) name = 'player_swing';
    else if (this.playerMoving) name = (this.walkFrame ? 'player_walk' : 'player_idle');
    else name = 'player_idle';
    var s = B.sprites.get(name, this.dn.vigor > 0.5);
    if (!s) return;
    var pose = B.feel.pose();
    var y = p.y - s.h + 8 - pose.push;
    var flip = (this.playerMoving && p.facing < 0);
    if (p.invuln > 0 && Math.floor(performance.now() / 70) % 2 === 0) g.globalAlpha = 0.5;
    g.save();
    g.translate(Math.round(p.x + pose.rollY * 3), Math.round(y));
    if (flip) g.scale(-1, 1);
    g.drawImage(s.base, -Math.round(s.w / 2), 0);
    g.restore();
    g.globalAlpha = 1;
    // 挥砍弧
    if (p.swingT > 0) {
      var prog = 1 - p.swingT / 0.2;
      g.strokeStyle = 'rgba(255,243,184,' + (0.85 - prog * 0.6) + ')';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(p.x, p.y - 4, 18, p.aim - p.swingArc / 2, p.aim - p.swingArc / 2 + p.swingArc * (0.4 + prog * 0.6));
      g.stroke();
    }
  };

  // 光源：全部径向渐变，lighter 叠。
  // 硬规则：玩家是全场唯一暖光；敌意光源一律用冷色（#7787b3）
  Game.prototype.lightBlob = function (g, x, y, r, inner, mid, a) {
    var grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(' + inner + ',' + a.toFixed(3) + ')');
    grd.addColorStop(0.5, 'rgba(' + mid + ',' + (a * 0.42).toFixed(3) + ')');
    grd.addColorStop(1, 'rgba(' + mid + ',0)');
    g.fillStyle = grd;
    g.fillRect(Math.round(x - r), Math.round(y - r), r * 2, r * 2);
  };

  Game.prototype.drawLights = function (g) {
    // 白天不叠加法光：否则玩家脚下会拖一团跟着走的脏雾
    if (this.dn.vigor < 0.10) return;
    var k = B.clamp((this.dn.vigor - 0.10) / 0.45, 0, 1);
    var t = performance.now() / 1000;

    g.globalCompositeOperation = 'lighter';

    // 玩家：唯一暖光，带 2Hz 呼吸
    var breathe = 0.50 + Math.sin(t * Math.PI * 4) * 0.04;
    this.lightBlob(g,
      Math.round(this.player.x - this.cam.x), Math.round(this.player.y - this.cam.y - 4),
      76, '255,210,122', '255,176,102', breathe * k);

    // 建筑固定灯（灯笼口）
    var bf = this.map.belfry;
    this.lightBlob(g, Math.round((bf.x + 2) * B.TILE - this.cam.x), Math.round(bf.y * B.TILE - this.cam.y),
      48, '255,210,122', '255,176,102', 0.30 * k);
    var sm = this.map.smithy;
    this.lightBlob(g, Math.round((sm.x + 2) * B.TILE - this.cam.x), Math.round((sm.y + sm.h) * B.TILE - this.cam.y),
      44, '255,210,122', '255,176,102', 0.28 * k);

    // 成熟作物：烛莲的宵灯
    for (var i = 0; i < this.farm.plots.length; i++) {
      var p = this.farm.plots[i];
      if (p.crop !== 'candlelotus' || !B.crops.isRipe(p)) continue;
      var lx = p.x * B.TILE + 8 - this.cam.x, ly = p.y * B.TILE + 6 - this.cam.y;
      if (lx < -40 || ly < -40 || lx > W + 40 || ly > H + 40) continue;
      this.lightBlob(g, Math.round(lx), Math.round(ly), 40, '255,210,122', '255,176,102', 0.26 * k);
    }

    // 圣烛弹：白热小光
    for (var j = 0; j < this.projectiles.length; j++) {
      var pr = this.projectiles[j];
      this.lightBlob(g, Math.round(pr.x - this.cam.x), Math.round(pr.y - this.cam.y),
        18, '255,243,184', '255,176,102', 0.55 * k);
    }

    // 敌意光：哀鸣者。冷色，绝不能抢"玩家唯一暖光"这条
    for (var m = 0; m < this.enemies.length; m++) {
      var e = this.enemies[m];
      if (e.type !== 'wailer' || !e.alive) continue;
      this.lightBlob(g, Math.round(e.x - this.cam.x), Math.round(e.y - this.cam.y - 6),
        26, '119,135,179', '74,86,140', 0.20 * k);
    }

    g.globalCompositeOperation = 'source-over';
  };

  // 瘴雾：3~4 个大软斑，screen 叠，慢漂。单点光晕撑不起“雾在墙外游走”
  Game.prototype.drawMiasma = function (g) {
    if (this.dn.vigor < 0.30) return;
    if (!this._miasma) {
      var rng = B.makeRng(7717);
      this._miasma = [];
      for (var i = 0; i < 4; i++) {
        this._miasma.push({
          bx: 41 * B.TILE + (rng() - 0.5) * 260,
          by: 27 * B.TILE + (rng() - 0.5) * 190,
          r: 70 + rng() * 60,
          ax: 24 + rng() * 40,
          ay: 18 + rng() * 30,
          sp: 0.18 + rng() * 0.22,
          ph: rng() * Math.PI * 2,
          a: 0.10 + rng() * 0.06
        });
      }
    }
    var t = performance.now() / 1000;
    var k = B.clamp((this.dn.vigor - 0.30) / 0.5, 0, 1);

    g.globalCompositeOperation = 'screen';
    for (var j = 0; j < this._miasma.length; j++) {
      var m = this._miasma[j];
      var x = m.bx + Math.sin(t * m.sp + m.ph) * m.ax - this.cam.x;
      var y = m.by + Math.cos(t * m.sp * 0.7 + m.ph) * m.ay - this.cam.y;
      if (x < -m.r || y < -m.r || x > W + m.r || y > H + m.r) continue;
      var grd = g.createRadialGradient(Math.round(x), Math.round(y), 0, Math.round(x), Math.round(y), m.r);
      grd.addColorStop(0, 'rgba(74,86,140,' + (m.a * k).toFixed(3) + ')');
      grd.addColorStop(0.55, 'rgba(74,86,140,' + (m.a * k * 0.45).toFixed(3) + ')');
      grd.addColorStop(1, 'rgba(74,86,140,0)');
      g.fillStyle = grd;
      g.fillRect(Math.round(x - m.r), Math.round(y - m.r), m.r * 2, m.r * 2);
    }
    g.globalCompositeOperation = 'source-over';
  };

  // 飘尘：世界里缓慢浮动的光点，让画面有空气感
  Game.prototype.updateMotes = function (dt) {
    if (!this.motes) {
      this.motes = [];
      var rng = B.makeRng(4242);
      for (var i = 0; i < 42; i++) {
        this.motes.push({
          x: rng() * 2000,
          y: rng() * 1400,
          vx: (rng() - 0.5) * 5,
          vy: -3 - rng() * 7,
          ph: rng() * Math.PI * 2,
          s: rng() < 0.3 ? 2 : 1
        });
      }
    }
    var t = performance.now() / 1000;
    for (var i = 0; i < this.motes.length; i++) {
      var m = this.motes[i];
      m.x += (m.vx + Math.sin(t * 0.6 + m.ph) * 4) * dt;
      m.y += m.vy * dt;
      // 出了相机远边界就绕回来，保证屏幕上一直有
      if (m.y < this.cam.y - 40) { m.y = this.cam.y + B.VIEW_H + 30; m.x = this.cam.x + Math.random() * B.VIEW_W; }
      if (m.x < this.cam.x - 60) m.x = this.cam.x + B.VIEW_W + 40;
      if (m.x > this.cam.x + B.VIEW_W + 60) m.x = this.cam.x - 40;
    }
  };

  Game.prototype.drawMotes = function (g) {
    if (!this.motes) return;
    var day = 1 - this.dn.vigor * 0.55;
    var t = performance.now() / 1000;
    for (var i = 0; i < this.motes.length; i++) {
      var m = this.motes[i];
      var a = (0.18 + Math.sin(t * 1.4 + m.ph) * 0.14) * day;
      if (a <= 0.01) continue;
      g.globalAlpha = a;
      g.fillStyle = this.dn.vigor > 0.5 ? '#9fe8ff' : '#fff3b8';
      g.fillRect(Math.round(m.x), Math.round(m.y), m.s, m.s);
    }
    g.globalAlpha = 1;
  };

  // 光斑：阳光穿过树冠落下的暖亮斑（只白天）
  Game.prototype.drawSunPatches = function (g) {
    if (this.dn.vigor > 0.55) return;
    var a = (1 - this.dn.vigor / 0.55) * 0.13;
    if (a <= 0.004) return;
    g.globalCompositeOperation = 'lighter';
    var rng = B.makeRng(919);
    for (var i = 0; i < 26; i++) {
      var wx = Math.floor(rng() * this.map.w) * B.TILE - this.cam.x;
      var wy = Math.floor(rng() * this.map.h) * B.TILE - this.cam.y;
      if (wx < -80 || wy < -80 || wx > W + 80 || wy > H + 80) { rng(); rng(); continue; }
      g.fillStyle = 'rgba(255,236,180,' + a.toFixed(3) + ')';
      g.beginPath();
      g.ellipse(wx + 8, wy + 8, 13, 8, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  };

  // 后处理：暗角。强度随夜色走，白天不该把阳光压灰。
  // 常量图只烘一次，避免每帧新建满屏径向渐变
  Game.prototype.vignetteLayer = function () {
    if (this._vig) return this._vig;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d');
    if (g && g.createRadialGradient) {
      // 短边 55% 内全透明，到角落才压暗
      var grd = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28,
        W / 2, H / 2, Math.max(W, H) * 0.70);
      grd.addColorStop(0, 'rgba(24,18,30,0)');
      grd.addColorStop(0.6, 'rgba(24,18,30,0.10)');
      grd.addColorStop(1, 'rgba(24,18,30,0.28)');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
    }
    this._vig = c;
    return c;
  };

  Game.prototype.drawVignette = function (g) {
    // 昼：轻；夜：更重的冷黑
    var k = 0.35 + this.dn.vigor * 0.65;
    if (k <= 0.01) return;
    g.globalAlpha = k;
    g.drawImage(this.vignetteLayer(), 0, 0);
    g.globalAlpha = 1;
    if (this.dn.vigor > 0.5) {
      var a = (this.dn.vigor - 0.5) * 2;
      g.fillStyle = 'rgba(4,6,14,' + (0.30 * a).toFixed(3) + ')';
      g.fillRect(0, 0, W, H);
    }
  };

  // 脚下投影，让单位贴住地面而不是浮着
  Game.prototype.drawShadow = function (g, x, y, w) {
    g.fillStyle = 'rgba(0,0,0,0.30)';
    g.fillRect(Math.round(x - w / 2), Math.round(y - 1), w, 3);
    g.fillStyle = 'rgba(0,0,0,0.15)';
    g.fillRect(Math.round(x - w / 2 - 1), Math.round(y), w + 2, 1);
  };

  Game.prototype._bindBus = function () {
    if (this._busBound) return;   // 同一个实例只绑一次，否则事件会重入
    this._busBound = true;
    var self = this;
    B.bus.on('chooseBind', function (v) { self.chooseBind(v); });
    B.bus.on('advanceIntro', function () {
      self.introScreen++;
      if (self.introScreen >= B.story.intro.length) {
        self.state = 'play';
        self.dn.paused = false;
        B.music.setTheme('day', 1.5);
      }
    });
    B.bus.on('resolveAct', function (choice) {
      if (!self.pendingAct) return;
      self.applyActEffect(choice.effect);
      self.markAct(self.pendingAct.key);
      self.pendingAct = null;
      self.state = 'play';
    });
    B.bus.on('dismissSettle', function () {
      if (!self.pendingSettle) return;
      self.pendingSettle = false;
      self.dn.paused = false;
      var r = self.dn.advance();
      self.dn.t = 0;
      self.onPhase(r);
    });
    B.bus.on('dismissEnding', function () { self.state = 'ending'; });
    B.bus.on('restart', function () { self.restart(); });
  };

  Game.prototype.restart = function () {
    var ng = new Game(this.canvas);
    // 只复制实例自身的属性，绝不碰原型方法
    for (var k in ng) {
      if (Object.prototype.hasOwnProperty.call(ng, k)) this[k] = ng[k];
    }
    // bus 监听已经指向 this，不重复 bind
  };

  B.Game = Game;
})();
