#!/usr/bin/env node
// Builds the installable SchoolMate AI app (a PWA served by GitHub Pages) from app/schoolmate-ai.html,
// the same page that is published as the claude.ai artifact.
//
//   node scripts/build-app.mjs [--out _site]
//
// The output folder gets index.html (the page plus the app tags below), manifest.webmanifest, sw.js and
// the icons. timetable.json is added next to them by the GitHub Actions workflow (comcigan-sync.mjs).
// Node built-in modules only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'app');

// tags that turn the page into an installable app; <meta name="schoolmate-app"> switches on the app mode
// in the page (timetable.json instead of the claude.ai db, service worker, install button)
export function appHead(version) {
  return [
    `<meta name="schoolmate-app" content="${version}">`,
    '<meta name="description" content="창원대산고 일정·시간표 도우미">',
    '<link rel="manifest" href="manifest.webmanifest">',
    '<meta name="theme-color" content="#F2F5FB" media="(prefers-color-scheme: light)">',
    '<meta name="theme-color" content="#0E1322" media="(prefers-color-scheme: dark)">',
    '<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">',
    '<link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">',
    '<link rel="apple-touch-icon" href="apple-touch-icon.png">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-title" content="SchoolMate">'
  ].join('\n');
}

export function buildIndex(html, version) {
  const marker = '<title>SchoolMate AI</title>';
  const at = html.indexOf(marker);
  if (at < 0 || html.indexOf(marker, at + 1) >= 0) throw new Error('expected exactly one ' + marker + ' in the page');
  return html.slice(0, at + marker.length) + '\n' + appHead(version) + html.slice(at + marker.length);
}

export function build(out) {
  const html = fs.readFileSync(path.join(APP, 'schoolmate-ai.html'), 'utf8');
  const sw = fs.readFileSync(path.join(APP, 'sw.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(APP, 'manifest.webmanifest'), 'utf8');
  JSON.parse(manifest); // fail the build on a broken manifest
  const icons = fs.readdirSync(path.join(APP, 'icons')).filter((f) => f.endsWith('.png')).sort();
  const hash = crypto.createHash('sha256').update(html).update(sw).update(manifest);
  icons.forEach((f) => hash.update(fs.readFileSync(path.join(APP, 'icons', f))));
  const version = hash.digest('hex').slice(0, 12);

  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'index.html'), buildIndex(html, version));
  if (!sw.includes('__VERSION__')) throw new Error('sw.js has no __VERSION__ placeholder');
  fs.writeFileSync(path.join(out, 'sw.js'), sw.replace('__VERSION__', version));
  fs.writeFileSync(path.join(out, 'manifest.webmanifest'), manifest);
  icons.forEach((f) => fs.copyFileSync(path.join(APP, 'icons', f), path.join(out, f)));
  return { out, version, files: ['index.html', 'sw.js', 'manifest.webmanifest', ...icons] };
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--out');
  const out = path.resolve(i >= 0 && argv[i + 1] ? argv[i + 1] : '_site');
  console.log(JSON.stringify(build(out)));
}
