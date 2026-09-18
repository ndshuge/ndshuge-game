#!/usr/bin/env node
/*
 * LUMEN SIEGE - structural acceptance check.
 *
 * Runs on plain Node with no dependencies and no browser. It verifies the things a
 * static reader can actually prove: the shell exists, every script the shell loads
 * exists and parses, the load order respects the dependency graph, the code stays
 * faithful to the "open index.html and play" contract (no ES modules, no remote
 * assets), and the required gameplay systems are present.
 *
 * Exit code 0 = pass. Any failure prints and exits 1.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

let checks = 0;
let failures = 0;
const notes = [];

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

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

/* Load order matters: these are classic scripts sharing one global namespace. */
const EXPECTED_SCRIPTS = [
  'src/core.js',
  'src/input.js',
  'src/audio.js',
  'src/sprites.js',
  'src/map.js',
  'src/combat.js',
  'src/player.js',
  'src/enemies.js',
  'src/upgrades.js',
  'src/upgrade-icons.js',
  'src/ui.js',
  'src/intro.js',
  'src/game.js',
  'src/main.js'
];

console.log('LUMEN SIEGE :: structural acceptance\n');

/* ---------- 1. shell ---------- */

check('index.html exists', () => {
  assert(exists('index.html'), 'index.html is missing');
  return `${fs.statSync(path.join(ROOT, 'index.html')).size} bytes`;
});

check('style.css exists and is linked', () => {
  assert(exists('style.css'), 'style.css is missing');
  const html = read('index.html');
  assert(/<link rel="stylesheet" href="style\.css">/.test(html), 'index.html does not link style.css');
  return `${fs.statSync(path.join(ROOT, 'style.css')).size} bytes`;
});

check('canvas has a fixed logical resolution', () => {
  const html = read('index.html');
  const m = html.match(/<canvas id="game" width="(\d+)" height="(\d+)">/);
  assert(m, 'canvas#game with explicit width/height not found');
  return `${m[1]}x${m[2]}`;
});

/* ---------- 2. script graph ---------- */

check('every script is loaded exactly once, in dependency order', () => {
  const html = read('index.html');
  const found = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert(found.length > 0, 'no script tags found');
  assert(
    JSON.stringify(found) === JSON.stringify(EXPECTED_SCRIPTS),
    `load order mismatch\n      expected: ${EXPECTED_SCRIPTS.join(', ')}\n      found:    ${found.join(', ')}`
  );
  return `${found.length} scripts`;
});

check('every referenced script exists', () => {
  const missing = EXPECTED_SCRIPTS.filter((rel) => !exists(rel));
  assert(missing.length === 0, `missing file(s): ${missing.join(', ')}`);
  return EXPECTED_SCRIPTS.length + ' files present';
});

check('every source file parses as a script', () => {
  const bad = [];
  for (const rel of EXPECTED_SCRIPTS) {
    const src = read(rel);
    try {
      new vm.Script(src, { filename: rel });
    } catch (err) {
      bad.push(`${rel}: ${err.message}`);
    }
  }
  assert(bad.length === 0, bad.join(' | '));
  return EXPECTED_SCRIPTS.length + ' parsed';
});

/* ---------- 3. doubles-click-to-play contract ---------- */

check('no ES module syntax (would break under file://)', () => {
  const offenders = [];
  for (const rel of EXPECTED_SCRIPTS) {
    const src = read(rel);
    if (/^\s*(import|export)\s/m.test(src)) offenders.push(rel);
  }
  const html = read('index.html');
  if (/<script[^>]*type="module"/.test(html)) offenders.push('index.html');
  assert(offenders.length === 0, `module syntax in: ${offenders.join(', ')}`);
  return 'classic scripts only';
});

