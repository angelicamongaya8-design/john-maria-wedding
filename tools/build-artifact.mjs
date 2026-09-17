#!/usr/bin/env node
/**
 * build-artifact.mjs
 *
 * The site has two homes:
 *   1. a normal web host (GitHub Pages) — serves index.html as-is
 *   2. a Claude artifact — the host injects its own <!doctype>, <head>
 *      and <body>, so the file it publishes must NOT carry its own
 *
 * This script derives (2) from (1), so index.html stays the only
 * source of truth. Run it, then publish dist/artifact/index.html.
 *
 *   node tools/build-artifact.mjs
 */

import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'dist/artifact');

// keep the cache-busting stamps current before deriving anything from the page
await import('./stamp-assets.mjs');

const html = await readFile(resolve(root, 'index.html'), 'utf8');

// keep the <title>, the font <link>s and the stylesheet <link>s out of <head>
const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
const keep = [...head.matchAll(/<(?:title|link)\b[^>]*>(?:[\s\S]*?<\/title>)?/g)]
  .map((m) => m[0])
  .filter((tag) => !/rel="icon"/.test(tag))       // the host sets the favicon
  .filter((tag) => !/theme-color/.test(tag));

// body, minus the closing tags
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
