# 부분 지우개 구현·검증

2026-09-12, Node.js `v22.23.2` 기준.

## 제공 동작

- 수업노트와 출석부의 공용 지우개에 `부분 지우기`와 `획 전체 지우기`를 제공한다. 기본은 부분 지우기다.
- 크기는 화면 기준 지름 16·32·64px이며 기본은 32px(보통)이다. 접촉 중 원형 범위를 표시하고 이동·확대 좌표를 일치시킨다.
- 빠른 이동은 이벤트 사이 경로도 검사한다. 한 접촉 동작은 실행 취소 한 단계이며 빈 영역의 동작은 저장·이력을 만들지 않는다.
- 부분 삭제는 벡터 선분을 분리한다. 색상·굵기·페이지를 유지하고 새 경계점의 필압·시간·기울기를 보간한다. 펜 굵기와 둥근 끝을 고려해 삭제 경계를 계산한다.
- 손바닥 무시, 손가락 이동·확대, Pencil 입력 복구, 외부 문서 반영 대기와 기존 사진·노트 배경을 유지한다.
- 입력 취소는 마지막 유효 샘플까지 지운 내용을 확정한다. 필압과 버튼이 모두 0인 이동은 지우지 않는다.

## 저장·동기화 계약

- `InkStrokeV2.sourceStrokeId?: string`은 원래 획 ID다. 필드가 없으면 `id`가 원래 획 ID다.
- 첫 잔여 조각은 기존 ID를 유지하며 추가 조각에 새 ID를 부여한다. 재삭제 이후에도 원래 획 ID를 유지한다.
- 병합·충돌 미리보기·충돌 해결은 같은 원래 획의 조각 전체를 다룬다. 다른 기기에서 같은 획을 다르게 지우면 한 충돌로 남기며, 서로 다른 조각을 무조건 합치지 않는다.
- 기존에 저장된 단일 획 충돌도 읽는다. 충돌 상태에서 추가로 지운 경우 선택 화면의 로컬 내용도 갱신한다.
- API JSON 필드 순서가 달라져도 동일한 저장 응답으로 판단한다.
- NestJS의 수업노트·출석부 검증과 JSON 저장이 새 필드를 보존한다. DB 스키마·필기 JSON 버전 변경은 없다.
- 기본 제한은 획 5,000개, 점 50,000개, JSON 4 MiB다. 출석부에는 기존 서버 제한인 1 MiB를 적용한다. 한도를 초과하면 이번 지우기 전체를 취소하고 이전 필기를 유지한다.

## 패키지 연결

- 공용 저장소: `/Users/min/Documents/workspace/npm-packages/react-ink-canvas`
- Git 태그: `v0.4.1`
- 게시 커밋: `b295d6faa4be9c73fa971dd113b0c5bd32b7c614`
- `origin/main`과 `v0.4.1`이 해당 커밋을 가리키는 것을 확인했다. 앱 의존성과 lockfile을 이 태그·SHA로 고정했다.
- 최종 lockfile로 `npm ci --ignore-scripts --no-audit --no-fund`를 실행했고, 설치된 `0.4.1`의 배포 파일 11개가 패키지 빌드와 SHA-256 기준으로 일치했다.
- 다른 의존성 버전은 변경하지 않는다. 패키지 `dist/`는 빌드로 생성한다.
- 운영 반영 시 클라이언트와 서버를 함께 갱신해야 한다. 이전 서버는 새 원본 획 필드를 보존하지 않는다.

## 검증 결과

| 대상 | 명령·확인 | 결과 |
| --- | --- | --- |
| 공용 패키지 | `npm test` | 3 suites, 41 tests 통과 |
| 공용 패키지 | `npm run typecheck`, `npm run build` | 통과 |
| 클라이언트 | `CI=true npm test -- --watchAll=false --runInBand --silent` | 21 suites, 130 tests 통과 |
| 클라이언트 | `npm run build` | 통과 |
| NestJS | `npm test -- --runInBand` | 10 suites, 53 tests 통과 |
| NestJS | `npm run test:e2e -- --runInBand` | 3 suites, 10 tests 통과 |
| NestJS | `npm run build` | 통과 |
| 브라우저 | 로컬 패키지 playground의 v0.4.0 구현본, Aside 데스크톱 마우스 | 접촉 원, 선의 부분 삭제, undo/redo, 원본 획 전체 삭제를 스크린샷으로 확인 |
| 작업 범위 | 두 저장소 `git diff --check`, `git status --short` | 관련 소스·테스트·패키지·검증 문서만 변경 |

회귀 테스트는 성긴 선분, 겹친 획, 점, 동일 좌표의 필압 변화 보존, 빠른 이동, 반복 삭제, 확대 좌표, 입력 취소, 압력 0 이동, coalesced 이벤트, 저장 한도, 오프라인 재시작, 양쪽 충돌 선택과 저장 응답의 필드 순서 변경을 포함한다.

`v0.4.1`의 동일 좌표 필압 보존 보완은 재현 테스트 실패 후 수정하여 패키지 테스트 41개로 검증했다.

실제 iPad/Apple Pencil 하드웨어와 인증된 운영 UI는 검증하지 않았다. Pi 운영 배포 결과는 아래와 같다.


## Pi 운영 배포

2026-09-12, 기능 커밋 `1b622c6`을 `origin/master`에 푸시하고 운영에 반영했다.

- 공용 패키지 `v0.4.1`, 클라이언트 빌드 ID `1b622c6-eraser-v041`.
- 릴리스: `/home/pi/releases/node-audio-player-1b622c6-eraser`.
- 백업: `/home/pi/backups/node-audio-player-1b622c6-20260912-eraser`.
- 운영 소스 111개가 배포 전 Git 기준과 일치함을 확인했다. 코드·기존 빌드·PM2 설정을 보관하고, 서비스 중지 후 DB·참조 사진을 최종 백업했다.
- Pi 별도 릴리스에서 `npm ci --include=dev --ignore-scripts --no-audit --no-fund`, `npm run build`, `npm test -- --runInBand --no-watchman`(53개), `npm run test:e2e -- --runInBand --no-watchman`(10개)가 통과했다.
- 서버·클라이언트를 함께 교체하고 PM2 `nmp`를 재시작·저장했다. 운영 소스·빌드 파일 288개가 릴리스와 SHA-256 기준으로 일치했다.
- 두 포트(4000·8080)에서 playlist·attendance snapshot·lesson curricula API 총 6개가 HTTP 200과 유효 JSON을 반환했다.
- `/attendance`, `/lesson-notes`, `/service-worker.js`, `/version.json`이 HTTP 200을 반환했다. asset manifest의 6개 파일은 HTTP 응답과 디스크 내용이 일치했다.
- 실제 음악 파일의 Range 요청은 HTTP 206이며 요청한 32바이트가 원본과 일치했다.
- DB 스키마는 8을 유지했다. `integrity_check=ok`, 외래 키 오류 0건이며 배포 후 전체 SQL dump가 최종 백업과 일치했다.
- PM2 `nmp`는 online이며 자동 재시작 증가가 없었다.
- 로컬과 Pi의 `curl`에서 공개 `/attendance`는 Cloudflare Access로 HTTP 302를 반환했다. Pi Python urllib 요청은 HTTP 403을 반환해 공개 경로 검증은 curl로 별도 확인했다.
- 인증된 운영 화면, 설치된 PWA의 업데이트 수신, 실제 iPad/Pencil 동작은 별도 기기 확인이 필요하다.
