const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'frontline-ui.css'), 'utf8');
const game = fs.readFileSync(path.join(root, 'game.js'), 'utf8');

test('existing mission controls and events retain their selectors', () => {
  for (const [field, count] of [['mode', 4], ['map', 3], ['train', 3], ['bots', 5]]) {
    assert.equal((html.match(new RegExp(`data-${field}="`, 'g')) || []).length, count);
  }
  for (const id of ['menu', 'start-btn', 'sens', 'sens-val', 'm-best', 'menu-stats', 'r-again', 'r-menu', 'ts-enter', 'ts-settings']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test('input and scene IDs do not collide with mobile UI IDs', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['touch-controls', 'touch-pause', 'touch-move', 'touch-stick', 'touch-aim', 'touch-switch', 'touch-jump', 'touch-fire', 'touch-weapon-picker']) {
    assert.ok(ids.includes(id), `missing touch control ${id}`);
  }
});

test('mobile layout includes device safe areas, narrow widths and coarse touch input', () => {
  assert.match(html, /maximum-scale=1\.0, user-scalable=no, viewport-fit=cover/);
  assert.match(html, /href="frontline-ui\.css"/);
  assert.match(css, /url\("cover\.png"\)/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /@media \(max-width: 370px\)/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /#touch-move\s*\{/);
  assert.match(css, /body\.touch-device\.touch-playing #touch-controls/);
  assert.match(game, /matchMedia\('\(pointer: coarse\)'\)/);
  assert.match(game, /if \(!isTouchDevice && canvas\.requestPointerLock\)/);
  assert.match(game, /gesturestart/);
  assert.match(game, /ev\.touches\.length > 1 && ev\.cancelable/);
});

test('mobile controls feed existing actions instead of forking combat implementation', () => {
  assert.match(game, /keys\.KeyW = dy/);
  assert.match(game, /fireBtn\.setPointerCapture/);
  assert.match(game, /shoot\(\);/);
  assert.match(game, /switchWeapon\(Number\(button\.dataset\.weapon\)\)/);
  assert.match(game, /bindTouchCommand\(document\.getElementById\('touch-aim'\), toggleScope\)/);
  assert.match(game, /setTouchWeaponPicker\(picker\.hidden\)/);
  assert.match(game, /if \(ev\.pointerType === 'touch'\) return/);
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(game, /setAttribute\('aria-pressed'/);
});

test('weapon list provides five direct choices and a visible selection state', () => {
  const items = [...html.matchAll(/data-weapon="([0-4])"/g)].map(m => Number(m[1]));
  assert.deepEqual(items, [0, 1, 2, 3, 4]);
  assert.match(html, /id="touch-weapon-picker"[^>]*hidden/);
  assert.match(html, /id="touch-switch"[^>]*aria-expanded="false"/);
  assert.match(css, /#touch-weapon-picker\[hidden\]/);
  assert.match(css, /#touch-aim:disabled/);
});

test('launcher starts play immediately but keeps the setup route available', () => {
  assert.match(game, /tsEnter\.addEventListener\('click', function \(\) \{\s*leaveTitleScreen\(\);[\s\S]*?startGame\(\);/);
  assert.match(game, /getElementById\('ts-settings'\)\.addEventListener\('click', function \(\) \{\s*leaveTitleScreen\(\);\s*showMenu\(false\);/);
  assert.match(css, /#title-screen \.ts-settings/);
});

test('scope and weapon UI respond to weapon selection and scope state', () => {
  const source = game.slice(game.indexOf('  function setTouchWeaponPicker(open) {'),
    game.indexOf('  function setTouchPlaying(playing) {'));
  assert.match(source, /function toggleScope/);
  const aim = { disabled: false, textContent: '', attributes: {}, setAttribute(k, v) { this.attributes[k] = v; } };
  const picker = { hidden: true };
  const switchBtn = { attributes: {}, setAttribute(k, v) { this.attributes[k] = v; } };
  const choices = Array.from({ length: 5 }, (_, index) => ({
    dataset: { weapon: String(index) }, attributes: {}, setAttribute(k, v) { this.attributes[k] = v; }
  }));
  let scopeSounds = 0;
  const context = {
    isTouchDevice: true,
    WEAPONS: [{ zoom: false }, { zoom: true }, { zoom: false }, { zoom: false }, { zoom: false }],
    weaponIdx: 0, zoomed: false, state: 'play',
    sndScope() { scopeSounds++; },
    document: {
      getElementById(id) { return ({ 'touch-aim': aim, 'touch-weapon-picker': picker, 'touch-switch': switchBtn })[id]; },
      querySelectorAll() { return choices; }
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context);

  context.syncTouchWeaponUI();
  assert.equal(aim.disabled, true);
  assert.equal(aim.attributes['aria-pressed'], 'false');
  context.toggleScope();
  assert.equal(context.zoomed, false, 'other weapons cannot scope');
  context.weaponIdx = 1;
  context.syncTouchWeaponUI();
  assert.equal(aim.disabled, false);
  context.toggleScope();
  assert.equal(context.zoomed, true);
  assert.equal(aim.textContent, '关镜');
  assert.equal(aim.attributes['aria-pressed'], 'true');
  assert.equal(choices[1].attributes['aria-pressed'], 'true');
  assert.equal(scopeSounds, 1);
  context.toggleScope();
  assert.equal(aim.textContent, '开镜');
  assert.equal(scopeSounds, 1);
  context.setTouchWeaponPicker(true);
  assert.equal(picker.hidden, false);
  assert.equal(switchBtn.attributes['aria-expanded'], 'true');
  context.setTouchWeaponPicker(false);
  assert.equal(picker.hidden, true);
});

test('touch pointerdown activates once even when browser follows with click', () => {
  const source = game.slice(game.indexOf('    function bindTouchCommand(button, action) {'),
    game.indexOf('    var movePad ='));
  const context = { Date, console };
  vm.createContext(context);
  vm.runInContext(source, context);
  const handlers = {};
  const button = { addEventListener(type, fn) { handlers[type] = fn; } };
  let count = 0;
  context.bindTouchCommand(button, () => count++);
  handlers.pointerdown({ pointerType: 'touch', preventDefault() {} });
  assert.equal(count, 1);
  handlers.click({ detail: 1 });
  assert.equal(count, 1, 'synthetic click must not duplicate touch action');
  handlers.click({ detail: 0 });
  assert.equal(count, 2, 'keyboard/assistive click remains available');
});

test('pinch handling blocks multi-touch browser zoom but allows one-finger gestures', () => {
  const source = game.slice(game.indexOf("  document.addEventListener('touchmove', function (ev) {"),
    game.indexOf("  document.addEventListener('dblclick',", game.indexOf("  document.addEventListener('touchmove',")));
  const handlers = {};
  vm.runInNewContext(source, {
    document: {
      addEventListener(name, handler, options) { handlers[name] = { handler, options }; }
    }
  });
  assert.equal(handlers.touchmove.options.passive, false);
  let prevented = 0;
  const gesture = touchCount => ({
    touches: Array(touchCount).fill({}), cancelable: true, preventDefault() { prevented++; }
  });
  handlers.touchmove.handler(gesture(1));
  assert.equal(prevented, 0);
  handlers.touchmove.handler(gesture(2));
  assert.equal(prevented, 1);
});
