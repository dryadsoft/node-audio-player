# 지속 로그인

## 정책

Google 인증 후 허용된 개별 이메일에만 앱 세션을 발급한다. 서버 세션에는
절대 만료나 미사용 만료가 없다. 브라우저 쿠키는 400일이며 보호된 요청에서
하루 한 번 갱신한다. 브라우저 데이터 삭제·쿠키 만료·관리자 취소 시에는
재로그인이 필요하다. Safari와 설치 PWA는 각각 로그인 상태를 확인한다.

로그아웃은 현재 쿠키 저장소에만 적용한다. 미저장 입력·충돌을 먼저 해결하고
다른 앱 탭을 닫아야 한다. 온라인 동기화가 끝난 뒤 서버 세션을 폐기하고
기기의 노트·출석·사진 DB와 메모리 데이터를 삭제한다. 서버 원본은 유지한다.
네트워크 실패나 삭제 실패 시 완료했다고 표시하지 않고 잠긴 정리 화면에서
재시도한다. 기존 기기 기록은 최초 인증된 Google sub에 귀속되며 다른 계정으로
전송하지 않는다. 계정 전환 전에는 기존 계정의 동기화·로그아웃을 마쳐야 한다.
Web Locks와 최신 서비스 워커가 없는 브라우저에서는 안전한 로그아웃이 제한된다.

## 운영 설정

서버 시작 전 다음 값을 환경에 주입한다. 저장소나 명령 로그에 비밀값을 넣지 않는다.
`AUTH_ORIGIN`은 마지막 슬래시 없는 HTTPS origin이다. 인증 설정 누락 시 서버는
시작에 실패한다. 자체 인증을 끄는 우회 플래그는 없다.

```text
AUTH_ORIGIN=https://music.mcdryad.com
AUTH_GOOGLE_CLIENT_ID=<app-specific Google OAuth client ID>
AUTH_GOOGLE_CLIENT_SECRET=<secret>
AUTH_DB_PATH=/home/pi/workspace/node-audio-player/server-nestjs/data/auth.sqlite
```

Google OAuth 웹 클라이언트에 정확히 다음 redirect URI를 등록한다:
`https://music.mcdryad.com/api/auth/google/callback`.
범위는 `openid email`이며 Google refresh token을 요청하거나 저장하지 않는다.
OAuth state는 브라우저에 바인딩된 일회용이며 10분 후 만료한다.

Node 22.23.2로 빌드 후 서버 디렉터리에서 다음 명령을 사용한다.
이메일은 stdin으로 한 줄 입력하고 EOF를 보낸다. 이메일을 CLI 인수로 남기지 않는다.

```sh
npm run auth:admin -- allow
npm run auth:admin -- remove
npm run auth:admin -- revoke
```

`remove`는 이메일 허용과 모든 기존 세션을 함께 제거한다. 다시 허용하더라도
기존 세션은 복구되지 않는다. `revoke`는 이메일 허용을 유지하고 세션만 취소한다.
인증 DB는 업무 DB와 별개이며 파일 권한은 0600이다. 인증 DB를 과거 백업으로
복원하면 취소했던 세션이 복구될 수 있으므로 코드 롤백에서 덮어쓰지 않는다.

## 전환 순서

1. 기존 Cloudflare Access 정책·허용 이메일·Tunnel 및 Nginx/PM2 설정을 비공개 백업한다.
2. 앱 전용 OAuth 클라이언트와 위 환경 변수를 준비하고, 기존 이메일을 인증 DB에 등록한다.
3. Access를 유지한 상태로 서버와 클라이언트를 함께 배포한다. 새 서버를 재시작하기
   전에 환경 변수와 인증 DB 경로·권한을 확인한다. 기존 업무 DB 스키마는 변경하지 않는다.
4. Nginx 설정의 OAuth 콜백 로그 제외를 적용한다. 공개 화면 틀과 정적 자산에는 사용자
   데이터가 없다. API와 `/songs/`는 Nest 인증 미들웨어로 보호한다.
