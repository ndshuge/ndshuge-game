/* 钟楼契约 · palette.js
   双色域色板。数值来自像素美术专项（2026-09-18），非自造。
   A 组农场暖调 16 色 / B 组墓穴冷调 16 色 / UI 色。
   草地棋盘与亮斑用半透明白叠加，不占色板。 */
(function () {
  'use strict';
  var B = window.Belfry;

  var FARM = {
    // 草地
    grassA: '#7aa24a',      // 草地基色，暖黄绿
    grassB: '#6d9443',      // 派生：棋盘暗格（专项未给，按基调压暗一档）
    grassC: '#9ccf5a',      // 专项：作物幼苗共用绿，兼草丛亮斑

    // 耕地
    soilA: '#a97c4f',       // 耕地干土（未开垦）
    soilB: '#8a6440',       // 派生：过渡纹理
    tilled: '#7d5a36',      // 耕地湿土 / 垄沟（已开垦）

    // 路与石
    path: '#a97c4f',        // 土路底（复用耕地干土）
    pathD: '#9a958a',       // 石点叠加
    stoneA: '#9a958a',      // 石基
    stoneB: '#6f6d64',      // 派生：石暗部
    stoneC: '#b8b3a6',      // 派生：石亮顶

    // 木与叶
    woodA: '#b07f4a',       // 建筑木主色
    woodB: '#6e4a28',       // 木暗部，兼锤柄
    woodC: '#c99a63',       // 派生：木亮部
    leafA: '#9ccf5a',
    leafB: '#4f7c33',       // 茎叶中期深绿

    // 作物三阶段：幼苗共用绿 -> 中期 -> 成熟专属色
    ashwheat: ['#9ccf5a', '#8fa05e', '#d8cdb4'],   // 灰麦：熟穗灰白
    candlelotus: ['#9ccf5a', '#a8b86a', '#ffd23f'], // 烛莲：熟芯烛焰黄
    ironfern: ['#9ccf5a', '#4f7c33', '#7f93a8'],    // 铁蕨：熟叶铁蓝灰
    moongrape: ['#9ccf5a', '#5d8a62', '#b48ae0'],   // 月葡：熟珠紫
    knellgrass: ['#9ccf5a', '#4f7c33', '#9fe8dc']   // 悼铃草：熟铃青白
  };

  var CRYPT = {
    floorA: '#1d222c',      // 墓穴地面基
    floorB: '#171b23',      // 地面暗格
    floorC: '#262d3a',      // 地面亮斑

    wallA: '#3c4557',       // 墙基
    wallB: '#12151d',       // 墙缝最暗
    wallC: '#525d74',       // 墙顶亮沿

    miasmaSoft: '#7787b3',  // 瘴雾薄，叠加层用
    miasma: '#4a568c',      // 瘴雾浓

    blood: '#7e2136',       // 血迹基，冷调偏紫红
    bloodEdge: '#a93044',   // 血迹亮缘

    // 光体系：烛莲芯(昼) -> 火光核(夜灯) -> 墓守缝光(敌意) -> 圣烛弹(白热)
    ember: '#ffd27a',       // 火光核，夜灯 / 烛台 / 主角锚色
    emberDeep: '#ffb066',   // 火光缘，橙
    emberOuter: '#b05023',  // 火光最外缘
    holyBolt: '#fff3b8',    // 圣烛弹，白热

    ghost: '#bfeae2',       // 契约者幽灵体
    ghostCore: '#ecfff9',   // 幽灵芯
    ghostDark: '#6fa8a0'    // 幽灵暗纹
  };

  var UI = {
    ink: '#12151d',
    paper: '#e8dcbe',
    paperDark: '#c4b795',
    gold: '#ffd27a',
    blood: '#a93044',
    ward: '#c05a2e',
    soul: '#7ddfff',
    dim: '#6b6478'
  };

  // 描边色：昼夜两套（专项规定，L* 差 >= 15）
  var OUTLINE = { day: '#241a10', night: '#0d1018' };

  // 夜幕：乘蓝而非黑罩。黑罩等比衰减会把暖色往脏灰绿漂并使剪影粘连。
  var NIGHT_MUL = '#2a3560';

  B.pal = {
    farm: FARM,
    crypt: CRYPT,
    ui: UI,
    outline: OUTLINE,
    nightMul: NIGHT_MUL,

    // 夜幕强度：由昼夜状态机给出 vigor(0..1)
    veilAlpha: function (vigor) { return B.clamp(vigor * 0.52, 0, 0.52); },

    // 兼容旧调用：对单个色施加夜幕（仅在需要静态色时用）
    apply: function (hex, vigor) {
      if (vigor <= 0.001) return hex;
      var c = B.hexToRgb(hex), n = B.hexToRgb(NIGHT_MUL), a = B.veilAlpha(vigor);
      return B.rgbToHex(
        c.r * (1 - a) + c.r * (n.r / 255) * a,
        c.g * (1 - a) + c.g * (n.g / 255) * a,
        c.b * (1 - a) + c.b * (n.b / 255) * a
      );
    }
  };
})();
