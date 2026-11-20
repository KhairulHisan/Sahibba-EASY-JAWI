/**
 * Assemble a single self-contained HTML page (JS, CSS and fonts inlined, no
 * service worker) for hosts that serve one page, e.g. an embedded viewer.
 *
 *   npm run build:embedded -- [output.html]
 *
 * The output is a body fragment (title, style, root, script): the host adds
 * the doctype/head skeleton.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const distDir = join(root, 'dist-embedded');
const out = process.argv[2] ?? join(distDir, 'easy-jawi.html');
const html = readFileSync(join(distDir, 'index.html'), 'utf8');

const cssHref = html.match(/<link rel="stylesheet"[^>]*href="([^"]+)"/)?.[1];
const jsSrc = html.match(/<script type="module"[^>]*src="([^"]+)"/)?.[1];
if (!cssHref || !jsSrc) throw new Error('Could not find the built CSS/JS in dist-embedded/index.html');

const css = readFileSync(join(distDir, cssHref), 'utf8');
const js = readFileSync(join(distDir, jsSrc), 'utf8').replace(/<\/script/gi, '<\\/script');
if (/url\((?!["']?data:)/.test(css)) throw new Error('CSS still references external files; raise assetsInlineLimit.');

const page = `<title>EASY JAWI</title>
<meta name="description" content="Susun Huruf, Bina Perkataan, Jadi Juara! Permainan papan perkataan Jawi.">
<style>${css}</style>
<div id="root"></div>
<noscript>EASY JAWI memerlukan JavaScript.</noscript>
<script type="module">${js}</script>
`;
writeFileSync(out, page);
console.log(`Wrote ${out} (${(page.length / 1024 / 1024).toFixed(2)} MB)`);

