/* 钟楼契约 · ui.js
   游戏内界面层。全部 canvas 自绘，一条渲染路径。

   设计依据 threejs-game-ui-designer（references/ui-patterns.md）：
     · 状态分区：左上 目标与生存，右上 资源与压力，底部 只在需要时出现的槽位
     · 固定宽度数字容器，数值变化不许抖布局
     · 图标 + 短标签，不用文字解释显而易见的操作
     · 警报色全局一致：危险 / 奖励 / 增益 / 目标 / 禁用
     · 量条负责"快速读"，数字负责"精确读"
     · 面板用有意义的几何（钟形、刻度、切口），不用嵌套圆角卡片
     · 世界美术的意象（钟、雾、火）要延续到 UI */
(function () {
  'use strict';
  var B = window.Belfry;
  var W = B.VIEW_W, H = B.VIEW_H;

  // ---------- 字体 ----------
  function cnFont(size, bold) { return (bold ? 'bold ' : '') + size + 'px "Microsoft YaHei","PingFang SC",sans-serif'; }
  function numFont(size, bold) { return (bold ? 'bold ' : '') + size + 'px Consolas,"JetBrains Mono",monospace'; }
  function font11() { return cnFont(11); }

  // ---------- 色彩角色（全局一致） ----------
  var ROLE = {
    danger: '#a93044',
    dangerSoft: '#7e2136',
    reward: '#ffd27a',
    boost: '#9ccf5a',
    ward: '#c05a2e',
    soul: '#7ddfff',
    objective: '#e8dcbe',
    neutral: '#6b6478',
    surface: 'rgba(14,17,24,0.82)',
    edge: 'rgba(255,210,122,0.45)',
    edgeDim: 'rgba(255,210,122,0.18)'
  };

  // ---------- 几何：带切角的面板，比圆角卡片更有"器物感" ----------
  function plate(g, x, y, w, h, opt) {
    opt = opt || {};
    var cut = opt.cut == null ? 4 : opt.cut;
    g.fillStyle = opt.fill || ROLE.surface;
    g.beginPath();
    g.moveTo(x + cut, y);
    g.lineTo(x + w, y);
    g.lineTo(x + w, y + h - cut);
    g.lineTo(x + w - cut, y + h);
    g.lineTo(x, y + h);
    g.lineTo(x, y + cut);
    g.closePath();
    g.fill();
    g.strokeStyle = opt.edge || ROLE.edgeDim;
    g.lineWidth = 1;
    g.stroke();
    if (opt.topTick) {
      g.fillStyle = opt.tickColor || ROLE.edge;
      g.fillRect(x + cut + 2, y, Math.max(6, w - cut - 10), 1);
    }
  }

  // ---------- 图标（像素小图，画在世界风格里） ----------
  var ICON = {
    soul: function (g, x, y) {          // 魂火：一簇立着的火
      g.fillStyle = '#ffd27a'; g.fillRect(x + 2, y + 1, 2, 2);
      g.fillStyle = '#ffb066'; g.fillRect(x + 1, y + 3, 4, 3);
      g.fillStyle = '#b05023'; g.fillRect(x + 1, y + 6, 4, 1);
      g.fillStyle = '#fff3b8'; g.fillRect(x + 2, y + 3, 1, 2);
    },
    steel: function (g, x, y) {         // 钢：锤头
      g.fillStyle = '#9a958a'; g.fillRect(x, y + 1, 6, 3);
      g.fillStyle = '#b8b3a6'; g.fillRect(x, y + 1, 6, 1);
      g.fillStyle = '#6e4a28'; g.fillRect(x + 2, y + 4, 2, 3);
    },
    ward: function (g, x, y) {          // 业火：向下压的三角
      g.fillStyle = '#c05a2e';
      g.beginPath(); g.moveTo(x + 3, y + 1); g.lineTo(x + 6, y + 6); g.lineTo(x, y + 6); g.closePath(); g.fill();
      g.fillStyle = '#e0731f'; g.fillRect(x + 2, y + 6, 3, 1);
    },
    bond: function (g, x, y) {          // 契约者：幽灵轮廓
      g.fillStyle = '#bfeae2';
      g.fillRect(x + 1, y + 1, 4, 5);
      g.fillStyle = '#6fa8a0'; g.fillRect(x + 2, y + 2, 1, 1); g.fillRect(x + 4, y + 2, 1, 1);
      g.fillStyle = '#bfeae2'; g.fillRect(x, y + 6, 1, 1); g.fillRect(x + 3, y + 6, 1, 1);
    },
    hammer: function (g, x, y) {
      g.fillStyle = '#6e4a28'; g.fillRect(x + 3, y + 2, 1, 5);
      g.fillStyle = '#9a958a'; g.fillRect(x, y, 6, 3);
      g.fillStyle = '#b8b3a6'; g.fillRect(x, y, 6, 1);
    },
    candle: function (g, x, y) {
      g.fillStyle = '#e8dcbe'; g.fillRect(x + 2, y + 2, 2, 5);
      g.fillStyle = '#ffd27a'; g.fillRect(x + 2, y, 2, 2);
      g.fillStyle = '#fff3b8'; g.fillRect(x + 2, y + 1, 1, 1);
    },
    seed: function (g, x, y) {
      g.fillStyle = '#7d5a36'; g.fillRect(x, y + 4, 6, 2);
      g.fillStyle = '#9ccf5a'; g.fillRect(x + 1, y + 1, 1, 3); g.fillRect(x + 4, y + 1, 1, 3);
      g.fillStyle = '#d8cdb4'; g.fillRect(x + 2, y, 2, 2);
    }
  };

  // ---------- 钟面：本作的核心意象，用它做时间进度 ----------
  var PHASE_COLOR = {
    dawn: '#e8dcbe', day: '#9ccf5a', dusk: '#e0731f', night: '#a93044', settle: '#6b6478'
  };
  var ORDER = ['dawn', 'day', 'dusk', 'night', 'settle'];

  function clockFace(g, cx, cy, r, dn) {
    var i, seg;
    // 底盘
    g.beginPath(); g.arc(cx, cy, r + 2, 0, Math.PI * 2);
    g.fillStyle = 'rgba(10,12,18,0.85)'; g.fill();
    g.strokeStyle = 'rgba(255,210,122,0.30)'; g.lineWidth = 1; g.stroke();

    // 五段弧，只画当天已经走过的部分为亮色
    var total = 0;
    for (i = 0; i < ORDER.length; i++) total += B.PHASE_LEN[ORDER[i]];
    var acc = 0;
    for (i = 0; i < ORDER.length; i++) {
      var ph = ORDER[i];
      var frac = B.PHASE_LEN[ph] / total;
      var a0 = -Math.PI / 2 + acc * Math.PI * 2;
      var a1 = a0 + frac * Math.PI * 2;
      var done = (dn.phase === ph);
      g.beginPath();
      g.arc(cx, cy, r - 3, a0 + 0.03, a1 - 0.03);
      g.strokeStyle = done ? PHASE_COLOR[ph] : 'rgba(255,255,255,0.10)';
      g.lineWidth = done ? 4 : 3;
      g.stroke();
      acc += frac;
      void seg;
    }

    // 指针：一天走过多少比例
    var passed = 0;
    for (i = 0; i < ORDER.length; i++) {
      if (ORDER[i] === dn.phase) { passed += dn.progress() * (B.PHASE_LEN[ORDER[i]] / total); break; }
      passed += B.PHASE_LEN[ORDER[i]] / total;
    }
    var ang = -Math.PI / 2 + passed * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(ang) * (r - 4), cy + Math.sin(ang) * (r - 4));
    g.strokeStyle = PHASE_COLOR[dn.phase] || ROLE.objective;
    g.lineWidth = 2;
    g.stroke();
    g.beginPath(); g.arc(cx, cy, 2, 0, Math.PI * 2);
    g.fillStyle = ROLE.reward; g.fill();
  }

  // ---------- 量条：只有"快速读"的量才用条 ----------
  function meter(g, x, y, w, h, ratio, color, back) {
    g.fillStyle = back || 'rgba(0,0,0,0.55)';
    g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle = color;
    g.fillRect(x, y, Math.max(0, Math.round(w * B.clamp(ratio, 0, 1))), h);
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 1;
    g.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
  }

  // ---------- 数字：固定宽度区域，位数变了不抖动 ----------
  function fixedNum(g, text, rightX, y, size, color, bold) {
    g.font = numFont(size, bold);
    g.textAlign = 'right';
    g.fillStyle = color;
    g.fillText(text, rightX, y);
    g.textAlign = 'left';
  }

  var ui = {
    ROLE: ROLE,

    // ============================================================
    //  HUD
    // ============================================================
    drawHUD: function (g, game) {
      var p = game.player, dn = game.dn;

      // ---- 左上：钟面 + 天数（目标与生存区） ----
      clockFace(g, 30, 32, 17, dn);
      g.font = cnFont(11, true);
      g.fillStyle = ROLE.objective;
      g.fillText(dn.label(), 54, 24);
      g.font = numFont(15, true);
      g.fillStyle = ROLE.reward;
      g.fillText(String(dn.day), 54, 41);
      g.font = numFont(9);
      g.fillStyle = ROLE.neutral;
      g.fillText('/ ' + B.TOTAL_DAYS, 66, 41);

      // 本段剩余（夜里才显眼，白天淡化）
      var sec = Math.ceil(dn.remaining());
      g.font = numFont(10);
      g.fillStyle = dn.isNight() ? ROLE.danger : 'rgba(107,100,120,0.9)';
      g.textAlign = 'right';
      g.fillText((sec < 10 ? ' ' : '') + sec + 's', 158, 24);
      g.textAlign = 'left';

      // ---- 生存：血与体力 ----
      meter(g, 8, 56, 118, 6, p.hp / p.maxHp, ROLE.danger);
      meter(g, 8, 66, 118, 3, p.stamina / p.maxStamina, ROLE.boost);

      // ---- 右上：资源与压力 ----
      var rx = W - 10;
      var ry = 26;
      // 一行一个资源：图标在左，数字右对齐到固定列
      ICON.soul(g, rx - 108, ry - 5);
      fixedNum(g, String(game.soulfire), rx, ry, 12, ROLE.reward, true); ry += 15;
      ICON.steel(g, rx - 108, ry - 5);
      fixedNum(g, String(game.steel), rx, ry, 12, ROLE.objective); ry += 15;
      ICON.ward(g, rx - 108, ry - 5);
      fixedNum(g, String(game.bonds.ward), rx, ry, 12,
        game.bonds.ward > 0 ? ROLE.ward : ROLE.neutral, game.bonds.ward > 0); ry += 15;
      ICON.bond(g, rx - 108, ry - 5);
      fixedNum(g, game.bonds.list.length + '/' + game.bonds.slots, rx, ry, 12, ROLE.soul);

      // 业火压强提示条：只在有契约时出现，一句话说不完的用条
      if (game.bonds.ward > 0) {
        var pw = 70;
        plate(g, rx - pw - 8, ry + 6, pw, 12, { cut: 3, fill: 'rgba(192,90,46,0.16)', edge: 'rgba(192,90,46,0.5)' });
        g.font = cnFont(9);
        g.fillStyle = ROLE.ward;
        g.textAlign = 'right';
        g.fillText(game.bonds.pressureLabel(), rx - 14, ry + 15);
        g.textAlign = 'left';
      }

      // ---- 底部：只在白天出现的槽位（武器 / 种子） ----
      if (!dn.isNight()) {
        var by = H - 26;
        // 武器槽
        plate(g, 8, by, 92, 18, { cut: 4, topTick: true });
        var wid = p.weapon.indexOf('hammer') === 0;
        (wid ? ICON.hammer : ICON.candle)(g, 14, by + 6);
        g.font = cnFont(10);
        g.fillStyle = ROLE.objective;
        g.fillText(B.weapons.get(p.weapon).name, 26, by + 13);

        // 种子槽
        plate(g, 106, by, 84, 18, { cut: 4 });
        ICON.seed(g, 112, by + 6);
        g.font = cnFont(10);
        g.fillStyle = ROLE.boost;
        g.fillText(B.crops.defs[game.selectedSeed].name, 124, by + 13);

        // 契约名额槽（可扩才显眼）
        var canUp = game.bonds.slots < 5;
        plate(g, 196, by, 74, 18, {
          cut: 4,
          edge: canUp ? ROLE.edgeDim : 'rgba(107,100,120,0.25)'
        });
        ICON.bond(g, 202, by + 6);
        g.font = cnFont(10);
        g.fillStyle = canUp ? ROLE.soul : ROLE.neutral;
        g.fillText('U 扩至 ' + Math.min(5, game.bonds.slots + 1), 214, by + 13);
      }

      // ---- 夜里：斩 / 缚 的常驻提醒，做成两个小徽标而不是一行字 ----
      if (dn.isNight()) {
        var bx = 8, byy = H - 24;
        plate(g, bx, byy, 66, 16, { cut: 3 });
        g.font = cnFont(10);
        g.fillStyle = ROLE.neutral;
        g.fillText('1 斩', bx + 10, byy + 12);
        plate(g, bx + 72, byy, 66, 16, { cut: 3, fill: 'rgba(192,90,46,0.14)', edge: 'rgba(192,90,46,0.4)' });
        g.fillStyle = ROLE.ward;
        g.fillText('2 缚', bx + 82, byy + 12);
      }
    },

    // ============================================================
    //  Toast
    // ============================================================
    drawToast: function (g, t) {
      var colors = {
        info: ROLE.objective, good: ROLE.boost, bad: ROLE.danger,
        warn: ROLE.ward, spirit: ROLE.soul, npc: ROLE.reward
      };
      var a = B.clamp(t.life / t.max, 0, 1);
      g.globalAlpha = a > 0.75 ? 1 : a / 0.75;

      g.font = cnFont(11);
      var tw = g.measureText(t.text).width;
      var w = Math.min(W - 60, tw + 34);
      var x = W / 2 - w / 2, y = H - 62;

      plate(g, x, y, w, 20, { cut: 4, edge: 'rgba(255,210,122,0.28)' });
      g.fillStyle = colors[t.kind] || ROLE.objective;
      g.fillRect(x + 5, y + 9, 2, 2);
      g.font = cnFont(11);
      g.fillStyle = colors[t.kind] || ROLE.objective;
      g.fillText(t.text, x + 13, y + 14);
      g.globalAlpha = 1;
    },

    // ============================================================
    //  覆盖界面
    // ============================================================
    drawOverlay: function (g, game) {
      if (game.state === 'intro') return ui.drawIntro(g, game);
      if (game.state === 'dialogue') return ui.drawAct(g, game);
      if (game.state === 'bind') return ui.drawBind(g, game);
      if (game.state === 'ending') return ui.drawEnding(g, game);
      if (game.state === 'dead') return ui.drawDead(g, game);
    },

    drawDead: function (g, game) {
      ui.dim(g, 0.9);
      g.textAlign = 'center';
      g.font = cnFont(26, true);
      g.fillStyle = ROLE.danger;
      g.fillText('你留在第十四天之前了', W / 2, H / 2 - 18);
      g.font = font11();
      g.fillStyle = ROLE.neutral;
      g.fillText('撑到第 ' + game.dn.day + ' 天', W / 2, H / 2 + 8);
      g.font = numFont(11);
      g.fillStyle = ROLE.edge;
      g.fillText('R   再来一局', W / 2, H / 2 + 44);
      g.textAlign = 'left';
    },

    drawDeadNoop: function () { },

    dim: function (g, a) {
      g.fillStyle = 'rgba(6,8,13,' + a + ')';
      g.fillRect(0, 0, W, H);
    },

    drawIntro: function (g, game) {
      ui.dim(g, 0.90);
      var screens = B.story.intro;
      var s = screens[B.clamp(game.introScreen, 0, screens.length - 1)];
      g.textAlign = 'center';
      for (var i = 0; i < s.length; i++) {
        g.font = i === 0 ? cnFont(17, true) : cnFont(12);
        g.fillStyle = i === 0 ? ROLE.reward : ROLE.objective;
        g.fillText(s[i], W / 2, H / 2 - 26 + i * 26);
      }
      g.font = numFont(10);
      g.fillStyle = ROLE.neutral;
      g.fillText((game.introScreen + 1) + ' / ' + screens.length, W / 2, H - 42);
      g.fillStyle = ROLE.edge;
      g.fillText('空格 继续', W / 2, H - 26);
      g.textAlign = 'left';
    },

    drawAct: function (g, game) {
      var act = game.pendingAct;
      if (!act) return;
      ui.dim(g, 0.92);

      g.font = numFont(10);
      g.fillStyle = ROLE.neutral;
      g.fillText('DAY ' + act.day + '  ·  ' + act.where, 46, 40);

      g.font = cnFont(20, true);
      g.fillStyle = ROLE.reward;
      g.fillText(act.title, 46, 64);
      g.fillStyle = ROLE.edge;
      g.fillRect(46, 72, 44, 1);

      g.font = cnFont(12.5);
      g.fillStyle = ROLE.objective;
      for (var i = 0; i < act.narration.length; i++) {
        g.fillText(act.narration[i], 46, 96 + i * 19);
      }

      var y0 = 196;
      for (var k = 0; k < act.choices.length; k++) {
        var c = act.choices[k];
        var y = y0 + k * 52;
        var isBind = /缚/.test(c.label);
        plate(g, 46, y, W - 92, 44, {
          cut: 6,
          fill: isBind ? 'rgba(192,90,46,0.13)' : 'rgba(20,26,38,0.85)',
          edge: isBind ? 'rgba(192,90,46,0.55)' : 'rgba(255,210,122,0.28)',
          topTick: true,
          tickColor: isBind ? ROLE.ward : ROLE.edgeDim
        });
        g.font = numFont(11, true);
        g.fillStyle = isBind ? ROLE.ward : ROLE.reward;
        g.fillText(String(k + 1), 60, y + 18);
        g.font = cnFont(13.5, true);
        g.fillStyle = isBind ? ROLE.ward : ROLE.objective;
        g.fillText(c.label, 76, y + 19);
        g.font = cnFont(10);
        g.fillStyle = ROLE.neutral;
        g.fillText(c.outcome, 76, y + 35);
      }
      g.font = cnFont(10);
      g.fillStyle = ROLE.neutral;
      g.fillText('按 1 / 2 选择 · 这一步不能回头', 46, H - 18);
    },

    drawBind: function (g, game) {
      var e = game.pendingBind;
      if (!e) return;
      ui.dim(g, 0.78);

      g.textAlign = 'center';
      g.font = cnFont(18, true);
      g.fillStyle = ROLE.objective;
      g.fillText(e.stats.name + ' 倒下了', W / 2, 76);
      g.textAlign = 'left';

      // 左：斩杀（中性）
      plate(g, 60, 106, 240, 74, { cut: 6, topTick: true });
      g.font = numFont(11, true); g.fillStyle = ROLE.reward;
      g.fillText('1', 76, 126);
      g.font = cnFont(15, true); g.fillStyle = ROLE.objective;
      g.fillText('斩杀', 92, 127);
      g.font = cnFont(10.5); g.fillStyle = ROLE.reward;
      g.fillText('+' + e.soul + ' 魂火', 92, 146);
      g.fillStyle = ROLE.neutral;
      g.fillText('业火不动，今夜不变难', 92, 163);

      // 右：缚契（业火色，代价用红字）
      plate(g, 340, 106, 240, 74, {
        cut: 6, fill: 'rgba(192,90,46,0.13)', edge: 'rgba(192,90,46,0.55)', topTick: true, tickColor: ROLE.ward
      });
      g.font = numFont(11, true); g.fillStyle = ROLE.ward;
      g.fillText('2', 356, 126);
      g.font = cnFont(15, true); g.fillStyle = ROLE.ward;
      g.fillText('缚契', 372, 127);
      g.font = cnFont(10.5); g.fillStyle = ROLE.soul;
      g.fillText('它替你耕地守夜', 372, 146);
      g.fillStyle = ROLE.danger;
      g.fillText('业火 +1，今夜强度 +18%', 372, 163);

      // 底部：把账算给他看
      var w0 = game.bonds.ward;
      g.textAlign = 'center';
      g.font = numFont(11);
      g.fillStyle = ROLE.neutral;
      g.fillText('业火 ' + w0 + ' → ' + (w0 + 1) + '    名额 ' +
        game.bonds.list.length + ' / ' + game.bonds.slots, W / 2, 206);
      g.textAlign = 'left';
    },

    drawEnding: function (g, game) {
      var ed = game.ending;
      if (!ed) return;
      ui.dim(g, 0.95);
      g.textAlign = 'center';
      g.font = cnFont(28, true);
      g.fillStyle = ROLE.reward;
      g.fillText(ed.title, W / 2, 58);
      g.font = numFont(10);
      g.fillStyle = ROLE.neutral;
      g.fillText(ed.en, W / 2, 78);
      g.fillStyle = ROLE.edge;
      g.fillRect(W / 2 - 30, 90, 60, 1);

      var lines = game.flags.coldEnding ? ed.text.slice(0, 3) : ed.text;
      g.font = cnFont(11.5);
      g.fillStyle = ROLE.objective;
      for (var i = 0; i < lines.length; i++) {
        g.fillText(lines[i], W / 2, 118 + i * 20);
      }
      if (game.flags.extraEpilogue) {
        g.font = cnFont(10.5);
        g.fillStyle = ROLE.soul;
        g.fillText('钟灵：我也是名册上的第一个。你猜到了。', W / 2, 118 + lines.length * 20 + 12);
      }
      g.font = numFont(11);
      g.fillStyle = ROLE.neutral;
      g.fillText('R  再来一局', W / 2, H - 24);
      g.textAlign = 'left';
    },

    // ============================================================
    //  结算
    // ============================================================
    drawSettle: function (g, game) {
      ui.dim(g, 0.92);
      g.font = numFont(11);
      g.fillStyle = ROLE.neutral;
      g.fillText('DAY ' + game.dn.day, 46, 44);
      g.font = cnFont(19, true);
      g.fillStyle = ROLE.reward;
      g.fillText('今日的账', 46, 68);
      g.fillStyle = ROLE.edge;
      g.fillRect(46, 76, 40, 1);

      var rows = [
        ['魂火', String(game.soulfire), ROLE.reward],
        ['钢', String(game.steel), ROLE.objective],
        ['契约者', game.bonds.list.length + ' / ' + game.bonds.slots, ROLE.soul],
        ['业火', String(game.bonds.ward), game.bonds.ward > 0 ? ROLE.ward : ROLE.neutral]
      ];
      for (var i = 0; i < rows.length; i++) {
        var y = 104 + i * 22;
        g.font = cnFont(12);
        g.fillStyle = ROLE.neutral;
        g.fillText(rows[i][0], 46, y);
        g.textAlign = 'right';
        g.font = numFont(13, true);
        g.fillStyle = rows[i][2];
        g.fillText(rows[i][1], 210, y);
        g.textAlign = 'left';
      }

      plate(g, 46, 208, W - 92, 22, { cut: 4, fill: 'rgba(192,90,46,0.12)', edge: 'rgba(192,90,46,0.45)' });
      g.font = cnFont(11);
      g.fillStyle = ROLE.ward;
      g.fillText('今夜 ' + game.bonds.pressureLabel(), 58, 223);

      g.textAlign = 'center';
      g.font = numFont(11);
      g.fillStyle = ROLE.edge;
      g.fillText('空格  进入明天的早晨', W / 2, H - 22);
      g.textAlign = 'left';
    },

    // ============================================================
    //  输入
    // ============================================================
    handleInput: function (game, input) {
      if (game.pendingSettle) {
        if (input.justPressed('act')) B.bus.emit('dismissSettle');
        return true;
      }
      if (game.state === 'intro') {
        if (input.justPressed('act')) B.bus.emit('advanceIntro');
        return true;
      }
      if (game.state === 'bind') {
        if (input.codePressed('Digit1')) B.bus.emit('chooseBind', false);
        else if (input.codePressed('Digit2')) B.bus.emit('chooseBind', true);
        return true;
      }
      if (game.state === 'dialogue') {
        var act = game.pendingAct;
        if (!act) return true;
        if (input.codePressed('Digit1')) B.bus.emit('resolveAct', act.choices[0]);
        else if (input.codePressed('Digit2')) B.bus.emit('resolveAct', act.choices[1]);
        return true;
      }
      if (game.state === 'ending') {
        if (input.codePressed('KeyR')) B.bus.emit('restart');
        return true;
      }
      return false;
    }
  };

  B.ui = ui;
})();
