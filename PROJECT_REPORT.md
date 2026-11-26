# HM레이블 백엔드·프론트엔드 최종 결과

작성일: 2026-11-27 (Asia/Seoul). 이전 보고서는 Git 커밋 `3c20a32`에 보존되어 있다.

## 결과

C팀 전용 TOP 200, 서버 관리자 인증, 인증 후 Excel 업로드, 전체 건수 검증 및 중복 요청 방지, 모바일 개선을 구현했다. 백엔드 `master`는 실제 Push 후 Render 자동 배포 **Live**를 확인했다. 프론트 기능 커밋 `9732c8bbcb6cbadb5906bb85adcbe3301da049f9`도 `main`에 실제 Push하고 원격 refs 일치를 확인했다. 이후 Windows 개발 서버의 파일 잠금 방지를 추가했으며 최신 커밋은 최종 답변에 명시한다. 단순 의존성 경고를 이유로 Push를 보류하지 않는다.

실제 운영 서버에서 C팀 시즌1·2·3 조회와 TOP 200 모두 HTTP 200 / 0건, 관리자 로그인·세션 확인 200, 무인증 업로드 401을 확인했다. **운영 DB에 테스트 데이터를 생성·수정·삭제하지 않았다.** 실제 저장 검증은 Mock DB와 실제 라우트에서 수행했다. 인증된 운영 POST로 데이터를 저장하는 시험은 하지 않았다.

## 작업 경로와 보호

| 구분 | 경로·원격 |
| --- | --- |
| 백엔드 실제 수정 | `C:\Users\user\Desktop\new\HMrable\back\ASG-B2-work` / `https://github.com/EdgeRunner107/ASG-B2.git` / `master` |
| 프론트 실제 수정 | `C:\Users\user\Desktop\new\HMrable\front\HM-LABEL` / `https://github.com/EdgeRunner107/HMrableData.git` / `main` |
| 원본 백엔드 보존 | `C:\Users\user\Desktop\new\HMrable\back\ASG-B2-master` |
| 원본 H/M 프론트 보존 | `C:\Users\user\Desktop\new\HMrable\front\HM-NewData-master` |

원본 백엔드는 여전히 .git 없는 폴더여서 임의 init/전체 업로드를 하지 않았다. 원격 `master`의 `d36f8c3`을 별도 clone했고 로컬 원본 index.js와 일치함을 확인한 다음 HM레이블 영역만 변경했다. 원격 이력과 기존 프론트 `3c20a32`를 유지했다. 강제 push/reset/clean/checkout은 사용하지 않았다.

원본 백엔드 소스·설정 8개와 H/M 프론트 17개 파일의 SHA-256이 작업 전후 동일하다(node_modules/dist/.git 제외). 백엔드 index.js의 HM 전용 영역 이전과 기존 H/M TOP 200 이후 전체 소스는 원격 기준과 문자 단위로 동일하다. 기존 H/M 조회·업로드·TOP 200, 공유 함수, Cron, CORS, Supabase 연결, 포트·시작 코드는 변경하지 않았다. 원본 프론트 모바일 실행은 별도 임시 복사본을 사용했다.

## 백엔드 변경 파일

- `index.js`: HM 전용 인증·TOP 200·전체 조회 검증·중복 요청 처리.
- `package-lock.json`: 기존 package.json에 이미 선언된 Supabase 2.57.4, ws 8.18.0의 누락 잠금 추가. 기존 잠금 패키지의 버전 변경은 0개, package.json 버전 범위는 유지.
- `HM_RABLE_API.txt`, `HM_RABLE_RELEASE.md`: 이전 무인증 계약의 대체 안내와 현재 사용법.
- `sql/hm-rable-view-definition.sql`: 실제 사용한 읽기 전용 정의 조회와 관찰 결과. DDL 없음.
- `tests/http.cjs`: 테스트 전용 loopback HTTP 전송. Windows fetch bad port 문제 해결.
- `tests/rable.test.cjs`: 인증·전체 조회·TOP 200·대량 저장 검증.
- `tests/newdata.test.cjs`, `tests/top200.test.cjs`: 테스트 전송만 교체. 기존 H/M 기대 동작 유지.

## TOP 200 공식과 구현

Supabase의 기존 `public.donation_top200_by_team_season`에 대해 다음 **읽기 전용 SQL만 실행**해 실제 정의를 확인했다. 기존 VIEW와 DB 데이터는 수정하지 않았다.

```sql
SELECT pg_get_viewdef('public.donation_top200_by_team_season'::regclass, true) AS definition;
```