5. 실제 허용·비허용 Google 계정, 미인증 API/사진/다운로드, 한글 음악 Range 206,
   새로고침·재시작, 로그아웃·기기 기록 삭제를 검증한다.
6. 검증 후에만 이 호스트의 Access 애플리케이션 보호와 Tunnel의 Access 검증을 해제한다.
   Tunnel, HTTPS, loopback 바인딩은 유지한다. 다른 서비스의 Access 정책은 변경하지 않는다.
7. 기존 PWA를 업데이트하고 실제 Safari·설치 PWA를 별도로 검증한다.

롤백 시 Access 보호를 먼저 복구하고 미인증 차단을 확인한 뒤 이전 코드로 되돌린다.
사용자 업무 DB·음악·사진·인증 DB는 덮어쓰지 않는다.

## 로컬 검증

```sh
cd server-nestjs
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
cd ../client
npm test -- --watchAll=false --runInBand
npm run build
node scripts/persistent-auth-preview.mjs
```

미리보기는 127.0.0.1:4193에서 임시 DB·샘플 WAV를 사용한다. Google 버튼은
테스트 도구 안에서만 모의 인증하며 실제 Nest 세션·API·로그아웃을 사용한다.
운영 OAuth 성공의 증거로 사용하지 않는다. 종료 시 임시 데이터를 삭제한다.

기존 `offline-preview.mjs` 등 Access 전용 fixture는 새 앱 인증 handshake를
제공하지 않는다. 새 인증 검증에는 `persistent-auth-preview.mjs`를 사용한다.

## 2026-11-06 운영 전환 기록

- 기존 `node-audio-player-access` Google 프로젝트에
  `Node Audio Player - Persistent Login` 웹 클라이언트를 추가했다.
  기존 Access OAuth 클라이언트는 보존했다. 기존 허용 이메일 3개를 앱 인증 DB와
  Google 테스트 사용자에 등록했다.
- Raspberry Pi에 서버·클라이언트·Nginx를 배포했다. 인증 환경은
  `/home/pi/.config/node-audio-player/auth.env`(0600)에 저장하고 PM2에 주입했다.
- 백업과 롤백 스크립트는
  `/home/pi/releases/nmp-persistent-auth-20261106/`에 보관했다.
- Cloudflare Access 앱은 삭제하지 않고 대상 경로를 `__legacy_access`로 변경했다.
  앱 본 경로는 자체 인증을 사용한다. Tunnel의 `Protect with Access`는 기존부터
  꺼져 있었으며 `http://127.0.0.1:8080` 연결을 유지했다.
  롤백은 Access 앱의 Path를 먼저 비우고 저장해 호스트 전체 보호를 복구한 뒤 진행한다.
- 실제 Google 허용 계정 로그인, 비허용 계정 거부, 새로고침과 PM2 재시작 후 로그인
  유지, 로그아웃 후 세션 폐기를 확인했다. 한글·공백·중첩 경로 MP3 요청은
  `206` 및 `Content-Range: bytes 0-1023/4845696`로 응답했다.
- 인증 쿠키 없는 공개 요청은 `/`와 `/api/auth/session`이 `200`, 플레이리스트·음악·
  사진·다운로드가 `401`, 보존한 `/__legacy_access`가 Access 로그인 `302`였다.
- Node 22.23.2: 서버 build, unit 12 suites/70 tests, e2e 3 suites/15 tests,
  클라이언트 build 및 29 suites/173 tests가 통과했다. `git diff --check`도 통과했다.
- 브라우저 검증은 Aside Chromium에서 수행했다. 실제 iPad Safari·설치 PWA와
  장기간 미접속 후 복귀는 이번 검증에 포함하지 않았다. 서버 세션 무만료·쿠키 갱신은
  자동화 테스트로 확인했다.
