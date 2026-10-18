// node --test scripts/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { discover, decodeCell, gradeRows, mergeWeeks, teacherName } from './comcigan-sync.mjs';

const keys = { route: '36179', prefix: '73629_', daily: '147', original: '481', teacher: '446', subject: '492' };

// 1 grade, 1 class, Mon..Fri; cell value = subject*1000 + teacher (분리 = 1000)
function sample(overrides = {}) {
  const day = (cells) => [cells.length, ...cells];
  const week = [5, day([2001, 3002]), day([3002]), day([]), day([2001]), day([0, 2001])];
  return Object.assign({
    분리: 1000,
    변경알림: 1,
    학급수: [1, 1, 0, 0],
    가상학급수: [0, 0, 0, 0],
    자료446: ['', '박철*', '김미*'],
    자료492: [3, '수학', '자율', '국어'],
    자료147: [1, [1, week]],
    자료481: [1, [1, week]]
  }, overrides);
}

test('teacher names drop the trailing mask', () => {
  assert.equal(teacherName('박철*'), '박철');
  assert.equal(teacherName('김*수'), '김*수');
  assert.equal(teacherName(undefined), '');
});

test('decodes subject and teacher, flags changed cells', () => {
  const data = sample();
  assert.deepEqual(decodeCell(2001, 2001, data, keys), { text: '자율 박철', changed: false });
  assert.deepEqual(decodeCell('>3002', 2001, data, keys), { text: '국어 김미', changed: true });
  assert.deepEqual(decodeCell(0, 0, data, keys), { text: '', changed: false });
});

test('grade rows are 40 strings, day-major', () => {
  const { rows } = gradeRows(sample(), keys, 1, false);
  assert.equal(rows.length, 40);
  assert.equal(rows[0], '자율 박철');
  assert.equal(rows[1], '국어 김미');
  assert.equal(rows[8], '국어 김미');
  assert.equal(rows[16], '');
  assert.equal(rows[33], '자율 박철');
});

test('changed cells are listed as grade-class-day-period', () => {
  const data = sample();
  data.자료147 = JSON.parse(JSON.stringify(data.자료147));
  data.자료147[1][1][2][1] = '>2001';
  assert.deepEqual(gradeRows(data, keys, 1, false).changed, ['1-1-2-1']);
});

test('fresh weeks replace stored ones and the list stays sorted', () => {
  const merged = mergeWeeks([{ start: '2026-10-12', v: 'old' }, { start: '2026-10-19', v: 'old' }], [{ start: '2026-10-19', v: 'new' }, { start: '2026-10-26', v: 'new' }]);
  assert.deepEqual(merged.map((w) => w.start + ':' + w.v), ['2026-10-12:old', '2026-10-19:new', '2026-10-26:new']);
});

test('discovers route and data keys from the student page', () => {
  const html = "url:'./36179?17384l'+sc sc_data('73629_',sc,1,'0') 원자료=Q자료(자료.자료481[학년] 일일자료=Q자료(자료.자료147[학년] 성명=Q성명(자료.자료446[th]) 과목명=Q과목명(자료.자료492[sb])";
  assert.deepEqual(discover(html), keys);
});