확인된 원본 기준:

- `team, season, nickname` 그룹화. **user_id는 사용하지 않는다.** 같은 닉네임의 여러 ID는 합산하며 닉네임 변경 후에는 별도 그룹이다. 이름 자체의 공백을 제거해서 묶지 않는다.
- NULL season, NULL nickname, 공백만 있는 nickname, NULL amount 제외. 닉네임 공백 판단은 PostgreSQL 기본 TRIM의 공백 기준을 따른다.
- `count(*)`, **signed `sum(amount)`**. 음수를 절댓값으로 바꾸지 않는다.
- 회차 제한 없이 시즌 전체 대상이므로 직급전과 모든 회차를 포함한다.
- 합계 내림차순, 닉네임 오름차순으로 `row_number()` 부여. 동점에게 같은 rank를 주는 방식이 아니다.
- 집계 후 rank 1~200. 200명 미만은 실제 인원만, 비어 있으면 정상 빈 배열.

신규 **GET https://asg-b2.onrender.com/top200-rable?season=시즌1**은 `donation_rable`의 C팀만 조회한다. 시즌1·2·3이 필수이고 round 제한은 거부한다. H/M 경로·기존 VIEW를 확장하지 않았다.

서버가 전체 기록을 읽고 닉네임 그룹·signed BigInt 합계를 계산한 뒤 200명을 선정한다. 동점 순서는 **DB의 nickname 정렬로 받은 순서**를 stable sort로 보존하므로 JavaScript locale로 DB collation을 추측하지 않는다. 큰 정수 합계는 안전 정수 범위 밖이면 문자열로 반환한다.

```json
{"success":true,"count":1,"data":[{"team":"C팀","season":"시즌1","nickname":"후원자","donation_count":2,"rank":1,"total_amount":90}]}
```

현재 실제 시즌1·2·3 응답은 모두 `{success:true,count:0,data:[]}`다. 잘못된 시즌은 400. DB 오류·불완전 조회는 500이다. **신규 VIEW/RPC·SQL 적용·마이그레이션은 필요 없다.**

## 관리자 인증과 실제 사용

기존 관리자/백엔드에는 재사용 가능한 로그인 구현이 없음을 재확인했다. 새 정책은 HM레이블 경로에만 적용한다.

- `POST https://asg-b2.onrender.com/admin-rable/login`: JSON `{password}`.
- 성공 시 HMAC-SHA256으로 서명한 30분 토큰과 expiresAt 반환. audience/scope/발급·만료 시각/서명을 서버에서 확인한다.
- `GET /admin-rable/session`: Bearer 인증 확인.
- `POST /upload-supabase-rable`: **Bearer 인증 필수**. 인증 실패 401, 잘못된 서버 설정 503, 15분 구간 로그인 실패 10회 이상 429.
- 비밀번호는 고정 시간 해시 비교, 인증 응답은 `Cache-Control: no-store`. 비밀번호·토큰을 서버 로그에 남기지 않는다.
- 프론트 비밀번호 하드코딩, VITE 비밀키, URL 토큰 전달은 없다. 토큰은 탭 메모리에만 보관하고 새로고침 시 재로그인한다. 로그아웃은 탭 토큰을 제거하며 서버에서 이미 발급한 토큰은 최대 30분 유효하다.

Render ASG-B2 환경에 **HM_RABLE_ADMIN_PASSWORD**, **HM_RABLE_TOKEN_SECRET** 두 변수를 새로 추가 저장했다. 암호학적으로 임의 생성한 값을 사용했고 기존 변수 10개는 변경하지 않았음을 UI 값 비교로 확인했다. Save only로 저장한 다음 GitHub Push에 따른 배포가 새 값을 읽도록 했다. 기존 Render 설정·빌드·시작 방식·도메인은 변경하지 않았다.

**관리자는 Render → ASG-B2 → Environment → HM_RABLE_ADMIN_PASSWORD에서 비밀번호를 확인하거나 직접 변경한 후 /admin에서 로그인하면 된다.** 비밀번호 자체는 이 보고서·Git·프론트 빌드·로그에 기록하지 않았다. 토큰 서명 키는 사용자 화면에 입력하지 않는다. 최소 길이는 비밀번호 16자·서명 키 32자다.

운영 API에 새 비밀번호로 로그인 200, 세션 확인 200, 만료까지 약 1,800초, no-store를 확인했다. 무인증 빈 업로드 요청은 401이며 DB에 도달하지 않았다. 관리자의 유효한 파일은 로그인 후 실제 서버로 업로드할 수 있도록 연결했으며 종전의 상수 false 잠금을 제거했다.

