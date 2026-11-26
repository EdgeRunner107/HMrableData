# HM LABEL · HM레이블

C팀 전용 React 18 / Vite 5 프론트엔드입니다. 기존 다크/퍼플 UI와 데이터 집계 공식을 유지하며 시즌 1·2·3을 바로 선택합니다.

## 실행

```powershell
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

- 메인: `http://127.0.0.1:5174/`
- 시즌별 조회: `/season/1`, `/season/2`, `/season/3`
- 관리자: `/admin`

실제 운영 API가 기본이며 `.env.local` 또는 Vercel에 다음 변수를 설정할 수 있습니다.

```dotenv
VITE_API_BASE_URL=https://asg-b2.onrender.com
```

Vite 변수는 빌드 시 적용됩니다. 서버 비밀번호·서명 키는 VITE 변수에 넣지 않습니다.

## 조회·TOP 200

- `GET /supabase-data-rable?season=시즌1[&round=HM크루 1회차]`
- `GET /top200-rable?season=시즌1`
- 성공 응답: `{ success: true, count, data }`. 빈 데이터도 정상입니다.

백엔드가 시즌 전체 데이터를 확인해 반환합니다. 프론트는 건수·ID·시즌·회차·팀 범위를 검증하고 잘못된 응답을 통계에 사용하지 않습니다. 후원자 표와 상세 내역은 100행씩 표시하지만 통계는 전체 행을 사용합니다. H/M 경로나 Supabase에 직접 접근하지 않고 오류 시 가상 데이터를 대신 표시하지 않습니다.

TOP 200은 확인된 기존 VIEW와 같은 닉네임 그룹, signed SUM, 합계 내림차순·DB 닉네임 오름차순의 순번을 사용합니다. 모든 회차·직급전이 대상이며 API에서 집계 완료 후 최대 200명을 반환합니다.

## 관리자 업로드

관리자 화면에서 Render의 `HM_RABLE_ADMIN_PASSWORD`로 로그인합니다. 서버가 검증한 30분 유효 토큰을 탭의 메모리에만 보관하므로 새로고침하면 다시 로그인해야 합니다. 로그아웃은 현재 탭의 토큰을 지웁니다. 이미 발급된 서버 토큰은 만료되거나 서명 키가 변경될 때까지 유효합니다.

- `POST /admin-rable/login`: `{ password }`
- `POST /upload-supabase-rable`: Bearer 인증과 `{ data, season, round }` JSON

엑셀은 기존 첫 번째 시트의 아이디·닉네임·채팅·스트리머·종류·개수·시간 컬럼을 사용합니다. 직급전과 1~12회차 선택을 유지합니다. 원본의 음수·0·큰 정수·한국 시각을 보존하고, 오류가 있는 파일은 전체 전송 전에 차단합니다. 파일 전체를 1회 전송하며 서버가 100행씩 저장합니다. 10MB를 초과하면 전송하지 않습니다.

실제 저장 수와 ID를 확인하고 등록 내역을 재조회한 경우에만 완료로 표시합니다. 207 일부 실패와 응답 불명·재조회 실패를 구분하며 자동 재시도하지 않습니다. SHA-256 지문과 localStorage로 동일 브라우저의 동일 요청을 잠그고 서버도 단일 프로세스에서 중복 결과를 재사용합니다. 서버 재시작·여러 인스턴스를 아우르는 영구 멱등성은 아직 보장하지 않습니다. 삭제·대체 기능은 없습니다.

## 검증

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:browser
npm.cmd run test:mobile
```

단위/계약 테스트 24개, Chrome 통합 검증 9개 그룹, 원본과 9개 너비의 모바일 비교 18개를 수행합니다. 브라우저 테스트는 Python Playwright와 설치된 Chrome을 사용합니다. 필요하면 `python -m pip install -r tests/requirements.txt`로 준비합니다. Chrome 실행 파일은 `HM_LABEL_CHROME`으로 지정할 수 있습니다.

운영 DB 저장 테스트를 하지 않고 API를 가로채 Mock으로 검증합니다. `tests/artifacts/`의 결과·스크린샷·audit 결과는 Git에서 제외됩니다. 원본 H/M 소스는 읽기 전용이며 비교할 때 별도 임시 복사본을 실행합니다.

개발 UI 예시가 필요한 경우에만 `VITE_PREVIEW_MODE=true`를 사용합니다. 프로덕션에서는 프리뷰 코드가 제외되고 프리뷰 모드의 서버 업로드도 차단됩니다.

## Vercel

Repository: `https://github.com/EdgeRunner107/HMrableData.git`

- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- 환경변수: `VITE_API_BASE_URL=https://asg-b2.onrender.com`

기존 `vercel.json`의 SPA rewrite를 유지합니다. Vercel 프로젝트·도메인은 새로 생성하지 않습니다. 서버 인증용 두 변수는 이미 ASG-B2 Render 환경에 추가했으며 프론트 설정에는 필요하지 않습니다.

전체 구현, 운영 확인 결과와 남은 한계는 [최종 보고서](PROJECT_REPORT.md)를 참고하세요. 이전 작업 이력은 Git의 `3c20a32` 커밋에 보존되어 있습니다.
