/* LUMEN SIEGE - bootstrap: canvas scaling, wiring, and the fixed-step game loop. */
(function () {
  'use strict';
  var PG = (window.PG = window.PG || {});

  var canvas = document.getElementById('game');
  var stage = document.getElementById('stage');
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  var STEP = 1 / 60;

  function resize() {
    var fit = Math.min(window.innerWidth / PG.VIEW_W, window.innerHeight / PG.VIEW_H);
    /* Desktop keeps integer scaling for crisp pixels. A finger-first device fills
       the screen instead: at phone sizes an integer floor can leave half the display
       black (a 390px-tall landscape phone would run at 1x = 270px and waste 120px). */
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    var scale = coarse ? fit : (fit >= 1 ? Math.floor(fit) : Math.max(fit, 0.25));
    var w = Math.round(PG.VIEW_W * scale);
    var h = Math.round(PG.VIEW_H * scale);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    stage.style.width = w + 'px';
    stage.style.height = h + 'px';
  }

  PG.Sprites.init();
  var game = new PG.Game(ctx);
  PG.game = game;              /* input.js consults this to decide about default keys   */
  window.__LUMEN__ = game;     /* debug/verification hook: read live state from outside */

  game.loadSettings();
  game.loadRecords();
  game.buildVignette();

  PG.Input.init(canvas);

  function togglePause() {
    if (game.state === 'playing') {
      game.state = 'pause';
      PG.UI.showScreen('pause');
    } else if (game.state === 'pause') {
      game.state = 'playing';
      PG.UI.showScreen(null);
      PG.UI.showHud(true);
    }
  }

  PG.UI.init({
    onStart: function () {
      /* The first run plays the story beats; afterwards START goes straight in. */
      if (PG.Intro.hasSeen()) {
        game.newRun();
      } else {
        PG.Intro.start(function () { game.newRun(); });
      }
    },
    onRetry: function () { game.newRun(); },
    onMenu: function () { game.toMenu(); },
    onResume: function () { togglePause(); },
    onQuit: function () { game.toMenu(); },
    onPause: function () { togglePause(); },
    onPick: function (upgrade) { game.chooseUpgrade(upgrade); }
  });

  PG.Intro.init();

  var guideBtn = document.getElementById('btn-guide');
  if (guideBtn) {
    guideBtn.addEventListener('click', function () {
      PG.Audio.play('click');
      PG.Intro.startFromMenu();
    });
  }

  window.addEventListener('keydown', function (e) {
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (PG.Intro.isActive()) return;   /* the intro owns Escape while it is up */
      if (game.state === 'playing' || game.state === 'pause') {
        e.preventDefault();
        togglePause();
      }
    }
  }, false);

  /* The audio context needs one real user gesture before it may start. */
  function unlockOnce() {
    PG.Audio.unlock();
    window.removeEventListener('pointerdown', unlockOnce);
    window.removeEventListener('keydown', unlockOnce);
  }
  window.addEventListener('pointerdown', unlockOnce, false);
  window.addEventListener('keydown', unlockOnce, false);

  window.addEventListener('resize', resize, false);

  var last = (window.performance && performance.now) ? performance.now() : Date.now();
  var acc = 0;

  function frame(now) {
    var elapsed = (now - last) / 1000;
    last = now;
    if (elapsed > 0.25) elapsed = 0.25;   /* never let a background tab build a debt */
    acc += elapsed;
    var guard = 0;
    while (acc >= STEP && guard++ < 6) {
      game.update(STEP);
      PG.Input.endFrame();
      acc -= STEP;
    }
    game.render();
    PG.Audio.pump(game.musicIntensity());
    window.requestAnimationFrame(frame);
  }

  resize();
  PG.UI.showHud(false);
  PG.UI.renderRecords(game.records);
  PG.UI.showScreen('start');
  window.requestAnimationFrame(frame);
})();