## 업로드·중복·전체 조회

기존 전체 JSON **1회 전송 → 전체 행 사전 검증 → 서버 내부 100행 순차 INSERT/SELECT**와 append-only 정책을 유지했다. 기존 10MB 전역 제한은 바꾸지 않았고 클라이언트는 JSON UTF-8 크기 초과 시 전송 전에 중단한다. 회차 삭제·대체 API는 추가하지 않았다.

Excel 실제 행·빈 행 제외·파싱·유효·전송·저장 성공·실패·재조회 확인 건수를 구분한다. 207, 응답 건수 불일치, 원본과 다른 저장 응답, 실패 배치, 네트워크 결과 불명, 재조회 실패를 전체 성공으로 표시하지 않는다. 내부 배치 진행 API가 없으므로 가상의 퍼센트를 만들지 않는다. 완료는 저장 ID 및 원본 필드를 재조회에서 확인한 경우에만 표시한다.

클라이언트 중복 클릭 잠금·SHA-256·localStorage 보호는 유지했다. 결과 불명·부분 실패는 자동/전체 재전송하지 않는다. DB 쓰기 전 400/401/403/413/415가 확정된 경우에는 잠금을 해제해 수정·재로그인 후 수동 재시도를 허용한다.

서버도 정규화된 **전체 요청**의 지문을 최대 24시간 기억한다. 진행 중 같은 요청은 409, 완료·207 결과는 저장했던 응답을 재사용한다. 기록은 128개·64MB 제한이며 용량 부족 시 안전하게 거부한다. 개별 후원 행을 닉네임·금액으로 중복 제거하지 않아 정상적인 반복 후원과 원본 음수·0·시간을 보존한다.

**한계:** 서버 지문은 프로세스 메모리이므로 재시작·다중 인스턴스 사이의 영구 멱등성은 보장하지 않는다. 다른 브라우저에서 배포 후 같은 파일을 다시 올리는 경우까지 막는 영구 보장이 필요하면 별도 DB/지속 저장소 계약과 승인이 필요하다. 신규 테이블을 임의 생성하지 않았다. 현재 프론트 영구 지문과 서버 실행 중 중복 방지를 함께 사용한다.

조회는 매 페이지 exact count, ID 유일성, 팀·시즌·회차 범위 및 최종 head count를 확인한다. 1,000행 요청이 333행으로 제한돼도 실제 수신 수만큼 offset을 옮겨 전체 건수까지 진행한다. 총건수 변화·빈 중간 페이지·중복·범위 혼입은 오류로 반환한다. 동시 INSERT/DELETE에 따른 건수 불일치는 숨기지 않는다. 같은 총건수를 유지하는 외부 UPDATE까지 DB 스냅샷 일관성을 보장하는 것은 아니다.

## 프론트·모바일

변경: `src/newDataConfig.js`, `src/api/adminAuth.js`, `donations.js`, `top200.js`, `uploads.js`, `uploadWorkflow.js`, `src/pages/AdminPage.jsx`, `src/label.css`, `package.json`, 테스트 3개 파일, `vite.config.js` 및 README/보고서. 신규 TOP 200·로그인·업로드는 하나의 VITE_API_BASE_URL을 공유한다.

- 기존 TOP 200 패널에 C팀 API를 연결하고 미지원 안내를 제거했다. 로딩·빈 데이터·오류·다시 시도·뒤로가기를 유지했다.
- 기존 다크/퍼플·폰트·시즌 카드·표·그래프·관리자 레이아웃을 유지하고 팀 선택은 제공하지 않는다.
- 원본과 360·375·390·393·414·430·768·1440·1920px을 비교했다. 메인/조회/TOP 200/관리자 동일 너비 스크린샷과 측정값을 저장했다.
- 회차 선택은 높이 48px·글자 16px, 관리자 입력/버튼은 48px로 터치 조작과 iOS 입력 가독성을 확보했다. 작은 화면의 메인 높이·카드 여백을 줄였다.
- TOP 200은 기존 네 컬럼을 유지하고 긴 닉네임을 줄바꿈하며 큰 숫자는 표 내부 가로 스크롤로 읽도록 했다. 표는 최대 65vh 내부 스크롤·고정 헤더를 적용해 닫기/뒤로가기 접근을 유지한다. 상위 3개 순위는 기존 퍼플 팔레트로 강조했다.
- 요약 숫자는 말줄임으로 자르지 않고 줄바꿈한다. 상세/미리보기의 내부 가로 스크롤과 100행 단위 렌더링을 유지한다. 전체 페이지는 가로로 밀리지 않는다.
- 기존 회차별 게임점수·행별 절댓값 기여도·후원자 합계·검색·시간별 점수/건수·개인 누적 집계 블록은 원본과 동일함을 문자 단위 비교했다. 원본 데이터 부호와 한국 시각을 변경하지 않았다.
- 시즌 이동 시 회차·멤버·검색·파일·순위·그래프와 진행 요청을 분리한다. 운영 빌드에 Mock을 포함하지 않는다.

