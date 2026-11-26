import axios from 'axios';
import { ADMIN_LOGIN_URL } from '../newDataConfig';

let session = null;
const subscribers = new Set();
export function getAdminSession() {
  return session && session.expiresAt > Date.now() ? session : null;
}
export function subscribeAdminSession(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}
export function logoutAdmin() {
  session = null;
  subscribers.forEach(callback => callback(null));
}
export async function loginAdmin(password) {
  try {
    const { data } = await axios.post(ADMIN_LOGIN_URL, { password }, { timeout: 20000 });
    if (data?.success !== true || typeof data.token !== 'string' || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= Date.now()) {
      throw new Error('관리자 인증 응답을 확인할 수 없습니다.');
    }
    // 토큰은 탭의 메모리에만 보관한다. 새로고침 후 다시 로그인한다.
    session = { token: data.token, expiresAt: data.expiresAt };
    subscribers.forEach(callback => callback(session));
    return session;
  } catch (error) {
    throw new Error(error.response?.data?.error || error.message || '관리자 로그인에 실패했습니다.');
  }
}
