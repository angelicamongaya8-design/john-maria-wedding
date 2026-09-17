#!/usr/bin/env node


import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'dist/artifact');

await import('./stamp-assets.mjs');

const html = await readFile(resolve(root, 'index.html'), 'utf8');

const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
const keep = [...head.matchAll(/<(?:title|link)\b[^>]*>(?:[\s\S]*?<\/title>)?/g)]
  .map((m) => m[0])
  .filter((tag) => !/rel="icon"/.test(tag))       
  .filter((tag) => !/theme-color/.test(tag));

const body = html
  .slice(html.indexOf('<body>') + '<body>'.length, html.lastIndexOf('</body>'))
  .trim();

const artifact = `${keep.join('\n')}\n\n${body}\n`;

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await writeFile(resolve(out, 'index.html'), artifact);
await cp(resolve(root, 'assets'), resolve(out, 'assets'), { recursive: true });

const kb = (Buffer.byteLength(artifact) / 1024).toFixed(1);
console.log(`built dist/artifact/index.html  (${kb} kB + assets)`);
