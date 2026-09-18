/* LUMEN SIEGE - upgrades: the level-up pool.
 *
 * Three rarity tiers. Common upgrades are steady stat growth; rare ones add a new
 * behaviour; legendary ones change how a run is played. Rarity weight shifts with
 * player level, so a long run drifts toward the stronger pool on purpose.
 *
 * Every entry is one readable change. The interest is in how they stack.
 */
(function () {
  'use strict';
  var PG = (window.PG = window.PG || {});

  /* Rarity: common = steady stats, rare = new behaviour, legend = run-defining.
     Artwork for every upgrade lives in upgrade-icons.js, one matrix per upgrade. */
  var COMMON = 'common', RARE = 'rare', LEGEND = 'legend';

  var UPGRADES = [
    /* ---------------- projectile core ---------------- */
    {
      id: 'dmg', name: '光刃强化', rarity: COMMON, weight: 9, max: 12,
      desc: '光弹伤害 +28%', icon: 'up',
      apply: function (p) { p.damage *= 1.28; }
    },
    {
      id: 'rate', name: '快速咏唱', rarity: COMMON, weight: 9, max: 12,
      desc: '攻击间隔 -18%', icon: 'rate',
      apply: function (p) { p.fireInterval = Math.max(0.05, p.fireInterval * 0.82); }
    },
    {
      id: 'multi', name: '分裂光', rarity: RARE, weight: 5, max: 10,
      desc: '每次攻击多发射 1 枚光弹', icon: 'multi',
      apply: function (p) { p.multi += 1; }
    },
    {
      id: 'pierce', name: '贯穿', rarity: RARE, weight: 5, max: 7,
      desc: '光弹可多穿透 1 个敌人（每次穿透伤害略降）', icon: 'pierce',
      apply: function (p) { p.pierce += 1; }
    },
    {
      id: 'bulletspeed', name: '迅光', rarity: COMMON, weight: 8, max: 7,
      desc: '光弹速度 +22%，射程 +15%', icon: 'bullet',
      apply: function (p) { p.bulletSpeed *= 1.22; p.bulletLife *= 1.15; }
    },
    {
      id: 'crit', name: '会心', rarity: RARE, weight: 5, max: 7,
      desc: '暴击率 +18%', icon: 'crit',
      apply: function (p) { p.critChance = Math.min(1, p.critChance + 0.18); }
    },
    {
      id: 'critdmg', name: '致命一击', rarity: RARE, weight: 4, max: 6,
      requires: 'crit',
      desc: '暴击伤害 +90%（基础 200%）', icon: 'critbig',
      apply: function (p) { p.critMult += 0.9; }
    },
    {
      id: 'caliber', name: '大口径', rarity: RARE, weight: 4, max: 5,
      desc: '光弹体积变大，伤害 +18%', icon: 'caliber',
      apply: function (p) { p.bulletRadius += 1.0; p.damage *= 1.18; }
    },
    {
      id: 'homing', name: '追踪光', rarity: RARE, weight: 4, max: 4,
      desc: '光弹会自动转向最近的敌人', icon: 'homing',
      apply: function (p) { p.homing += 2.2; }
    },
    {
      id: 'bounce', name: '弹射', rarity: RARE, weight: 4, max: 4,
      desc: '光弹撞墙会反弹 1 次', icon: 'bounce',
      apply: function (p) { p.bounce += 1; }
    },

    /* ---------------- orbiting shuriken ---------------- */
    {
      id: 'orb', name: '手里剑', rarity: RARE, weight: 6, max: 1,
      desc: '获得 1 枚环绕你的手里剑，接触即伤害', icon: 'orbit',
      apply: function (p) { p.orbitCount += 1; }
    },
    {
      id: 'orbcount', name: '手里剑增数', rarity: RARE, weight: 5, max: 7,
      requires: 'orb',
      desc: '环绕手里剑 +1', icon: 'orbit2',
      apply: function (p) { p.orbitCount += 1; }
    },
    {
      id: 'orbspeed', name: '旋刃', rarity: RARE, weight: 5, max: 6,
      requires: 'orb',
      desc: '手里剑转速 +35%', icon: 'spin',
      apply: function (p) { p.orbitSpeed *= 1.35; }
    },
    {
      id: 'orbdmg', name: '磨刃', rarity: RARE, weight: 5, max: 8,
      requires: 'orb',
      desc: '手里剑伤害 +45%', icon: 'thorn',
      apply: function (p) { p.orbitDamage *= 1.45; }
    },
    {
      id: 'orbrange', name: '扩张轨道', rarity: RARE, weight: 4, max: 5,
      requires: 'orb',
      desc: '手里剑轨道半径 +25%', icon: 'ring',
      apply: function (p) { p.orbitRadius *= 1.25; }
    },

    /* ---------------- secondary weapons ---------------- */
    {
      id: 'boomerang', name: '回旋镖', rarity: LEGEND, weight: 3, max: 1,
      desc: '获得回旋镖：自动投出，去程回程各打一次', icon: 'bounce',
      apply: function (p) { p.boomerangCount += 1; }
    },
    {
      id: 'boomerangcount', name: '连抛', rarity: RARE, weight: 4, max: 4,
      requires: 'boomerang',
      desc: '回旋镖 +1', icon: 'multi',
      apply: function (p) { p.boomerangCount += 1; }
    },
    {
      id: 'boomerangspeed', name: '快镖', rarity: RARE, weight: 4, max: 5,
      requires: 'boomerang',
      desc: '回旋镖投掷间隔 -18%', icon: 'rate',
      apply: function (p) { p.boomerangInterval = Math.max(0.4, p.boomerangInterval * 0.82); }
    },
    {
      id: 'sentinel', name: '灯灵哨卫', rarity: LEGEND, weight: 3, max: 1,
      desc: '一个跟随你的哨卫，自己寻找敌人射击', icon: 'orbit',
      apply: function (p) { p.sentinelCount += 1; }
    },
    {
      id: 'sentinelcount', name: '多灵', rarity: RARE, weight: 4, max: 3,
      requires: 'sentinel',
      desc: '哨卫 +1', icon: 'orbit2',
      apply: function (p) { p.sentinelCount += 1; }
    },
    {
      id: 'sentinelrate', name: '哨卫连射', rarity: RARE, weight: 4, max: 5,
      requires: 'sentinel',
      desc: '哨卫射击间隔 -20%，伤害 +20%', icon: 'rate',
      apply: function (p) {
        p.sentinelInterval = Math.max(0.25, p.sentinelInterval * 0.80);
        p.sentinelDamageMul *= 1.2;
      }
    },
    {
      id: 'well', name: '引力井', rarity: LEGEND, weight: 3, max: 1,
      desc: '周期在脚下开启引力井，把敌人扳进来并持续磨碎', icon: 'ring',
      apply: function (p) { p.wellRadius = Math.max(p.wellRadius, 92); }
    },
    {
      id: 'wellsize', name: '深井', rarity: RARE, weight: 4, max: 5,
      requires: 'well',
      desc: '引力井半径 +28%，伤害 +40%，开启更频', icon: 'chain',
      apply: function (p) {
        p.wellRadius *= 1.28;
        p.wellDamage *= 1.4;
        p.wellInterval = Math.max(1.8, p.wellInterval * 0.85);
      }
    },
    {
      id: 'split', name: '分裂弹', rarity: RARE, weight: 5, max: 1,
      desc: '光弹命中后向四周炸出一圈碎片', icon: 'burst',
      apply: function (p) { p.splitCount = Math.max(p.splitCount, 5); }
    },
    {
      id: 'splitcount', name: '更多碎片', rarity: RARE, weight: 4, max: 4,
      requires: 'split',
      desc: '分裂碎片 +2，碎片伤害 +25%', icon: 'burst',
      apply: function (p) { p.splitCount += 2; p.splitDamageMul *= 1.25; }
    },
    {
      id: 'execute', name: '处决', rarity: LEGEND, weight: 3, max: 3,
      desc: '对生命低于 22% 的敌人直接斩杀', icon: 'skull',
      apply: function (p) { p.executeThreshold = Math.min(0.6, p.executeThreshold + 0.22); }
    },
    {
      id: 'chill', name: '缓流', rarity: RARE, weight: 4, max: 4,
      desc: '命中使敌人减速 25%，持续一秒', icon: 'hourglass',
      apply: function (p) { p.chillFactor = Math.min(0.8, p.chillFactor + 0.25); }
    },

    /* ---------------- elemental shots ---------------- */
    {
      id: 'freeze', name: '冰冻弹', rarity: LEGEND, weight: 3, max: 1,
      desc: '光弹命中后冻结敌人 1.4 秒。冻结中受伤 +50%，再中 3 下直接碎裂',
      icon: 'ring',
      apply: function (p) { p.freezePower = Math.max(p.freezePower, 1.4); }
    },
    {
      id: 'freezetime', name: '深寒', rarity: RARE, weight: 4, max: 5,
      requires: 'freeze',
      desc: '冻结时间 +0.5 秒',
      icon: 'hourglass',
      apply: function (p) { p.freezePower += 0.5; }
    },
    {
      id: 'ricochet', name: '弹跳弹', rarity: RARE, weight: 5, max: 1,
      desc: '光弹命中敌人后会拐向下一个目标，同一发弹继续飞',
      icon: 'bounce',
      apply: function (p) { p.ricochet = Math.max(p.ricochet, 1); }
    },
    {
      id: 'ricochetcount', name: '乱弹', rarity: RARE, weight: 4, max: 4,
      requires: 'ricochet',
      desc: '弹跳次数 +1',
      icon: 'multi',
      apply: function (p) { p.ricochet += 1; }
    },
    {
      id: 'ricochetpower', name: '滚雪', rarity: RARE, weight: 5, max: 5,
      requires: 'ricochet',
      desc: '每弹跳一次，这一发的伤害 +30%',
      icon: 'bounce',
      apply: function (p) { p.ricochetPower += 0.3; }
    },
    {
      id: 'shrapnel', name: '弹片', rarity: RARE, weight: 5, max: 1,
      desc: '击杀敌人时向四周迸射碎弹',
      icon: 'split',
      apply: function (p) { p.shrapnel = Math.max(p.shrapnel, 6); p.shrapnelDamage = Math.max(p.shrapnelDamage, 16); }
    },
    {
      id: 'shrapnelcount', name: '锋爆', rarity: RARE, weight: 4, max: 5,
      requires: 'shrapnel',
      desc: '弹片 +3，伤害 +25%',
      icon: 'splitcount',
      apply: function (p) { p.shrapnel += 3; p.shrapnelDamage *= 1.25; }
    },
    {
      id: 'splitchain', name: '连锁分裂', rarity: LEGEND, weight: 3, max: 1,
      requires: 'split',
      desc: '分裂出的碎片会再碎一次',
      icon: 'explode',
      apply: function (p) { p.splitChain = 1; }
    },
    {
      id: 'ring', name: '环形弹', rarity: RARE, weight: 4, max: 4,
      desc: function (player) {
        var now = player && player.ringEvery ? player.ringEvery : 6;
        var next = Math.max(3, (player && player.ringEvery ? player.ringEvery : 7) - 1);
        return '每 ' + now + ' 次射击改为向四周泼出一圈弹 → 每 ' + next + ' 次';
      },
      icon: 'nova',
      apply: function (p) { p.ringEvery = Math.max(3, (p.ringEvery || 7) - 1); }
    },

    /* ---------------- beam / aura / deployment ---------------- */
    {
      id: 'laser', name: '激光器', rarity: LEGEND, weight: 3, max: 1,
      desc: '按住左键时射出一束持续激光，穿透一切',
      icon: 'bullet',
      apply: function (p) { p.laserDps = Math.max(p.laserDps, 26); }
    },
    {
      id: 'laserpower', name: '聚能', rarity: RARE, weight: 4, max: 6,
      requires: 'laser',
      desc: '激光伤害 +40%',
      icon: 'critbig',
      apply: function (p) { p.laserDps *= 1.4; }
    },
    {
      id: 'aura', name: '灼热光环', rarity: RARE, weight: 5, max: 1,
      desc: '贴身范围持续灼烧，不靠命中',
      icon: 'burst',
      apply: function (p) { p.auraRadius = Math.max(p.auraRadius, 46); p.auraDamage = Math.max(p.auraDamage, 16); }
    },
    {
      id: 'aurasize', name: '炽域', rarity: RARE, weight: 4, max: 5,
      requires: 'aura',
      desc: '光环半径 +25%，伤害 +30%',
      icon: 'ring',
      apply: function (p) { p.auraRadius *= 1.25; p.auraDamage *= 1.3; }
    },
    {
      id: 'mine', name: '地雷', rarity: RARE, weight: 4, max: 1,
      desc: '移动时在脚下留下地雷，敌人踩到就炸',
      icon: 'skull',
      apply: function (p) { p.mineDamage = Math.max(p.mineDamage, 46); p.mineInterval = 0.6; }
    },
    {
      id: 'minepower', name: '重雷', rarity: RARE, weight: 4, max: 5,
      requires: 'mine',
      desc: '地雷伤害 +45%，布设更频',
      icon: 'burst',
      apply: function (p) { p.mineDamage *= 1.45; p.mineInterval = Math.max(0.22, p.mineInterval * 0.85); }
    },
    {
      id: 'poison', name: '毒云', rarity: RARE, weight: 4, max: 1,
      desc: '击杀处留下一团毒云，持续腐蚀经过的敌人',
      icon: 'drop',
      apply: function (p) { p.poisonRadius = Math.max(p.poisonRadius, 40); p.poisonDamage = Math.max(p.poisonDamage, 22); }
    },
    {
      id: 'poisonpower', name: '剧毒', rarity: RARE, weight: 4, max: 5,
      requires: 'poison',
      desc: '毒云半径 +25%，伤害 +40%',
      icon: 'drop',
      apply: function (p) { p.poisonRadius *= 1.25; p.poisonDamage *= 1.4; }
    },

    /* ---------------- summon / rhythm ---------------- */
    {
      id: 'mirror', name: '镜影', rarity: LEGEND, weight: 3, max: 1,
      desc: '一个跟随你的幻影，朝反方向射击',
      icon: 'orbit2',
      apply: function (p) { p.mirrorCount += 1; }
    },
    {
      id: 'mirrorcount', name: '重影', rarity: RARE, weight: 4, max: 3,
      requires: 'mirror',
      desc: '镜影 +1',
      icon: 'multi',
      apply: function (p) { p.mirrorCount += 1; }
    },
    {
      id: 'overcharge', name: '超载', rarity: RARE, weight: 5, max: 1,
      desc: '连续命中 15 次后，下一发变成巨型弹',
      icon: 'bolt',
      apply: function (p) { p.overchargeEvery = 15; }
    },
    {
      id: 'overchargefast', name: '快充', rarity: RARE, weight: 4, max: 4,
      requires: 'overcharge',
      desc: '超载所需命中数 -3',
      icon: 'bolt',
      apply: function (p) { p.overchargeEvery = Math.max(5, p.overchargeEvery - 3); }
    },
    {
      id: 'frenzy', name: '连击加速', rarity: RARE, weight: 5, max: 1,
      desc: '击杀后 2 秒内攻速 +40%，可刷新',
      icon: 'rate',
      apply: function (p) { p.frenzyPower = 0.4; }
    },
    {
      id: 'frenzypower', name: '血热', rarity: RARE, weight: 4, max: 4,
      requires: 'frenzy',
      desc: '连击加速提升到 +60%、持续 3 秒',
      icon: 'fire',
      apply: function (p) { p.frenzyPower = Math.min(0.75, p.frenzyPower + 0.2); }
    },

    /* ---------------- control ---------------- */
    {
      id: 'nova', name: '护盾爆裂', rarity: RARE, weight: 5, max: 1,
      desc: '护盾破碎时向四周射出一圈弹',
      icon: 'shield',
      apply: function (p) { p.shieldNova = 12; }
    },
    {
      id: 'novaup', name: '环爆', rarity: RARE, weight: 4, max: 4,
      requires: 'nova',
      desc: '爆裂弹数 +4',
      icon: 'ring',
      apply: function (p) { p.shieldNova += 4; }
    },
    {
      id: 'timestop', name: '时之凝滞', rarity: LEGEND, weight: 3, max: 3,
      desc: '命中时有 2% 概率让全场敌人静止 0.35 秒',
      icon: 'hourglass',
      apply: function (p) { p.timeStopChance = Math.min(0.1, p.timeStopChance + 0.02); }
    },

    /* ---------------- blood pacts: real power, real price ---------------- */
    {
      id: 'pact', name: '血契', rarity: LEGEND, weight: 3, max: 3,
      desc: '生命上限 -25%，伤害 +60%',
      icon: 'skull',
      apply: function (p) {
        p.maxHp = Math.max(40, Math.round(p.maxHp * 0.75));
        p.hp = Math.min(p.hp, p.maxHp);
        p.damage *= 1.6;
      }
    },
    {
      id: 'allin', name: '孤注', rarity: LEGEND, weight: 3, max: 3,
      desc: '护盾上限清零，暴击率 +30%、暴击伤害 +50%',
      icon: 'critbig',
      apply: function (p) {
        p.shieldMax = 0;
        p.shield = 0;
        p.critChance = Math.min(1, p.critChance + 0.30);
        p.critMult += 0.5;
      }
    },

    /* ---------------- on-hit / on-kill effects ---------------- */
    {
      id: 'chain', name: '链式闪电', rarity: LEGEND, weight: 2, max: 6,
      icon: 'chain',
      desc: function (player) {
        if (!player) return '命中时放出闪电，链接附近敌人';
        var now = Math.round(player.chainChance * 100);
        var next = Math.round(Math.min(1, player.chainChance + 0.20) * 100);
        return '当前 ' + now + '% 概率、链接 ' + player.chainTargets + ' 个'
          + ' → ' + next + '% 概率、链接 ' + (player.chainTargets + 1) + ' 个；链击伤害 +15%';
      },
      /* Every stack moves two numbers now, so a later stack is never a dead pick. */
      apply: function (p) {
        p.chainChance = Math.min(1, p.chainChance + 0.20);
        p.chainTargets += 1;
        p.chainDamageMul += 0.15;
      }
    },
    {
      id: 'explode', name: '轰爆', rarity: RARE, weight: 5, max: 1,
      desc: '击杀敌人时产生小范围爆炸', icon: 'burst',
      apply: function (p) { p.explodeRadius = Math.max(p.explodeRadius, 34); }
    },
    {
      id: 'exploderange', name: '连锁爆', rarity: RARE, weight: 4, max: 6,
      requires: 'explode',
      desc: '爆炸半径 +45%，伤害 +35%', icon: 'burst',
      apply: function (p) { p.explodeRadius *= 1.45; p.explodeDamage *= 1.35; }
    },
    {
      id: 'burn', name: '元素灼烧', rarity: RARE, weight: 5, max: 6,
      desc: '命中使敌人持续灼烧，每秒掉血', icon: 'fire',
      apply: function (p) { p.burnDps += 6; }
    },
    {
      id: 'mark', name: '印记', rarity: LEGEND, weight: 2, max: 5,
      desc: '命中给敌人叠印记，每层使其承受伤害 +12%（最多 5 层）', icon: 'cross2',
      apply: function (p) { p.markPower += 0.12; }
    },

    /* ---------------- survivability ---------------- */
    {
      id: 'maxhp', name: '光核扩张', rarity: COMMON, weight: 9, max: 12,
      desc: '生命上限 +40，并立即回复 40', icon: 'heart',
      apply: function (p) { p.maxHp += 40; p.hp = Math.min(p.maxHp, p.hp + 40); }
    },
    {
      id: 'regen', name: '自愈', rarity: COMMON, weight: 7, max: 8,
      desc: function (player) {
        var now = player ? Math.round(player.regenPct * 100) : 3;
        var next = player ? Math.round((player.regenPct + 0.01) * 100) : 4;
        return '每秒回复 ' + now + '% 生命 → ' + next + '%（基础 3%）';
      },
      icon: 'cross',
      apply: function (p) { p.regenPct += 0.01; }
    },
    {
      id: 'shield', name: '护盾层数', rarity: LEGEND, weight: 2, max: 4,
      desc: '可恢复护盾 +1 层（每层抵挡一次伤害）', icon: 'shield',
      apply: function (p) {
        p.shieldMax += 1;
        p.shield = p.shieldMax;
      }
    },
    {
      id: 'shieldup', name: '光盾强化', rarity: RARE, weight: 4, max: 5,
      requires: 'shield',
      desc: '护盾层数 +1，恢复更快', icon: 'shield',
      apply: function (p) {
        p.shieldMax += 1;
        p.shield = p.shieldMax;
        p.shieldRegen = Math.max(1.0, p.shieldRegen * 0.76);
      }
    },
    {
      id: 'thorns', name: '荆棘', rarity: RARE, weight: 4, max: 6,
      desc: '受到伤害时灼伤周围的敌人', icon: 'thorn',
      apply: function (p) { p.thorns += 22; }
    },
    {
      id: 'lifesteal', name: '吸血', rarity: RARE, weight: 4, max: 5,
      desc: '每击杀一个敌人回复 3 点生命', icon: 'drop',
      apply: function (p) { p.lifesteal += 3; }
    },
    {
      id: 'secondwind', name: '不屈', rarity: LEGEND, weight: 2, max: 2,
      desc: '受到致命伤害时免于一死，并回复 40% 生命', icon: 'star',
      apply: function (p) { p.secondWind += 1; }
    },
    {
      id: 'berserk', name: '狂暴', rarity: LEGEND, weight: 2, max: 4,
      desc: '生命越低伤害越高，最高 +100%', icon: 'skull',
      apply: function (p) { p.berserk += 0.5; }
    },

    /* ---------------- mobility ---------------- */
    {
      id: 'speed', name: '疾行', rarity: COMMON, weight: 9, max: 9,
      desc: '移动速度 +15%', icon: 'wing',
      apply: function (p) { p.speed *= 1.15; }
    },
    {
      id: 'dash', name: '闪避精通', rarity: COMMON, weight: 7, max: 7,
      desc: '冲刺冷却 -22%', icon: 'bolt',
      apply: function (p) { p.dashCooldown *= 0.78; }
    },
    {
      id: 'dashdist', name: '长闪', rarity: COMMON, weight: 6, max: 5,
      desc: '冲刺距离 +22%', icon: 'up',
      apply: function (p) { p.dashDistance *= 1.22; }
    },
    {
      id: 'dashtrail', name: '灼热冲刺', rarity: RARE, weight: 4, max: 5,
      desc: '冲刺路径会灼伤经过的敌人', icon: 'fire',
      apply: function (p) { p.dashBurn += 26; }
    },
    {
      id: 'dashimpact', name: '冲刺冲击', rarity: RARE, weight: 4, max: 5,
      desc: '冲刺撞到的敌人受伤并被击退', icon: 'burst',
      apply: function (p) { p.dashImpact += 38; }
    },

    /* ---------------- economy / utility ---------------- */
    {
      id: 'xp', name: '汲取', rarity: COMMON, weight: 8, max: 6,
      desc: '获得经验 +35%', icon: 'star',
      apply: function (p) { p.xpMult *= 1.35; }
    },
    {
      id: 'pickup', name: '引力', rarity: COMMON, weight: 6, max: 5,
      desc: '经验拾取范围 +50%', icon: 'magnet',
      apply: function (p) { p.pickupRange *= 1.5; }
    },
    {
      id: 'loot', name: '战利品', rarity: RARE, weight: 4, max: 5,
      desc: '击杀有 14% 概率掉落一点生命', icon: 'drop',
      apply: function (p) { p.lootChance += 0.14; }
    },
    {
      id: 'luck', name: '幸运', rarity: LEGEND, weight: 2, max: 4,
      desc: '升级时多一个可选项', icon: 'star',
      apply: function (p) { p.extraChoices += 1; }
    },
    {
      id: 'slow', name: '时间沙漏', rarity: RARE, weight: 4, max: 6,
      desc: '所有敌人移动速度 -11%', icon: 'hourglass',
      apply: function (p) { p.enemySlow = Math.min(0.65, p.enemySlow + 0.11); }
    },
    {
      id: 'knock', name: '冲击', rarity: COMMON, weight: 6, max: 6,
      desc: '击退力度 +55%', icon: 'ring',
      apply: function (p) { p.knock *= 1.55; }
    }
  ];

  /* ---------- two pools ----------
     Levelling offers one card from each pool, so a choice is never "two stat bumps".
     The split is by role in combat, not by "is it a number": melee count +1 sits in
     offense even though it is technically a number, because it puts another visible
     thing on the screen. */

  var POOLS = {
    offense: [
      'dmg', 'rate', 'multi', 'pierce', 'bulletspeed', 'crit', 'critdmg', 'caliber',
      'homing', 'bounce',
      'orb', 'orbcount', 'orbspeed', 'orbdmg', 'orbrange',
      'boomerang', 'boomerangcount', 'boomerangspeed',
      'sentinel', 'sentinelcount', 'sentinelrate',
      'well', 'wellsize', 'split', 'splitcount', 'execute',
      'freeze', 'freezetime', 'ricochet', 'ricochetcount', 'ricochetpower',
      'shrapnel', 'shrapnelcount', 'splitchain', 'ring',
      'laser', 'laserpower', 'aura', 'aurasize', 'mine', 'minepower',
      'poison', 'poisonpower', 'mirror', 'mirrorcount',
      'overcharge', 'overchargefast', 'frenzy', 'frenzypower',
      'chain', 'explode', 'exploderange', 'burn', 'mark', 'chill',
      'berserk', 'pact', 'allin'
    ],
    survival: [
      'maxhp', 'regen', 'shield', 'shieldup', 'thorns', 'lifesteal', 'secondwind',
      'speed', 'dash', 'dashdist', 'dashtrail', 'dashimpact',
      'xp', 'pickup', 'loot', 'luck',
      'slow', 'knock', 'timestop', 'nova', 'novaup'
    ]
  };

  var POOL_OF = {};
  (function () {
    for (var poolName in POOLS) {
      for (var q = 0; q < POOLS[poolName].length; q++) POOL_OF[POOLS[poolName][q]] = poolName;
    }
  })();

  function inPool(id, whichPool) {
    if (!whichPool || whichPool === 'any') return true;
    return POOL_OF[id] === whichPool;
  }

  var byId = {};
  for (var i = 0; i < UPGRADES.length; i++) byId[UPGRADES[i].id] = UPGRADES[i];

  /* ---------- evolutions ----------
     A different kind of reward from stacking: when both parents are fully levelled,
     they fuse into something that is not just a bigger number. This gives a long run
     a goal to aim at, instead of hoping the pool hands over the right card. */

  var EVOLUTIONS = [
    {
      id: 'evoWheel', name: '刃轮', rarity: LEGEND, weight: 7, max: 1,
      parents: ['orb', 'orbdmg'], icon: 'orbit2',
      desc: '手里剑与磨刃融合：环绕 6 枚、轨道更大、刃更重',
      evolve: function (p) {
        p.orbitCount = Math.max(p.orbitCount, 6);
        p.orbitRadius *= 1.35;
        p.orbitSpeed *= 1.35;
        p.orbitDamage *= 2.0;
      }
    },
    {
      id: 'evoStorm', name: '雷暴', rarity: LEGEND, weight: 7, max: 1,
      parents: ['chain', 'ricochet'], icon: 'chain',
      desc: '闪电与弹跳融合：必定放电，链击更宽更痛',
      evolve: function (p) {
        p.chainChance = 1;
        p.chainTargets += 2;
        p.chainDamageMul += 0.5;
        p.ricochet += 1;
      }
    },
    {
      id: 'evoNova', name: '星爆', rarity: LEGEND, weight: 7, max: 1,
      parents: ['explode', 'exploderange'], icon: 'burst',
      desc: '轰爆与连锁爆融合：爆炸大幅扩张，本身也会连锁',
      evolve: function (p) {
        p.explodeRadius *= 1.8;
        p.explodeDamage *= 2.0;
      }
    },
    {
      id: 'evoFrost', name: '霜核', rarity: LEGEND, weight: 7, max: 1,
      parents: ['freeze', 'chill'], icon: 'ring',
      desc: '冰冻与缓流融合：命中即冻，冻住的目标爆得更狠',
      evolve: function (p) {
        p.freezePower += 0.8;
        p.chillFactor = Math.max(p.chillFactor, 0.6);
        p.explodeRadius = Math.max(p.explodeRadius, 30);
      }
    }
  ];

  for (i = 0; i < EVOLUTIONS.length; i++) byId[EVOLUTIONS[i].id] = EVOLUTIONS[i];

  /* An evolution only becomes offerable once every parent has hit its cap. */
  function evolutionReady(player, evo) {
    if ((player.upgrades[evo.id] || 0) >= evo.max) return false;
    for (var k = 0; k < evo.parents.length; k++) {
      var base = byId[evo.parents[k]];
      if (!base) return false;
      if ((player.upgrades[base.id] || 0) < base.max) return false;
    }
    return true;
  }

  /* Pure stat cards are dialled back so the behaviour cards actually show up. */
  var RARITY_SCALE = { common: 0.62, rare: 1.0, legend: 1.0 };

  /* Rarity weight drift: the longer a run goes, the more the pool tilts toward
     rare and legendary offers. This is the "late game should feel like a payoff"
     knob, not a difficulty knob. */
  function rarityWeight(base, rarity, level) {
    var scaled = base * (RARITY_SCALE[rarity] || 1);
    if (rarity === LEGEND) return scaled * (1 + level * 0.075);
    if (rarity === RARE) return scaled * (1 + level * 0.02);
    return scaled * Math.max(0.4, 1 - level * 0.03);
  }

  var Upgrades = {
    all: UPGRADES,
    evolutions: EVOLUTIONS,
    pools: POOLS,
    poolOf: function (id) { return POOL_OF[id] || null; },
    icons: {},   /* filled in by upgrade-icons.js, which owns all the artwork */
    get: function (id) { return byId[id]; },
    evolutionReady: evolutionReady,

    /* Draw `count` distinct offers the player can still take, weighted and never
       duplicated within one offer set.

       An upgrade that builds on a weapon is held back until that weapon exists:
       offering "+1 shuriken" to someone with no shuriken is not a choice, it is a
       wasted level. Filtering those out also raises the odds of the unlock itself,
       because the pool it competes with gets smaller. */
    roll: function (player, count, rng, whichPool) {
      var pool = [];
      var i, u;
      for (i = 0; i < UPGRADES.length; i++) {
        u = UPGRADES[i];
        var taken = player.upgrades[u.id] || 0;
        if (taken >= u.max) continue;
        if (u.requires && !(player.upgrades[u.requires] > 0)) continue;
        if (!inPool(u.id, whichPool)) continue;
        pool.push(u);
      }

      /* evolutions enter the pool only when both parents are capped: they are the
         payoff for committing to a line, not another generic card. All four are
         weapon fusions, so they belong to the offense side. */
      if (!whichPool || whichPool === 'any' || whichPool === 'offense') {
        for (i = 0; i < EVOLUTIONS.length; i++) {
          if (evolutionReady(player, EVOLUTIONS[i])) pool.push(EVOLUTIONS[i]);
        }
      }
      var picks = [];
      while (picks.length < count && pool.length > 0) {
        var total = 0;
        for (i = 0; i < pool.length; i++) {
          total += rarityWeight(pool[i].weight, pool[i].rarity, player.level);
        }
        var roll = (rng ? rng.next() : PG.rng.next()) * total;
        var idx = 0;
        for (i = 0; i < pool.length; i++) {
          roll -= rarityWeight(pool[i].weight, pool[i].rarity, player.level);
          if (roll <= 0) { idx = i; break; }
          idx = i;
        }
        picks.push(pool[idx]);
        pool.splice(idx, 1);
      }
      return picks;
    }
  };

  PG.Upgrades = Upgrades;
})();
