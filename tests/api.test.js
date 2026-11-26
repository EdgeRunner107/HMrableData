import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx/xlsx.mjs';
import { EXCEL_HEADERS, parseExcel, normalizeTime, normalizeAmount } from '../src/api/excel.js';
import { validateDonationResponse } from '../src/api/validation.js';
import { createUploadWorkflow, validateUploadResult } from '../src/api/uploadWorkflow.js';

const season = '시즌1', round = 'HM크루 12회차';
const scope = { season, round, team: 'C팀' };
function excel(matrix, date1904 = false) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(matrix), '데이터');
  book.Workbook = { WBProps: { date1904 } };
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}
const fixture = count => Array.from({ length: count }, (_, i) => [String(i).padStart(6, '0'), '한글♡중복', i % 2 ? '' : '긴 채팅'.repeat(100), '멤버 A', '후원', i % 3 ? '1,234개' : -100, 46296.5]);
const storage = () => { const map = new Map(); return { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) }; };
const response = rows => ({ success: true, count: rows.length, data: rows });
function serverRows(rows) { return rows.map((row, i) => ({ id: i + 1, ...scope, user_id: row.아이디,
  nickname: row.닉네임, chat: row.채팅, streamer: row.스트리머, type: row.종류, amount: row.개수, time: row.시간 })); }

for (const count of [499, 500, 501, 999, 1000, 1001, 1250, 2500, 2700, 5000, 10000, 10005]) {
  test(`${count} rows: full Excel → one POST → stored IDs → full read verification`, async () => {
    const parsed = parseExcel(excel([EXCEL_HEADERS, ...fixture(count)]), scope);
    assert.equal(parsed.validRows, count);
    assert.equal(parsed.errors.length, 0);
    const stored = serverRows(parsed.rows);
    let calls = 0;
    const upload = createUploadWorkflow({ storage: storage(), post: async body => {
      calls++;
      assert.equal(body.data.length, count);
      assert.equal(body.season, season); assert.equal(body.round, round);
      assert.equal(body.team, undefined); assert.equal(body.data[0].id, undefined);
      assert.equal(body.data[0]._row, undefined); assert.equal(body.data.at(-1)['아이디'], String(count - 1).padStart(6, '0'));
      return { success: true, requestedRows: count, insertedRows: count, failedRows: 0, data: stored };
    }, read: async () => response(stored) });
    const result = await upload({ rows: parsed.rows, season, round });
    assert.equal(calls, 1); assert.equal(result.verifiedRows, count); assert.equal(result.complete, true);
    const rawSum = parsed.rows.reduce((sum, row) => sum + row.개수, 0);
    const loaded = validateDonationResponse(response(stored), scope);
    assert.equal(new Set(loaded.map(row => row.id)).size, count);
    assert.equal(loaded.reduce((sum, row) => sum + row.amount, 0), rawSum);
    assert.equal(loaded[0].amount, -100);
    await assert.rejects(upload({ rows: parsed.rows, season, round }), /이미 전송/);
    assert.equal(calls, 1);
  });
}

test('Excel: original IDs, repeated donations, negative/zero/bigint, local time, blank rows, ignored extra columns', () => {
  const rows = fixture(3); rows[1][5] = 0; rows[2][5] = '-9223372036854775808'; rows[2][6] = '2026-11-26 21:23:45';
  const parsed = parseExcel(excel([[...EXCEL_HEADERS, '기여도', '메모', 'id'], rows[0], [], ...rows.slice(1)]), scope);
  assert.equal(parsed.validRows, 3); assert.equal(parsed.excluded.length, 1);
  assert.equal(parsed.rows[0].아이디, '000000'); assert.equal(parsed.rows[0].개수, -100);
  assert.equal(parsed.rows[1].개수, 0); assert.equal(parsed.rows[2].개수, '-9223372036854775808');
  assert.equal(parsed.rows[0].시간, '2026-10-01 12:00:00');
  assert.equal(parsed.rows[2].시간, rows[2][6]); assert.equal(parsed.rows[0].id, undefined);
  assert.equal(parsed.rows[1]._row, 4);
  assert.equal(normalizeTime(1.5, true), '1904-01-02 12:00:00');
});

test('reject bad headers, dates, numeric precision and invalid integer instead of silently coercing', () => {
  assert.throws(() => parseExcel(excel([['아이디'], ['test']]), scope), /필수 컬럼/);
  for (const value of ['oops', 1.5, Number.MAX_SAFE_INTEGER + 1, '9223372036854775808']) assert.throws(() => normalizeAmount(value));
  for (const value of ['2026-02-30', '2026-11-26T12:00:00Z', '2026-11-26 25:00:00', 60]) assert.throws(() => normalizeTime(value));
  const rows = fixture(2); rows[1][5] = 'bad';
  const parsed = parseExcel(excel([EXCEL_HEADERS, ...rows]), scope);
  assert.equal(parsed.dataRows, 2); assert.equal(parsed.validRows, 1); assert.equal(parsed.errors[0].row, 3);
});

