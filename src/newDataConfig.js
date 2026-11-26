export const SEASONS = ['시즌1', '시즌2', '시즌3'];
export const DEFAULT_ROUND = 'HM크루 직급전';
export const UPLOAD_ROUNDS = [DEFAULT_ROUND, ...Array.from({ length: 12 }, (_, i) => `HM크루 ${i + 1}회차`)];

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

// 현재 백엔드에는 관리자 인증 미들웨어가 없습니다. 브라우저 비밀번호로 우회하지 않습니다.
export const ADMIN_UPLOAD_ENABLED = false;
export const ADMIN_UPLOAD_BLOCK_REASON = '관리자 인증 연결이 필요하여 서버 업로드가 잠겨 있습니다. 엑셀 파일은 이 브라우저에서 확인할 수 있습니다.';
