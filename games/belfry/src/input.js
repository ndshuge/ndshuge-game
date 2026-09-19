/* 钟楼契约 · input.js
   键鼠输入 + 每帧边沿检测。 */
(function () {
  'use strict';
  var B = window.Belfry;

  var keys = {};          // 当前按住
  var pressed = {};       // 本帧刚按下
  var released = {};      // 本帧刚松开

  var mouse = { x: 0, y: 0, down: false, clicked: false, worldX: 0, worldY: 0 };

  var MAP = {
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    attack: ['KeyJ'],
    act: ['KeyK', 'Space'],
    bond: ['KeyE'],
    dash: ['ShiftLeft', 'ShiftRight', 'KeyL'],
    upgrade: ['KeyU'],
    pause: ['KeyP', 'Escape'],
    slot1: ['Digit1'],
    slot2: ['Digit2'],
    slot3: ['Digit3'],
    mute: ['KeyM']
  };

  function isMapped(code, action) {
    var l = MAP[action];
    return l && l.indexOf(code) !== -1;
  }

  var input = {
    keys: keys,

    init: function (canvas) {
      window.addEventListener('keydown', function (e) {
        // 防止空格/方向键滚动页面
        if (e.code === 'Space' || e.code.indexOf('Arrow') === 0) e.preventDefault();
        if (!keys[e.code]) pressed[e.code] = true;
        keys[e.code] = true;
      });
      window.addEventListener('keyup', function (e) {
        keys[e.code] = false;
        released[e.code] = true;
      });
      window.addEventListener('blur', function () { keys = input.keys = {}; });

      if (!canvas) return;
      canvas.addEventListener('mousemove', function (e) {
        var r = canvas.getBoundingClientRect();
        mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
        mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
      });
      canvas.addEventListener('mousedown', function (e) {
        if (e.button === 0) { mouse.down = true; mouse.clicked = true; }
      });
      window.addEventListener('mouseup', function (e) {
        if (e.button === 0) mouse.down = false;
      });
      canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    },

    // 逻辑坐标（未缩放）
    mouse: mouse,

    held: function (action) {
      var l = MAP[action];
      if (!l) return false;
      for (var i = 0; i < l.length; i++) if (keys[l[i]]) return true;
      return false;
    },

    justPressed: function (action) {
      var l = MAP[action];
      if (!l) return false;
      for (var i = 0; i < l.length; i++) if (pressed[l[i]]) return true;
      return false;
    },

    // 直接按 code 查边沿（UI 用）
    codePressed: function (code) { return !!pressed[code]; },

    axis: function () {
      var x = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);
      var y = (input.held('down') ? 1 : 0) - (input.held('up') ? 1 : 0);
      if (x !== 0 && y !== 0) { var k = Math.SQRT1_2; x *= k; y *= k; }
      return { x: x, y: y };
    },

    attackDown: function () { return input.held('attack') || mouse.down; },
    attackPressed: function () { return input.justPressed('attack') || mouse.clicked; },

    // 每帧末尾调用
    endFrame: function () {
      pressed = {};
      released = {};
      mouse.clicked = false;
    },

    anyPressed: function () {
      for (var k in pressed) if (pressed[k]) return true;
      return false;
    }
  };

  B.input = input;
})();
