/* 钟楼契约 · daynight.js
   昼夜状态机。day 1..14，每天五段：晨 / 昼 / 昏 / 夜 / 结。
   vigor 是唯一的色调输入，0 = 正午，1 = 深夜。 */
(function () {
  'use strict';
  var B = window.Belfry;

  var ORDER = ['dawn', 'day', 'dusk', 'night', 'settle'];

  var LABEL = {
    dawn: '晨',
    day: '昼',
    dusk: '昏',
    night: '夜',
    settle: '结'
  };

  var HINT = {
    dawn: '喂养契约者，看今日的活。',
    day: '耕地、播种、浇水、锻造。天黑前把活干完。',
    dusk: '钟要响了。分配谁去打，谁留下。',
    night: '守住农场。打赢之后，斩或缚。',
    settle: '收拾今天的账。'
  };

  // vigor 曲线：每个阶段内部的起止值
  var VIGOR = {
    dawn: [0.34, 0.0],
    day: [0.0, 0.0],
    dusk: [0.0, 0.55],
    night: [1.0, 1.0],
    settle: [1.0, 0.40]
  };

  function DayNight() {
    this.day = 1;
    this.phase = 'dawn';
    this.t = 0;
    this.vigor = VIGOR.dawn[0];
    this.paused = true;
    this.finished = false;
  }

  DayNight.prototype.phaseLen = function (p) {
    return B.PHASE_LEN[p] || 10;
  };

  DayNight.prototype.remaining = function () {
    return Math.max(0, this.phaseLen(this.phase) - this.t);
  };

  DayNight.prototype.progress = function () {
    return B.clamp(this.t / this.phaseLen(this.phase), 0, 1);
  };

  DayNight.prototype.update = function (dt) {
    if (this.paused || this.finished) return null;
    this.t += dt;
    var len = this.phaseLen(this.phase);
    if (this.t >= len) {
      var overflow = this.t - len;
      var next = this.advance();
      this.t = overflow;
      if (next) return next;   // 返回刚进入的阶段名，供 game 层触发事件
    }
    this.vigor = this.vigorNow();
    return null;
  };

  DayNight.prototype.vigorNow = function () {
    var v = VIGOR[this.phase] || [0, 0];
    var p = this.progress();
    return B.clamp(B.lerp(v[0], v[1], p), 0, 1);
  };

  // 推进一步，跨天时返回 'newday'
  DayNight.prototype.advance = function () {
    var i = ORDER.indexOf(this.phase);
    if (i < ORDER.length - 1) {
      this.phase = ORDER[i + 1];
      return this.phase;
    }
    // settle 结束 -> 新的一天
    this.day++;
    if (this.day > B.TOTAL_DAYS) {
      this.finished = true;
      this.paused = true;
      return 'gameover';
    }
    this.phase = 'dawn';
    return 'newday';
  };

  // 立刻跳到指定阶段（调试与剧情用）
  DayNight.prototype.jump = function (phase) {
    if (ORDER.indexOf(phase) === -1) return;
    this.phase = phase;
    this.t = 0;
    this.vigor = this.vigorNow();
  };

  DayNight.prototype.label = function () { return LABEL[this.phase] || ''; };
  DayNight.prototype.hint = function () { return HINT[this.phase] || ''; };
  DayNight.prototype.isNight = function () { return this.phase === 'night'; };
  DayNight.prototype.isDay = function () { return this.phase === 'day'; };

  // 阶段序号，供判断"是否已经过了某一阶段"
  DayNight.prototype.order = DayNight.ORDER = ORDER;

  B.DayNight = DayNight;
})();
