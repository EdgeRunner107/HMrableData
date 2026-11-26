// 전부 가상의 개발용 데이터입니다. 기존 운영 데이터는 포함하지 않습니다.
const TEAM = '__HM_LABEL_PREVIEW__';
const members = ['테스트 멤버 A', '테스트 멤버 B', '테스트 멤버 C'];
const rounds = ['HM크루 직급전', 'HM크루 1회차', 'HM크루 2회차', 'HM크루 3회차'];

export function makePreviewRows(season) {
  const seasonNumber = Number(season.replace('시즌', ''));
  return rounds.flatMap((round, ri) => members.flatMap((streamer, mi) =>
    Array.from({ length: 18 }, (_, index) => ({
      id: `${seasonNumber}-${ri}-${mi}-${index}`,
      team: TEAM, season, round, streamer,
      user_id: `preview-donor-${index % 7 + 1}`,
      nickname: `테스트 후원자 ${index % 7 + 1}`,
      amount: (index === 5 ? -200 : (index % 5 + 1) * 100) * seasonNumber * (mi + 1),
      time: `2026-11-${String(10 + ri).padStart(2, '0')} ${String(18 + Math.floor(index / 4)).padStart(2, '0')}:${String(index * 3 % 60).padStart(2, '0')}:00`,
      type: index === 5 ? '차감' : '후원', chat: 'HM레이블 디자인 확인용 가상 후원입니다.',
    }))));
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
}

export async function previewResponse({ season, round, signal, kind, state }) {
  // loading 상태는 화면에서 상태를 바꾸거나 이동할 때까지 유지합니다.
  await wait(state === 'loading' ? 2147483647 : 260, signal);
  if (state === 'error') throw new Error('개발용 오류 상태');
  const rows = state === 'empty' ? [] : makePreviewRows(season);
  let data = rows.filter(row => !round || row.round === round);
  if (kind === 'top200') {
    const totals = new Map();
    rows.forEach(row => {
      const value = totals.get(row.user_id) || {
        team: TEAM, season, nickname: row.nickname, total_amount: 0, donation_count: 0,
      };
      value.total_amount += row.amount;
      value.donation_count++;
      totals.set(row.user_id, value);
    });
    data = [...totals.values()].sort((a, b) => b.total_amount - a.total_amount)
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }
  return { data: { success: true, count: data.length, data } };
}
