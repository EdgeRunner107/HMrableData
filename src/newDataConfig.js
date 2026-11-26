export const SEASONS = ['시즌1', '시즌2', '시즌3'];
export const DEFAULT_ROUND = 'HM레이블 직급전';
export const UPLOAD_ROUNDS = [DEFAULT_ROUND, ...Array.from({ length: 12 }, (_, i) => `HM레이블 ${i + 1}회차`)];

// 기존 설정 및 실제 GET 응답으로 확인한 운영 서버.
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'https://asg-b2.onrender.com').replace(/\/+$/, '');
const base = new URL(API_BASE_URL);
if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
  throw new Error('VITE_API_BASE_URL에 올바른 서버 주소를 설정해주세요.');
}
if (import.meta.env.PROD && (base.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) {
  throw new Error('운영 API에는 HTTPS 서버 주소가 필요합니다.');
}
export const DATA_API_URL = `${API_BASE_URL}/supabase-data-rable`;
export const UPLOAD_API_URL = `${API_BASE_URL}/upload-supabase-rable`;
export const TOP200_API_URL = `${API_BASE_URL}/top200-rable`;
