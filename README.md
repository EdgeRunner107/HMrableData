# HM레이블 · HM LABEL

실제 기준 사이트 https://hm-new-data.vercel.app/ 의 원본 JSX·CSS를 재사용한 C팀 전용 프론트엔드입니다. 팀 선택 없이 시즌1·2·3을 선택합니다. PC에서도 원본 조회 최대 500px·관리자 최대 760px 레이아웃을 사용합니다.

## 실행

```powershell
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

메인: http://127.0.0.1:5174/ · 관리자: http://127.0.0.1:5174/admin · 시즌 경로: `/season/1`, `/season/2`, `/season/3`.

## API와 관리자 현재 상태

공통 환경변수: `VITE_API_BASE_URL=https://asg-b2.onrender.com`.

- `GET /supabase-data-rable?season=시즌1[&round=HM크루 1회차]`
- `GET /top200-rable?season=시즌1`
- `POST /upload-supabase-rable`: 기존 전체 JSON·서버 100행 배치·저장 후 재조회 계약 유지.

관리자 비밀번호 입력 UI는 없습니다. 시즌·회차·파일·미리보기·업로드 버튼을 바로 이용할 수 있습니다. **그러나 운영 업로드 API는 여전히 Bearer 인증을 요구합니다.** 기존 유효 세션이 없는 새 탭/새로고침에서는 인증 계약이 없어 저장을 진행하지 않고 정확한 오류를 표시합니다. 서버 키를 넣거나 인증을 우회하지 않았으며 백엔드는 변경하지 않았습니다. 비밀번호 없는 실제 저장에는 서버의 안전한 세션/SSO 계약이 추가로 필요합니다.

원본 데이터의 음수·0·큰 정수·시각, 전체 JSON 1회 전송, 10MB 제한, 중복 방지, 207/응답 불명 처리와 저장 ID/원본 재조회 검증은 유지합니다. 표의 100행 페이지네이션과 실제 전체 데이터 집계는 분리합니다.

## 검증

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:browser
npm.cmd run test:mobile
```

브라우저 검증은 Python Playwright와 설치된 Chrome을 사용하며 필요한 경우 `python -m pip install -r tests/requirements.txt`로 준비합니다. `HM_LABEL_CHROME`으로 실행 파일을 지정할 수 있습니다.

모바일 비교는 실제 운영 사이트의 화면/정적 자산을 로드하고 데이터 API만 Mock으로 통일합니다. 360·375·390·393·414·430·768·1440·1920px에서 비교합니다. 운영 DB에 데이터를 쓰지 않으며 스크린샷·측정·테스트 결과는 Git 제외 경로 `tests/artifacts/`에 저장합니다.

개발 디자인 확인용 데이터가 필요한 경우에만 `VITE_PREVIEW_MODE=true`를 설정합니다. 프로덕션에서 프리뷰 코드와 데이터는 제외됩니다.

## Vercel

Repository: https://github.com/EdgeRunner107/HMrableData.git

Vite / `npm run build` / `dist`. 환경변수는 `VITE_API_BASE_URL=https://asg-b2.onrender.com`입니다. 서버 비밀키를 VITE 변수에 넣지 않습니다. 기존 SPA rewrite와 Vercel 프로젝트 설정은 유지합니다.

세부 변경·검증·인증 한계는 [최종 보고서](PROJECT_REPORT.md)를 참고하세요. 이전 작업 이력은 Git에 보존되어 있습니다.
