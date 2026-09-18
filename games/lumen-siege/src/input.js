/* LUMEN SIEGE - input: keyboard, mouse and touch, funnelled into one state object.
 *
 * Touch layout for a two-thumb screen:
 *   left half   a virtual stick appears wherever the thumb lands; drag to move
 *   right half  drag to aim, holding fires continuously
 *   dash        an on-screen button (see ui.js), because a double-tap is too easy
 *               to misread mid-fight
 *
 * The touch layer writes into the same `keys` / `mouse` state the keyboard and mouse
 * use, so nothing downstream needs to know which device is in play.
 */
(function () {
  'use strict';
  var PG = (window.PG = window.PG || {});

  var keys = Object.create(null);       // held this frame
  var pressed = Object.create(null);    // went down this frame only

  var mouse = {
    x: PG.VIEW_W / 2, y: PG.VIEW_H / 2,  // logical canvas coordinates
    down: false
  };

  var canvas = null;

  /* ---------- keyboard ---------- */

  function onDown(e) {
    var c = e.code;
    if (!keys[c]) pressed[c] = true;
    keys[c] = true;
    /* Prevent page scroll on space / arrows while playing. */
    if (c === 'Space' || c === 'ArrowUp' || c === 'ArrowDown' ||
        c === 'ArrowLeft' || c === 'ArrowRight') {
      if (PG.game && PG.game.blocksDefaultKeys()) e.preventDefault();
    }
  }

  function onUp(e) {
    keys[e.code] = false;
  }

  function toLogical(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var sx = PG.VIEW_W / rect.width;
    var sy = PG.VIEW_H / rect.height;
    return {
      x: (clientX - rect.left) * sx,
      y: (clientY - rect.top) * sy
    };
  }

  /* ---------- touch ---------- */

  /*: Drag distance, in logical pixels, that counts as full stick deflection. */
  var STICK_RADIUS = 30;

  /*: Whether this device's primary pointer is a finger. A desktop with a mouse is
     `fine` even if the machine also has a touchscreen; the on-screen stick should not
     appear there. Touch events stay live either way, so a touchscreen laptop can still
     be operated by finger, it just does not get the visual overlay. */
  function coarsePointer() {
    if (!window.matchMedia) return false;
    try {
      return window.matchMedia('(pointer: coarse)').matches;
    } catch (e) {
      return false;
    }
  }

  var touch = {
    seen: false,          // a real touch has happened
    moveId: null,
    originX: 0, originY: 0,
    moveX: 0, moveY: 0,   // -1..1, normalised
    aimId: null,
    aimOriginX: 0, aimOriginY: 0,
    aimDX: 0, aimDY: 0,   // aim stick, -1..1
    aimX: 0, aimY: 0      // raw thumb position, for drawing
  };

  function findTouch(list, id) {
    if (!list) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].identifier === id) return list[i];
    }
    return null;
  }

  function onTouchStart(e) {
    if (PG.game && !PG.game.acceptsPointer()) return;
    e.preventDefault();
    touch.seen = true;
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      var p = toLogical(t.clientX, t.clientY);
      if (p.x < PG.VIEW_W / 2 && touch.moveId === null) {
        /* stick appears under the thumb rather than at a fixed spot: no reaching */
        touch.moveId = t.identifier;
        touch.originX = p.x;
        touch.originY = p.y;
        touch.moveX = 0;
        touch.moveY = 0;
      } else if (p.x >= PG.VIEW_W / 2 && touch.aimId === null) {
        /* the right stick also appears under the thumb: the offset from where it
           landed is the aim direction, so aiming never requires reaching the edge */
        touch.aimId = t.identifier;
        touch.aimOriginX = p.x;
        touch.aimOriginY = p.y;
        touch.aimDX = 0;
        touch.aimDY = 0;
        touch.aimX = p.x;
        touch.aimY = p.y;
        mouse.down = true;
      }
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      var p = toLogical(t.clientX, t.clientY);
      if (t.identifier === touch.moveId) {
        var dx = p.x - touch.originX;
        var dy = p.y - touch.originY;
        var len = Math.sqrt(dx * dx + dy * dy);
        if (len > STICK_RADIUS) {
          dx *= STICK_RADIUS / len;
          dy *= STICK_RADIUS / len;
        }
        touch.moveX = dx / STICK_RADIUS;
        touch.moveY = dy / STICK_RADIUS;
      } else if (t.identifier === touch.aimId) {
        /* aim is a stick too: the thumb's offset from where it landed is the
           direction, so aiming never requires reaching the screen edge */
        var adx = p.x - touch.aimOriginX;
        var ady = p.y - touch.aimOriginY;
        var alen = Math.sqrt(adx * adx + ady * ady);
        if (alen > AIM_RADIUS) {
          adx *= AIM_RADIUS / alen;
          ady *= AIM_RADIUS / alen;
        }
        touch.aimDX = adx / AIM_RADIUS;
        touch.aimDY = ady / AIM_RADIUS;
        touch.aimX = touch.aimOriginX + adx;
        touch.aimY = touch.aimOriginY + ady;
      }
    }
  }

  function onTouchEnd(e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.identifier === touch.moveId) {
        touch.moveId = null;
        touch.moveX = 0;
        touch.moveY = 0;
      } else if (t.identifier === touch.aimId) {
        touch.aimId = null;
        mouse.down = false;
        touch.aimDX = 0;
        touch.aimDY = 0;
      }
    }
  }

  /*: Drag distance, in logical pixels, that counts as full stick deflection. */
  var AIM_RADIUS = 26;

  var Input = {
    init: function (canvasEl) {
      canvas = canvasEl;
      window.addEventListener('keydown', onDown, false);
      window.addEventListener('keyup', onUp, false);
      window.addEventListener('blur', function () {
        for (var k in keys) keys[k] = false;
        mouse.down = false;
      }, false);

      canvas.addEventListener('mousemove', function (e) {
        var p = toLogical(e.clientX, e.clientY);
        mouse.x = p.x;
        mouse.y = p.y;
      }, false);
      canvas.addEventListener('mousedown', function (e) {
        if (e.button === 0) {
          var p = toLogical(e.clientX, e.clientY);
          mouse.x = p.x;
          mouse.y = p.y;
          mouse.down = true;
        }
      }, false);
      window.addEventListener('mouseup', function (e) {
        if (e.button === 0) mouse.down = false;
      }, false);
      canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); }, false);

      canvas.addEventListener('touchstart', onTouchStart, { passive: false });
      canvas.addEventListener('touchmove', onTouchMove, { passive: false });
      canvas.addEventListener('touchend', onTouchEnd, { passive: false });
      canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });
    },

    /* Logical (480x270) aim position. */
    mouse: mouse,

    /*: True on a finger-first device. Gates the on-screen stick, crosshair and dash
       button so a desktop never sees them. */
    touchActive: function () { return touch.seen && coarsePointer(); },

    /*: The virtual stick, for drawing. Null when no thumb is down. */
    stick: function () {
      if (touch.moveId === null) return null;
      return {
        ox: touch.originX, oy: touch.originY,
        x: touch.moveX, y: touch.moveY,
        dx: touch.moveX * STICK_RADIUS,
        dy: touch.moveY * STICK_RADIUS,
        radius: STICK_RADIUS
      };
    },

    /*: The aim stick: where the thumb landed, where it is now, and the normalised
       direction. Null when the right thumb is up. */
    aimStick: function () {
      if (touch.aimId === null) return null;
      return {
        ox: touch.aimOriginX, oy: touch.aimOriginY,
        dx: touch.aimDX, dy: touch.aimDY,
        x: touch.aimX, y: touch.aimY,
        radius: AIM_RADIUS
      };
    },

    /*: The aim direction, or null when the thumb is still near its origin (keep
       the last aim in that case, so a twitch does not swing the lantern around). */
    aimVector: function () {
      if (touch.aimId === null) return null;
      var l = Math.sqrt(touch.aimDX * touch.aimDX + touch.aimDY * touch.aimDY);
      if (l < 0.18) return null;
      return { x: touch.aimDX / l, y: touch.aimDY / l };
    },

    /*: The aim marker, for drawing. */
    aim: function () {
      if (touch.aimId === null) return null;
      return { x: touch.aimX, y: touch.aimY };
    },

    /* Called by the on-screen dash button so the dash path stays identical. */
    triggerDash: function () {
      if (!pressed['Space']) pressed['Space'] = true;
      keys['Space'] = true;
      window.setTimeout(function () { keys['Space'] = false; }, 60);
    },

    held: function (code) { return !!keys[code]; },
    pressed: function (code) { return !!pressed[code]; },

    /* Movement axis from WASD / arrows, or the virtual stick. Normalised. */
    axis: function () {
      if (touch.moveId !== null) {
        var tx = touch.moveX, ty = touch.moveY;
        var tl = Math.sqrt(tx * tx + ty * ty);
        if (tl > 1) { tx /= tl; ty /= tl; }
        return { x: tx, y: ty };
      }
      var x = 0, y = 0;
      if (keys['KeyA'] || keys['ArrowLeft']) x -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) x += 1;
      if (keys['KeyW'] || keys['ArrowUp']) y -= 1;
      if (keys['KeyS'] || keys['ArrowDown']) y += 1;
      if (x !== 0 && y !== 0) { var inv = Math.SQRT1_2; x *= inv; y *= inv; }
      return { x: x, y: y };
    },

    /* Called by the game loop after all systems have read the frame. */
    endFrame: function () {
      for (var k in pressed) pressed[k] = false;
    },

    /* Fully drop all state (used when leaving a run). */
    reset: function () {
      for (var k in keys) { keys[k] = false; pressed[k] = false; }
      mouse.down = false;
      touch.moveId = null;
      touch.aimId = null;
      touch.moveX = 0;
      touch.moveY = 0;
    }
  };

  PG.Input = Input;
})();
