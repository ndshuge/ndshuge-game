#!/usr/bin/env node
/*
 * LUMEN SIEGE - single acceptance entry point.
 *
 * Runs every suite in order and exits non-zero if any of them fails. This is the
 * command a reviewer (or an automated pipeline) should call.
 *
 *   node tests/run-all.mjs
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const SUITES = [
  'smoke.test.mjs',      /* structural: shell, load order, required systems */
  'headless.test.mjs'    /* runtime: executes the game in a DOM stub */
];

let failed = 0;

for (const suite of SUITES) {
  console.log('');
  console.log('='.repeat(64));
  console.log('  ' + suite);
  console.log('='.repeat(64));
  const result = spawnSync(process.execPath, [path.join(HERE, suite)], { stdio: 'inherit' });
  if (result.status !== 0) failed++;
}

console.log('');
console.log('='.repeat(64));
if (failed === 0) {
  console.log('ALL SUITES PASSED (' + SUITES.length + '/' + SUITES.length + ')');
} else {
  console.log('FAILED SUITES (' + (SUITES.length - failed) + '/' + SUITES.length + ' passed)');
}
process.exit(failed === 0 ? 0 : 1);
