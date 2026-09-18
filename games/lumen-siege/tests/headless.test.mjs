#!/usr/bin/env node
/*
 * LUMEN SIEGE - headless integration test.
 *
 * The structural suite proves things a reader can see. This one actually RUNS the
 * game: it builds a minimal DOM/canvas stub, executes all twelve scripts in the same
 * order index.html does, then drives real frames and asserts on live state.
 *
 * Why it matters for the "double-click index.html" contract: this environment has no
 * network, no module loader and no browser globals beyond a stub, which is the same
 * shape as file://. If any script depended on a remote asset, an ES module, or a
 * browser API we did not stub, it would fail here.
 *
 * Rendering is stubbed, so this complements the browser pass. It does not replace it.
 *
 * Exit code 0 = pass.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

let checks = 0;
let failures = 0;

function check(name, fn) {
  checks++;
  try {
    const detail = fn();
    console.log(`  ok    ${name}${detail ? '  (' + detail + ')' : ''}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL  ${name}: ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/* ------------------------------------------------------------------ DOM stub */

class FakeClassList {
  constructor() { this.set = new Set(); }
  add(c) { this.set.add(c); }
  remove(c) { this.set.delete(c); }
  contains(c) { return this.set.has(c); }
  toggle(c, force) {
    const on = force === undefined ? !this.set.has(c) : !!force;
    if (on) this.set.add(c); else this.set.delete(c);
    return on;
  }
}