test('read refuses partial counts, duplicate IDs, mixed seasons/teams/rounds and invalid success', () => {
  const row = { id: 1, ...scope };
  for (const bad of [{ success: true, count: 2, data: [row] }, response([row, row]), response([{ ...row, season: '시즌2' }]),
    response([{ ...row, team: 'H팀' }]), response([{ ...row, round: '다른 회차' }]), { ...response([row]), success: false }]) {
    assert.throws(() => validateDonationResponse(bad, scope));
  }
  assert.deepEqual(validateDonationResponse(response([]), scope), []);
});

test('207 partial storage never succeeds and cannot be retried; exact server failure batch retained', async () => {
  const parsed = parseExcel(excel([EXCEL_HEADERS, ...fixture(501)]), scope);
  const rows = serverRows(parsed.rows).filter((_, i) => i < 100 || i >= 200);
  const failures = [{ batchNumber: 2, startIndex: 100, endIndex: 199, count: 100 }];
  let calls = 0;
  const upload = createUploadWorkflow({ storage: storage(), post: async () => { calls++; return {
    success: false, requestedRows: 501, insertedRows: 401, failedRows: 100, failedBatches: failures, data: rows,
  }; }, read: async () => response(rows) });
  const result = await upload({ rows: parsed.rows, season, round });
  assert.equal(result.complete, false); assert.equal(result.verifiedRows, 401); assert.deepEqual(result.failedBatches, failures);
  await assert.rejects(upload({ rows: parsed.rows, season, round }), /이미 전송/); assert.equal(calls, 1);
});

test('network timeout after POST locks retry; unknown counts are never reported as zero/success', async () => {
  let calls = 0;
  const upload = createUploadWorkflow({ storage: storage(), post: async () => { calls++; throw new Error('timeout'); }, read: async () => {} });
  const options = { rows: parseExcel(excel([EXCEL_HEADERS, ...fixture(1)]), scope).rows, season, round };
  await assert.rejects(upload(options), /timeout/); await assert.rejects(upload(options), /이미 전송/); assert.equal(calls, 1);
  assert.throws(() => validateUploadResult({ success: true, data: [] }, 1), /실제 저장 건수/);
});

test('readback failure or missing saved IDs cannot produce upload success', async () => {
  for (const read of [async () => { throw new Error('read failed'); }, async () => response([])]) {
    const rows = parseExcel(excel([EXCEL_HEADERS, ...fixture(1)]), scope).rows;
    const upload = createUploadWorkflow({ storage: storage(), post: async () => ({ success: true, requestedRows: 1, insertedRows: 1, failedRows: 0, data: serverRows(rows) }), read });
    const result = await upload({ rows, season, round });
    assert.equal(result.complete, false); assert.equal(result.insertedRows, 1);
  }
});

test('in-flight double click, unavailable storage and >10MB are rejected before another POST', async () => {
  const rows = parseExcel(excel([EXCEL_HEADERS, ...fixture(1)]), scope).rows;
  let release;
  const upload = createUploadWorkflow({ storage: storage(), post: () => new Promise(resolve => { release = resolve; }), read: async () => response(serverRows(rows)) });
  const first = upload({ rows, season, round });
  await assert.rejects(upload({ rows, season, round }), /진행 중/);
  await new Promise(resolve => setTimeout(resolve, 10));
  release({ success: true, requestedRows: 1, insertedRows: 1, failedRows: 0, data: serverRows(rows) }); await first;
  let posts = 0;
  const unavailable = createUploadWorkflow({ storage: { getItem() { throw new Error('blocked'); } }, post: () => posts++ });
  await assert.rejects(unavailable({ rows, season, round }), /blocked/); assert.equal(posts, 0);
  await assert.rejects(unavailable({ rows: [{ 채팅: 'a'.repeat(10 * 1024 * 1024) }], season, round }), /10MB/);
});

test('server cannot silently change an original amount or text and still report success', async () => {
  const rows = parseExcel(excel([EXCEL_HEADERS, ...fixture(1)]), scope).rows;
  const changed = serverRows(rows);
  changed[0].amount = 100;
  const upload = createUploadWorkflow({ storage: storage(), post: async () => ({ success: true,
    requestedRows: 1, insertedRows: 1, failedRows: 0, data: changed }), read: async () => response(changed) });
  await assert.rejects(upload({ rows, season, round }), /원본 데이터와 다릅니다/);
});
