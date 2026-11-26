import { fetchSeasonRanking } from './donations';

export async function fetchTop200(team, season, signal) {
  const { data } = await fetchSeasonRanking(season, signal);
  if (data?.success !== true || !Array.isArray(data.data) || data.count !== data.data.length || data.count > 200 ||
      data.data.some((row, index) => row.team !== team || row.season !== season || row.rank !== index + 1)) {
    throw new Error('시즌 TOP 200 응답의 범위 또는 순위를 확인할 수 없습니다.');
  }
  return data.data;
}
