# HM레이블 인증 제거·회차 명칭 변경 결과

작성일: 2026-11-27 (Asia/Seoul). 사용자가 이전 인증 유지 조건을 철회하고 HM레이블 전용 인증 제거와 양쪽 저장소 Push를 요청한 범위에 적용했다.

## 결과

HM레이블 관리자 업로드에서 프론트·백엔드의 비밀번호, 로그인, 토큰, 세션 의존성을 제거했다. 새 브라우저에서도 시즌 → 회차 → 엑셀 → 분석·미리보기 → 업로드 → 결과·재조회 순서로 작동한다. 요청에는 Content-Type과 기존 JSON 본문만 사용한다. 가짜 세션이나 공개 토큰으로 대체하지 않았다.

신규 표준은 **HM레이블 직급전 및 HM레이블 1~12회차**다. 목록·기본값·미리보기·POST/GET 값과 백엔드 검증·INSERT round를 일치시켰다. team은 C팀, season은 시즌1·2·3, 저장 대상은 donation_rable로 유지했다.

**실제 운영 DB에 테스트 데이터를 등록하지 않았다.** 저장·INSERT 본문·재조회 검증은 Mock DB/브라우저 결과다. 운영에서는 인증 없는 빈 POST의 400, 삭제된 인증 API의 404와 데이터 GET을 확인했다.

## 경로와 변경 파일

프론트: `C:/Users/user/Desktop/new/HMrable/front/HM-LABEL`, 원격 https://github.com/EdgeRunner107/HMrableData.git, 브랜치 **main**.

백엔드: 이력이 있는 안전한 작업 저장소 `C:/Users/user/Desktop/new/HMrable/back/ASG-B2-work`, 원격 https://github.com/EdgeRunner107/ASG-B2.git, 브랜치 **master**. Render에서도 실제 운영 브랜치가 master인 것을 확인했다. .git이 없는 ASG-B2-master는 수정하지 않았다.

백엔드 변경 파일(3개):

- `index.js`: HM레이블 인증 코드 삭제, 회차 표준·검증, 구/신 명칭 조회 호환성.
- `tests/rable.test.cjs`: 인증 없는 실제 라우트, 신규 명칭 INSERT, 혼합 회차 조회·집계 검증.
- `HM_RABLE_RELEASE.md`: API·환경변수·명칭·검증 문서.

프론트 변경 파일(11개):

- `src/api/adminAuth.js`: 삭제. loginAdmin/getAdminSession/subscribeAdminSession/logoutAdmin과 메모리 토큰 상태 제거.
- `src/api/uploads.js`: 세션 검사·401/403 로그아웃·Authorization 삭제. 데이터 검증 실패 등 확실한 미저장 응답 처리와 업로드 워크플로 유지.
- `src/newDataConfig.js`: 직급전·12개 회차 명칭 변경, ADMIN_LOGIN_URL 제거.
- `src/pages/AdminPage.jsx`: 인증 오류와 연관되던 공통 추가 문구 제거. 기존 UI 유지.
- `src/preview/data.js`: 공통 회차 목록 재사용.
- `tests/api.test.js`: 새 명칭과 인증과 무관한 사전 검증 실패의 수동 재시도 검증.
- `tests/hm_label_integration.py`: 빈 저장소·쿠키에서 인증 없이 501건 요청/재조회·207·중복 차단·직급전 검증.
- `tests/mobile_compare.py`: 원본 HM크루와 제품 HM레이블 명칭을 분리해 UI 비교 유지.
- `README.md`, `reference/README.md`, `PROJECT_REPORT.md`: 현재 흐름·결과.

## 인증 제거

비밀번호 입력창·로그인 모달·로그아웃 버튼·인증 표시·버튼 비활성화는 이전 UI 작업에서 제거되어 있었다. 이번에는 남아 있던 실제 요청 차단과 세션 모듈까지 제거했다. 인증 관련 localStorage/sessionStorage나 VITE 인증 변수는 추가하지 않았다. 기존 localStorage 업로드 지문은 중복 방지 기능이므로 유지했다.

백엔드에서 HM레이블만 사용하는 requireRableAdmin, rableAuthConfig, rableEqual, 로그인 실패 제한, HMAC 토큰 발급·검증·만료, POST /admin-rable/login, GET /admin-rable/session을 삭제했다. 업로드는 checkSupabase → 기존 중복 처리 → 전체 사전 검증 → 저장 흐름이다.

더 이상 필요하지 않은 환경변수는 **HM_RABLE_ADMIN_PASSWORD**, **HM_RABLE_TOKEN_SECRET**이다. 코드 의존성만 제거했으며 실제 Render 변수는 읽거나 삭제·변경하지 않았다. 설정 유무와 무관하게 동작한다. Supabase 연결 인증·공통 미들웨어·기존 H/M 정책은 유지했다. node:crypto는 중복 지문에 필요해 유지한다.

## 회차와 데이터 호환성

변경 전: HM크루 직급전 및 HM크루 1~12회차. 변경 후: HM레이블 직급전 및 HM레이블 1~12회차. 최대 회차는 유지한다. 별도 회차 추가 버튼은 원래 없고 공통 설정에서 목록을 자동 생성하는 구조다. 그 생성 정의·기본값을 변경했다.

신규 POST는 13개 표준만 허용한다. 구명칭·공백 변형·01회차·0/13회차·다른 팀·임의 SQL 문자열은 400이다. 원본 한글과 URL 인코딩을 사용하며 API 주소와 응답 구조는 유지했다.

