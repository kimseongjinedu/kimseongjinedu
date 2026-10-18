#!/usr/bin/env node
// Fetches every class's timetable from 컴시간알리미 (http://컴시간학생.kr → comci.net:4082)
// and writes one JSON document for the SchoolMate AI artifact's shared database.
//
// Usage:
//   node scripts/comcigan-sync.mjs --out out.json [--prev prev.json] [--code 31720]
//
// --prev   the document currently in the database (as saved by ArtifactData get with out_dir).
//          Weeks it holds that Comcigan no longer serves are kept, so past weeks stay viewable.
// Exit code 0 on success. Prints a one-line JSON summary to stdout.
// Uses only Node built-ins. Tunnels through HTTPS_PROXY with CONNECT when one is set.

import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';

const DEFAULT_CODE = 31720; // 창원대산고등학교
const DEFAULT_NAME = '창원대산고등학교';
const ORIGIN_HOST = 'comci.net';
const ORIGIN_PORT = 4082;
const KEEP_WEEKS = 12; // weeks kept in the doc (newest first), keeps it well under the 256 KiB doc limit

// ---------- args ----------
function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith('--')) a[k.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return a;
}

// ---------- HTTP (direct, or tunnelled through the HTTPS proxy) ----------
function noProxyFor(host) {
  const list = (process.env.NO_PROXY || process.env.no_proxy || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.some((p) => p === host || (p.startsWith('.') && host.endsWith(p)) || (p.startsWith('*.') && host.endsWith(p.slice(1))));
}

function openSocket(host, port) {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || '';
  if (!proxy || noProxyFor(host)) {
    return new Promise((resolve, reject) => {
      const s = net.connect(port, host, () => resolve(s));
      s.once('error', reject);
    });
  }
  const u = new URL(proxy);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: u.hostname, port: u.port || 80, method: 'CONNECT', path: host + ':' + port, headers: { Host: host + ':' + port } });
    req.once('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); reject(new Error('proxy CONNECT ' + res.statusCode)); return; }
      resolve(socket);
    });
    req.once('error', reject);
    req.end();
  });
}

async function get(path, { timeout = 20000 } = {}) {
  const socket = await openSocket(ORIGIN_HOST, ORIGIN_PORT);
  return new Promise((resolve, reject) => {
    const req = http.request({
      createConnection: () => socket,
      host: ORIGIN_HOST,
      port: ORIGIN_PORT,
      path,
      method: 'GET',
      headers: { Host: ORIGIN_HOST + ':' + ORIGIN_PORT, 'User-Agent': 'Mozilla/5.0 SchoolMateSync', Accept: '*/*', Connection: 'close' }
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode !== 200) { reject(new Error('GET ' + path + ' -> ' + res.statusCode)); return; }
        resolve(Buffer.concat(chunks));
      });
      res.on('error', reject);
    });
    req.setTimeout(timeout, () => req.destroy(new Error('timeout ' + path)));
    req.once('error', reject);
    req.end();
  });
}

async function getWithRetry(path, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    try { return await get(path); } catch (e) { err = e; await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
  }
  throw err;
}

