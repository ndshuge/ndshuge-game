/* Gameplay helpers shared by the browser game and Node regression tests. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WW2Gameplay = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  // Resolve a swept player circle (axis-aligned Minkowski expansion) against
  // the nearest wall boundary. Unlike endpoint-only tests, a large delta
  // cannot jump through a thin obstacle.
  function sweepAxis(start, other, delta, axis, radius, footY, walls) {
    if (!Number.isFinite(start) || !Number.isFinite(other) ||
        !Number.isFinite(delta) || delta === 0) return start;
    var end = start + delta;
    var isX = axis === 'x';
    var minA = isX ? 'minX' : 'minZ';
    var maxA = isX ? 'maxX' : 'maxZ';
    var minO = isX ? 'minZ' : 'minX';
    var maxO = isX ? 'maxZ' : 'maxX';
    var r = Math.max(0, radius);
    for (var i = 0; i < walls.length; i++) {
      var wall = walls[i];
      // Elevated step platforms are passable when the player's feet are
      // already above their top, matching the original movement rule.
      if (wall.step && footY >= wall.h - 0.05) continue;
      if (other <= wall[minO] - r || other >= wall[maxO] + r) continue;
      var lower = wall[minA] - r;
      var upper = wall[maxA] + r;
      if (delta > 0 && start <= lower && end > lower) end = lower;
      if (delta < 0 && start >= upper && end < upper) end = upper;
    }
    return end;
  }
  function renderPixelRatio(width, height, dpr, budget) {
    var w = Math.max(1, Number(width) || 1);
    var h = Math.max(1, Number(height) || 1);
    var device = Math.max(0.25, Math.min(2, Number(dpr) || 1));
    var maxPixels = Math.max(1, Number(budget) || 2600000);
    return Math.max(0.25, Math.min(device, Math.sqrt(maxPixels / (w * h))));
  }
  function weaponKey(code, repeat) {
    if (repeat) return -1;
    if (code === 'KeyQ') return 5;
    if (/^Digit[1-5]$/.test(code)) return Number(code.charAt(5)) - 1;
    return -1;
  }
  return { sweepAxis: sweepAxis, renderPixelRatio: renderPixelRatio, weaponKey: weaponKey };
});