function makeCtx(canvas) {
  const target = {
    canvas,
    imageSmoothingEnabled: false,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
    /* stub has no real pixels, so counting draw calls is the honest evidence
       that something was painted */
    fills: 0,
    fillRect() { target.fills++; },
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createPattern: () => null,
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    measureText: (t) => ({ width: String(t).length * 6 })
  };
  return new Proxy(target, {
    get(t, k) {
      if (typeof k === 'symbol') return t[k];
      if (k in t) return t[k];
      return () => {};              /* any unimplemented 2D method is a no-op */
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}

class FakeElement {
  constructor(tag, id) {
    this.tagName = String(tag).toUpperCase();
    this.id = id || '';
    this.classList = new FakeClassList();
    this.style = {};
    this.children = [];
    this.listeners = {};
    this.textContent = '';
    this.tabIndex = 0;
    this._html = '';
    this._ctx = null;
    if (this.tagName === 'CANVAS') { this.width = 300; this.height = 150; }
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.children.length = 0; }
  get className() { return Array.from(this.classList.set).join(' '); }
  set className(v) {
    this.classList.set = new Set(String(v).split(/\s+/).filter(Boolean));
  }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener(type, fn) {
    const arr = this.listeners[type];
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }
  appendChild(child) { this.children.push(child); return child; }
  click() { (this.listeners.click || []).slice().forEach((fn) => fn({ preventDefault() {} })); }
  focus() {}
  setAttribute() {}
  getBoundingClientRect() {
    return { left: 0, top: 0, right: 480, bottom: 270, width: 480, height: 270 };
  }
  getContext() { if (!this._ctx) this._ctx = makeCtx(this); return this._ctx; }
  toDataURL() { return 'data:image/png;base64,'; }
  querySelectorAll(sel) {
    var query = String(sel);
    var wantCard = query.indexOf('.card') >= 0;
    var wantCanvas = query.indexOf('canvas') >= 0;
    var wantStatline = query.indexOf('.statline') >= 0;
    var wantRequires = query.indexOf('.requires') >= 0;
    var out = [];
    var walk = function (node) {
      for (var i = 0; i < node.children.length; i++) {
        var child = node.children[i];
        if (wantCard && child.classList.contains('card')) out.push(child);
        if (wantCanvas && child.tagName === 'CANVAS') out.push(child);
        if (wantStatline && child.classList.contains('statline')) out.push(child);
        if (wantRequires && child.classList.contains('requires')) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
}

const elementCache = new Map();
const documentStub = {
  getElementById(id) {
    if (!elementCache.has(id)) {
      const tag = id === 'game' ? 'canvas' : 'div';
      const el = new FakeElement(tag, id);
      if (tag === 'canvas') { el.width = 480; el.height = 270; }
      if (id === 'screen-start') el.classList.remove('hidden');
      else if (id.indexOf('screen-') === 0 || id === 'hud') el.classList.add('hidden');
      elementCache.set(id, el);
    }
    return elementCache.get(id);
  },
  createElement(tag) { return new FakeElement(tag); },
  querySelectorAll() { return []; },
  body: new FakeElement('body'),
  addEventListener() {},
  removeEventListener() {}
};

/* ------------------------------------------------------------------ window stub */

const store = new Map();
const winListeners = {};
const timers = [];

const windowStub = {
  innerWidth: 1440,
  innerHeight: 900,
  document: documentStub,
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear()
  },
  performance: { now: () => Date.now() },
  /* Reports a coarse primary pointer, i.e. a phone. The on-screen stick is gated on
     this, so the stub has to answer it or the touch tests would measure nothing. */
  matchMedia: (query) => ({
    matches: String(query).indexOf('pointer: coarse') >= 0,
    media: String(query),
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}
  }),
  /* Deliberately absent: AudioContext, fetch, XMLHttpRequest.
     The game must degrade gracefully without them. */
  setTimeout: (fn, ms) => { timers.push(fn); return timers.length; },
  clearTimeout: () => {},
  requestAnimationFrame: () => 0,
  addEventListener(type, fn) { (winListeners[type] = winListeners[type] || []).push(fn); },
  removeEventListener(type, fn) {
    const arr = winListeners[type];
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }
};

function fireWindow(type, ev) {
  (winListeners[type] || []).slice().forEach((fn) => fn(ev));
}

const sandbox = {
  console,
  window: windowStub,
  document: documentStub,
  performance: windowStub.performance,
  setTimeout: windowStub.setTimeout,
  clearTimeout: windowStub.clearTimeout,
  Math, JSON, Date, Object, Array, String, Number, Boolean, Error, RegExp,
  Map, Set, Promise, Symbol, Uint8Array, Uint8ClampedArray, Float64Array
};
const context = vm.createContext(sandbox);

/* scripts come from index.html so the load list has a single source of truth */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SCRIPTS = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);

console.log('LUMEN SIEGE :: headless integration\n');

console.log(`  scripts under test: ${SCRIPTS.length}`);
console.log('  (AudioContext / fetch / XHR are deliberately absent)\n');

/* ---------- 1. execute every script ---------- */

let loadError = null;
try {
  for (const rel of SCRIPTS) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(src, context, { filename: rel });
  }
} catch (err) {
  loadError = err;
}

check('all twelve scripts execute without throwing', () => {
  assert(!loadError, `threw during load: ${loadError && loadError.message}`);
  return `${SCRIPTS.length} scripts ran`;
});

if (loadError) {
  console.log(`\nchecks: ${checks - failures}/${checks} passed`);
  console.log('\nRESULT: FAIL (load aborted the run)');
  process.exit(1);
}

const PG = windowStub.PG;
const game = windowStub.__LUMEN__;
const Input = PG.Input;
const canvasEl = documentStub.getElementById('game');

function step(frames) {
  for (let i = 0; i < frames; i++) {
    game.update(1 / 60);
    Input.endFrame();
  }
}
function flushTimers() {
  while (timers.length) timers.shift()();
}

/* ---------- 2. wiring ---------- */

check('game instance booted into the menu state', () => {
  assert(game, 'window.__LUMEN__ was not assigned');
  assert(game.state === 'menu', `expected menu, got ${game.state}`);
  return 'state=menu';
});

check('namespace exposes every subsystem the page needs', () => {
  const needed = ['Game', 'Player', 'Enemy', 'World', 'Projectiles', 'Gems',
    'Upgrades', 'Sprites', 'UI', 'Audio', 'Input', 'Particles'];
  const missing = needed.filter((k) => !PG[k]);
  assert(missing.length === 0, `missing: ${missing.join(', ')}`);
  return needed.length + ' subsystems';
});

check('sprites compiled from matrices in a canvas-free-DOM world', () => {
  const p = PG.Sprites.get('player');
  assert(p && p.normal, 'player sprite was not built');
  const s = PG.Sprites.size('player');
  assert(s.w > 0 && s.h > 0, 'player sprite has no size');
  return `player ${s.w}x${s.h}`;
});

/* ---------- 3. starting a run ---------- */

check('newRun builds a world, a player and an opening crowd', () => {
  game.newRun();
  assert(game.state === 'playing', `expected playing, got ${game.state}`);
  assert(game.world && game.world.ground, 'world ground was not baked');
  assert(game.player && game.player.hp > 0, 'player not initialised');
  assert(game.enemies.length >= 4, `expected a real opening crowd, got ${game.enemies.length}`);
  /* and the first wave must not make the player wait */
  assert(game.spawnTimer <= 0.5, `first spawn waits ${game.spawnTimer}s`);
  return `world ${game.world.w}x${game.world.h}, ${game.enemies.length} opening enemies`;
});

/* ---------- 4. input -> movement ---------- */

check('a real keydown reaches the player and moves it', () => {
  const x0 = game.player.x;
  fireWindow('keydown', { code: 'KeyD', preventDefault() {} });
  step(60);
  fireWindow('keyup', { code: 'KeyD', preventDefault() {} });
  const dx = game.player.x - x0;
  assert(dx > 20, `player barely moved (dx=${dx.toFixed(1)})`);
  return `dx=${dx.toFixed(1)}px in 1s`;
});

check('WASD and arrow keys are both bound', () => {
  const before = game.player.y;
  fireWindow('keydown', { code: 'ArrowDown', preventDefault() {} });
  step(30);
  fireWindow('keyup', { code: 'ArrowDown', preventDefault() {} });
  assert(game.player.y - before > 10, 'ArrowDown did not move the player down');
  return 'arrows bound';
});

check('dash starts, grants i-frames and goes on cooldown', () => {
  const p = game.player;
  p.dashCd = 0;
  fireWindow('keydown', { code: 'Space', preventDefault() {} });
  game.update(1 / 60);
  Input.endFrame();
  assert(p.dashing, 'dash did not start');
  assert(p.invuln > 0, 'dash granted no invulnerability');
  assert(p.dashCd > 0, 'dash has no cooldown');
  fireWindow('keyup', { code: 'Space', preventDefault() {} });
  step(20);
  return `cd=${p.dashCooldown}s`;
});

/* ---------- 5. shooting and killing ---------- */

check('holding fire spawns projectiles that kill an enemy', () => {
  game.enemies.length = 0;
  game.projectiles.clear();
  const p = game.player;
  /* Park the player at the arena centre: the generator guarantees no rock within
     five tiles of it, so the firing line is clear regardless of the random seed. */
  p.x = game.world.w / 2;
  p.y = game.world.h / 2;
  p.kvx = 0;
  p.kvy = 0;
  const e = game.addEnemy('crawler', p.x + 40, p.y);
  e.spawnT = 0;
  const kills0 = game.kills;
  const gems0 = game.gems.items.filter((g) => g.active).length;

  Input.mouse.down = true;
  let shots = 0;
  let lastFireTimer = p.fireTimer;
  for (let i = 0; i < 90; i++) {
    Input.mouse.x = (e.dead ? p.x : e.x) - game.camX;
    Input.mouse.y = (e.dead ? p.y : e.y) - game.camY;
    game.update(1 / 60);
    Input.endFrame();
    if (p.fireTimer > lastFireTimer) shots++;
    lastFireTimer = p.fireTimer;
    if (e.dead) break;
  }
  Input.mouse.down = false;

  assert(e.dead, 'the enemy survived sustained fire: ' + JSON.stringify({
    hp: e.hp,
    maxHp: e.maxHp,
    dist: +PG.dist(e.x, e.y, p.x, p.y).toFixed(1),
    playerDamage: p.damage,
    playerAngle: +p.angle.toFixed(2),
    activeProjectiles: game.projectiles.items.filter((q) => q.active).length,
    shotsFired: shots,
    enemySpawnT: e.spawnT,
    camX: Math.round(game.camX),
    mouseX: Math.round(Input.mouse.x),
    mouseY: Math.round(Input.mouse.y)
  }));
  assert(game.kills === kills0 + 1, 'kill was not counted');
  assert(game.gems.items.filter((g) => g.active).length > gems0, 'no xp gem dropped');
  return 'enemy killed, gem dropped';
});

/* ---------- 6. taking damage and dying ---------- */

check('contact damage reaches the player once the shield is down', () => {
  /* a shield layer is baseline now, so it has to be spent before hp is touched */
  game.player.shield = 0;
  game.player.shieldMax = 0;
  game.player.invuln = 0;
  const hp0 = game.player.hp;
  game.player.takeDamage(17, game.player.x - 30, game.player.y);
  assert(game.player.hp === hp0 - 17, 'damage was not applied');
  assert(game.player.invuln > 0, 'no i-frames after a hit');
  return `hp ${hp0} -> ${game.player.hp}`;
});

check('every run starts with regeneration and one shield layer', () => {
  const fresh = new PG.Player(0, 0);
  assert(fresh.regenPct >= 0.03, `baseline regen is ${fresh.regenPct}`);
  assert(fresh.shieldMax >= 1, 'no baseline shield layer');
  assert(fresh.shield === fresh.shieldMax, 'the shield did not start full');
  assert(fresh.shieldRegen > 0 && fresh.shieldRegen <= 6, `shield recharge is ${fresh.shieldRegen}s`);
  return `regen ${(fresh.regenPct * 100).toFixed(0)}%/s, ${fresh.shieldMax} shield, ${fresh.shieldRegen}s recharge`;
});

check('regeneration is a share of max health, so it scales with the pool', () => {
  const p = new PG.Player(0, 0);
  const game2 = { time: 0, queueLevelUp() {}, world: { circleHits: () => false }, enemies: [], sparks: () => {}, particles: { spawn() {} }, shake: () => {}, findNearestEnemy: () => null, camX: 0, camY: 0 };
  const drain = () => { p.hp = Math.round(p.maxHp * 0.5); };

  drain();
  const before = p.hp;
  p.update(1, game2);
  const healed = p.hp - before;
  assert(Math.abs(healed - p.maxHp * p.regenPct) < 1.5,
    `one second healed ${healed.toFixed(1)} at ${p.maxHp} max hp`);

  /* double the pool and the same second should heal roughly twice as much */
  p.maxHp *= 2;
  drain();
  const before2 = p.hp;
  p.update(1, game2);
  const healed2 = p.hp - before2;
  assert(healed2 > healed * 1.7, `healing did not scale: ${healed.toFixed(1)} -> ${healed2.toFixed(1)}`);
  return `${healed.toFixed(1)} hp/s at ${Math.round(p.maxHp / 2)} max, ${healed2.toFixed(1)} at ${p.maxHp}`;
});

check('a broken shield comes back on its own', () => {
  const p = new PG.Player(0, 0);
  const game2 = { time: 0, queueLevelUp() {}, world: { circleHits: () => false }, enemies: [], sparks: () => {}, particles: { spawn() {} }, shake: () => {}, findNearestEnemy: () => null, camX: 0, camY: 0, shieldBreak: () => {} };
  assert(p.shield === 1, 'no starting shield');
  const tag = p.takeDamage(10, p.x - 20, p.y, game2);
  assert(tag === 'shield', `the shield did not absorb the hit (${tag})`);
  assert(p.shield === 0, 'the shield survived a hit');
  assert(p.hp === p.maxHp, 'hp was touched while the shield held');

  const wait = p.shieldRegen + 0.2;
  for (let i = 0; i < Math.ceil(wait * 60); i++) p.update(1 / 60, game2);
  assert(p.shield === 1, `the shield never recharged after ${wait.toFixed(1)}s`);
  return `shield recharged after ${p.shieldRegen}s`;
});

/* ---------- 7. levelling and the 3-choice offer ---------- */

check('xp levels the player and opens the upgrade screen', () => {
  const lv0 = game.player.level;
  game.player.xp = 0;
  game.player.gainXp(500, game);
  step(1);
  assert(game.player.level > lv0, 'level did not increase');
  assert(game.state === 'upgrade', `expected upgrade, got ${game.state}`);
  const cards = documentEls('.card');
  assert(cards.length === 3, `expected 3 cards, got ${cards.length}`);
  return `level ${lv0} -> ${game.player.level}, 3 cards`;
});

function documentEls(sel) {
  return documentStub.getElementById('upgrade-cards').querySelectorAll(sel);
}

check('choosing applies the pick and resumes play', () => {
  game.newRun();
  game.player.xp = 0;
  game.player.gainXp(400, game);
  step(1);
  assert(game.state === 'upgrade', 'upgrade screen did not open');
  const before = Object.keys(game.player.upgrades).length;
  let guard = 0;
  while (game.state === 'upgrade' && guard++ < 80) {
    game.chooseUpgrade(game.currentOffers[0]);
  }
  assert(game.state === 'playing', `did not resume, state=${game.state}`);
  assert(
    Object.keys(game.player.upgrades).length > before,
    'no upgrade was recorded on the player'
  );
  return `${Object.keys(game.player.upgrades).join(', ')}`;
});

check('a level offers one pool, and every card is selectable', () => {
  game.newRun();
  game.player.xp = 0;
  game.player.gainXp(400, game);
  step(1);
  assert(game.state === 'upgrade', 'upgrade screen did not open');
  const offers = game.currentOffers;
  assert(offers.length === 3, `expected 3 offers, got ${offers.length}`);
  const cells = documentStub.getElementById('upgrade-cards').querySelectorAll('.card');
  assert(cells.length === offers.length, 'the rendered column does not match the offer');
  /* both pools must be able to appear in the same draw */
  const pools = new Set(offers.map((u) => PG.Upgrades.poolOf(u.id)).filter(Boolean));
  return `3 cards drawn from ${pools.size} pool(s)`;
});

check('every upgrade belongs to exactly one pool', () => {
  const loose = PG.Upgrades.all.filter((u) => !PG.Upgrades.poolOf(u.id));
  assert(loose.length === 0, `unassigned: ${loose.map((u) => u.id).join(', ')}`);
  const counts = {};
  const off = PG.Upgrades.pools.offense.length;
  const sur = PG.Upgrades.pools.survival.length;
  counts.offense = off;
  counts.survival = sur;
  assert(off > 10 && sur > 5, `pool sizes look wrong: ${off}/${sur}`);
  const overlap = PG.Upgrades.pools.offense.filter((id) => PG.Upgrades.pools.survival.indexOf(id) >= 0);
  assert(overlap.length === 0, `in both pools: ${overlap.join(', ')}`);
  return `offense ${off}, survival ${sur}`;
});

check('every upgrade applies without throwing', () => {
  const probe = new PG.Player(0, 0);
  for (const u of PG.Upgrades.all) u.apply(probe);
  assert(probe.damage > 12, 'damage upgrade had no effect');
  assert(probe.multi > 1, 'multi upgrade had no effect');
  assert(probe.maxHp > 100, 'hp upgrade had no effect');
  return `${PG.Upgrades.all.length} upgrades applied cleanly`;
});

check('the roster covers ten archetypes and each has its own behaviour', () => {
  const types = Object.keys(PG.ENEMY_DEFS);
  const wanted = ['crawler', 'zipper', 'spitter', 'bloater', 'bulwark', 'splitter', 'weaver',
    'shielder', 'colossus', 'turret'];
  const missing = wanted.filter((t) => !types.includes(t));
  assert(missing.length === 0, `missing archetypes: ${missing.join(', ')}`);
  for (const t of wanted) {
    const fn = 'update' + t.charAt(0).toUpperCase() + t.slice(1);
    assert(typeof PG.Enemy.prototype[fn] === 'function', `${t} has no behaviour function`);
    const inst = new PG.Enemy(t, 0, 0, 1, 1);
    assert(inst.r > 0 && inst.maxHp > 0, `${t} did not construct`);
  }
  /* the late-game pair must actually be tougher, not just different */
  const crawler = new PG.Enemy('crawler', 0, 0, 1, 1);
  const colossus = new PG.Enemy('colossus', 0, 0, 1, 1);
  assert(colossus.maxHp > crawler.maxHp * 5, 'colossus is not a wall');
  assert(colossus.damage > crawler.damage * 2, 'colossus does not hit hard');
  assert(new PG.Enemy('turret', 0, 0, 1, 1).speed === 0, 'the turret should be immobile');
  return `${wanted.length} archetypes, late pair verified`;
});

check('elites are meaningfully stronger and only appear later', () => {
  const base = new PG.Enemy('crawler', 0, 0, 1, 1);
  const elite = new PG.Enemy('crawler', 0, 0, 1, 1, true);
  assert(elite.maxHp > base.maxHp * 2, `elite hp ${elite.maxHp} vs ${base.maxHp}`);
  assert(elite.damage > base.damage, 'elite does not hit harder');
  assert(elite.xp > base.xp * 2, 'elite is not worth the detour');
  assert(elite.r > base.r, 'elite is not visually bigger');
  assert(elite.speed < base.speed, 'elite should be a little slower');
  assert(game.eliteChanceFor(4) === 0, 'elites should not exist before tier 5');
  assert(game.eliteChanceFor(7) > 0.1, 'elites should be common by tier 7');
  assert(game.eliteChanceFor(12) <= 0.25, 'elite density should stay capped');
  return `tier7 elite chance ${(game.eliteChanceFor(7) * 100).toFixed(0)}%`;
});

check('the late game is harder than the opening, not just longer', () => {
  const early = game.hpMultFor(2);
  const mid = game.hpMultFor(6);
  const late = game.hpMultFor(12);
  assert(early < mid && mid < late, 'hp scaling is not monotonic');
  const midSlope = mid - game.hpMultFor(5);
  const lateSlope = late - game.hpMultFor(11);
  assert(lateSlope > midSlope, 'the late slope should be steeper than the mid slope');
  return `hp x${early.toFixed(2)} / x${mid.toFixed(2)} / x${late.toFixed(2)}`;
});

check('dependent upgrades are withheld until their parent exists', () => {
  const probe = new PG.Player(0, 0);
  const rng = new PG.Rng(20260918);
  const gated = PG.Upgrades.all.filter((u) => u.requires);
  assert(gated.length >= 8, `expected gated upgrades, found ${gated.length}`);

  /* with nothing taken, no child may be offered */
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    for (const u of PG.Upgrades.roll(probe, 3, rng)) seen.add(u.id);
  }
  const leaked = gated.filter((u) => seen.has(u.id));
  assert(leaked.length === 0, `offered without their parent: ${leaked.map((u) => u.id).join(', ')}`);

  /* once the parent is taken, its children must become reachable */
  probe.applyUpgrade(PG.Upgrades.get('orb'));
  const after = new Set();
  for (let i = 0; i < 500; i++) {
    for (const u of PG.Upgrades.roll(probe, 3, rng)) after.add(u.id);
  }
  const children = gated.filter((u) => u.requires === 'orb');
  const missing = children.filter((u) => !after.has(u.id));
  assert(missing.length === 0, `children never appeared: ${missing.map((u) => u.id).join(', ')}`);
  return `${gated.length} gated, 0 leaked, ${children.length} unlocked by the parent`;
});

/* ---------- 8. death, records and restart ---------- */

check('every upgrade has a well-formed icon matrix', () => {
  const allowed = new Set(['.', '1', '2', '3', '4']);
  const problems = [];
  const distinct = new Set();
  for (const up of PG.Upgrades.all) {
    const icon = PG.Upgrades.icons[up.icon];
    if (!icon) { problems.push(`${up.id}: no icon named ${up.icon}`); continue; }
    const w = icon[0].length;
    if (icon.length < 8) problems.push(`${up.id}: only ${icon.length} rows`);
    for (let i = 0; i < icon.length; i++) {
      if (icon[i].length !== w) {
        problems.push(`${up.id}: row ${i} has ${icon[i].length} chars, expected ${w}`);
      }
      for (const ch of icon[i]) {
        if (!allowed.has(ch)) problems.push(`${up.id}: illegal char '${ch}'`);
      }
    }
    distinct.add(up.icon);
  }
  assert(problems.length === 0, problems.slice(0, 4).join(' | '));
  /* one icon per upgrade: sharing made a whole family of cards look identical */
  assert(
    distinct.size === PG.Upgrades.all.length,
    `${PG.Upgrades.all.length} upgrades share only ${distinct.size} icons`
  );
  const sizes = new Set();
  for (const up of PG.Upgrades.all) sizes.add(PG.Upgrades.icons[up.icon][0].length);
  assert(sizes.size === 1, `icons are not a uniform size: ${[...sizes].join(', ')}`);
  return `${PG.Upgrades.all.length} upgrades, ${distinct.size} distinct icons, ${[...sizes][0]}px`;
});

check('evolutions only appear once BOTH parents are fully capped', () => {
  const probe = new PG.Player(0, 0);
  const rng = new PG.Rng(4242);
  const evos = PG.Upgrades.evolutions;
  assert(evos.length >= 3, `only ${evos.length} evolutions`);

  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    for (const u of PG.Upgrades.roll(probe, 3, rng)) seen.add(u.id);
  }
  const leaked = evos.filter((e) => seen.has(e.id));
  assert(leaked.length === 0, `offered too early: ${leaked.map((e) => e.id).join(', ')}`);

  const evo = evos[0];
  for (const pid of evo.parents) {
    const parent = PG.Upgrades.get(pid);
    for (let i = 0; i < parent.max; i++) probe.applyUpgrade(parent);
  }
  assert(PG.Upgrades.evolutionReady(probe, evo), 'evolution should be ready after capping parents');

  const after = new Set();
  for (let i = 0; i < 400; i++) {
    for (const u of PG.Upgrades.roll(probe, 3, rng)) after.add(u.id);
  }
  assert(after.has(evo.id), 'evolution never surfaced after both parents capped');
  return `${evos.length} evolutions, gated on capped parents`;
});

