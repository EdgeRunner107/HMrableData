import axios from 'axios';
import { UPLOAD_API_URL } from '../newDataConfig';
import { fetchDonations } from './donations';
import { createUploadWorkflow } from './uploadWorkflow.js';
import { getAdminSession, logoutAdmin } from './adminAuth';
import { PREVIEW_MODE } from '../config/site';

let workflow;
export function uploadDonations(options) {
  if (PREVIEW_MODE) return Promise.reject(new Error('개발 프리뷰에서는 서버 업로드를 하지 않습니다.'));
  if (!getAdminSession()) return Promise.reject(new Error('업로드용 서버 인증 세션이 없습니다. 인증 연결이 필요합니다.'));
  workflow ||= createUploadWorkflow({
    storage: window.localStorage,
    post: async body => {
      const session = getAdminSession();
      if (!session) throw Object.assign(new Error('업로드용 서버 인증 세션이 만료되어 전송하지 않았습니다.'), { notStored: true });
      try {
        return (await axios.post(UPLOAD_API_URL, body, {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` }, timeout: 180000,
        })).data;
      } catch (error) {
        if ([401, 403].includes(error.response?.status)) logoutAdmin();
        throw Object.assign(new Error(error.response?.data?.error || '업로드 결과를 확인할 수 없습니다. 등록 내역을 확인해주세요.'), {
          notStored: [400, 401, 403, 413, 415].includes(error.response?.status),
        });
      }
    },
    read: async (season, round) => (await fetchDonations(season, round)).data,
  });
  return workflow(options);
}
