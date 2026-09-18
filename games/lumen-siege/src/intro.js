/* LUMEN SIEGE - intro: the opening story beats that double as the tutorial.
   Five short steps, shown once. Space/Enter advances, Esc skips. */
(function () {
  'use strict';
  var PG = (window.PG = window.PG || {});

  var STEPS = [
    {
      title: '回声庭院',
      body: '你被投进这里的时候，手里只剩一盏灯。\n蚀影正在合围，而你是唯一还亮着的光。',
      hint: ''
    },
    {
      title: '灯就是武器',
      body: '灯照到哪里，光就打向哪里。按住左键，光弹会连续射出。',
      hint: '鼠标瞄准 · 左键攻击'
    },
    {
      title: '别让它们碰到你',
      body: '蚀影会从四面围上来。移动，拉开距离，别站在原地。',
      hint: 'WASD / 方向键 移动'
    },
    {
      title: '灯灭之前',
      body: '撑不住的时候冲出去。冲刺的那一瞬间，你是无敌的。',
      hint: '空格 冲刺'
    },
    {
      title: '光尘',
      body: '击杀会留下光尘。拾起光尘，光核就会变强。\n升级时从几项里挑一项，选得越准，后面越强。',
      hint: '拾取光尘 · 升级选择'
    }
  ];

  var el = {};
  var dots = [];
  var index = 0;
  var active = false;
  var onDone = null;

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function render() {
    var step = STEPS[index];
    el.step.textContent = pad(index + 1) + ' / ' + pad(STEPS.length);
    el.title.textContent = step.title;
    el.body.textContent = step.body;
    if (step.hint) {
      el.hint.textContent = step.hint;
      el.hint.classList.remove('hidden');
    } else {
      el.hint.classList.add('hidden');
    }
    el.next.textContent = index === STEPS.length - 1 ? '进入庭院' : '继续';
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.toggle('on', i <= index);
    }
  }

  function advance() {
    if (index < STEPS.length - 1) {
      index++;
      PG.Audio.play('click');
      render();
    } else {
      finish();
    }
  }

  function finish() {
    if (!active) return;
    active = false;
    PG.store.set('lumen.intro.v1', true);
    PG.UI.showScreen(null);
    var fn = onDone;
    onDone = null;
    if (fn) fn();
  }

  var Intro = {
    /* Add the page's intro screen to the UI router. */
    init: function () {
      el.screen = document.getElementById('screen-intro');
      if (!el.screen) return;
      el.step = document.getElementById('intro-step');
      el.title = document.getElementById('intro-title');
      el.body = document.getElementById('intro-body');
      el.hint = document.getElementById('intro-hint');
      el.next = document.getElementById('btn-intro-next');
      el.skip = document.getElementById('btn-intro-skip');
      el.dots = document.getElementById('intro-dots');

      for (var i = 0; i < STEPS.length; i++) {
        var dot = document.createElement('i');
        el.dots.appendChild(dot);
        dots.push(dot);
      }

      el.next.addEventListener('click', function () { PG.Audio.unlock(); advance(); });
      el.skip.addEventListener('click', function () { PG.Audio.play('click'); finish(); });

      window.addEventListener('keydown', function (e) {
        if (!active) return;
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
          e.preventDefault();
          advance();
        } else if (e.code === 'Escape') {
          e.preventDefault();
          finish();
        }
      }, false);
    },

    hasSeen: function () { return PG.store.get('lumen.intro.v1', false) === true; },

    isActive: function () { return active; },

    start: function (done) {
      if (!el.screen) { if (done) done(); return; }
      index = 0;
      active = true;
      onDone = done || null;
      render();
      PG.UI.showScreen('intro');
    },

    /* Used by the start screen's GUIDE button: watch the story, then come back. */
    startFromMenu: function () {
      Intro.start(function () { PG.UI.showScreen('start'); });
    }
  };

  PG.Intro = Intro;
})();