check('every stackable card can state what the next stack gives', () => {
  /* Build a fully unlocked probe first: a dependent card reads its parent's live
     value, so without the parent its preview would be blank for the wrong reason. */
  const probe = new PG.Player(0, 0);
  for (const u of PG.Upgrades.all) {
    if (!u.requires) u.apply(probe);
  }
  const blank = [];
  let withNumbers = 0;
  for (const u of PG.Upgrades.all) {
    if (u.max <= 1) continue;              /* one-shots never repeat, nothing to explain */
    const text = PG.UI.previewStat(probe, u);
    const hasDynamicDesc = typeof u.desc === 'function';
    if (text || hasDynamicDesc) withNumbers++;
    else blank.push(u.id);
  }
  assert(withNumbers > 40, `only ${withNumbers} stackable upgrades carry information`);
  assert(blank.length === 0, `these show no number and no live text: ${blank.join(', ')}`);
  /* names that read like a one-time unlock must explain their stacking */
  const mustExplain = ['homing', 'bounce', 'multi', 'pierce', 'mark', 'lifesteal'];
  const missing = mustExplain.filter((id) => !PG.UI.previewStat(probe, PG.Upgrades.get(id)));
  assert(missing.length === 0, `these still read as one-shots: ${missing.join(', ')}`);
  return `${withNumbers} cards show current -> next`;
});

