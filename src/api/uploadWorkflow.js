import { validateDonationResponse } from './validation.js';

const savedFields = ['user_id', 'nickname', 'chat', 'streamer', 'type', 'amount', 'time', 'round', 'season', 'team'];
const valueKey = (field, value) => field === 'time' && typeof value === 'string' ? value.replace('T', ' ') : value;
const rowKey = row => JSON.stringify(savedFields.map(field => valueKey(field, row[field] ?? null)));

function verifyReturnedRows(stored, sent, season, round) {
  const expected = new Map();
  for (const row of sent) {
    const key = rowKey({ user_id: row.아이디, nickname: row.닉네임, chat: row.채팅, streamer: row.스트리머,
      type: row.종류, amount: row.개수, time: row.시간, season, round, team: 'C팀' });
    expected.set(key, (expected.get(key) || 0) + 1);
  }
  for (const row of stored) {
    const key = rowKey(row);
    if (!expected.get(key)) throw new Error('서버 저장 응답이 전송한 원본 데이터와 다릅니다. 등록 내역을 확인해주세요.');
    expected.set(key, expected.get(key) - 1);
  }
}

// 전송 수와 서버가 확인한 저장 수를 분리합니다.
export function validateUploadResult(body, requested) {
  if (!body || ![body.requestedRows, body.insertedRows, body.failedRows].every(n => Number.isSafeInteger(n) && n >= 0) ||
      body.requestedRows !== requested || body.insertedRows + body.failedRows !== requested ||
      !Array.isArray(body.data) || body.data.length !== body.insertedRows ||
      body.success !== (body.failedRows === 0) ||
      (body.failedRows > 0 && (!Array.isArray(body.failedBatches) || !body.failedBatches.length))) {
    throw new Error('서버의 실제 저장 건수를 확인할 수 없습니다. 재전송 전에 등록 내역을 확인해주세요.');
  }
  const ids = new Set(body.data.map(row => row?.id == null ? null : String(row.id)));
  if (ids.has(null) || ids.size !== body.insertedRows) throw new Error('서버 저장 ID를 확인할 수 없습니다.');
  return { ...body, failedBatches: body.failedBatches || [] };
}

export function createUploadWorkflow({ post, read, storage }) {
  let busy = false;
  return async function upload({ rows, season, round, onState = () => {} }) {
    if (busy) throw new Error('업로드가 이미 진행 중입니다.');
    if (!['시즌1', '시즌2', '시즌3'].includes(season) || typeof round !== 'string' || !round.trim() || !rows.length) throw new Error('업로드 범위를 확인해주세요.');
    const data = rows.map(row => Object.fromEntries(['아이디', '닉네임', '채팅', '스트리머', '종류', '개수', '시간'].map(key => [key, row[key]])));
    const payload = { data, season, round };
    const json = JSON.stringify(payload);
    if (new TextEncoder().encode(json).length > 10 * 1024 * 1024) throw new Error('서버 요청 제한 10MB를 초과했습니다. 파일 크기를 줄여주세요.');
    busy = true;
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
      const key = 'hm-label-upload:' + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      if (storage.getItem(key)) throw new Error('이미 전송한 파일입니다. 중복 저장을 막기 위해 재전송하지 않습니다. 등록 내역을 확인해주세요.');
      // 응답이 끊긴 경우에도 재시도하지 않습니다. 저장소 접근 실패 시 전송 전에 중단합니다.
      storage.setItem(key, 'pending');
      onState({ phase: 'sending', sentRows: rows.length });
      let body;
      try {
        body = validateUploadResult(await post(payload), rows.length);
        verifyReturnedRows(body.data, data, season, round);
      }
      catch (error) {
        if (error.notStored === true) storage.removeItem(key);
        else storage.setItem(key, 'unknown');
        throw error;
      }
      storage.setItem(key, body.success ? 'saved' : 'partial');
      onState({ phase: 'verifying', sentRows: rows.length, ...body });
      let verifiedRows = null;
      try {
        const response = await read(season, round);
        const stored = validateDonationResponse(response, { season, round });
        const byId = new Map(stored.map(row => [String(row.id), row]));
        verifiedRows = body.data.filter(row => {
          const loaded = byId.get(String(row.id));
          return loaded && rowKey(row) === rowKey(loaded);
        }).length;
      } catch { /* 저장 응답은 보존하고 재조회 실패를 별도로 표시합니다. */ }
      const complete = body.success && verifiedRows === rows.length;
      const result = { ...body, sentRows: rows.length, verifiedRows, complete };
      onState({ phase: complete ? 'complete' : 'incomplete', ...result });
      return result;
    } finally { busy = false; }
  };
}
