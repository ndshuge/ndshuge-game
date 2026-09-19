/* 钟楼契约 · main.js
   启动、素材加载、整数倍缩放、固定步长主循环。 */
(function () {
  'use strict';
  var B = window.Belfry;
  var W = B.VIEW_W, H = B.VIEW_H;

  var STEP = 1 / 60;
  var acc = 0;
  var last = 0;
  var game = null;
  var canvas = null;

  function resize() {
    if (!canvas) return;
    var availW = window.innerWidth - 16;
    var availH = window.innerHeight - 52;   // 给底部操作图例留位置，否则被挤出视口
    var scale = Math.min(availW / W, availH / H);
    if (scale >= 1) {
      var intScale = Math.floor(scale);
      if (intScale >= 1) scale = intScale;
    }
    if (scale < 1) scale = Math.max(scale, 0.4);
    canvas.style.width = Math.round(W * scale) + 'px';
    canvas.style.height = Math.round(H * scale) + 'px';
    canvas.width = W; canvas.height = H;
    var g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
  }

  function frame(ts) {
    if (!last) last = ts;
    var raw = (ts - last) / 1000;
    last = ts;
    if (raw > 0.25) raw = 0.25;

    // 手感层用真实 dt 推进，不受顿帧影响
    B.feel.update(raw);
    // 顿帧时游戏逻辑时间冻结
    var dt = raw * B.feel.timeScale();

    acc += dt;
    var guard = 0;
    while (acc >= STEP && guard++ < 6) {
      game.update(STEP);
      acc -= STEP;
    }

    B.ui.handleInput(game, B.input);
    game.render();
    B.input.endFrame();
    window.requestAnimationFrame(frame);
  }

  function boot() {
    canvas = document.getElementById('game');
    if (!canvas) return;

    canvas.addEventListener('mousedown', function () { B.audio.init(); B.music.init(); });
    window.addEventListener('keydown', function () { B.audio.init(); B.music.init(); }, { once: true });
    window.addEventListener('resize', resize);

    B.input.init(canvas);
    B.audio.init();

    // 素材先加载完再建 Game：Game 构造里要烘焙地面
    B.atlas.load(function (failed) {
      if (failed) {
        try { console.warn('[belfry] 有 ' + failed + ' 张素材加载失败，相关层退回程序化绘制'); } catch (e) { }
      }
      if (B.sprites && B.sprites.rebindAtlas) B.sprites.rebindAtlas();
      game = new B.Game(canvas);
      window.__BELFRY__ = game;
      window.__ATLAS_FAILED__ = failed;
      resize();
      window.requestAnimationFrame(frame);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
