import axios from 'axios';
import { UPLOAD_API_URL } from '../newDataConfig';
import { fetchDonations } from './donations';
import { createUploadWorkflow } from './uploadWorkflow.js';
import { PREVIEW_MODE } from '../config/site';

let workflow;
export function uploadDonations(options) {
  if (PREVIEW_MODE) return Promise.reject(new Error('개발 프리뷰에서는 서버 업로드를 하지 않습니다.'));
  workflow ||= createUploadWorkflow({
    storage: window.localStorage,
    post: async body => {
      try {
        return (await axios.post(UPLOAD_API_URL, body, {
          headers: { 'Content-Type': 'application/json' }, timeout: 180000,
        })).data;
      } catch (error) {
        throw Object.assign(new Error(error.response?.data?.error || '업로드 결과를 확인할 수 없습니다. 등록 내역을 확인해주세요.'), {
          notStored: [400, 413, 415].includes(error.response?.status),
        });
      }
    },
    read: async (season, round) => (await fetchDonations(season, round)).data,
  });
  return workflow(options);
}