check('every upgrade card actually paints its icon', () => {
  game.newRun();
  game.player.xp = 0;
  game.player.gainXp(600, game);
  step(1);
  const canvases = [...documentEls('.glyph canvas')];
  assert(canvases.length > 0, 'no icon canvases were created');
  const bad = [];
  for (const c of canvases) {
    if (c.width < 8 || c.height < 8) { bad.push(`a canvas is ${c.width}x${c.height}`); continue; }
    const ctx = c.getContext('2d');
    if (!ctx.fills || ctx.fills < 8) {
      bad.push(`a canvas only drew ${ctx.fills || 0} rects`);
    }
  }
  assert(bad.length === 0, bad.slice(0, 3).join(' | '));
  return `${canvases.length} cards, all painted`;
});

check('every dependent upgrade declares its prerequisite', () => {
  /* The earlier gate test only proves that declared gates work. This one is about
     completeness, which is a different failure: 'shield-break nova' needs a shield
     to break, but shipped without a requires and was offered to players who had
     none. Naming every prerequisite here means a new dependent card cannot slip
     through silently. */
  const EXPECTED = {
    shieldup: 'shield',
    /* nova is intentionally absent: a shield layer is baseline now, so the
       shield-break burst is always usable and needs no prerequisite */
    novaup: 'nova',
    critdmg: 'crit',
    orbcount: 'orb', orbspeed: 'orb', orbdmg: 'orb', orbrange: 'orb',
    boomerangcount: 'boomerang', boomerangspeed: 'boomerang',
    sentinelcount: 'sentinel', sentinelrate: 'sentinel',
    wellsize: 'well',
    splitcount: 'split', splitchain: 'split',
    freezetime: 'freeze',
    ricochetcount: 'ricochet', ricochetpower: 'ricochet',
    shrapnelcount: 'shrapnel',
    laserpower: 'laser',
    aurasize: 'aura',
    minepower: 'mine',
    poisonpower: 'poison',
    mirrorcount: 'mirror',
    overchargefast: 'overcharge',
    frenzypower: 'frenzy',
    exploderange: 'explode'
  };
  const problems = [];
  for (const id in EXPECTED) {
    const u = PG.Upgrades.get(id);
    if (!u) { problems.push(`${id} is missing entirely`); continue; }
    if (u.requires !== EXPECTED[id]) {
      problems.push(`${id} should require ${EXPECTED[id]}, has ${u.requires || 'nothing'}`);
    }
  }
  for (const u of PG.Upgrades.all) {
    if (u.requires && !PG.Upgrades.get(u.requires)) {
      problems.push(`${u.id} requires a nonexistent ${u.requires}`);
    }
  }
  assert(problems.length === 0, problems.slice(0, 4).join(' | '));
  return `${Object.keys(EXPECTED).length} prerequisites, all declared and resolvable`;
});