## 테스트

| 항목 | 결과 |
| --- | --- |
| 백엔드 기존+신규 실제 Express/Mock DB | **75/75 통과** |
| 실제 Supabase SDK 전송 형식 | 통과: C팀 테이블/amount::text/필터/INSERT JSON/count |
| 프론트 단위·계약 | **24/24 통과** |
| Chrome 통합 | **9개 그룹 통과**, Mock GET 68회, Mock 업로드 2회, 외부 실제 DB 쓰기 0, pageerror 0 |
| 원본 모바일 비교 | **18개 비교 통과**: 2개 사이트 × 9개 너비, 메인/조회/TOP 200/관리자 스크린샷 |
| 프로덕션 빌드 | 성공, dist 생성, 관리자/XLSX 별도 청크 |
| 서버 실행 | 실제 Node index.js의 root 200 확인, 테스트용 서버만 종료 |
| 설치 재현성 | 수정한 백엔드 package/lock으로 별도 임시 폴더 npm ci 성공 |
| 실제 운영 확인 | Render Live + 로그인/세션 200, 무인증 업로드 401, C팀 조회/TOP 200 모든 시즌 200 |
| 기존 운영 읽기 | H/M 시즌3 조회 각각 200/0건, H/M 시즌1 TOP 200 각각 200/200명: 배포 전후 동일 |

대량 저장은 **99·100·101·499·500·501·999·1,000·1,001·2,700·5,000·10,000·10,005건**을 실제 라우트+Mock DB에서 검증했다. 프론트는 추가로 1,250·2,500건도 검사했다. 각 건수의 파싱·전체 1회 전송·100행 배치 수·마지막 배치·반환 ID·재조회 총건수·원본 합계·음수·중복 요청 방지를 검증했다. TOP 200은 0·13·199·200·201·350명, 시즌 분리, 1,001건 이상 합산, 다른 ID/같은 닉네임, 닉네임 변경, 큰 정수·음수·동점·NULL 제외를 검사했다.

브라우저에서 501건 업로드와 저장 재조회 완료, 같은 파일 재전송 차단, 207(성공401/실패100), 잘못된 비밀번호, 30분 만료, 시즌 전환·지연 응답·오류·잘못된 건수를 확인했다. 모두 Mock 저장이다. 운영 DB는 현재 비어 있으므로 운영 대량 쓰기·수만 건 성능 실측으로 보고하지 않는다.

결과 파일은 Git 제외 경로 `tests/artifacts/results.json`, `mobile-comparison.json`, `live-before.json`, `live-after.json`, audit JSON 및 비교 스크린샷이다. 별도 lint/tsc 스크립트가 없는 JSX 프로젝트다. 기존 React Router use client 및 약 622KB 기본 청크 경고는 빌드를 막지 않았다.

## 의존성 경고와 영향

프론트 npm audit는 이전과 동일하게 **6건: 높음 5, 중간 1**이다. 기존 의존성 버전과 라이브러리를 강제 변경하지 않았다.

| 패키지 | 경고와 실제 범위 |
| --- | --- |
| axios (높음) | prototype pollution 전제의 요청 변경·Node 어댑터 등의 경고. 프론트 요청은 고정 HTTPS API/XHR·고정 옵션을 사용하고 임의 URL을 받지 않는다. 모든 경고가 이 호출에 도달하는 것으로 단정하지 않으며 pollution 전제 위험 자체는 남는다. |
| esbuild (중간) | 개발 서버 응답 노출 경고. 로컬 dev는 loopback에서만 실행하며 Vercel은 정적 dist를 제공한다. |
| follow-redirects (높음) | Node HTTP redirect의 인증 헤더 관련. 브라우저에서는 이 Node 어댑터가 실행되지 않는다. |
| source-map-js (높음) | source map 입력의 DoS. 사용자 source map 업로드/처리 기능은 없다. |
| vite (높음) | 개발 서버 경로/Windows 에디터 관련 경고. 운영 정적 dist에서 Vite 개발 서버를 띄우지 않는다. |
| xlsx (높음) | 파일 파싱 prototype pollution/ReDoS. 관리자가 선택한 악성 Excel은 브라우저에 실제 영향을 줄 수 있는 잔여 위험이다. 신규 서버 업로드는 JSON만 처리한다. 기존 XLSX의 안전한 교체/패치 검토는 별도 작업이며 이번에 임의 교체하지 않았다. |

