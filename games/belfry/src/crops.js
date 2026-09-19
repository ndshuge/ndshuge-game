/* 钟楼契约 · crops.js
   5 种作物与生长规则。
   生长口径：growth 0(刚播种) -> 1(幼苗) -> 2(中期) -> 3(成熟)。
   每天结算时，只要这块地今天被浇过水，growth +1。
   契约者代浇与玩家手动浇等价。 */
(function () {
  'use strict';
  var B = window.Belfry;

  var CROPS = {
    ashwheat: {
      id: 'ashwheat', name: '灰麦', need: 2,
      colors: 'ashwheat', role: '魂火基础产出',
      yield: 3, soul: 4
    },
    candlelotus: {
      id: 'candlelotus', name: '烛莲', need: 3,
      colors: 'candlelotus', role: '恢复契约者活力',
      yield: 2, soul: 2, vigorRestore: 40
    },
    ironfern: {
      id: 'ironfern', name: '铁蕨', need: 3,
      colors: 'ironfern', role: '锻造材料',
      yield: 2, soul: 2, steel: 1
    },
    moongrape: {
      id: 'moongrape', name: '月葡', need: 4,
      colors: 'moongrape', role: '换镇民好感',
      yield: 2, soul: 6, favor: 1
    },
    knellgrass: {
      id: 'knellgrass', name: '悼铃草', need: 5,
      colors: 'knellgrass', role: '降低业火 1 点（全游戏最贵）',
      yield: 1, soul: 10, ward: -1
    }
  };

  var ORDER = ['ashwheat', 'candlelotus', 'ironfern', 'moongrape', 'knellgrass'];

  // 每种作物的成长阶段色（取自美术专项的三阶段色）
  function colorsAt(cropId, growth) {
    var def = CROPS[cropId];
    if (!def) return '#9ccf5a';
    var ramp = B.pal.farm[def.colors];
    if (!ramp) return '#9ccf5a';
    if (growth <= 0) return ramp[0];
    if (growth === 1) return ramp[0];
    if (growth === 2) return ramp[1];
    return ramp[2];
  }

  // 成熟度 0..1，用于收获判定与 UI 环
  function maturity(plot) {
    var def = CROPS[plot.crop];
    if (!def) return 0;
    return B.clamp(plot.growth / def.need, 0, 1);
  }

  function isRipe(plot) {
    var def = CROPS[plot.crop];
    return !!def && plot.growth >= def.need;
  }

  // 收获产出
  function harvest(plot) {
    var def = CROPS[plot.crop];
    if (!def) return null;
    return {
      crop: def.id, name: def.name,
      soul: def.soul || 0,
      steel: def.steel || 0,
      favor: def.favor || 0,
      ward: def.ward || 0,
      vigorRestore: def.vigorRestore || 0
    };
  }

  // 一天结束时的生长推进。watered = 这块地今天浇过水吗
  function grow(plot, watered) {
    if (!plot.crop) return false;
    if (isRipe(plot)) return false;
    if (!watered) { plot.watered = false; return false; }
    plot.growth += 1;
    plot.watered = false;
    return true;
  }

  B.crops = {
    defs: CROPS,
    order: ORDER,
    colorsAt: colorsAt,
    maturity: maturity,
    isRipe: isRipe,
    harvest: harvest,
    grow: grow,

    // 播种：把地块变成某作物
    plant: function (plot, cropId) {
      if (!CROPS[cropId]) return false;
      plot.crop = cropId;
      plot.growth = 0;
      plot.watered = false;
      return true;
    },

    // 种子成本：魂火
    seedCost: function (cropId) {
      var d = CROPS[cropId];
      if (!d) return 0;
      return d.need + 1;
    }
  };
})();