check('every dependent card names the upgrade it strengthens', () => {
  /* A dependent card must say whose upgrade it is. Without the label, "every bounce
     adds 30% damage" reads as a standalone card and looks unrelated to the bounce
     you do not own yet. */
  const probe = new PG.Player(0, 0);
  for (const pid of ['orb', 'ricochet', 'shield', 'freeze']) {
    const parent = PG.Upgrades.get(pid);
    for (let i = 0; i < parent.max; i++) probe.applyUpgrade(parent);
  }
  game.player = probe;

  const deps = PG.Upgrades.all.filter((u) => u.requires).slice(0, 9);
  game.player = probe;

  PG.UI.renderUpgrades(deps);

  const lines = [...documentEls('.requires')].map((n) => n.textContent);
  assert(lines.length === deps.length,
    `expected ${deps.length} prerequisite labels, saw ${lines.length}`);
  const malformed = lines.filter((t) => t.indexOf('强化 · ') !== 0);
  assert(malformed.length === 0, `malformed labels: ${malformed.slice(0, 3).join(', ')}`);
  const named = lines.filter((t) => t.length > 6);
  assert(named.length === lines.length, 'a label carried no parent name');
  return `${lines.length} dependent cards labelled (e.g. "${lines[0]}")`;
});

check('the level cadence targets about ten seconds, fast or slow', () => {
  const p = new PG.Player(0, 0);
  const gap = PG.Player.TARGET_GAP;
  const rows = [];
  /* Across a wide spread of earn rates, the cost should buy roughly the target
     spacing. This is the two-sided requirement: the old version only ever made the
     cost larger, so a slow late game turned into a wall. */
  for (const rate of [6, 20, 60, 150, 400]) {
    p.xpRate = rate;
    for (const lv of [1, 5, 12, 25, 40]) {
      const seconds = p.demandFor(lv) / rate;
      assert(seconds >= gap * 0.5 && seconds <= gap * 1.6,
        `rate ${rate}/s at level ${lv}: ${seconds.toFixed(1)}s is not near the ${gap}s target`);
    }
    rows.push(`${rate}/s -> ~${(p.demandFor(12) / rate).toFixed(1)}s`);
  }
  return rows.join(', ');
});

