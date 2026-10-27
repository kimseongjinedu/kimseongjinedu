// node --test scripts/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build, buildIndex } from './build-app.mjs';

test('buildIndex adds the app tags right after the title', () => {
  const out = buildIndex('<head><title>SchoolMate AI</title><style></style>', 'abc');
  assert.match(out, /<title>SchoolMate AI<\/title>\n<meta name="schoolmate-app" content="abc">/);
  assert.match(out, /<link rel="manifest" href="manifest.webmanifest">/);
  assert.throws(() => buildIndex('<head></head>', 'x'));
});

test('build writes an installable app folder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smapp-'));
  const r = build(dir);
  const index = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.equal(index.split('<meta name="schoolmate-app" content=').length, 2);
  const sw = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8');
  assert.ok(!sw.includes('__VERSION__') && sw.includes(r.version));
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  for (const ic of manifest.icons) assert.ok(fs.existsSync(path.join(dir, ic.src)), ic.src);
  assert.ok(manifest.icons.some((ic) => ic.purpose === 'maskable'));
  for (const f of ['favicon-32.png', 'apple-touch-icon.png']) assert.ok(fs.existsSync(path.join(dir, f)), f);
  fs.rmSync(dir, { recursive: true, force: true });
});