읽기에서는 새 명칭과 대응 구명칭을 단일 Supabase IN 조건으로 조회한다. 전체 시즌 응답도 round를 HM레이블로 정규화하므로 조회 목록·직급전 우선 정렬·회차별 집계·그래프가 같은 명칭을 사용한다. DB 행은 수정하지 않는다. ID 유일성·페이지 count·마지막 count 검증을 유지하고 각 원본 행을 한 번만 반환한다. TOP 200도 두 번 조회하거나 합산하지 않는다. 서로 다른 ID의 기존 후원 행을 임의로 삭제·중복 제거하지 않는다.

변경 전 운영 C팀 전체 GET 결과는 **0건**, HM크루도 **0건**이었다. 마이그레이션 SQL은 필요하지 않아 작성·실행하지 않았다. 구명칭 호환성은 Mock으로 검증했다. 기존 금액·이름·ID·team·season·time·기본키는 수정하지 않았다.

## 기능·UI 유지

- API /supabase-data-rable, /upload-supabase-rable, /top200-rable 및 base https://asg-b2.onrender.com 유지.
- 전체 엑셀 → 전체 JSON 1회 → 전체 사전 검증 → **100행 순차 저장** → 응답 원본·ID·건수 검사 → 같은 범위 재조회 유지.
- 10MB, 날짜·시간·금액·시즌·회차·빈 데이터 검사, C팀·donation_rable 고정, 마지막 배치·207·응답 불명 처리 유지.
- 중복 클릭·브라우저 지문·서버 지문 유지. 불명확한 응답·부분 실패를 자동 재전송하지 않는다. 서버 지문은 기존처럼 메모리이며 재시작을 넘는 영구 보장은 아니다.
- 전체 조회·화면 100행 페이지네이션, 음수·0·bigint·누적·시간대·기여도·게임점수 공식과 TOP 200 nickname 그룹·signed SUM·순위·동점 유지.
- 원본 다크 테마·JSX·CSS·헤더·로고·버튼·표·TOP 200·그래프·모바일 스크롤 유지. styles.css는 원본과 바이트 단위 동일하다.

## 검증

| 항목 | 결과 |
| --- | --- |
| backend node --check index.js | 통과 |
| node --test tests/newdata.test.cjs tests/top200.test.cjs tests/rable.test.cjs | **76/76 통과** |
| 인증 없는 Mock 서버 | 전체 서버를 인증 변수 없이 실행. 로그인·쿠키·Authorization 없이 저장 200, 무효 데이터 400, DB 미설정 500, 인증 API 404 |
| 회차 Mock/실제 SDK 전송 | 13개 명칭 INSERT JSON, 혼합 IN·정규화·팀/시즌 분리·signed SUM/건수 일치 |
| 대량 | 99·100·101·499·500·501·999·1,000·1,001·2,700·5,000·10,000·10,005건과 마지막 배치·전체 재조회·합계 |
| npm test | **24/24 통과** |
| npm run test:browser | **9개 그룹 통과**, Mock 조회 71회, pageerror 0, 실제 외부 쓰기 0 |
| 브라우저 업로드 | 신규 context·빈 localStorage/sessionStorage·쿠키 없음. 인증 요청·Authorization 없이 501건 성공/재조회, 중복 차단, 207 성공401/실패100, 시즌3 직급전 성공 |
| npm run test:mobile | **18케이스·6,822개 스타일/크기 속성 일치**. 360·375·390·393·414·430·768·1440·1920px, 페이지 가로 넘침 없음 |
| npm run build | 성공. Mock·인증 모듈 제외, SPA 직접 접근 유지 |
| 보호 경로 | 원본 H/M 17개·원본 backend archive 8개 파일 해시 일치 |
| 기존 서비스 | HM레이블 구간 앞/뒤 소스가 이전 커밋과 동일. H/M API·업로드·테이블 접근·공통 설정 변경 없음 |

브라우저 저장은 Mock이며 실제 DB 저장 완료로 보고하지 않는다. 운영 INSERT/UPDATE/DELETE는 하지 않았다. 결과 파일은 Git 제외 경로 tests/artifacts의 noauth-live-api.json, noauth-existing-rounds.json, results.json, mobile-comparison.json에 있다.

## GitHub·배포·실행

백엔드 **4034b689a045a9c9e3577deca63e0dc71330bc04**, master Push·원격 해시 일치 확인. Render Auto-Deploy **Live**, 배포 ID **dep-dc468jgjo6nc73b87p1g** 확인.

배포 후 인증 없는 빈 data[] POST가 401 대신 **400(저장할 데이터 없음)**으로 검증에 도달한다. 로그인 POST·세션 GET은 404다. 시즌1~3 신규 직급전/1/12회차·구명칭 1회차 GET과 TOP 200 모두 200/0건이다. 기존 H/M 시즌1 직급전 GET은 각각 200/353건·200/645건, TOP 200도 각각 200/200건이다.

프론트는 백엔드 Live·신규 계약 확인 후 main에 Commit/Push한다. 최종 해시·원격 반영·Vercel 상태는 최종 전달 메시지에 기록한다. 기존 Vercel(Vite / npm run build / dist / SPA rewrite), Render(npm install / node index.js / 포트·CORS·Cron·Supabase) 설정은 변경하지 않았다.

의존성·lock·버전을 바꾸거나 새 패키지를 설치하지 않았다. 기존 프론트 audit 6건(높음5/중간1), React Router use client 안내, 500KB 청크 경고는 기존 범위다. 새 빌드 오류는 없다. 백엔드 Promise-like router 안내도 기능 실패를 일으키지 않았다.

LOCALHOST: **http://127.0.0.1:5174/**

관리자: **http://127.0.0.1:5174/admin**

운영 DB 쓰기 테스트는 요청에 따라 생략했다. 실제 엑셀 등록 시 서버 결과와 재조회 검증으로 성공 여부를 표시한다. 추가 인증 연결이나 데이터 마이그레이션은 필요하지 않다.