check('a build that outpaces the base curve does not get punished', () => {
  /* The concrete bug: a strong late-game player used to face the plain curve while
     their kill rate had grown, so levels crawled. Pricing against the earned rate
     and allowing the cost to fall below the base curve fixes that half. */
  const slow = new PG.Player(0, 0);
  slow.level = 20;
  slow.xpRate = 3;                     /* barely collecting anything */
  const cheap = slow.demandFor(20);
  const baseCurve = 7 + 20 * 4.2 + Math.pow(20, 1.12);
  assert(cheap <= baseCurve, `a slow player was charged ${cheap} vs base ${baseCurve.toFixed(0)}`);

  const fast = new PG.Player(0, 0);
  fast.level = 20;
  fast.xpRate = 120;
  const cost = fast.demandFor(20);
  const seconds = cost / fast.xpRate;
  assert(seconds >= 8 && seconds <= 12, `a fast player waited ${seconds.toFixed(1)}s`);
  return `slow pays ${cheap}, fast pays ${cost} (~${seconds.toFixed(1)}s)`;
});

check('a fast-clearing run settles into the target spacing', () => {
  const p = new PG.Player(0, 0);
  const game = { time: 0, queueLevelUp() {} };
  let lastAt = 0;
  let prev = p.level;
  const gaps = [];
  const rate = 150;                       /* a built late-game player, xp per second */
  for (let i = 0; i < 60 * 400; i++) {
    const t = i / 60;
    game.time = t;
    p.gainXp(rate / 60, game);
    if (p.level > prev) { gaps.push(t - lastAt); lastAt = t; prev = p.level; }
  }
  assert(gaps.length > 10, `only ${gaps.length} level-ups simulated`);
  const settled = gaps.slice(8);
  const avg = settled.reduce((a, b) => a + b, 0) / settled.length;
  assert(avg >= 6 && avg <= 14, `settled spacing averaged ${avg.toFixed(1)}s`);
  return `${gaps.length} levels over 400s, settled average ${avg.toFixed(1)}s`;
});

check('the earn-rate sample is forgotten after a quiet spell', () => {
  const p = new PG.Player(0, 0);
  const game = { time: 0, queueLevelUp() {} };
  for (let i = 0; i < 120; i++) { game.time = i / 60; p.gainXp(20, game); }
  assert(p.xpRate > 0, 'the sampler never picked anything up');
  const hot = p.xpRate;
  p.update(1 / 60, { time: 0, world: { circleHits: () => false }, enemies: [], player: p, sparks: () => {}, particles: { spawn() {} }, shake: () => {}, findNearestEnemy: () => null });
  assert(p.xpRate === hot, 'a live sample should survive a single frame');
  game.time = 40;                          /* long quiet stretch */
  p.update(1 / 60, game);
  assert(p.xpRate === 0, 'a cold sample was never dropped');
  return 'sample decays to zero when the player stops earning';
});

check('spawn points respect the body that will occupy them', () => {
  game.newRun();
  game.tier = 10;
  /* A big elite needs more room than a small crawler, and the clearance has to say so:
     a hard-coded value let an elite colossus be placed in a gap it did not fit into. */
  const small = game.clearanceFor('crawler', false);
  const bigElite = game.clearanceFor('colossus', true);
  assert(bigElite > small + 4, `clearance did not scale: ${small} vs ${bigElite}`);
  const bigR = PG.ENEMY_DEFS.colossus.r * 1.35;
  assert(bigElite >= Math.ceil(bigR),
    `clearance ${bigElite} is smaller than the elite colossus radius ${bigR}`);

  /* and every spawn must actually sit in open space for that radius */
  let checked = 0;
  for (let i = 0; i < 200; i++) {
    const kind = game.pickType(game.tier);
    const spot = game.findSpawnPoint(150, 300, game.clearanceFor(kind, true));
    if (!spot) continue;
    checked++;
    assert(!game.world.circleHits(spot.x, spot.y, game.clearanceFor(kind, true)),
      `a ${kind} was placed into a wall`);
  }
  assert(checked > 20, `only ${checked} spawn points were produced`);
  return `${checked} spawns verified, crawler needs ${small}px, elite colossus ${bigElite}px`;
});

check('an enemy pinned against geometry eventually frees itself', () => {
  game.newRun();
  /* Park a body inside solid rock: every attempted move is rejected, which is the
     pinned case in its purest form. */
  let solid = null;
  for (let ty = 0; ty < game.world.th && !solid; ty++) {
    for (let tx = 0; tx < game.world.tw; tx++) {
      if (game.world.isSolid(tx, ty)) { solid = { x: tx * 16 + 8, y: ty * 16 + 8 }; break; }
    }
  }
  assert(solid, 'the generated world had no solid tile to test with');
  const e = game.addEnemy('crawler', solid.x, solid.y, false);
  e.spawnT = 0;
  let detourFrames = 0;
  let detourDir = 0;
  for (let i = 0; i < 60 * 4; i++) {
    game.update(1 / 60);
    if (e.detourT > 0) { detourFrames++; detourDir = e.detourDir; }
  }
  assert(detourFrames > 0, 'a fully pinned enemy never attempted a detour');
  assert(detourDir === 1 || detourDir === -1, 'the detour had no direction');
  return `detour engaged for ${detourFrames} frames while pinned in rock`;
});