check('no remote assets or network calls', () => {
  const offenders = [];
  const files = ['index.html', 'style.css', ...EXPECTED_SCRIPTS];
  for (const rel of files) {
    const src = read(rel);
    if (/https?:\/\/[^\s"')]+/.test(src)) offenders.push(`${rel} (url)`);
    if (/\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket/.test(src)) offenders.push(`${rel} (request)`);
  }
  assert(offenders.length === 0, offenders.join(', '));
  return 'fully self-contained';
});

/* ---------- 4. required systems ---------- */

const SRC = {};
for (const rel of EXPECTED_SCRIPTS) SRC[rel] = read(rel);
const ALL = Object.values(SRC).join('\n');

check('player has movement, hp, invulnerability, dash and death', () => {
  const p = SRC['src/player.js'];
  for (const needle of ['this.maxHp', 'this.hp', 'invuln', 'dashCooldown', 'takeDamage', 'this.dead']) {
    assert(p.includes(needle), `player.js is missing "${needle}"`);
  }
  return 'hp / invuln / dash / death present';
});

check('three enemy archetypes with distinct behaviour', () => {
  const e = SRC['src/enemies.js'];
  for (const type of ['crawler', 'zipper', 'bulwark']) {
    assert(new RegExp(`${type}:\\s*\\{`).test(e), `no definition for enemy "${type}"`);
  }
  for (const fn of ['updateCrawler', 'updateZipper', 'updateBulwark']) {
    assert(e.includes(fn), `no distinct behaviour function ${fn}`);
  }
  assert(/state === 'wind'/.test(e) && /state === 'dash'/.test(e), 'zipper has no wind-up/dash states');
  assert(/enraged/.test(e), 'bulwark has no enrage branch');
  return 'crawler / zipper / bulwark';
});

check('combat has projectiles, hit detection, damage and knockback', () => {
  const c = SRC['src/combat.js'];
  const g = SRC['src/game.js'];
  assert(c.includes('Projectiles'), 'combat.js has no Projectiles');
  assert(c.includes('dist2'), 'combat.js has no hit distance test');
  assert(g.includes('damageEnemy'), 'game.js has no damageEnemy');
  assert(g.includes('kvx') && g.includes('kvy'), 'no knockback velocity applied');
  assert(c.includes('pierce'), 'no pierce handling');
  return 'projectile / hit / damage / knockback / pierce';
});

check('experience gems feed a levelling system', () => {
  const c = SRC['src/combat.js'];
  const p = SRC['src/player.js'];
  assert(c.includes('Gems'), 'no gem pickups');
  assert(p.includes('gainXp'), 'player cannot gain xp');
  assert(p.includes('xpToNext'), 'no xp curve');
  return 'gems / gainXp / curve';
});

check('at least six distinct upgrades, weighted and stack-capped', () => {
  const u = SRC['src/upgrades.js'];
  const ids = [...u.matchAll(/id:\s*'([a-z]+)'/g)].map((m) => m[1]);
  assert(ids.length >= 30, `only ${ids.length} upgrades defined`);
  assert(u.includes('weight'), 'upgrades have no weights');
  assert(u.includes('max:'), 'upgrades have no stack caps');
  assert(u.includes('roll:'), 'no offer roller');
  assert(/rarity/.test(u), 'no rarity tiers');
  return `${ids.length} upgrades, ${/[A-Z]+ = '(common|rare|legend)'/.test(u) ? 'tiered' : 'untiered'}`;
});

check('new mechanics are actually implemented, not just listed', () => {
  const p = SRC['src/player.js'];
  const c = SRC['src/combat.js'];
  const g = SRC['src/game.js'];
  assert(/updateOrbitals/.test(p), 'no orbiting shuriken logic');
  assert(/orbitAngle/.test(p) && /shuriken/.test(p), 'shuriken state/visual missing');
  assert(/homing/.test(c), 'no homing projectiles');
  assert(/bounce/.test(c), 'no wall bounce');
  assert(/chainLightning/.test(g), 'no chain lightning');
  assert(/Game\.prototype\.explode/.test(g), 'no explosion');
  assert(/secondWind/.test(p) && /secondWind/.test(g), 'no second wind');
  assert(/shieldMax/.test(p), 'no shield');
  assert(/thornsBurst/.test(g), 'no thorns');
  assert(/lifesteal/.test(p) && /lifesteal/.test(g), 'no lifesteal');
  return 'orbit / homing / bounce / chain / explode / shield / thorns / lifesteal / second wind';
});

check('secondary weapons exist as real systems', () => {
  const p = SRC['src/player.js'];
  const c = SRC['src/combat.js'];
  const g = SRC['src/game.js'];
  assert(/throwBoomerangs/.test(p), 'no boomerang thrower');
  assert(/returning/.test(c), 'boomerang never returns');
  assert(/sentinelFire/.test(p), 'no sentinel weapon');
  assert(/Game\.prototype\.openWell/.test(g), 'no gravity well');
  assert(/split/.test(c) && /isSplit/.test(c), 'no split shot');
  assert(/execute/.test(c) && /execute/.test(p), 'no execute');
  assert(/chill/.test(c) && /chillFactor/.test(p), 'no chill');
  return 'boomerang / sentinel / well / split / execute / chill';
});

check('level-up presents a choice from the upgrade pool', () => {
  const g = SRC['src/game.js'];
  assert(/Upgrades\.roll\(this\.player,\s*count,\s*rng,\s*'any'/.test(g), 'not rolling from the whole pool');
  assert(/extraChoices/.test(g), 'the luck upgrade cannot widen the choice');
  assert(/pendingLevelUps/.test(g), 'no queued level-ups');
  assert(/showUpgradeScreen/.test(g), 'no upgrade screen transition');
  assert(/chooseUpgrade/.test(g), 'nothing applies the chosen card');
  return 'single pool, luck-widenable, queued';
});

check('levelling is not a wall: xp demand grows slower than enemy value', () => {
  const p = SRC['src/player.js'];
  const g = SRC['src/game.js'];
  assert(/Math\.pow\(level,\s*1\.12\)/.test(p), 'xp curve is not the softened one');
  assert(/e\.xp \* \(1 \+/.test(g), 'enemy xp does not scale with the tier');
  return 'L^1.15 curve + tier-scaled xp';
});

check('an opening story tutorial exists and only runs once', () => {
  assert(exists('src/intro.js'), 'no intro module');
  const html = read('index.html');
  assert(html.includes('id="screen-intro"'), 'no intro screen');
  assert(html.includes('src/intro.js'), 'intro module is not loaded');
  const intro = SRC['src/intro.js'];
  assert(/lumen\.intro\.v1/.test(intro), 'intro does not remember that it ran');
  assert(/hasSeen/.test(intro), 'no seen-check');
  const steps = [...intro.matchAll(/title:\s*'/g)].length;
  assert(steps >= 4, `only ${steps} intro beats`);
  return `${steps} story beats, persisted`;
});

check('difficulty ramps with survival time', () => {
  const g = SRC['src/game.js'];
  for (const fn of ['tierFor', 'spawnIntervalFor', 'maxAliveFor', 'hpMultFor', 'dmgMultFor']) {
    assert(g.includes(fn), `no ${fn} in the difficulty curve`);
  }
  assert(/Math\.min\(12,\s*1 \+ Math\.floor\(this\.time/.test(g), 'tier is not time-driven');
  return 'tier / rate / cap / hp / damage';
});

check('camera follows the player and is clamped to the world', () => {
  const g = SRC['src/game.js'];
  assert(g.includes('updateCamera'), 'no camera update');
  assert(/PG\.clamp\(this\.camX, SHAKE_MARGIN/.test(g), 'camera is not clamped to the world bounds');
  const m = SRC['src/map.js'];
  assert(m.includes('WORLD_TW') && /WORLD_W\s*=/.test(SRC['src/core.js']), 'world size is not larger than the viewport');
  return 'follow + clamp';
});

check('world is larger than the viewport and has obstacles, borders and regions', () => {
  const core = SRC['src/core.js'];
  const map = SRC['src/map.js'];
  assert(/PG\.WORLD_TW\s*=\s*(\d+)/.test(core), 'no world width');
  assert(/PG\.WORLD_TH\s*=\s*(\d+)/.test(core), 'no world height');
  assert(map.includes('WALL'), 'no border tiles');
  assert(map.includes('ROCK'), 'no obstacle tiles');
  assert(map.includes('REGION_PAL'), 'no per-region palette');
  assert(map.includes('circleHits'), 'no tile collision');
  const tw = Number(core.match(/PG\.WORLD_TW\s*=\s*(\d+)/)[1]);
  const th = Number(core.match(/PG\.WORLD_TH\s*=\s*(\d+)/)[1]);
  const tile = Number(core.match(/PG\.TILE\s*=\s*(\d+)/)[1]);
  const vw = Number(core.match(/PG\.VIEW_W\s*=\s*(\d+)/)[1]);
  const vh = Number(core.match(/PG\.VIEW_H\s*=\s*(\d+)/)[1]);
  const w = tw * tile, h = th * tile;
  assert(w >= vw * 2 && h >= vh * 2, `world ${w}x${h} is not meaningfully larger than the view ${vw}x${vh}`);
  return `world ${w}x${h} px vs view ${vw}x${vh} px`;
});

check('pixel-art rendering: no image smoothing, all sprites drawn in code', () => {
  const main = SRC['src/main.js'];
  const sprites = SRC['src/sprites.js'];
  const css = read('style.css');
  assert(/imageSmoothingEnabled\s*=\s*false/.test(main), 'image smoothing is not disabled');
  assert(/image-rendering:\s*pixelated/.test(css), 'CSS does not request pixelated scaling');
  assert(/makeSprite/.test(sprites), 'sprites are not compiled from pixel matrices');
  assert(!/<img|\.png|\.jpg|\.gif/i.test(ALL), 'an external image reference is present');
  return 'nearest-neighbour, procedural sprites';
});

check('effects: particles, hit flash, death burst, screen shake', () => {
  const core = SRC['src/core.js'];
  const sprites = SRC['src/sprites.js'];
  const game = SRC['src/game.js'];
  assert(core.includes('PG.Particles'), 'no particle system');
  assert(sprites.includes('flash:'), 'sprites have no white flash variant');
  assert(game.includes('killEnemy'), 'no enemy death handling');
  assert(game.includes('shake'), 'no screen shake');
  return 'particles / flash / burst / shake';
});

check('audio is layered, not a single beep, and can be muted', () => {
  const a = SRC['src/audio.js'];
  assert(/AudioContext/.test(a), 'no Web Audio usage');
  for (const cue of ['shot', 'hit', 'levelup', 'dash', 'death']) {
    assert(new RegExp(`\\b${cue}:`).test(a), `missing sound cue "${cue}"`);
  }
  /* the layered strike: transient + body + thump + crack */
  assert(/function strike/.test(a), 'no layered strike builder');
  assert(/highpass/.test(a) && /bandpass/.test(a), 'strike is missing its noise layers');
  /* kill cue climbs with the streak */
  assert(/KILL_STEPS/.test(a), 'kill cue does not climb');
  assert(/combo/.test(a), 'no kill-streak tracking');
  /* separate music / sfx buses */
  assert(/musicBus/.test(a) && /sfxBus/.test(a), 'audio buses are not separated');
  assert(/latencyHint/.test(a), 'no interactive latency hint');
  assert(a.includes('setMuted') && a.includes('toggleMute'), 'sound cannot be muted');
  const ui = SRC['src/ui.js'];
  assert(ui.includes('SND ON') && ui.includes('SND OFF'), 'no mute control in the UI');
  return '4-layer strike, rising kills, split buses, mutable';
});

check('HUD shows hp, xp, level, kills and time', () => {
  const html = read('index.html');
  for (const id of ['hp-fill', 'hp-text', 'xp-fill', 'hud-level', 'hud-kills', 'hud-time']) {
    assert(html.includes(`id="${id}"`), `HUD element #${id} missing`);
  }
  const ui = SRC['src/ui.js'];
  assert(ui.includes('updateHud'), 'HUD is never updated');
  return 'hp / xp / level / kills / time';
});

check('start, level-up, pause and death screens all exist', () => {
  const html = read('index.html');
  for (const id of ['screen-start', 'screen-upgrade', 'screen-pause', 'screen-dead']) {
    assert(html.includes(`id="${id}"`), `screen #${id} missing`);
  }
  for (const id of ['btn-start', 'btn-retry', 'btn-resume', 'btn-quit', 'btn-menu']) {
    assert(html.includes(`id="${id}"`), `control #${id} missing`);
  }
  const ui = SRC['src/ui.js'];
  assert(ui.includes('showScreen'), 'screens are never switched');
  return '4 screens, restart wired';
});

check('progress is persisted to localStorage', () => {
  const core = SRC['src/core.js'];
  const game = SRC['src/game.js'];
  assert(core.includes('localStorage'), 'no localStorage helper');
  assert(game.includes('lumen.records.v1'), 'records are not saved');
  assert(game.includes('lumen.settings.v1') || SRC['src/ui.js'].includes('lumen.settings.v1'), 'settings are not saved');
  return 'records + settings';
});

check('fixed-step loop with a background-tab guard', () => {
  const main = SRC['src/main.js'];
  assert(/STEP\s*=\s*1\s*\/\s*60/.test(main), 'no fixed timestep');
  assert(/elapsed\s*>\s*0\.25/.test(main), 'no clamp on long frame gaps');
  assert(main.includes('requestAnimationFrame'), 'no animation loop');
  return '60 Hz fixed step';
});

check('every upgrade targets a field the player actually declares', () => {
  const u = SRC['src/upgrades.js'];
  const p = SRC['src/player.js'];
  const used = new Set([...u.matchAll(/\bp\.([A-Za-z][A-Za-z0-9]*)/g)].map((m) => m[1]));
  const start = p.indexOf('var BASE = {');
  const baseBlock = p.slice(start, p.indexOf('};', start));
  const declared = new Set(
    [...baseBlock.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*)\s*:/gm)].map((m) => m[1])
  );
  /* hp and shield are derived in the constructor rather than listed in BASE */
  for (const m of p.matchAll(/this\.([A-Za-z][A-Za-z0-9]*)\s*=/g)) declared.add(m[1]);
  const missing = [...used].filter((k) => !declared.has(k));
  assert(missing.length === 0, `upgrade writes undefined player fields: ${missing.join(', ')}`);
  return `${used.size} fields referenced, all declared`;
});

check('every sprite matrix is rectangular (rows must be equal length)', () => {
  const src = SRC['src/sprites.js'];
  const blocks = [...src.matchAll(/var\s+([A-Z][A-Z0-9_]*)\s*=\s*\[([\s\S]*?)\];/g)];
  const problems = [];
  let checked = 0;
  for (const [, name, body] of blocks) {
    const rows = [...body.matchAll(/'([^']*)'/g)].map((m) => m[1]);
    if (rows.length < 3) continue;               /* not a pixel matrix */
    checked++;
    const width = rows[0].length;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].length !== width) {
        problems.push(`${name} row ${i}: ${rows[i].length} chars, expected ${width}`);
        break;
      }
      for (const ch of rows[i]) {
        if (!/[.0-9A-Za-z]/.test(ch)) problems.push(`${name}: odd character '${ch}'`);
      }
    }
  }
  assert(checked >= 5, `only ${checked} matrices found to check`);
  assert(problems.length === 0, problems.slice(0, 4).join(' | '));
  return `${checked} matrices, all rectangular`;
});

check('a debug hook exposes live state (used by automated play tests)', () => {
  const main = SRC['src/main.js'];
  assert(main.includes('window.__LUMEN__'), 'no verification hook');
  return 'window.__LUMEN__';
});

/* ---------- summary ---------- */

console.log('');
console.log(`checks: ${checks - failures}/${checks} passed`);
if (notes.length) console.log(notes.join('\n'));
if (failures > 0) {
  console.log(`\nRESULT: FAIL (${failures} failing check${failures === 1 ? '' : 's'})`);
  process.exit(1);
}
console.log('\nRESULT: PASS');
process.exit(0);
