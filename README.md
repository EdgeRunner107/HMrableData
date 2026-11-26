# HM LABEL · HM레이블

기존 HM 데이터 화면을 유지한 React 18 / Vite 5 프론트엔드입니다. C팀 전용이며 시즌 1·2·3을 바로 선택합니다.

## 실행 및 검증

```powershell
cd C:\Users\user\Desktop\new\HMrable\front\HM-LABEL
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1
npm.cmd test
npm.cmd run build
npm.cmd run test:browser
```

이번 작업에서 확인 가능한 개발 서버는 **http://127.0.0.1:5174/** 입니다. 5173의 기존 프로세스는 종료하지 않았습니다. 새 실행 시 포트는 Vite 출력으로 확인하세요.

| 경로 | 화면 |
| --- | --- |
| `/` | HM레이블 시즌 선택 |
| `/season/1`, `/season/2`, `/season/3` | 시즌별 후원 조회·통계 |
| `/admin` | 시즌·회차 선택, 기존 등록 건수, 엑셀 분석·미리보기 |

## API

기본 서버는 기존 설정 및 실제 GET으로 확인한 `https://asg-b2.onrender.com`입니다. `.env.local` 또는 Vercel의 `VITE_API_BASE_URL`로 일괄 변경할 수 있습니다. Vite 변수는 빌드 시 반영됩니다. 비밀정보를 넣지 마세요.

```dotenv
VITE_API_BASE_URL=https://asg-b2.onrender.com
VITE_PREVIEW_MODE=false
```

- `GET /supabase-data-rable?season=시즌1[&round=HM크루 1회차]`
- `POST /upload-supabase-rable` — 계약에 맞는 클라이언트를 준비했으나 관리자 인증 부재로 실제 전송은 잠겨 있습니다.
- 시즌값: `시즌1`, `시즌2`, `시즌3`. 회차 문자열은 원본 그대로 사용합니다.
- 조회는 서버가 1,000행씩 모두 읽어 `{ success, count, data }`를 반환합니다. 프론트는 추가 API 페이지네이션을 하지 않습니다.
- 클라이언트는 건수 일치, ID 중복, 시즌·팀·회차 범위를 검사합니다. 일부 응답으로 전체 통계를 계산하지 않습니다.
- 후원자 순위와 상세 표는 100행씩 표시하며 합계는 전체 데이터 기준입니다.
- H/M API와 Supabase 직접 연결, 실패 시 구 API/가상 데이터 대체는 사용하지 않습니다.
- C팀 전용 시즌 TOP 200 API가 없어 해당 패널에 연결 필요를 안내합니다. 기존 DB VIEW의 미확인 동점·집계 규칙을 추측하지 않습니다.

## 관리자 업로드의 현재 제한

참조한 원본 관리자에도 로그인·비밀번호·서버 인증 전달 코드가 없습니다. 신규 POST 라우트에도 인증 미들웨어가 없습니다. 따라서 브라우저 비밀번호나 환경변수로 인증을 만들어 우회하지 않고, 화면과 실제 요청 함수 모두에서 업로드를 차단합니다. 인증 지원 전까지 운영 업로드는 완료 상태가 아닙니다.

관리자 화면에서는 기존 회차 범위(직급전 + 1~12회차), 필수 엑셀 컬럼(아이디·닉네임·채팅·스트리머·종류·개수·시간), 다크 테마와 표·버튼 디자인을 유지합니다. 파일은 브라우저 안에서만 분석하며 서버에 보내지 않습니다. 잘못된 날짜나 정수 금액은 행별 오류로 표시하고 전체 파일 전송을 막습니다. 동일한 후원 내역을 임의로 중복 제거하지 않습니다.

`src/api/uploadWorkflow.js`는 의존성을 주입해 Mock 테스트합니다. 전체 JSON을 1회 전달하고 백엔드가 100행씩 저장하는 계약을 사용합니다. 207·건수 불일치·불명확한 응답·타임아웃·재조회 실패를 전체 성공으로 표시하지 않습니다. 전송 지문을 저장해 같은 브라우저의 동일 요청 재전송을 막으며, 서버의 멱등성 보장을 대신하지는 못합니다. 부분 실패나 전송 결과가 불명확한 경우 자동 재시도하지 않습니다. 삭제·교체 API는 구현하지 않았습니다.

## 개발 프리뷰 및 테스트

실제 API가 기본입니다. 개발 서버에서만 `VITE_PREVIEW_MODE=true`로 가상의 디자인 확인 데이터를 명시적으로 사용할 수 있습니다. 프로덕션에서는 프리뷰 코드가 제외됩니다.

`npm test`: 실제 XLSX 파일 파싱과 Mock 전송·재조회 검증 20개. 499·500·501·999·1,000·1,001·1,250·2,500·2,700·5,000·10,000·10,005건을 검사합니다.

`npm run test:browser`: Python Playwright와 설치된 Chrome을 사용합니다. 필요한 경우 `python -m pip install -r tests/requirements.txt`로 준비하세요. `HM_LABEL_CHROME`으로 Chrome 실행 파일을 지정할 수 있습니다. 테스트는 전용 로컬 서버를 띄우며 모든 API를 가로채 Mock으로 응답하고 쓰기 요청을 차단합니다. 결과·스크린샷은 Git에서 제외되는 `tests/artifacts/`에 기록합니다. 원본이 옆 폴더에 있으면 집계 코드와 로고 보존도 검사합니다. 이전 `tests/hm_label_browser.py` 실행 경로도 동일한 테스트로 연결합니다.

## Vercel 준비

- Repository: `https://github.com/EdgeRunner107/HMrableData.git`
- Framework Preset: **Vite**
- Build Command: **npm run build**
- Output Directory: **dist**
- 환경변수: **VITE_API_BASE_URL=https://asg-b2.onrender.com**
- 개발 전용 `VITE_PREVIEW_MODE`는 Vercel에 등록할 필요가 없습니다.
- `vercel.json`은 확장자 없는 SPA 경로를 `index.html`로 보내며 정적 파일·assets는 제외합니다.

서버 인증, C팀 TOP 200, 의존성 보안 점검 등 남은 문제는 [검증 보고서](PROJECT_REPORT.md)를 확인하세요. 요청서의 운영 배포 금지 조건에 따라 GitHub Push와 Vercel 배포는 보류합니다. 기존 Vercel 프로젝트·도메인·환경변수는 수정하지 않았습니다.
