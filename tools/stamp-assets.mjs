#!/usr/bin/env node


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

  const pattern = new RegExp(
    `(["'])${asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\?v=[a-f0-9]+)?\\1`,
    'g',
  );

  if (!pattern.test(html)) {
    console.warn(`  ! ${asset} is not referenced in index.html — not stamped`);
    continue;
  }
  pattern.lastIndex = 0;   

  html = html.replace(pattern, `$1${asset}?v=${hash}$1`);
  stamped.push(`${asset} → ${hash}`);
}

await writeFile(page, html);
console.log('stamped:\n  ' + stamped.join('\n  '));
