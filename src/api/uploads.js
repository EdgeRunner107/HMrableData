import axios from 'axios';
import { ADMIN_UPLOAD_ENABLED, ADMIN_UPLOAD_BLOCK_REASON, UPLOAD_API_URL } from '../newDataConfig';
import { fetchDonations } from './donations';
import { createUploadWorkflow } from './uploadWorkflow.js';

let workflow;
export function uploadDonations(options) {
  // 화면 제어와 별도로 실제 요청 경계에서도 차단합니다.
  if (!ADMIN_UPLOAD_ENABLED) return Promise.reject(new Error(ADMIN_UPLOAD_BLOCK_REASON));
  workflow ||= createUploadWorkflow({
    storage: window.localStorage,
    post: async body => (await axios.post(UPLOAD_API_URL, body, {
      headers: { 'Content-Type': 'application/json' }, timeout: 180000,
    })).data,
    read: async (season, round) => (await fetchDonations(season, round)).data,
  });
  return workflow(options);
}