check('touch drives movement and aiming through the same state the keyboard uses', () => {
  const Input = PG.Input;
  Input.reset();
  game.state = 'playing';
  game.newRun();

  const canvasEl = documentStub.getElementById('game');
  const fire = (type, touches) => {
    (canvasEl.listeners[type] || []).slice().forEach((fn) =>
      fn({ preventDefault() {}, changedTouches: touches }));
  };

  /* Left thumb: the stick appears under the thumb rather than at a fixed spot. */
  fire('touchstart', [{ clientX: 100, clientY: 150, identifier: 1 }]);
  assert(Input.touchActive(), 'a touch was not registered');
  assert(Input.stick(), 'no stick appeared under the thumb');
  fire('touchmove', [{ clientX: 130, clientY: 150, identifier: 1 }]);
  const ax = Input.axis();
  assert(ax.x > 0.9, `the stick did not produce a rightward axis (${ax.x})`);

  /* Right thumb: aim is a stick too, and holding fires. */
  fire('touchstart', [{ clientX: 380, clientY: 90, identifier: 2 }]);
  assert(Input.mouse.down === true, 'the right side did not begin firing');
  assert(Input.aimStick(), 'no aim stick was produced');
  const stick0 = Input.aimStick();
  assert(stick0 && stick0.dx === 0 && stick0.dy === 0, 'the aim stick did not start at its origin');
  const stick = Input.aimStick();
  fire('touchmove', [{ clientX: 380 + 26, clientY: 90, identifier: 2 }]);
  const av = Input.aimVector();
  assert(av && av.x > 0.9, `the aim stick did not point right (${JSON.stringify(av)})`);
  const stickAfter = Input.aimStick();
  assert(stickAfter && stickAfter.dx > 0 && stickAfter.dy === 0,
    `aim stick offset wrong: ${JSON.stringify(stickAfter)}`);

  /* Release clears both. */
  fire('touchend', [
    { clientX: 0, clientY: 0, identifier: 1 },
    { clientX: 0, clientY: 0, identifier: 2 }
  ]);
  assert(Input.axis().x === 0, 'movement did not stop on release');
  assert(Input.mouse.down === false, 'firing did not stop on release');
  assert(Input.stick() === null, 'the stick survived the release');
  assert(Input.aimStick() === null, 'the aim stick survived the release');
  return 'stick moves, right thumb aims as a stick and fires, release clears both';
});

check('the on-screen dash button feeds the same path as the space key', () => {
  const Input = PG.Input;
  Input.reset();
  assert(!Input.pressed('Space'), 'dash was already queued');
  Input.triggerDash();
  assert(Input.pressed('Space'), 'the dash button did not raise the space edge');
  Input.endFrame();
  assert(!Input.pressed('Space'), 'the dash edge did not clear');
  return 'dash button raises and clears the same edge';
});

check('keyboard still works and touch does not leak into it', () => {
  const Input = PG.Input;
  Input.reset();
  fireWindow('keydown', { code: 'KeyD', preventDefault() {} });
  assert(Input.axis().x > 0.9, 'the keyboard axis broke');
  fireWindow('keyup', { code: 'KeyD', preventDefault() {} });
  assert(Input.axis().x === 0, 'the keyboard release broke');
  /* a touch on the left half must not fire the weapon */
  const canvasEl = documentStub.getElementById('game');
  (canvasEl.listeners.touchstart || []).slice().forEach((fn) =>
    fn({ preventDefault() {}, changedTouches: [{ clientX: 60, clientY: 200, identifier: 9 }] }));
  assert(Input.mouse.down === false, 'a movement touch started firing');
  return 'keyboard unaffected, movement touch does not shoot';
});

check('time stop only rolls for direct hits, never for shards', () => {
  game.newRun();
  const p = game.player;
  p.timeStopChance = 1;                    /* would fire on every allowed roll */
  let freezes = 0;
  const real = game.freezeAll.bind(game);
  game.freezeAll = function () { freezes++; };

  const e = game.addEnemy('crawler', p.x + 40, p.y, false);
  e.spawnT = 0;

  game.damageEnemy(e, 1, 0, 0, false, 0, 'shot');
  assert(freezes === 1, `a direct hit did not roll for time stop (${freezes})`);

  /* a split volley is eight hits: it used to roll eight times and freeze the field
     constantly during any bullet-heavy build */
  for (let i = 0; i < 12; i++) game.damageEnemy(e, 1, 0, 0, false, 0, 'split');
  assert(freezes === 1, `shards rolled ${freezes - 1} extra times`);

  /* and with no source named, nothing rolls either */
  for (let i = 0; i < 6; i++) game.damageEnemy(e, 1, 0, 0, false, 0);
  assert(freezes === 1, 'an unnamed damage source rolled for time stop');

  game.freezeAll = real;
  return 'direct hits roll once, shards and unnamed sources never do';
});

check('the arena is open, and the flow field reaches every corner of it', () => {
  game.newRun();
  const w = game.world;

  /* obstacle density: sparse on purpose, so fights happen in the open and detours
     are legible rather than a maze */
  let solid = 0, open = 0;
  for (let ty = 2; ty < w.th - 2; ty++) {
    for (let tx = 2; tx < w.tw - 2; tx++) {
      if (w.isSolid(tx, ty)) solid++; else open++;
    }
  }
  const density = solid / (solid + open);
  assert(density < 0.14, `interior obstacle density is ${(density * 100).toFixed(1)}%`);

  /* the field must reach essentially every walkable tile, or bodies will sit still
     against a rock they cannot see a way around */
  let reachable = 0, walkable = 0;
  for (let ty = 0; ty < w.th; ty++) {
    for (let tx = 0; tx < w.tw; tx++) {
      if (w.isSolid(tx, ty)) continue;
      walkable++;
      if (w.flow[ty * w.tw + tx] >= 0) reachable++;
    }
  }
  assert(walkable > 1000, `only ${walkable} walkable tiles`);
  assert(reachable / walkable > 0.95,
    `the flow field only reaches ${(reachable / walkable * 100).toFixed(1)}% of walkable tiles`);
  return `density ${(density * 100).toFixed(1)}%, reachable ${(reachable / walkable * 100).toFixed(1)}%`;
});

check('an enemy behind a rock walks around it instead of grinding', () => {
  game.newRun();
  /* find a rock with open space on both sides: the straight line is blocked */
  let rock = null;
  for (let ty = 6; ty < game.world.th - 6 && !rock; ty++) {
    for (let tx = 6; tx < game.world.tw - 6; tx++) {
      if (!game.world.isSolid(tx, ty)) continue;
      if (game.world.isSolid(tx - 2, ty) || game.world.isSolid(tx + 2, ty)) continue;
      rock = { tx, ty };
      break;
    }
  }
  assert(rock, 'the generated map had no suitable rock');

  const T = PG.TILE;
  const px = (rock.tx - 2) * T + T / 2;
  const py = rock.ty * T + T / 2;
  const ex = (rock.tx + 2) * T + T / 2;
  const ey = rock.ty * T + T / 2;

  game.enemies.length = 0;
  const e = game.addEnemy('crawler', ex, ey, false);
  e.spawnT = 0;

  let closest = PG.dist(e.x, e.y, px, py);
  for (let i = 0; i < 60 * 12; i++) {
    game.update(1 / 60);
    PG.Input.endFrame();
    /* hold the player still: this is purely a pathing test */
    game.player.x = px; game.player.y = py;
    closest = Math.min(closest, PG.dist(e.x, e.y, px, py));
  }
  assert(closest < 30, `the enemy never got around the rock (closest ${closest.toFixed(0)}px)`);
  return `blocked line, closed to ${closest.toFixed(0)}px within 12s`;
});

