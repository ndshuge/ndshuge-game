/* 钟楼契约 · weapons.js
   两系各三档。钟锤系近战重击，圣烛系远程穿透。武器只影响夜战。 */
(function () {
  'use strict';
  var B = window.Belfry;

  var W = {
    // 钟锤系：近战，扇形挥砍，重击退
    hammer1: { id: 'hammer1', name: '粗铁锤', branch: 'hammer', tier: 1,
      kind: 'melee', dmg: 15, range: 24, arc: 1.7, cd: 0.44, kb: 130, heavy: false },
    hammer2: { id: 'hammer2', name: '淬火钟锤', branch: 'hammer', tier: 2,
      kind: 'melee', dmg: 24, range: 28, arc: 1.9, cd: 0.42, kb: 175, heavy: true },
    hammer3: { id: 'hammer3', name: '钟坠重锤', branch: 'hammer', tier: 3,
      kind: 'melee', dmg: 38, range: 32, arc: 2.1, cd: 0.50, kb: 240, heavy: true, shock: true },

    // 圣烛系：远程，光弹穿透，慢速高伤
    candle1: { id: 'candle1', name: '短烛台', branch: 'candle', tier: 1,
      kind: 'ranged', dmg: 10, speed: 230, cd: 0.32, pierce: 0, kb: 60, life: 1.1 },
    candle2: { id: 'candle2', name: '长明烛', branch: 'candle', tier: 2,
      kind: 'ranged', dmg: 15, speed: 265, cd: 0.34, pierce: 1, kb: 80, life: 1.2 },
    candle3: { id: 'candle3', name: '圣烛', branch: 'candle', tier: 3,
      kind: 'ranged', dmg: 23, speed: 300, cd: 0.36, pierce: 3, kb: 100, life: 1.4, burn: true }
  };

  var LADDER = {
    hammer: ['hammer1', 'hammer2', 'hammer3'],
    candle: ['candle1', 'candle2', 'candle3']
  };

  B.weapons = {
    defs: W,

    get: function (id) { return W[id] || W.hammer1; },

    // 成本（魂火 + 铁蕨钢）
    costOf: function (id) {
      var d = W[id];
      if (!d) return null;
      return { soul: [0, 12, 34][d.tier - 1] || 0, steel: [0, 2, 5][d.tier - 1] || 0 };
    },

    // 升级到下一档，返回新 id（已满级返回 null）
    upgrade: function (currentId) {
      var d = W[currentId];
      if (!d) return null;
      var l = LADDER[d.branch];
      var i = l.indexOf(currentId);
      if (i < 0 || i >= l.length - 1) return null;
      return l[i + 1];
    },

    tier2: function (id) { return (W[id] || {}).tier || 1; }
  };
})();
