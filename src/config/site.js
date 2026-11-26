export const SITE = Object.freeze({ name: 'HM레이블', englishName: 'HM LABEL', members: [] });

// 실제 멤버 명단 제공 전에는 API 응답의 streamer 목록을 사용합니다.
// 프리뷰는 개발 서버에서만 허용합니다. 프로덕션에서는 항상 비활성화됩니다.
export const PREVIEW_MODE = import.meta.env.DEV && import.meta.env.VITE_PREVIEW_MODE === 'true';
export const API_TEAM = 'C팀';
export const LIVE_API_ENABLED = !PREVIEW_MODE;
export const SCOPE_TEAM = PREVIEW_MODE ? '__HM_LABEL_PREVIEW__' : API_TEAM;
export const SEASON_OPTIONS = [1, 2, 3].map(id => ({ id: String(id), label: `시즌${id}`, title: `시즌 ${id}` }));

export function previewState() {
  if (!PREVIEW_MODE) return 'ready';
  const value = new URLSearchParams(window.location.search).get('previewState');
  return ['empty', 'loading', 'error'].includes(value) ? value : 'ready';
}