이는 무취약 판정이 아니다. audit 상세·advisory URL은 `tests/artifacts/audit-final.json`에 있다. 사용자 지시에 따라 이 기존 경고만으로 Push를 중단하지 않았다.

백엔드 잠금 정합성 설치 기준 audit는 **15건(critical2/high7/moderate6)**이다. form-data/proxy-addr 등 기존 의존성 경고와 기존 선언 ws가 잠금에 추가되며 드러난 경고를 포함한다. 신규 인증은 jws/폼·Google/WS를 사용하지 않고 Node crypto와 JSON을 사용한다. 신규 라우트에서 multipart 또는 임의 외부 URL/신뢰 프록시 정책을 추가하지 않았다. 기존 위험의 제거·전체 의존성 업데이트를 수행한 것으로 보고하지 않는다. SDK 누락·bad port로 실패하던 기존 로컬 테스트는 설치 정합성과 테스트 HTTP 전송으로 해결했다.

## GitHub·배포·사용자 확인

- 백엔드 원격: https://github.com/EdgeRunner107/ASG-B2.git
- 백엔드 Push: **성공 / master / bf1d7056e5b4bd8d7117f60edc5418370820fc95**. 원격 refs 일치 확인.
- Render: **자동 배포 성공, Live**. 배포 ID `dep-dc45c3g473hc739519sg`, 대시보드 표시 약 30.7초. 기존 `npm install` / `node index.js` / master 유지.
- 프론트 원격: https://github.com/EdgeRunner107/HMrableData.git
- 프론트 Push: **성공 / main / 기능 커밋 9732c8bbcb6cbadb5906bb85adcbe3301da049f9**. Windows 감시 설정을 포함한 최신 커밋은 최종 전달 메시지에 기록한다.
- Vercel: **Vite / npm run build / dist**. 기존 vercel.json SPA rewrite 유지. 로컬 프로덕션 시즌/관리자 직접 접근을 검증했다.
- Vercel 변수: **VITE_API_BASE_URL=https://asg-b2.onrender.com** 하나. 서버 비밀번호/서명 키를 Vercel에 넣지 않는다.
- Vercel 프로젝트 생성·도메인·기존 설정 변경은 수행하지 않는다. 현재 로그인한 Vercel 범위에서 HMrableData 프로젝트 검색 결과가 없고, Push 후 GitHub 커밋 status context 0개·deployment 0개여서 자동 배포 연결은 확인되지 않았다. 프로젝트·도메인은 요청 범위에 따라 만들지 않았으며 Vercel 배포 완료로 보고하지 않는다.
- LOCALHOST: **http://127.0.0.1:5174/**, 관리자 **http://127.0.0.1:5174/admin**. 실제 서버 실행 및 브라우저 확인 완료. 가능한 한 실행 상태로 유지한다.
- 재실행: HM-LABEL에서 `npm.cmd run dev -- --host 127.0.0.1 --port 5174 --strictPort`.
- 사용자 추가 SQL: **없음**. Render 인증 변수: **추가 저장 완료**. 관리자 비밀번호는 위 Render 환경 화면에서 확인/변경한다.

남은 실질적 한계는 운영 DB 대량 쓰기를 시험하지 않았다는 점, 서버 재시작 간 영구 멱등성 부재, 다중 페이지 조회의 완전한 트랜잭션 스냅샷 부재, 기존 의존성 위험이다. 기존 개인 통계 Number 공식은 그대로여서 안전 정수 범위를 넘는 합계의 정밀도 한계도 유지된다(TOP 200 신규 합계는 BigInt). 이 한계와 정상 동작·검증 결과를 구분한다.

최종 로컬 점검에서 Windows EBUSY로 Vite가 생성된 audit JSON 감시 중 종료되는 문제를 발견했다. `vite.config.js`에서 `tests/artifacts`만 감시 제외해 원인을 해결했다. 운영 동작·API 계약은 바꾸지 않았다. 로컬 서버는 일반 개발 서버 세션으로 다시 실행하고 실제 HTTP·브라우저 접근을 재확인했다.