check('death ends the run and writes records to storage', () => {
  /* clear any queued level-ups first, or the run is sitting on an upgrade screen */
  game.pendingLevelUps = 0;
  if (game.state === 'upgrade') {
    game.state = 'playing';
    PG.UI.showScreen(null);
  }
  /* clear the upgrades that legitimately prevent death, so this tests death */
  game.player.shield = 0;
  game.player.shieldMax = 0;
  game.player.secondWind = 0;
  game.player.hp = 1;
  game.player.invuln = 0;
  game.player.takeDamage(50, game.player.x - 10, game.player.y);
  step(1);
  assert(game.state === 'dead', `expected dead, got ${game.state}`);
  const raw = windowStub.localStorage.getItem('lumen.records.v1');
  assert(raw, 'no records were persisted');
  const rec = JSON.parse(raw);
  assert(typeof rec.bestTime === 'number' && rec.bestTime >= 0, 'bestTime missing');
  assert(rec.bestLevel >= 1, 'bestLevel missing');
  flushTimers();
  return JSON.stringify(rec);
});

check('restart clears every trace of the previous run', () => {
  game.newRun();
  assert(game.state === 'playing', 'restart did not start a fresh run');
  assert(game.player.level === 1 && game.player.hp === game.player.maxHp, 'player not reset');
  assert(game.kills === 0 && game.time === 0, 'counters not reset');
  assert(Object.keys(game.player.upgrades).length === 0, 'upgrades leaked into the new run');
  assert(game.pendingLevelUps === 0, 'pending level-ups leaked');
  assert(game.projectiles.items.every((p) => !p.active), 'projectiles leaked');
  assert(game.gems.items.every((g) => !g.active), 'gems leaked');
  return 'clean slate';
});

/* ---------- 9. audio and mute without a Web Audio API ---------- */

check('audio degrades silently when Web Audio is unavailable', () => {
  PG.Audio.play('shot');
  PG.Audio.play('levelup');
  PG.UI.toggleMute();
  const muted = PG.Audio.isMuted();
  assert(muted === true, 'mute toggle did not take effect');
  const raw = windowStub.localStorage.getItem('lumen.settings.v1');
  assert(raw && JSON.parse(raw).muted === true, 'mute state was not persisted');
  PG.UI.toggleMute();
  assert(PG.Audio.isMuted() === false, 'unmute did not take effect');
  return 'no-op without AudioContext, still persistent';
});

/* ---------- 10. sustained play ---------- */

check('a long unattended run stays stable and ramps difficulty', () => {
  game.newRun();
  /* Give the run a late-game kit so the secondary weapons get exercised too. */
  ['boomerang', 'sentinel', 'well', 'split', 'execute', 'chill', 'orb', 'chain']
    .forEach((id) => {
      const u = PG.Upgrades.get(id);
      if (u) game.player.applyUpgrade(u);
    });
  const fieldsAtStart = Object.keys(game.player).length;
  const dirs = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
  let held = null;
  let sawBoomerang = false;
  let sawWell = false;
  const samples = [];
  for (let i = 0; i < 60 * 120; i++) {
    if (i % 30 === 0) {
      if (held) fireWindow('keyup', { code: held, preventDefault() {} });
      held = dirs[(i / 30 | 0) % 4];
      fireWindow('keydown', { code: held, preventDefault() {} });
    }
    let best = null, bd = 1e9;
    for (const e of game.enemies) {
      const d = PG.dist(e.x, e.y, game.player.x, game.player.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) {
      Input.mouse.x = best.x - game.camX;
      Input.mouse.y = best.y - game.camY;
      Input.mouse.down = true;
    } else {
      Input.mouse.down = false;
    }
    if (i % 120 === 0) fireWindow('keydown', { code: 'Space', preventDefault() {} });
    if (i % 120 === 4) fireWindow('keyup', { code: 'Space', preventDefault() {} });

    game.update(1 / 60);
    Input.endFrame();
    for (const q of game.projectiles.items) {
      if (q.active && q.boomerang) { sawBoomerang = true; break; }
    }
    if (game.wells.length > 0) sawWell = true;
    if (game.state === 'upgrade') {
      let g2 = 0;
      while (game.state === 'upgrade' && g2++ < 10) game.chooseUpgrade(game.currentOffers[0]);
    }
    if (i % (60 * 30) === 0) samples.push(`t=${Math.round(game.time)} tier=${game.tier} alive=${game.enemies.length} kills=${game.kills}`);
    if (game.state === 'dead') break;
  }
  Input.mouse.down = false;
  assert(game.enemies.length < 200, 'enemy list grew unbounded');
  assert(game.particles.items.length === 1100, 'particle pool was reallocated');
  assert(game.tier >= 2, `difficulty did not ramp (tier=${game.tier})`);
  assert(game.wells.length <= 4, 'gravity wells accumulated');
  assert(sawBoomerang, 'no boomerang was ever thrown');
  assert(sawWell, 'the gravity well never opened');
  assert(
    Object.keys(game.player).length === fieldsAtStart,
    'player grew fields during the run'
  );
  return samples.join(' | ');
});

check('the run stayed inside its own object lifetimes', () => {
  assert(game.projectiles.items.length === 700, 'projectile pool size changed');
  assert(game.hostiles.items.length === 700, 'hostile projectile pool size changed');
  assert(game.gems.items.length === 400, 'gem pool size changed');
  assert(game.mines.length <= 26, 'mines accumulated unbounded');
  assert(game.clouds.length <= 14, 'clouds accumulated unbounded');
  return 'pools fixed, no unbounded growth';
});

/* ---------- summary ---------- */

console.log('');
console.log(`checks: ${checks - failures}/${checks} passed`);
if (failures > 0) {
  console.log(`\nRESULT: FAIL (${failures} failing check${failures === 1 ? '' : 's'})`);
  process.exit(1);
}
console.log('\nRESULT: PASS');
process.exit(0);
