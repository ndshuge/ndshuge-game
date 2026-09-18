/* LUMEN SIEGE - audio: every sound is synthesised at runtime. No files, no network.
 *
 * The strike sounds follow a layered recipe borrowed from percussive synthesis:
 * a sharp transient click, a filtered noise body, a low sine thump and a short
 * square crack. One layer alone reads as "beep"; four layers read as an impact.
 *
 * Kill cues climb a pentatonic scale while a kill streak is alive, so a hot run
 * literally sounds like it is going up.
 */
(function () {
  'use strict';
  var PG = (window.PG = window.PG || {});

  var ctx = null;
  var master = null;
  var sfxBus = null;
  var musicBus = null;
  var noiseBuf = null;
  var muted = false;

  var VOLUME = 0.62;
  var SFX_LEVEL = 0.95;
  var MUSIC_LEVEL = 0.8;

  /* ---------- note names, so cues can be written musically ---------- */

  var NOTE_IDX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

  function freq(name) {
    var m = /^([A-G]#?)(-?\d)$/.exec(name);
    if (!m) return 440;
    return 440 * Math.pow(2, (NOTE_IDX[m[1]] + (parseInt(m[2], 10) - 4) * 12 - 9) / 12);
  }

  /* ---------- kill streak: drives the rising kill cue ---------- */

  var KILL_STEPS = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27];  /* pentatonic, two octaves */
  var COMBO_WINDOW = 1.8;
  var combo = 0;
  var lastKillAt = -99;
  var lastHitAt = -99;

  function now() { return ctx ? ctx.currentTime : 0; }

  /* ---------- graph ---------- */

  function build() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC({ latencyHint: 'interactive' });

    master = ctx.createGain();
    master.gain.value = muted ? 0 : VOLUME;
    master.connect(ctx.destination);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = SFX_LEVEL;
    sfxBus.connect(master);

    musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_LEVEL;
    musicBus.connect(master);

    var len = Math.floor(ctx.sampleRate * 0.8);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = noiseBuf.getChannelData(0);
    var seed = 987654321;
    for (var i = 0; i < len; i++) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      data[i] = ((seed >>> 0) / 2147483648) - 1;
    }
    return true;
  }

  function ensure() {
    if (muted) return false;
    if (!ctx && !build()) return false;
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    return true;
  }

  /* ---------- primitives ---------- */

  var tone = function (t, o) {
    var o2 = ctx.createOscillator();
    var g = ctx.createGain();
    o2.type = o.type || 'square';
    o2.frequency.setValueAtTime(Math.max(1, o.f0), t);
    if (o.f1) o2.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + o.dur);
    var vol = o.vol == null ? 0.2 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    o2.connect(g);
    g.connect(o.dest || sfxBus);
    o2.start(t);
    o2.stop(t + o.dur + 0.03);
  };

  var noise = function (t, o) {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    var f = ctx.createBiquadFilter();
    f.type = o.ftype || 'bandpass';
    f.frequency.setValueAtTime(o.f0 || 1700, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.f1), t + o.dur);
    f.Q.value = o.q == null ? 0.8 : o.q;
    var g = ctx.createGain();
    var vol = o.vol == null ? 0.3 : o.vol;
    g.gain.setValueAtTime(Math.max(0.0002, vol), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f);
    f.connect(g);
    g.connect(o.dest || sfxBus);
    src.start(t);
    src.stop(t + o.dur + 0.03);
  };

  /* A layered percussive strike. brightness scales the whole stack, which is how
     a crit reads as "harder" without needing a separate sample. */
  function strike(t, options) {
    var b = options.bright || 1;
    var vol = options.vol == null ? 1 : options.vol;

    /* 1. transient click: the "attack" of the impact */
    noise(t, { ftype: 'highpass', f0: 5200 * b, dur: 0.012, vol: 0.20 * vol });
    /* 2. body: filtered noise coming down */
    noise(t, { ftype: 'bandpass', f0: 1700 * b, f1: 250, dur: 0.10, vol: 0.27 * vol, q: 0.7 });
    /* 3. thump: low sine drop */
    tone(t, { type: 'sine', f0: 165 * b, f1: 46, dur: 0.08, vol: 0.28 * vol });
    /* 4. crack: short square snap */
    tone(t, { type: 'square', f0: 2600 * b, f1: 1100 * b, dur: 0.04, vol: 0.10 * vol });
  }

  function arp(t, notes, opts) {
    var o = opts || {};
    var step = o.step || 0.085;
    var type = o.type || 'square';
    var dur = o.dur || 0.18;
    var vol = o.vol == null ? 0.1 : o.vol;
    for (var i = 0; i < notes.length; i++) {
      tone(t + i * step, { type: type, f0: freq(notes[i]), dur: dur, vol: vol });
    }
  }

  /* ---------- voices ---------- */

  var VOICES = {

    shot: function (t) {
      var b = 0.96 + Math.random() * 0.08;
      tone(t, { type: 'square', f0: 900 * b, f1: 320, dur: 0.055, vol: 0.055 });
      noise(t, { ftype: 'bandpass', f0: 3400 * b, f1: 1300, dur: 0.035, vol: 0.035, q: 1.2 });
    },

    hit: function (t) {
      var b = 0.93 + Math.random() * 0.15;
      strike(t, { bright: b, vol: 0.62 });
    },

    /* crits reuse the strike but push the whole stack brighter and louder */
    crit: function (t) {
      var b = 1.35 + Math.random() * 0.1;
      strike(t, { bright: b, vol: 0.85 });
      tone(t, { type: 'sine', f0: 1760 * b, dur: 0.12, vol: 0.07 });
    },

    kill: function (t) {
      var step = KILL_STEPS[Math.min(Math.max(combo - 1, 0), KILL_STEPS.length - 1)];
      var f = freq('E5') * Math.pow(2, step / 12);
      noise(t, { ftype: 'lowpass', f0: 2600, f1: 480, dur: 0.13, vol: 0.20 });
      tone(t, { type: 'sine', f0: 190, f1: 55, dur: 0.15, vol: 0.22 });
      tone(t, { type: 'triangle', f0: f, dur: 0.16, vol: 0.12 });
      tone(t, { type: 'sine', f0: f * 2, dur: 0.10, vol: 0.055 });
    },

    bigkill: function (t) {
      noise(t, { ftype: 'lowpass', f0: 1400, f1: 260, dur: 0.32, vol: 0.28 });
      tone(t, { type: 'sine', f0: 150, f1: 38, dur: 0.34, vol: 0.32 });
      var step = KILL_STEPS[Math.min(Math.max(combo - 1, 0), KILL_STEPS.length - 1)];
      var f = freq('A4') * Math.pow(2, step / 12);
      tone(t, { type: 'triangle', f0: f, dur: 0.24, vol: 0.13 });
      tone(t, { type: 'sine', f0: f * 1.5, dur: 0.30, vol: 0.08 });
    },

    hurt: function (t) {
      tone(t, { type: 'sawtooth', f0: 320, f1: 82, dur: 0.22, vol: 0.16 });
      noise(t, { ftype: 'lowpass', f0: 900, f1: 200, dur: 0.14, vol: 0.10 });
    },

    dash: function (t) {
      noise(t, { ftype: 'bandpass', f0: 900, f1: 4200, dur: 0.13, vol: 0.09, q: 1.6 });
      tone(t, { type: 'triangle', f0: 240, f1: 980, dur: 0.13, vol: 0.075 });
    },

    levelup: function (t) {
      arp(t, ['A4', 'C5', 'E5', 'A5'], { step: 0.075, type: 'square', dur: 0.20, vol: 0.095 });
      tone(t, { type: 'sine', f0: freq('A3'), dur: 0.5, vol: 0.10 });
      tone(t + 0.22, { type: 'triangle', f0: freq('E5') * 2, dur: 0.35, vol: 0.05 });
    },

    death: function (t) {
      tone(t, { type: 'sawtooth', f0: 340, f1: 38, dur: 0.9, vol: 0.17 });
      noise(t, { ftype: 'lowpass', f0: 700, f1: 120, dur: 0.8, vol: 0.12 });
      arp(t + 0.1, ['E4', 'C4', 'A3'], { step: 0.16, type: 'triangle', dur: 0.3, vol: 0.07 });
    },

    /* short, dull, and meant to be repeated: the low-health pulse */
    heartbeat: function (t) {
      tone(t, { type: 'sine', f0: 68, f1: 40, dur: 0.16, vol: 0.30 });
      tone(t + 0.15, { type: 'sine', f0: 58, f1: 33, dur: 0.20, vol: 0.19 });
    },

    shield: function (t) {
      tone(t, { type: 'triangle', f0: 1200, f1: 1800, dur: 0.18, vol: 0.09 });
      noise(t, { ftype: 'highpass', f0: 4000, dur: 0.14, vol: 0.07 });
    },

    chain: function (t) {
      noise(t, { ftype: 'highpass', f0: 3000, f1: 8000, dur: 0.09, vol: 0.10, q: 2 });
      tone(t, { type: 'square', f0: 1400, f1: 2600, dur: 0.07, vol: 0.06 });
    },

    boom: function (t) {
      noise(t, { ftype: 'lowpass', f0: 1800, f1: 200, dur: 0.28, vol: 0.26 });
      tone(t, { type: 'sine', f0: 200, f1: 44, dur: 0.26, vol: 0.28 });
      tone(t, { type: 'square', f0: 900, f1: 300, dur: 0.09, vol: 0.09 });
    },

    pick: function (t) {
      tone(t, { type: 'triangle', f0: 1180, f1: 1560, dur: 0.06, vol: 0.05 });
    },

    click: function (t) {
      tone(t, { type: 'square', f0: 660, dur: 0.045, vol: 0.07 });
    }
  };

  /* ---------- layered music ----------
     Four bars of Am - F - C - G, sixteen steps per bar.

     The groove is a real drum kit: kick on 1 and the "and" of 3, snare on 2 and 4,
     hats on eighths, clap doubling the backbeat. The backbeat is what makes this
     read as a groove rather than a metronome, so it is on from the first second
     and is never gated behind an intensity level.

     On top: hats, then a bouncing eighth bass, then the melody. Tempo lifts with
     intensity as well, so a hot run literally runs faster. */

  var BPM_BASE = 108;
  var BPM_LIFT = 7;
  var CHORDS = ['A2', 'F2', 'C3', 'G2'];
  /* root / minor third / fifth / minor third - a walking figure, not a pedal tone */
  var BASS_RUN = [1, 1.1892, 1.4983, 1.1892];
  var LEAD = [
    ['', '', 'A4', '', '', 'C5', '', '', 'E5', '', '', '', 'D5', '', 'C5', ''],
    ['', '', 'F4', '', '', 'A4', '', '', 'C5', '', '', '', 'A4', '', 'G4', ''],
    ['', '', 'C5', '', '', 'E5', '', '', 'G5', '', '', '', 'E5', '', 'D5', ''],
    ['', '', 'G4', '', '', 'B4', '', '', 'D5', '', '', '', 'B4', '', 'A4', '']
  ];

  var musicStep = 0;
  var nextStepTime = 0;

  /* Player-authored rhythm: every kill stamps the current sixteenth-note slot, so
     the track accumulates the player's own beat. Hit sounds stay un-quantised on
     purpose, because delaying the shot feedback to sit on the grid would wreck the
     feel; the groove is carried by these slots instead. */
  var SLOT_COUNT = 16;
  var SLOT_KINDS = ['kick', 'snare', 'hat', 'clap'];
  var drumSlots = new Array(SLOT_COUNT).fill(null);

  function stepDur(intensity) {
    return 60 / (BPM_BASE + (intensity || 0) * BPM_LIFT) / 4;
  }

  /* Which sixteenth note is sounding right now, worked back from the scheduler. */
  function currentSlot() {
    if (!ctx) return 0;
    var ahead = nextStepTime - ctx.currentTime;
    var stepsBack = ahead / stepDur(1);
    var playing = musicStep - stepsBack;
    return ((Math.round(playing) % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT;
  }

  function fillSlot() {
    if (!ctx) return;
    var idx = currentSlot();
    if (drumSlots[idx]) return;          /* keep the first stamp, like a groove */
    var filled = 0;
    for (var i = 0; i < SLOT_COUNT; i++) if (drumSlots[i]) filled++;
    if (filled >= SLOT_COUNT) return;
    drumSlots[idx] = SLOT_KINDS[filled % SLOT_KINDS.length];
    if (typeof PG.Audio.onSlotFilled === 'function') PG.Audio.onSlotFilled(filled + 1);
  }

  function drum(t, kind, vol) {
    if (kind === 'kick') kick(t, vol * 0.9);
    else if (kind === 'snare') snare(t, vol * 0.65);
    else if (kind === 'hat') hat(t, vol * 0.3);
    else clap(t, vol * 0.5);
  }

  /* ---------- drum kit ---------- */

  function kick(t, vol) {
    tone(t, { type: 'sine', f0: 150, f1: 40, dur: 0.14, vol: vol, dest: musicBus });
  }
  function snare(t, vol) {
    noise(t, { ftype: 'lowpass', f0: 2400, f1: 700, dur: 0.10, vol: vol * 0.85, dest: musicBus });
    tone(t, { type: 'triangle', f0: 210, f1: 150, dur: 0.06, vol: vol * 0.45, dest: musicBus });
  }
  function hat(t, vol) {
    noise(t, { ftype: 'highpass', f0: 6500, dur: 0.045, vol: vol, dest: musicBus });
  }
  function clap(t, vol) {
    noise(t, { ftype: 'bandpass', f0: 1400, q: 0.6, dur: 0.09, vol: vol, dest: musicBus });
  }

  function scheduleStep(s64, t, intensity) {
    var bar = (s64 >> 4) & 3;
    var s = s64 & 15;
    var root = freq(CHORDS[bar]);
    var M = musicBus;

    /* the kit: always on, never gated */
    if (s === 0) kick(t, 0.46);
    else if (s === 6 || s === 10) kick(t, 0.34);
    if (s === 4 || s === 12) snare(t, 0.30);

    /* chord roots */
    if (s === 0) tone(t, { type: 'triangle', f0: root, dur: 0.40, vol: 0.15, dest: M });
    if (s === 10) tone(t, { type: 'triangle', f0: root * 1.5, dur: 0.16, vol: 0.085, dest: M });

    /* L1 - eighth hats, accented on the beat */
    if (intensity >= 1 && (s % 2) === 0) {
      hat(t, (s % 4) === 0 ? 0.13 : 0.08);
    }

    /* L2 - bouncing eighth bass line */
    if (intensity >= 2 && (s % 2) === 0) {
      tone(t, { type: 'square', f0: root * 2 * BASS_RUN[(s >> 1) & 3], dur: 0.11, vol: 0.075, dest: M });
    }

    /* L3 - clap on the backbeat, melody on top */
    if (intensity >= 3) {
      if (s === 12) clap(t, 0.17);
      var n = LEAD[bar][s];
      if (n) tone(t, { type: 'triangle', f0: freq(n), dur: 0.16, vol: 0.070, dest: M });
    }

    /* snare fill into the loop point, so it does not sound stamped out */
    if (bar === 3 && (s === 13 || s === 15)) snare(t, 0.20);

    /* the player's own stamps, layered over the kit */
    var stamped = drumSlots[s];
    if (stamped) drum(t, stamped, 0.55);
  }

  /* ---------- public surface ---------- */

  function bumpCombo() {
    var t = now();
    if (t - lastKillAt < COMBO_WINDOW) combo++; else combo = 1;
    lastKillAt = t;
    return combo;
  }

  var Audio = {
    /* Called from a real user gesture so the context is allowed to start. */
    unlock: function () { ensure(); },

    play: function (name) {
      var voice = VOICES[name];
      if (!voice) return;
      if (!ensure()) return;
      if (name === 'kill' || name === 'bigkill') {
        bumpCombo();
        fillSlot();
      }
      /* A shared hit-throttle: without it a full screen of impacts turns to mud. */
      if (name === 'hit' || name === 'crit') {
        var t = now();
        if (t - lastHitAt < 0.035) return;
        lastHitAt = t;
      }
      try { voice(now()); } catch (e) { /* audio must never break the game */ }
    },

    /* Live kill streak, for the HUD. */
    combo: function () {
      return combo > 0 && now() - lastKillAt < COMBO_WINDOW ? combo : 0;
    },

    /* Advance the music clock. Called once per frame; schedules just ahead of the
       audio clock so timing does not ride on the render loop's jitter. */
    pump: function (intensity) {
      if (!ensure()) return;
      var lvl = intensity || 0;
      if (nextStepTime < ctx.currentTime - 0.5) nextStepTime = ctx.currentTime + 0.05;
      var ahead = ctx.currentTime + 0.15;
      var guard = 0;
      while (nextStepTime < ahead && guard++ < 24) {
        scheduleStep(musicStep, nextStepTime, lvl);
        musicStep = (musicStep + 1) & 63;
        nextStepTime += stepDur(lvl);
      }
    },

    resetMusic: function () {
      musicStep = 0;
      nextStepTime = ctx ? ctx.currentTime + 0.08 : 0;
      for (var i = 0; i < SLOT_COUNT; i++) drumSlots[i] = null;
    },

    /* How much of the beat grid the player has filled, for the HUD. */
    slotsFilled: function () {
      var n = 0;
      for (var i = 0; i < SLOT_COUNT; i++) if (drumSlots[i]) n++;
      return n;
    },

    slotCount: SLOT_COUNT,

    resetCombo: function () { combo = 0; lastKillAt = -99; lastHitAt = -99; },

    isMuted: function () { return muted; },

    setMuted: function (value) {
      muted = !!value;
      if (master) master.gain.value = muted ? 0 : VOLUME;
      return muted;
    },

    toggleMute: function () { return Audio.setMuted(!muted); }
  };

  PG.Audio = Audio;
  PG.Audio.freq = freq;
})();
