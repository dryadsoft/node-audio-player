# PWA 인증 만료 복구

## 원인과 동작

Cloudflare Access 로그인 만료 후 기존 fetch는 로그인 페이지로의 교차 출처 이동을 따라가다가 `TypeError: Failed to fetch`를 반환했다. 실제 네트워크 장애와 구분되지 않아 음악·강의계획서 화면에서 재로그인을 안내하지 못했다. Safari에서 로그인해도 설치된 PWA의 인증 상태가 함께 복구된다고 가정하면 안 된다.

- 모든 공통 API 요청에 `X-Requested-With: XMLHttpRequest`, `credentials: same-origin`, `redirect: manual`, `cache: no-store`를 사용한다.
- 401/opaque redirect는 인증 만료, 403은 권한 부족으로 처리한다. 네트워크·시간 초과·서버 오류·잘못된 응답은 로그인으로 전환하지 않는다.
- 보호된 `GET /api/connection`은 DB를 읽지 않고 `{ "ok": true }`, `Cache-Control: no-store`를 반환한다. 시작·복귀·온라인 전환 때 확인하며 중복 요청과 30초 이내 복귀 검사를 제한한다. 네트워크 전환·수동 확인은 간격 제한을 우회한다.
- 인증 만료 시 일반 API 호출을 중지한다. 안전한 상태에서는 같은 PWA 창의 `?reauth=1`로 한 번 이동한다. 서비스 워커는 이 탐색을 캐시로 대신하지 않는다.
- 입력·IME·필기·재생·저장 작업·기기 저장 실패가 있으면 자동 이동을 보류한다. 한 번 보류하면 사용자가 작업을 마치고 **다시 로그인**을 누른다.
- 선택한 폴더·검색·학기·수업·출석부 위치는 sessionStorage로 복원한다. 원본 기록과 필기는 기존 IndexedDB 저장을 유지한다. 저장소 사용 실패 또는 연속 인증 실패는 수동 안내로 전환한다.
- 연결 확인 성공 후 목록과 기존 내구성 있는 오프라인 동기화를 재개한다. 일반 생성·삭제 요청은 자동 재전송하지 않는다.

근거: [Cloudflare Access AJAX session expiry](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/#ajax), [Response type](https://developer.mozilla.org/en-US/docs/Web/API/Response/type).

## 검증

2026-09-27, Node 22.23.2:

- Client build 성공, Jest 26 suites / 162 tests 통과.
- NestJS build 성공, e2e 3 suites / 11 tests 통과.
- `client/scripts/auth-recovery-check.mjs`: 실제 401, 교차 출처 302, 자동 복귀와 한글 폴더 복원, 편집 중 보류와 IndexedDB 보존, 반복 로그인 방지, 오프라인 복구 통과. 820px·390px 화면 확인.
- `client/scripts/pwa-update-check.mjs`: 운영 이전 빌드 `58d24ff-management` → 새 빌드 전환, 실패한 업데이트 유지, 두 탭 업데이트, IME·관리 입력 보호, 오프라인 글·획 보존과 재연결 동기화 통과.
- 위 브라우저 검사는 격리된 fixture와 데스크톱 Chrome 사용. 실제 iPad/Pencil 및 설치 PWA에서 장기 미접속 후 인증 만료는 별도 실기기 확인 대상이다.

브라우저 검사는 `PLAYWRIGHT_MODULE`, 필요 시 `PLAYWRIGHT_EXECUTABLE`을 지정한다. 인증 검사 스크립트의 기본 포트 4187은 업데이트 fixture의 보조 포트와 겹치므로 두 스크립트는 순차 실행한다.

## 운영 배포 및 복구

- 릴리스: `auth-recovery-20260927`, Pi `/home/pi/releases/nmp-auth-recovery-20260927/`.
- `backup/code.tgz`: 이전 client src/build, Nest src/dist. `backup/data/attendance-*/`: SQLite 일관성 백업과 참조 사진·검증 manifest. `backup/playlists.json`: 재생목록 백업.
- Nest API를 먼저 적용하고 PM2 `nmp` 재시작 및 4000/8080 probe를 확인했다. 이후 클라이언트 파일을 교체했다. 이전 해시 정적 파일은 기존 탭을 위해 유지한다.
- 배포 파일은 `staged/release-manifest.json`의 SHA-256과 대조한다. 배포 후 강의계획서 216개(2026년 14개), 음악 폴더 16개, 재생목록 2개, 센터 26개, 공통 원본 1개 및 출석부 조회 200. SQLite integrity `ok`, foreign key 위반 0, 오디오 Range 206 확인.
- 롤백은 백업의 client src/build와 Nest src/dist를 임시 디렉터리에 풀어 코드만 복원하고 PM2 `nmp`를 재시작한다. 이번 변경은 DB 마이그레이션이 없으므로 실시간 DB·사진·음악을 백업으로 덮어쓰지 않는다.
- 기존 설치 PWA에는 **새 버전 적용** 또는 새로고침으로 새 코드를 받아야 한다. 실기기에서는 작업 저장 후 업데이트 → 앱 종료/재실행 → 음악·강의계획서 조회, 추후 실제 인증 만료 시 안내·복귀·기록 보존을 확인한다. 확인 목적으로 사이트 데이터/IndexedDB를 삭제하지 않는다.
