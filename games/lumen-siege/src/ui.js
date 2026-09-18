/* LUMEN SIEGE - ui: DOM HUD, screens and the level-up cards.
   Writes are diffed against the last rendered value so the HUD never thrashes the DOM. */
(function () {
  'use strict';
  var PG = (window.PG = window.PG || {});

  var el = {};
  var last = { hp: '', xp: -1, level: -1, kills: -1, time: '', dash: '', combo: -1, dashReady: null };
  var handlers = {};
  var offers = [];
  var cardNodes = [];

  function $(id) { return document.getElementById(id); }

  function hide(node) { node.classList.add('hidden'); }
  function show(node) { node.classList.remove('hidden'); }

  /* Renders a character matrix into a small pixel canvas.
     Keys: '1' = main, '2' = highlight, '3' = shade, '4' = hot accent.
     Colour comes from the upgrade's rarity, so one matrix works for any tier. */
  function shade(hex, amount) {
    var n = parseInt(String(hex).slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amount > 0) {
      r += (255 - r) * amount; g += (255 - g) * amount; b += (255 - b) * amount;
    } else {
      r *= 1 + amount; g *= 1 + amount; b *= 1 + amount;
    }
    return 'rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ')';
  }

  function glyph(rows, size, color) {
    var base = color || '#5fe0c8';
    var pal = {
      '1': base,
      '2': shade(base, 0.42),
      '3': shade(base, -0.55),
      '4': '#fff3d0'
    };
    var h = rows.length, w = rows[0].length;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var col = pal[rows[y].charAt(x)];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
    c.style.width = size + 'px';
    c.style.height = size + 'px';
    return c;
  }

  var RARITY_LABEL = { common: '', rare: 'RARE', legend: 'LEGEND' };
  var RARITY_COLOR = { common: '#5fe0c8', rare: '#7fb6ff', legend: '#ffd76a' };

  /* Field labels for the number preview. Kept here rather than on each upgrade so
     the upgrade table stays about what things do, not how they read. */
  var STAT_LABELS = {
    damage: ['伤害', ''],
    fireInterval: ['攻击间隔', ' 秒'],
    multi: ['弹丸数', ''],
    pierce: ['穿透', ''],
    bulletSpeed: ['弹速', ''],
    bulletRadius: ['弹丸大小', ''],
    critChance: ['暴击率', ' %'],
    critMult: ['暴击倍率', ' 倍'],
    homing: ['转向速度', ' /秒'],
    bounce: ['反弹次数', ''],
    orbitCount: ['手里剑', ' 枚'],
    orbitSpeed: ['转速', ''],
    orbitDamage: ['环绕伤害', ''],
    orbitRadius: ['轨道半径', ''],
    chainChance: ['链击概率', ' %'],
    chainTargets: ['链接数', ''],
    chainDamageMul: ['链击伤害', ' 倍'],
    explodeRadius: ['爆炸半径', ''],
    explodeDamage: ['爆炸伤害', ''],
    burnDps: ['灼烧', ' /秒'],
    markPower: ['印记增伤', ' /层'],
    maxHp: ['生命上限', ''],
    regen: ['每秒回复', ''],
    shieldMax: ['护盾层数', ''],
    shieldRegen: ['护盾恢复', ' 秒'],
    thorns: ['荆棘伤害', ''],
    lifesteal: ['击杀回血', ''],
    secondWind: ['免死次数', ''],
    berserk: ['狂暴系数', ''],
    speed: ['移速', ''],
    dashCooldown: ['冲刺冷却', ' 秒'],
    dashDistance: ['冲刺距离', ''],
    dashBurn: ['冲刺灼伤', ''],
    dashImpact: ['冲刺撞击', ''],
    xpMult: ['经验倍率', ' 倍'],
    pickupRange: ['拾取范围', ''],
    lootChance: ['掉落概率', ' %'],
    extraChoices: ['额外选项', ''],
    enemySlow: ['敌人减速', ' %'],
    knock: ['击退', ''],
    boomerangCount: ['回旋镖', ' 枚'],
    boomerangInterval: ['投掷间隔', ' 秒'],
    sentinelCount: ['哨卫', ' 座'],
    sentinelInterval: ['哨卫间隔', ' 秒'],
    sentinelDamageMul: ['哨卫伤害', ' 倍'],
    wellRadius: ['引力井半径', ''],
    wellDamage: ['引力井伤害', ''],
    splitCount: ['碎片数', ''],
    splitDamageMul: ['碎片伤害', ' 倍'],
    executeThreshold: ['处决阈值', ' %'],
    chillFactor: ['减速', ' %'],
    freezePower: ['冻结时长', ' 秒'],
    ricochet: ['弹跳次数', ''],
    ricochetPower: ['每次弹跳增伤', ' %'],
    shrapnel: ['弹片数', ''],
    shrapnelDamage: ['弹片伤害', ''],
    ringEvery: ['环形弹间隔', ' 发'],
    laserDps: ['激光伤害', ' /秒'],
    auraRadius: ['光环半径', ''],
    auraDamage: ['光环伤害', ''],
    mineDamage: ['地雷伤害', ''],
    mineInterval: ['布雷间隔', ' 秒'],
    poisonRadius: ['毒云半径', ''],
    poisonDamage: ['毒云伤害', ''],
    mirrorCount: ['镜影', ' 个'],
    overchargeEvery: ['超载阈值', ' 命中'],
    frenzyPower: ['连杀加速', ' %'],
    shieldNova: ['爆裂弹数', ''],
    timeStopChance: ['凝滞概率', ' %']
  };

  var PERCENT_FIELDS = {
    critChance: 1, lootChance: 1, enemySlow: 1, executeThreshold: 1,
    chillFactor: 1, frenzyPower: 1, timeStopChance: 1, chainChance: 1,
    ricochetPower: 1
  };

  /* Runs apply() on a prototype-shadow of the player: reads fall through to the
     live object, writes land on the throwaway one. Nothing is mutated. */
  function previewStat(player, u) {
    if (!player || !u.apply) return '';
    var shadow;
    try { shadow = Object.create(player); u.apply(shadow); } catch (e) { return ''; }

    var picks = [];
    for (var k in STAT_LABELS) {
      if (!(k in player)) continue;
      var a = player[k], b = shadow[k];
      if (typeof a !== 'number' || typeof b !== 'number' || a === b) continue;
      var rel = Math.abs(b - a) / (Math.abs(a) || 1);
      if (rel < 0.02) continue;
      picks.push({ k: k, rel: rel });
    }
    if (picks.length === 0) return '';
    picks.sort(function (x, y) { return y.rel - x.rel; });
    picks = picks.slice(0, 2);

    var parts = [];
    for (var i = 0; i < picks.length; i++) {
      var key = picks[i].k;
      var label = STAT_LABELS[key];
      var scale = PERCENT_FIELDS[key] ? 100 : 1;
      parts.push(label[0] + ' ' + fmtNum(player[key] * scale) + ' → '
        + fmtNum(shadow[key] * scale) + label[1]);
    }
    return parts.join(' · ');
  }

  function fmtNum(v) {
    if (Math.abs(v) >= 100) return String(Math.round(v));
    if (Math.abs(v) >= 10) return String(Math.round(v * 10) / 10);
    return String(Math.round(v * 100) / 100);
  }

  var UI = {
    init: function (callbacks) {
      handlers = callbacks || {};

      el.hud = $('hud');
      el.hpFill = $('hp-fill');
      el.hpText = $('hp-text');
      el.xpFill = $('xp-fill');
      el.level = $('hud-level');
      el.kills = $('hud-kills');
      el.time = $('hud-time');
      el.dash = $('hud-dash');
      el.dashBar = $('dash-bar');
      el.dashFill = $('dash-fill');
      el.combo = $('hud-combo');
      el.comboN = $('hud-combo-n');
      el.btnMute = $('btn-mute');
      el.btnPause = $('btn-pause');

      el.start = $('screen-start');
      el.upgrade = $('screen-upgrade');
      el.pause = $('screen-pause');
      el.dead = $('screen-dead');
      el.intro = $('screen-intro');

      el.recTime = $('rec-time');
      el.recLevel = $('rec-level');
      el.recKills = $('rec-kills');
      el.cards = $('upgrade-cards');
      el.phase = $('upgrade-phase');
      el.resTime = $('res-time');
      el.resKills = $('res-kills');
      el.resLevel = $('res-level');
      el.resNew = $('res-new');
      el.btnMuteStart = $('btn-mute-start');

      $('btn-start').addEventListener('click', function () { PG.Audio.unlock(); PG.Audio.play('click'); handlers.onStart && handlers.onStart(); });
      $('btn-retry').addEventListener('click', function () { PG.Audio.play('click'); handlers.onRetry && handlers.onRetry(); });
      $('btn-menu').addEventListener('click', function () { PG.Audio.play('click'); handlers.onMenu && handlers.onMenu(); });
      $('btn-resume').addEventListener('click', function () { PG.Audio.play('click'); handlers.onResume && handlers.onResume(); });
      $('btn-quit').addEventListener('click', function () { PG.Audio.play('click'); handlers.onQuit && handlers.onQuit(); });
      el.btnPause.addEventListener('click', function () { handlers.onPause && handlers.onPause(); });

      /* On-screen dash. Touch-only: it appears the first time a real touch is seen,
         so a desktop player never gets a button they cannot use. */
      el.btnDash = $('btn-dash');
      if (el.btnDash) {
        var dashStart = function (e) {
          e.preventDefault();
          PG.Input.triggerDash();
          el.btnDash.classList.add('active');
        };
        var dashEnd = function (e) {
          e.preventDefault();
          el.btnDash.classList.remove('active');
        };
        el.btnDash.addEventListener('touchstart', dashStart, { passive: false });
        el.btnDash.addEventListener('touchend', dashEnd, { passive: false });
        el.btnDash.addEventListener('touchcancel', dashEnd, { passive: false });
        el.btnDash.addEventListener('mousedown', function (e) { e.preventDefault(); PG.Input.triggerDash(); });
      }
      el.btnMute.addEventListener('click', function () { UI.toggleMute(); });
      el.btnMuteStart.addEventListener('click', function () { UI.toggleMute(); });

      /* number keys pick an upgrade */
      window.addEventListener('keydown', function (e) {
        if (offers.length === 0) return;
        var n = parseInt(e.key, 10);
        if (n >= 1 && n <= offers.length) {
          e.preventDefault();
          UI.pick(n - 1);
        }
      }, false);

      UI.syncMuteButton();
    },

    toggleMute: function () {
      var muted = PG.Audio.toggleMute();
      PG.store.set('lumen.settings.v1', { muted: muted });
      UI.syncMuteButton();
      if (!muted) PG.Audio.play('click');
    },

    syncMuteButton: function () {
      var muted = PG.Audio.isMuted();
      el.btnMute.textContent = muted ? 'SND OFF' : 'SND ON';
      el.btnMuteStart.textContent = muted ? 'SOUND: OFF' : 'SOUND: ON';
    },

    /* ---------- screens ---------- */

    showScreen: function (name) {
      hide(el.start); hide(el.upgrade); hide(el.pause); hide(el.dead); hide(el.intro);
      if (name === 'start') show(el.start);
      else if (name === 'upgrade') show(el.upgrade);
      else if (name === 'pause') show(el.pause);
      else if (name === 'dead') show(el.dead);
      else if (name === 'intro') show(el.intro);
    },

    showHud: function (visible) {
      if (visible) show(el.hud); else hide(el.hud);
    },

    /* ---------- hud ---------- */

    resetHud: function () {
      last = { hp: '', xp: -1, level: -1, kills: -1, time: '', dash: '', combo: -1, dashReady: null };
    },

    updateHud: function (game) {
      var p = game.player;

      /* reveal touch controls the moment a touch actually happens */
      if (PG.Input.touchActive && PG.Input.touchActive() && !document.body.classList.contains('touch-mode')) {
        document.body.classList.add('touch-mode');
      }

      var hpText = Math.ceil(p.hp) + ' / ' + p.maxHp;
      if (hpText !== last.hp) {
        last.hp = hpText;
        el.hpText.textContent = hpText;
      }
      var hpRatio = PG.clamp(p.hp / p.maxHp, 0, 1);
      el.hpFill.style.transform = 'scaleX(' + hpRatio.toFixed(3) + ')';
      el.hpFill.style.background = hpRatio < 0.3 ? '#ff4d4d' : '';

      var xpRatio = PG.clamp(p.xp / p.xpToNext, 0, 1);
      if (Math.abs(xpRatio - last.xp) > 0.004) {
        last.xp = xpRatio;
        el.xpFill.style.transform = 'scaleX(' + xpRatio.toFixed(3) + ')';
      }

      if (p.level !== last.level) { last.level = p.level; el.level.textContent = p.level; }
      if (game.kills !== last.kills) { last.kills = game.kills; el.kills.textContent = game.kills; }

      var t = PG.fmtTime(game.time);
      if (t !== last.time) { last.time = t; el.time.textContent = t; }

      var dashText, dashReady = p.dashCd <= 0;
      if (dashReady) dashText = 'DASH READY';
      else dashText = 'DASH ' + Math.round((1 - p.dashCd / p.dashCooldown) * 100) + '%';
      if (dashText !== last.dash) {
        last.dash = dashText;
        el.dash.textContent = dashText;
        el.dash.classList.toggle('ready', dashReady);
      }

      /* bottom-edge recharge bar: scaleX every frame is cheap and keeps it smooth */
      var dashRatio = dashReady ? 1 : PG.clamp(1 - p.dashCd / p.dashCooldown, 0, 1);
      el.dashFill.style.transform = 'scaleX(' + dashRatio.toFixed(3) + ')';
      if (dashReady !== last.dashReady) {
        last.dashReady = dashReady;
        el.dashBar.classList.toggle('ready', dashReady);
      }

      /* kill streak: only shown while it is alive */
      var combo = PG.Audio.combo();
      if (combo !== last.combo) {
        last.combo = combo;
        if (combo > 1) {
          el.comboN.textContent = combo;
          el.combo.classList.remove('hidden');
        } else {
          el.combo.classList.add('hidden');
        }
      }
    },

    /* ---------- records ---------- */

    renderRecords: function (records) {
      el.recTime.textContent = PG.fmtTime(records.bestTime);
      el.recLevel.textContent = records.bestLevel;
      el.recKills.textContent = records.bestKills;
    },

    renderResult: function (stats, isNew) {
      el.resTime.textContent = PG.fmtTime(stats.time);
      el.resKills.textContent = stats.kills;
      el.resLevel.textContent = stats.level;
      if (isNew) show(el.resNew); else hide(el.resNew);
    },

    /* ---------- level-up cards ---------- */

    renderUpgrades: function (list) {
      offers = list || [];
      cardNodes = [];
      el.cards.innerHTML = '';
      if (el.phase) el.phase.textContent = '选择一项强化';
      for (var i = 0; i < offers.length; i++) {
        var card = buildCard(offers[i], i);
        el.cards.appendChild(card);
        cardNodes.push(card);
      }
    },

    pick: function (index) {
      if (!offers[index]) return;
      var chosen = offers[index];
      offers = [];
      if (cardNodes[index]) cardNodes[index].classList.add('chosen');
      PG.Audio.play('pick');
      /* let the choice render one frame before the screen closes */
      window.setTimeout(function () {
        handlers.onPick && handlers.onPick(chosen);
      }, 120);
    }
  };

  /* ---------- card rendering ---------- */

  function buildCard(u, index) {
    var rarity = u.rarity || 'common';
    var color = RARITY_COLOR[rarity];
    var card = document.createElement('div');
    card.className = 'card r-' + rarity;
    card.tabIndex = 0;

    var g = document.createElement('div');
    g.className = 'glyph';
    /* u.icon is a NAME; the matrix lives in PG.Upgrades.icons. Passing the name
       straight to glyph() silently produced a 1xN canvas and a blank card. */
    var matrix = PG.Upgrades.icons[u.icon];
    if (matrix) g.appendChild(glyph(matrix, 40, color));

    var player = PG.game ? PG.game.player : null;

    var name = document.createElement('div');
    name.className = 'name';
    name.textContent = u.name;

    /* A dependent card has to say what it strengthens. Thirteen of these used to
       read like standalone upgrades: "every bounce adds 30% damage" told you nothing
       about whose bounce, which is how a ricochet card looked unrelated to the
       ricochet you did not own. */
    var parent = u.requires ? PG.Upgrades.get(u.requires) : null;
    var requiresEl = null;
    if (parent) {
      requiresEl = document.createElement('div');
      requiresEl.className = 'requires';
      requiresEl.textContent = '强化 · ' + parent.name;
    }

    /* Show what stacking actually does. "Tracking light" reads like a one-time
       unlock, but it stacks to 4; without this the second copy looks wasted. */
    var taken = player ? (player.upgrades[u.id] || 0) : 0;
    if (taken > 0 && u.max > 1) {
      var stack = document.createElement('span');
      stack.className = 'stacks';
      stack.textContent = ' 第' + (taken + 1) + '层';
      name.appendChild(stack);
    }

    var desc = document.createElement('div');
    desc.className = 'desc';
    /* a description may depend on what the player already owns: the chain
       upgrade has to report its real current percentage */
    desc.textContent = typeof u.desc === 'function' ? u.desc(player, u) : u.desc;

    var rarityEl = document.createElement('div');
    rarityEl.className = 'rarity';
    rarityEl.textContent = RARITY_LABEL[rarity] || '';

    var slot = document.createElement('div');
    slot.className = 'slot';
    slot.textContent = '[' + (index + 1) + ']';

    var previewText = previewStat(player, u);

    card.appendChild(g);
    card.appendChild(rarityEl);
    card.appendChild(name);
    if (requiresEl) card.appendChild(requiresEl);
    if (previewText) {
      var prev = document.createElement('div');
      prev.className = 'statline';
      prev.textContent = previewText;
      card.appendChild(prev);
    }
    card.appendChild(desc);
    card.appendChild(slot);
    card.addEventListener('click', (function (idx) {
      return function () { UI.pick(idx); };
    })(index));
    return card;
  }


  PG.UI = UI;
  PG.UI.previewStat = previewStat;
  PG.UI.statLabels = STAT_LABELS;
})();
