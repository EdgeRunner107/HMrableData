import axios from 'axios';
import { DATA_API_URL } from '../newDataConfig';
import { PREVIEW_MODE, SCOPE_TEAM, previewState } from '../config/site';
import { validateDonationResponse } from './validation.js';

export async function fetchDonations(season, round, signal) {
  if (!['시즌1', '시즌2', '시즌3'].includes(season)) throw new Error('올바른 시즌을 선택해주세요.');
  let response;
  if (PREVIEW_MODE) {
    const { previewResponse } = await import('../preview/data');
    response = await previewResponse({ season, round, signal, kind: 'donations', state: previewState() });
  } else {
    try {
      // 서버가 전체 페이지를 합칩니다. page/limit/멤버 파라미터를 만들지 않습니다.
      response = await axios.get(DATA_API_URL, { params: { season, ...(round ? { round } : {}) }, signal, timeout: 120000 });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error(error.response?.data?.error || (error.code === 'ECONNABORTED'
        ? '조회 시간이 초과되었습니다. 다시 시도해주세요.' : '데이터를 불러오지 못했습니다. 서버 연결을 확인해주세요.'));
    }
  }
  validateDonationResponse(response.data, { season, round, team: SCOPE_TEAM });
  return response;
}

export async function fetchSeasonRanking(season, signal) {
  if (PREVIEW_MODE) {
    const { previewResponse } = await import('../preview/data');
    return previewResponse({ season, signal, kind: 'top200', state: previewState() });
  }
  // 기존 TOP 200은 H/M 전용 DB VIEW의 순위입니다. 미확인 집계 규칙을 만들지 않습니다.
  throw new Error('HM레이블 시즌 TOP 200은 전용 순위 API 연결이 필요합니다. 회차별 후원자 순위는 조회 화면에서 확인해주세요.');
}
