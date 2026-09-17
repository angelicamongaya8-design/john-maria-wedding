#!/usr/bin/env node
/**
 * stamp-assets.mjs
 *
 * GitHub Pages serves assets with a ten-minute cache, and browsers hold
 * them far longer than that. Editing style.css or main.js without changing
 * their URL means returning visitors keep running the old files and see no
 * change at all — which is exactly the trap this project fell into.
 *
 * This rewrites the ?v= on each asset link in index.html to a short hash of
 * that file's contents. Change a file, its URL changes, every browser
 * refetches it. Leave a file alone and its URL is stable, so it stays
 * cached. Run it after touching anything under assets/.
 *
 *   node tools/stamp-assets.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const page = resolve(root, 'index.html');

const ASSETS = [
  'assets/css/reset.css',
  'assets/css/style.css',
  'assets/js/main.js',
];

let html = await readFile(page, 'utf8');
const stamped = [];

for (const asset of ASSETS) {
  const bytes = await readFile(resolve(root, asset));
  const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 8);

  // match the asset with or without an existing ?v=
  const pattern = new RegExp(
    `(["'])${asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\?v=[a-f0-9]+)?\\1`,
    'g',
  );

  // test for a match rather than for a change: when the stamp is already
  // correct the replacement is a no-op, which is success, not a miss
  if (!pattern.test(html)) {
    console.warn(`  ! ${asset} is not referenced in index.html — not stamped`);
    continue;
  }
  pattern.lastIndex = 0;   // the /g flag makes test() stateful

  html = html.replace(pattern, `$1${asset}?v=${hash}$1`);
  stamped.push(`${asset} → ${hash}`);
}

await writeFile(page, html);
console.log('stamped:\n  ' + stamped.join('\n  '));
