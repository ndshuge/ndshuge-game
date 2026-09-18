/* LUMEN SIEGE - sprites: original pixel art defined as character matrices and pre-rendered
   once into offscreen canvases. Each sprite also gets an all-white variant used for hit flash. */
(function () {
  'use strict';
  var PG = (window.PG = window.PG || {});

  var cache = {};

  function makeSprite(rows, pal) {
    var h = rows.length;
    var w = rows[0].length;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    for (var y = 0; y < h; y++) {
      var row = rows[y];
      for (var x = 0; x < row.length; x++) {
        var col = pal[row.charAt(x)];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  function whiteOf(pal) {
    var out = {};
    for (var k in pal) out[k] = '#ffffff';
    return out;
  }

  function register(name, rows, pal) {
    cache[name] = {
      w: rows[0].length,
      h: rows.length,
      normal: makeSprite(rows, pal),
      flash: makeSprite(rows, whiteOf(pal))
    };
    return cache[name];
  }

  /* ---------------- player: the lantern-bearer, seen from above ----------------
     Bright hood ring, shadowed face with two faint cyan glints, a teal cloak
     with shoulder pads, and a brass lantern clasp hanging at the belt (bottom
     row). The lamp itself is drawn separately in player.js at +6px along the
     aim vector, so the body is kept right at that radius: the held light
     always appears to sit on the edge of the cloak. */

  var PLAYER = [
    '....4444....',
    '..44333344..',
    '.4333333334.',
    '.4338558334.',
    '433225522334',
    '433222222334',
    '432222222234',
    '432222222234',
    '432222222234',
    '.4222662224.',
    '..44222244..',
    '....4664....'
  ];
  var PLAYER_PAL = {
    '2': '#2b7f9c', /* cloak */
    '3': '#9adcf0', /* hood rim / shoulder light */
    '4': '#0c2a35', /* outline */
    '5': '#06141d', /* hood shadow */
    '6': '#f2c14e', /* brass clasp, matches the UI gold */
    '8': '#bdf3ff'  /* eye glints, kin of the lamp light */
  };

  /* ---------------- crawler: a legged mite that swarms ----------------
     Four dark spiny legs at the diagonals, a light top rim, two amber eyes
     sunk into the shell and a shaded belly. Never rotates, so the silhouette
     must read as a bug from every direction: round body + sticking-out legs. */

  var CRAWLER = [
    '11......11',
    '.1......1.',
    '.13333331.',
    '1322222231',
    '1328228231',
    '1322222231',
    '.12444421.',
    '..114411..',
    '.1......1.',
    '11......11'
  ];
  var CRAWLER_PAL = {
    '1': '#431109', /* legs / outline */
    '2': '#d8543f', /* shell */
    '3': '#ff9366', /* top rim light */
    '4': '#a12c1b', /* belly shade */
    '8': '#ffe08a'  /* eyes */
  };

  /* ---------------- zipper: a swept-wing dart, points +x ----------------
     Bright fins sweep back from the nose like a delta wing, the body is
     gold, one dark eye slit sits before a white-hot tip. Rotates to face
     its motion, so the nose must be unambiguous: the pale block IS the head. */

  var ZIPPER = [
    '33..........',
    '.331........',
    '..331111....',
    '...331152222',
    '...331152222',
    '..331111....',
    '.331........',
    '33..........'
  ];
  var ZIPPER_PAL = {
    '1': '#e8b13a', /* body */
    '2': '#fff6c8', /* white-hot nose */
    '3': '#ffd76a', /* swept fins */
    '5': '#33210a'  /* eye slit */
  };

  /* ---------------- bulwark: a walking siege plate ----------------
     Riveted violet armour with a single glowing eye in a dark visor groove
     and two stub stone feet. It reads as a door that decided to chase you.
     The 2x2 magenta eye is the brightest pixel on it on purpose: when the
     half-hp enrage kicks in, players should already know where to look. */

  var BULWARK = [
    '..44444444..',
    '.4999999994.',
    '486888888684',
    '488855558884',
    '488850058884',
    '488850058884',
    '488855558884',
    '486888888684',
    '.4777777774.',
    '..44444444..',
    '...44..44...',
    '...44..44...'
  ];
  var BULWARK_PAL = {
    '4': '#1e0e28', /* outline */
    '7': '#5c3570', /* plate shade */
    '8': '#7b4790', /* plate */
    '9': '#a06cc0', /* plate top light */
    '5': '#241231', /* visor groove */
    '0': '#e0a0ff', /* eye glow */
    '6': '#d0a8e8'  /* rivets */
  };

  /* ---------------- small props ---------------- */

  var GEM = [
    '..1..',
    '.131.',
    '13231',
    '.131.',
    '..1..'
  ];
  var GEM_PAL = {
    '1': '#2f8f52', /* edge */
    '2': '#eafff0', /* bright core */
    '3': '#63d98a'  /* body, matches the pickup glow */
  };

  var HEARTGEM = [
    '.11.11.',
    '1232221',
    '1222221',
    '.12221.',
    '..121..',
    '...1...'
  ];
  var HEARTGEM_PAL = {
    '1': '#a83244', /* outline */
    '2': '#ff8f9a', /* body, matches the pickup glow */
    '3': '#ffd6dc'  /* highlight */
  };

  /* orbiting shuriken: a four-point star, spun at draw time.
     Two steel tones plus a dark hub give it depth while spinning; the bright
     tips read as the dangerous part. */
  var SHURIKEN = [
    '1......1',
    '12....21',
    '.122221.',
    '..12321.',
    '.12321..',
    '.122221.',
    '12....21',
    '1......1'
  ];
  var SHURIKEN_PAL = {
    '1': '#eaffff', /* bright tips */
    '2': '#9fc6d8', /* steel arms */
    '3': '#4e6e80'  /* dark hub */
  };

  var Sprites = {
    init: function () {
      register('player', PLAYER, PLAYER_PAL);
      register('crawler', CRAWLER, CRAWLER_PAL);
      register('zipper', ZIPPER, ZIPPER_PAL);
      register('bulwark', BULWARK, BULWARK_PAL);
      register('gem', GEM, GEM_PAL);
      register('heartgem', HEARTGEM, HEARTGEM_PAL);
      register('shuriken', SHURIKEN, SHURIKEN_PAL);
    },

    get: function (name) { return cache[name]; },

    /* Draw a sprite centred on (cx, cy) in world space, offset by the camera. */
    draw: function (ctx, name, cx, cy, camX, camY, angle, alpha, flash) {
      var s = cache[name];
      if (!s) return;
      ctx.save();
      if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;
      var px = Math.round(cx - camX);
      var py = Math.round(cy - camY);
      if (angle) {
        ctx.translate(px, py);
        ctx.rotate(angle);
        ctx.drawImage(flash ? s.flash : s.normal, -s.w / 2, -s.h / 2);
      } else {
        ctx.drawImage(
          flash ? s.flash : s.normal,
          px - (s.w >> 1),
          py - (s.h >> 1)
        );
      }
      ctx.restore();
    },

    size: function (name) { var s = cache[name]; return s ? { w: s.w, h: s.h } : { w: 0, h: 0 }; }
  };

  PG.Sprites = Sprites;
})();
