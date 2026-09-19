/* 钟楼契约 · story.js
   剧情文本与选择后果的数据层。逻辑层只消费 flag，不直接读字符串。 */
(function () {
  'use strict';
  var B = window.Belfry;

  // ---------- 世界观设定卡 ----------
  var WORLD = [
    '烬望是卡在雾口上的边境镇。',
    '镇外那片瘴雾不算天气，是没结清的账。凡在雾口死掉的活物，魂若无去处，就凝成雾，越积越厚。',
    '三百年前，一个后来没人记得名字的人把自己钉进钟楼，用整个自己撞响了钟。钟声成了边界，雾退回墙外。',
    '那个人留下来，成了钟灵，也是名册上的第一个契约者。',
    '钟灵不吃血肉，只吃魂薪。被斩杀的雾生之物，魂化成火，一部分归你，一部分烧进钟里。',
    '于是有了第二条路：缚契。把怪物的魂扣在它自己的身子里，让它白天替你耕地，夜里替你守墙。',
    '代价有两重。钟少收一份薪，边界薄一点；被扣住的魂是一笔没结的账，雾认账，顺着这条线找到门。',
    '契约者越多，门越多，夜就越凶。业火不是惩罚，是利息。而在烬望，利息从来不清零。'
  ];

  // ---------- 五幕 ----------
  // effect 是写给逻辑层的：{ flag, ward, waveBonus, rel:{villager:delta}, weaponTier }
  var ACTS = [
    {
      day: 1,
      key: 'roster',
      title: '名册',
      where: '钟楼下',
      narration: [
        '钟楼下摆着一本册子，纸边卷得像被火舔过。',
        '奥托说，来的人都登记，走的人不登记，因为没有人走出去过。',
        '你翻到第一页，空的，一个字都没有。',
        '他没解释，只是把蘸墨的笔递给你。笔杆上有一道很深的指痕，像被谁攥了很久，攥到木头都软了。'
      ],
      choices: [
        {
          label: '按血印入册',
          outcome: '此后每天清晨，钟灵会对你低语一句，预告当夜的东西。',
          effect: { flag: 'bloodOath', morningWhisper: true }
        },
        {
          label: '只报名字，不按印',
          outcome: '钟灵对你全程沉默。奥托免费给你一次当夜敌人构成的情报。',
          effect: { flag: 'nameOnly', intelFree: 1, muteSpirit: true }
        }
      ]
    },
    {
      day: 3,
      key: 'wear',
      title: '磨损',
      where: '你的地头',
      narration: [
        '它蹲在你地头，锄头还攥在手里，人却已经不动了。',
        '眼皮半合，喉头有很轻的声音，像在数什么，数到一半忘了。',
        '你这才明白，契约不是一条绳，是一份每天都要重签的东西。它每签一次，就少一块自己。',
        '魂火能喂它，可你手里的魂火本来是要拿去买铁的。'
      ],
      choices: [
        {
          label: '花魂火喂养它',
          outcome: '活力回升。玛尔塔会记住你把它当东西养，她的信任线更难走。',
          effect: { flag: 'fedElder', vigorRestore: 55, rel: { marta: -1 } }
        },
        {
          label: '什么都不做',
          outcome: '它会在明天白天，在你的农场里站起来。',
          effect: { flag: 'letWither', betrayNextDay: true }
        }
      ],
      // 若玩家从未缚契，这一幕改由莉薇发起（见 altNarration）
      altCondition: 'noBond',
      altNarration: [
        '莉薇在黄昏拦住你。',
        '她问你为什么不动手。雾里有的是东西，绳子够长，钟也够旧。',
        '她说，这镇子撑了三百年，靠的不是谁手快。'
      ]
    },
    {
      day: 6,
      key: 'marks',
      title: '刻痕',
      where: '墓穴',
      narration: [
        '墙上密密麻麻全是刻痕，每个名字后面跟一个数。',
        '奥托说，那是他们一共缚了几个。数字越大，名字刻得越浅，因为后来的人不肯用力。',
        '他递给你一把凿子，没催。',
        '你听见头顶很远处有钟声，响了六下，停了一息，又响了第七下。没人敲它。'
      ],
      choices: [
        {
          label: '把自己的名字和缚契数一起刻上墙',
          outcome: '镇民开始主动送物资到农场。当夜会多出一波。',
          effect: { flag: 'declaredPublic', supplyDaily: 1, waveBonus: 1, rel: { otto: 1 } }
        },
        {
          label: '只刻名字，不刻数',
          outcome: '没有物资。钟灵会在第九天提前对你说清自己的来历。',
          effect: { flag: 'hidCount', spiritRevealEarly: true }
        }
      ]
    },
    {
      day: 9,
      key: 'interest',
      title: '利息',
      where: '钟楼地基的裂口',
      narration: [
        '裂口从钟楼墙根一直裂到围墙外，缝里没有土，是灰。',
        '灰在动，一起一伏，像有人在底下呼吸。',
        '钟灵的声音第一次不在你耳朵里响，而是在你手掌里响。',
        '它说：我没有多要，我只是把利息记在你能看见的地方。',
        '燧石和悼铃草都摆在你面前，你能烧的只有一样。'
      ],
      choices: [
        {
          label: '烧掉悼铃草，把业火压回去',
          outcome: '业火减 1。玛尔塔与奥托各降一档，他们认为你在喂一个无底洞。',
          effect: { flag: 'burnedHerb', ward: -1, rel: { marta: -1, otto: -1 } },
          require: { crop: 'knellgrass', count: 1 },
          requireHint: '你没有悼铃草。'
        },
        {
          label: '什么都不烧，魂火全投进武器',
          outcome: '业火不动。当夜强度首次跃升，你的武器档位提前一级。',
          effect: { flag: 'allInSteel', weaponTier: 1, nightSurge: true }
        }
      ],
      triggerWard: 3,
      altWhere: '钟楼地基的裂口'
    },
    {
      day: 12,
      key: 'seventh',
      title: '第七声',
      where: '镇子的街上',
      narration: [
        '全镇都站到街上了，没人说话。',
        '第四声之后，尼可被莉薇抱进屋。门关上时你听见他在里面喊了一句，隔着门板听不真。',
        '第六声，围墙外的雾开始往上爬，不是漫，是爬，像有人在外面扶着墙。',
        '第七声落下时，钟楼的门自己开了一条缝。缝里很暗，但不冷。'
      ],
      choices: [
        {
          label: '进去',
          outcome: '第十四夜面对最初的契约者时，你会多听它说一段话。结局里会多一段钟灵自述。',
          effect: { flag: 'enteredBelfry', extraEpilogue: true }
        },
        {
          label: '把钟楼门锁上',
          outcome: '第十四天不做任何解释，所有结局旁白更短更冷。',
          effect: { flag: 'boltedDoor', coldEnding: true }
        }
      ]
    }
  ];

  // ---------- 镇民 ----------
  var VILLAGERS = [
    {
      id: 'marta', name: '玛尔塔', role: '铁匠铺主人', mark: '右臂有灼伤',
      quip: '铁不骗人。',
      lines: {
        0: '刀放柜台，钱放柜面。别跟我说话。',
        1: '你手上那层茧是钟锤磨的。换圣烛吧，你握得太紧，锤子跟你都累。',
        2: '我男人最后一次进墓穴，带的是我打的锤。你要真想撑到第十四天，我就给你打一把一样的，别问为什么。'
      },
      // 每档好感需要的点数
      thresholds: [0, 3, 7]
    },
    {
      id: 'otto', name: '奥托', role: '掘墓人兼敲钟人', mark: '',
      quip: '先量尺寸。',
      lines: {
        0: '坑我挖好了。谁躺进去，不归我管。',
        1: '钟响几下是有规矩的。这两天它多响了。你听见了吧。',
        2: '三百年前那个人也是自己走下去的。名册第一页一直空着，你猜为什么。'
      },
      thresholds: [0, 3, 7]
    },
    {
      id: 'nico', name: '尼可', role: '钟楼废墟里捡东西的孩子', mark: '',
      quip: '我什么都不怕，就是怕安静。',
      lines: {
        0: '你别过来。我认得你身上的味道，跟雾一个味。',
        1: '我捡到过一块钟的碎片。贴在耳朵上能听见有人数数，数到十四就停了。',
        2: '如果哪天钟不响了，你别把我关在屋里，好不好。'
      },
      thresholds: [0, 3, 7]
    }
  ];

  // ---------- 结局 ----------
  var ENDINGS = {
    silence: {
      key: 'silence', title: '熄钟', en: 'SILENCE',
      condition: '魂火足够砸碎古钟',
      text: [
        '你砸了钟。第一下它没裂，第二下裂了，第三下之后，烬望就再也没有声音。',
        '雾从墙外进来，不急，像水漫过田垄。',
        '你站在院子里，看着那些你亲手捆住的东西一个一个站直。它们没有看你，也没有跑，只是朝雾里走，像终于想起来自己该往哪去。',
        '你的地、你的仓、你钉在门上的那把锤，都留在原地。你自己也留在原地。',
        '天亮比昨天早了半刻。没有人记得这镇子叫什么，也没有人需要记得。'
      ]
    },
    vigil: {
      key: 'vigil', title: '承钟', en: 'VIGIL',
      condition: '缚契数达到五个以上',
      text: [
        '你把它们一个一个带上钟楼。它们没有反抗，契约还在，契约就是让它们不反抗的那个东西。',
        '钟灵把每一份魂接过去，接的时候很轻，像收一笔早该收的账。',
        '第七声之后，钟再没停过。雾退回墙外，退得比三百年来任何一次都远。',
        '烬望会一直在这里。田会一直有收成，孩子会长大，铁匠铺的炉子会一直烧着。',
        '你也在。你的名字在名册第二页，字迹很新。',
        '只有一件小事：你再也想不起它们叫什么，因为从来没有人给它们起过名字。'
      ]
    },
    hollow: {
      key: 'hollow', title: '空钟', en: 'HOLLOW',
      condition: '十四天里一个契约都没签',
      text: [
        '十四天里你没有跟任何东西签约。你杀掉的都烧了，一份不多留。',
        '第十四夜，钟灵从钟里走出来。是个人形，很旧，站都站不太稳。',
        '它在你面前站了很久，等你递点什么过去。你手里什么都没有，你身后也没有。',
        '它没有生气。它只是明白了一件事，然后就开始散，从手指尖开始，像灰被风吹。',
        '钟没有响，雾也没有进来。边界是你这些天一刀一刀砍出来的，跟它无关。',
        '你回到农场。天亮了，地还得耕。没有人向你道谢。'
      ]
    }
  };

  // ---------- 开场引导 ----------
  var INTRO = [
    ['你是来接班的人。', '烬望只剩十四天。', '方向键走动。'],
    ['雾里有东西。', '左键挥砍，按住不放会慢。', '打不过就跑，跑不掉就死。'],
    ['白天耕地。', '荒地先开垦，再播种，别忘了浇水。', '天黑前把活干完。'],
    ['打赢之后，你可以斩，也可以缚。', '缚了它，它就替你干活。', '也替你把夜叫得更黑。']
  ];

  // ---------- 钟灵低语（按血印后每晨一句，预告当夜） ----------
  var WHISPERS = [
    '今夜来的都是薄皮的，走得快。',
    '今夜有会唱的东西。先哑了它。',
    '今夜矮的多，别让它们贴上来。',
    '今夜第一波会来得比钟早。',
    '今夜有壳厚的。锤子比烛好使。',
    '今夜来的东西认识你，可你不认识它们。',
    '今夜雾会站到墙头上看。',
    '今夜死在这里的，明天还会来。',
    '今夜门比昨天多一扇。',
    '今夜不必数第几声。',
    '今夜它想跟你说句话。别听。',
    '今夜之后，只剩两夜。',
    '今夜钟会自己响。你不必去。',
    '最后一夜。它一直在等你递东西过去。'
  ];

  B.story = {
    world: WORLD,
    acts: ACTS,
    villagers: VILLAGERS,
    endings: ENDINGS,
    intro: INTRO,
    whispers: WHISPERS,

    actForDay: function (day) {
      for (var i = 0; i < ACTS.length; i++) if (ACTS[i].day === day) return ACTS[i];
      return null;
    },

    villager: function (id) {
      for (var i = 0; i < VILLAGERS.length; i++) if (VILLAGERS[i].id === id) return VILLAGERS[i];
      return null;
    },

    // 好感点数 -> 档位 (0/1/2)
    tierOf: function (id, points) {
      var v = B.story.villager(id);
      if (!v) return 0;
      var t = 0;
      for (var i = 0; i < v.thresholds.length; i++) if (points >= v.thresholds[i]) t = i;
      return t;
    },

    lineOf: function (id, tier) {
      var v = B.story.villager(id);
      if (!v) return '';
      tier = B.clamp(tier, 0, 2);
      return v.lines[tier];
    },

    // 结局判定：按玩家 14 天的行为，不按键
    resolveEnding: function (state) {
      if (state.totalBonds === 0) return ENDINGS.hollow;
      if (state.soulfire >= state.silenceCost) return ENDINGS.silence;
      if (state.totalBonds >= 5) return ENDINGS.vigil;
      // 既砸不动钟也没攒够契约，落到最接近的一条
      return state.soulfire > state.silenceCost * 0.6 ? ENDINGS.silence : ENDINGS.vigil;
    }
  };
})();
