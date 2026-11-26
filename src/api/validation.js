export function validateDonationResponse(body, { season, round, team = 'C팀' }) {
  if (body?.success !== true || !Array.isArray(body.data) || !Number.isSafeInteger(body.count) || body.count !== body.data.length) {
    throw new Error('조회 응답의 전체 건수가 일치하지 않습니다. 다시 조회해주세요.');
  }
  const ids = new Set();
  for (const row of body.data) {
    if (!row || row.team !== team || row.season !== season || (round && row.round !== round)) {
      throw new Error('선택한 시즌·회차와 다른 데이터가 응답에 포함되어 있습니다.');
    }
    if (row.id == null || ids.has(String(row.id))) throw new Error('조회 응답에 누락되거나 중복된 데이터 ID가 있습니다.');
    ids.add(String(row.id));
  }
  return body.data;
}