// ---------- discover the page's current route and data keys ----------
// Comcigan renames its route numbers and 자료NNN keys from time to time, so read them from /st.
export function discover(html) {
  const pick = (re, fallback) => { const m = html.match(re); return m ? m[1] : fallback; };
  return {
    route: pick(/url:'\.\/(\d+)\?\d+l'/, pick(/'\.\/(\d+)\?/, '36179')),
    prefix: pick(/sc_data\('(\d+_)'/, '73629_'),
    daily: pick(/일일자료=Q자료\(자료\.자료(\d+)\[/, '147'),
    original: pick(/원자료=Q자료\(자료\.자료(\d+)\[/, '481'),
    teacher: pick(/성명=Q성명\(자료\.자료(\d+)\[/, '446'),
    subject: pick(/과목명=Q과목명\(자료\.자료(\d+)\[/, '492')
  };
}

function parseJsonBody(buf) {
  const s = buf.toString('utf8');
  const end = s.lastIndexOf('}');
  if (end < 0) throw new Error('no JSON in response');
  return JSON.parse(s.slice(0, end + 1));
}

// ---------- decoding (ported from the Comcigan student page) ----------
function splitData(v) {
  const m = String(v).match(/\d{1,3}(?=(\d{3})+(?!\d))|\d{1,3}$/g);
  return m ? m.reverse().map(Number) : [0];
}

export function teacherName(raw) {
  if (raw == null) return '';
  const s = String(raw);
  if ((s.includes('*') && !s.startsWith('*') && !s.endsWith('*')) || (s.length === 2 && s[1] === '*')) return s;
  return s.replace('*', '');
}

// One timetable cell -> { text: '과목 교사' | '', changed: boolean }
export function decodeCell(daily, original, data, keys) {
  const sep = data.분리 == null ? 100 : data.분리;
  const raw = daily == null ? 0 : daily;
  const str = String(raw);
  const flagged = str.startsWith('>');
  const ma = splitData(flagged ? str.slice(1) : str);
  const th = ma[0] || 0;
  let sb = (ma[1] || 0) + (ma[2] || 0) * 1000;
  const changed = data.변경알림 == 1 ? flagged : String(original == null ? 0 : original) !== str;
  if (th <= 0) return { text: '', changed };
  sb = sb % sep;
  const subject = String((data['자료' + keys.subject] || [])[sb] ?? '').trim();
  const teacher = teacherName((data['자료' + keys.teacher] || [])[th]).trim();
  return { text: [subject, teacher].filter(Boolean).join(' '), changed };
}

// Grade timetable as 40 strings: index = day*8 + period (day 0=Mon..4=Fri, period 0..7),
// each string = the cells of classes 1..n joined by '|'.
export function gradeRows(data, keys, grade, useOriginal) {
  const n = classCount(data, grade);
  const daily = data['자료' + keys.daily];
  const orig = data['자료' + keys.original];
  const src = useOriginal ? orig : daily;
  const rows = [];
  const changed = [];
  for (let d = 1; d <= 5; d++) {
    for (let p = 1; p <= 8; p++) {
      const cells = [];
      for (let c = 1; c <= n; c++) {
        const dv = src?.[grade]?.[c]?.[d]?.[p];
        const ov = orig?.[grade]?.[c]?.[d]?.[p];
        const cell = decodeCell(dv, useOriginal ? dv : ov, data, keys);
        cells.push(cell.text.replace(/\|/g, '/'));
        if (!useOriginal && cell.changed && cell.text) changed.push(grade + '-' + c + '-' + d + '-' + p);
      }
      rows.push(cells.join('|'));
    }
  }
  return { rows, changed };
}

export function classCount(data, grade) {
  const all = Number(data.학급수?.[grade]) || 0;
  const virt = Number(data.가상학급수?.[grade]) || 0;
  return Math.max(0, all - virt);
}

function hm(s) { const m = String(s || '').match(/(\d{1,2}):(\d{2})/); return m ? m[1].padStart(2, '0') + ':' + m[2] : ''; }

export function buildWeek(data, keys) {
  const g = {};
  let changed = [];
  for (const grade of [1, 2, 3]) {
    if (!classCount(data, grade)) continue;
    const r = gradeRows(data, keys, grade, false);
    g[grade] = r.rows;
    changed = changed.concat(r.changed);
  }
  return { start: String(data.시작일 || ''), g, changed };
}

export function buildBase(data, keys) {
  const g = {};
  for (const grade of [1, 2, 3]) {
    if (!classCount(data, grade)) continue;
    g[grade] = gradeRows(data, keys, grade, true).rows;
  }
  return { from: String(data.시작일 || ''), g };
}

// Merge fresh weeks into the previous doc's weeks (fresh wins), newest KEEP_WEEKS kept, oldest first.
export function mergeWeeks(prevWeeks, freshWeeks) {
  const by = new Map();
  for (const w of Array.isArray(prevWeeks) ? prevWeeks : []) if (w && /^\d{4}-\d{2}-\d{2}$/.test(w.start)) by.set(w.start, w);
  for (const w of freshWeeks) if (w && /^\d{4}-\d{2}-\d{2}$/.test(w.start)) by.set(w.start, w);
  return [...by.values()].sort((a, b) => (a.start < b.start ? -1 : 1)).slice(-KEEP_WEEKS);
}

// JSON with object keys sorted, so two docs compare equal whatever order their keys came in.
export function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

// ---------- main ----------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const code = Number(args.code || DEFAULT_CODE);
  const out = args.out || 'timetable.json';

  const st = await getWithRetry('/st');
  const html = new TextDecoder('euc-kr').decode(st);
  const keys = discover(html);

  const fetchWeek = async (r) => {
    const q = Buffer.from(keys.prefix + code + '_0_' + r).toString('base64');
    const data = parseJsonBody(await getWithRetry('/' + keys.route + '?' + q));
    if (!data || !data['자료' + keys.daily]) throw new Error('timetable data missing for r=' + r + ' (keys ' + JSON.stringify(keys) + ')');
    return data;
  };

  const first = await fetchWeek(1);
  const weekNos = (Array.isArray(first.일자자료) ? first.일자자료 : []).map((x) => Number(x[0])).filter((n) => n > 0);
  const datas = [first];
  for (const r of weekNos) if (r !== 1) datas.push(await fetchWeek(r));

  const fresh = datas.map((d) => buildWeek(d, keys)).filter((w) => w.start);
  const latest = datas.slice().sort((a, b) => (String(a.시작일) < String(b.시작일) ? 1 : -1))[0];

  let prev = null;
  if (args.prev && fs.existsSync(args.prev)) {
    try {
      const p = JSON.parse(fs.readFileSync(args.prev, 'utf8'));
      prev = p && typeof p === 'object' ? (p.data && p.data.v ? p.data : p) : null;
    } catch (_) { prev = null; }
  }

  const classes = {};
  for (const grade of [1, 2, 3]) classes[grade] = classCount(latest, grade);

  const doc = {
    v: 1,
    school: DEFAULT_NAME,
    code,
    source: 'http://컴시간학생.kr',
    checkedAt: new Date().toISOString(),
    sourceUpdated: String(first.자료244 || ''),
    classes,
    times: (latest.일과시간 || []).map(hm),
    base: buildBase(latest, keys),
    weeks: mergeWeeks(prev && prev.weeks, fresh)
  };

  // Did anything other than checkedAt change since the previous doc? (the db may return keys in another order)
  const strip = (d) => canonical(Object.assign({}, d, { checkedAt: '' }));
  const changed = !prev || strip(prev) !== strip(doc);

  const json = JSON.stringify(doc);
  if (json.length > 250 * 1024) throw new Error('document too large: ' + json.length + ' bytes');
  fs.writeFileSync(out, json);

  console.log(JSON.stringify({
    ok: true,
    out,
    changed,
    bytes: json.length,
    classes,
    weeks: doc.weeks.map((w) => w.start),
    freshWeeks: fresh.map((w) => w.start),
    changedCells: fresh.reduce((n, w) => n + w.changed.length, 0),
    sourceUpdated: doc.sourceUpdated
  }));
}

if (import.meta.url === 'file://' + process.argv[1]) {
  main().catch((e) => {
    console.error(JSON.stringify({ ok: false, error: String(e && e.message || e) }));
    process.exit(1);
  });
}
