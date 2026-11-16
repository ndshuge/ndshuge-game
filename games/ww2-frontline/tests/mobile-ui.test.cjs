const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'frontline-ui.css'), 'utf8');
const game = fs.readFileSync(path.join(root, 'game.js'), 'utf8');

test('existing mission controls and events retain their selectors', () => {
  for (const [field, count] of [['mode', 4], ['map', 3], ['train', 3], ['bots', 5]]) {
    assert.equal((html.match(new RegExp(`data-${field}="`, 'g')) || []).length, count);
  }
  for (const id of ['menu', 'start-btn', 'sens', 'sens-val', 'm-best', 'menu-stats', 'r-again', 'r-menu', 'ts-enter']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test('input and scene IDs do not collide with mobile UI IDs', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['touch-controls', 'touch-pause', 'touch-move', 'touch-stick', 'touch-aim', 'touch-switch', 'touch-jump', 'touch-fire']) {
    assert.ok(ids.includes(id), `missing touch control ${id}`);
  }
});

test('mobile layout includes device safe areas, narrow widths and coarse touch input', () => {
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /href="frontline-ui\.css"/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /@media \(max-width: 370px\)/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /#touch-move\s*\{/);
  assert.match(css, /body\.touch-device\.touch-playing #touch-controls/);
  assert.match(game, /matchMedia\('\(pointer: coarse\)'\)/);
  assert.match(game, /if \(!isTouchDevice && canvas\.requestPointerLock\)/);
});

test('mobile controls feed existing actions instead of forking combat implementation', () => {
  assert.match(game, /keys\.KeyW = dy/);
  assert.match(game, /fireBtn\.setPointerCapture/);
  assert.match(game, /shoot\(\);/);
  assert.match(game, /switchWeapon\(\(weaponIdx \+ 1\)/);
  assert.match(game, /if \(ev\.pointerType === 'touch'\) return/);
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(game, /setAttribute\('aria-pressed'/);
});
