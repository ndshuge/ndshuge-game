/* 钟楼契约 · feel.js
   手感层。独立模块，刻意与状态机、经济、AI 解耦，方便单独调。
   依据 game-feel-polish：命中四路同帧、衰减率错位、顿帧最值钱。
   本文件只输出"变化量"，不直接画东西，也不读游戏状态。 */
(function () {
  'use strict';
  var B = window.Belfry;

  // 顿帧剩余秒数
  var hitstopT = 0;

  // 震屏：定向推 + 轻微随机，不是全屏乱晃
  var shakeMag = 0, shakeX = 0, shakeY = 0, shakeDir = 0, shakePhase = 0;

  // 挥击回弹。三个衰减率必须错开才"脆"：
  //   kick 14 快而脆、raise 9 稍慢、shake 恢复 8 更慢
  var kick = 0, raise = 0;

  // 受击红闪与击杀微震
  var hurtFlash = 0, killShake = 0;

  var api = {
    // ---------- 触发 ----------
    hitstop: function (sec) { if (sec > hitstopT) hitstopT = sec; },

    // mag: 像素强度；dir: 弧度，指向被击飞的方向
    shake: function (mag, dir) {
      if (mag > shakeMag) shakeMag = mag;
      if (dir != null) shakeDir = dir;
    },

    // 近战挥砍：方法论给的近战基准是 1.3
    swing: function (heavy) { api.kickArm(heavy ? 1.3 : 0.9); },
    // 远程开火：0.8
    fire: function () { api.kickArm(0.8); },

    kickArm: function (v) {
      if (v > kick) kick = v;
      var r = v * 0.77;
      if (r > raise) raise = r;
    },

    hurt: function () { hurtFlash = 1; },
    kill: function (dir) {
      killShake = 1;
      api.shake(2.4, dir);
    },

    // ---------- 每次命中，四路同帧弹出去 ----------
    // 调用方负责画面闪白与粒子，本函数负责时序类反馈
    landHit: function (opts) {
      opts = opts || {};
      var heavy = !!opts.heavy;
      api.hitstop(heavy ? 0.07 : 0.045);
      api.shake(heavy ? 3.2 : 1.8, opts.dir);
      if (opts.lethal) api.kill(opts.dir);
    },

    // ---------- 每帧推进（用真实 dt，不受顿帧影响） ----------
    update: function (dt) {
      if (hitstopT > 0) hitstopT -= dt;

      shakePhase += dt;
      shakeMag *= Math.exp(-dt * 8);
      if (shakeMag < 0.02) { shakeMag = 0; shakeX = 0; shakeY = 0; }
      else {
        var s = Math.sin(shakePhase * 62) * shakeMag;
        shakeX = Math.cos(shakeDir) * s + (Math.random() - 0.5) * shakeMag * 0.6;
        shakeY = Math.sin(shakeDir) * s + (Math.random() - 0.5) * shakeMag * 0.6;
      }

      kick *= Math.exp(-dt * 14);
      raise *= Math.exp(-dt * 9);
      if (kick < 0.001) kick = 0;
      if (raise < 0.001) raise = 0;

      hurtFlash *= Math.exp(-dt * 8);
      killShake -= dt * 4;
      if (killShake < 0) killShake = 0;
    },

    // ---------- 读取 ----------
    timeScale: function () { return hitstopT > 0 ? 0 : 1; },
    offset: function () { return { x: shakeX, y: shakeY }; },
    // 挥击姿态：供渲染层做横向甩刀
    pose: function () {
      return {
        kick: kick,
        raise: raise,
        // 近战专用：横向甩刀 + 前突
        rollY: -kick * 0.6,
        push: kick * 0.14
      };
    },
    hurtAlpha: function () { return B.clamp(hurtFlash, 0, 1); },
    killShake: function () { return killShake; },
    isFrozen: function () { return hitstopT > 0; },

    reset: function () {
      hitstopT = 0; shakeMag = 0; shakeX = 0; shakeY = 0;
      kick = 0; raise = 0; hurtFlash = 0; killShake = 0;
    }
  };

  B.feel = api;
})();
