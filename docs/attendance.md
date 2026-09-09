# 사진 출석부

`/attendance`에서 **연도·학기 → 센터 → 교시 → 사진**을 선택합니다. 기존 강의계획서의 센터 목록을 공유합니다. 각 센터의 수업 요일은 학기별로 하나이며 교시 이름·개수·순서는 자유롭게 관리합니다. 시간 입력, OCR, 출석 통계, PDF 및 인쇄 기능은 없습니다.

## 사용

1. 온라인에서 출석부 관리 패널을 열고 학기와 센터·교시를 준비합니다. **이 학기를 오프라인 저장 대상으로 지정**하면 해당 기기에서 그 학기 전체 센터·교시를 내려받습니다. 조회 학기와 자동 저장 대상은 별개입니다.
2. 빈 출석부의 **촬영하기 / 가져오기**, 또는 상단 **사진 추가 +**를 누릅니다. 촬영은 기기의 후면 카메라를 요청하며 실제 선택 화면은 브라우저에 따라 다릅니다.
3. 등록 전에 네 모서리·자르기·90° 회전을 맞추고 사진을 추가합니다. 보정 계산은 외부 서비스 없이 기기의 Worker에서 처리합니다. JPEG·PNG·WebP, 최대 25MiB·50MP를 받습니다. HEIC/HEIF는 브라우저에서 읽을 수 있을 때만 지원합니다. 최종 배경은 긴 변 4096px 이하, JPEG 품질 0.92, 8MiB 이하입니다.
4. 사진 위에 바로 체크·메모합니다. 펜·지우개·색·굵기·실행 취소·다시 실행을 지원합니다. 손가락은 기본적으로 이동·두 손가락 확대에 쓰며, 손가락 필기로 전환할 수 있습니다. 도구를 접거나 전체화면을 사용하면 사진 영역이 넓어집니다.
5. 사진·필기가 모두 내려받아져 **오프라인 준비됨**으로 표시된 뒤 연결 없이 사용할 수 있습니다. 준비된 교시에 오프라인으로 사진을 추가하고 필기할 수 있습니다.
6. 앱을 열어 둔 채 연결이 돌아오면 자동 전송합니다. 전송 대기 중에도 사진과 필기는 기기에 남습니다. 저장 오류가 있으면 앱을 닫지 말고 재시도합니다.

한 사진에 학기 동안 필기를 누적합니다. 확정한 사진 배경은 수정하지 않으며 재촬영본은 새 페이지로 추가합니다. 페이지·교시 이름이나 순서를 바꿔도 사진 ID와 필기의 연결은 유지됩니다. 삭제는 휴지통으로 이동하며 온라인에서 복구할 수 있습니다. 교시를 먼저 복구해야 그 안의 사진을 복구할 수 있습니다. 미전송 필기가 있는 사진의 삭제는 전송 완료 뒤 가능합니다. 다른 기기의 삭제와 로컬 수정이 겹치면 복구 후 다시 전송합니다.

현재 기기의 자동 저장 대상 학기를 바꿔도 기존 기기 기록을 자동 삭제하지 않습니다. 브라우저 데이터 삭제는 로컬 미전송 기록을 잃게 하므로 먼저 동기화해야 합니다. 앱을 완전히 닫은 동안의 전송은 보장하지 않습니다.

## 구현과 API

- SQLite v6에 `attendance_centers`, `attendance_periods`, `attendance_pages`를 추가합니다. v1~v5 마이그레이션과 기존 노트 저장소는 유지합니다.
- 사진은 `ATTENDANCE_IMAGE_DIR` 또는 `server-nestjs/data/attendance/`에 SHA-256 이름으로 저장합니다. 파일은 immutable이며 휴지통 이동 시 물리 삭제하지 않습니다. 사용자 파일명과 임의 경로를 사용하지 않습니다.
- `GET /api/attendance/snapshot?year=2026&term=fall`은 센터·교시·사진 메타데이터를 반환합니다. 필기는 사진 상세에서 revision이 바뀐 경우에 가져옵니다.
- `PUT /api/attendance/centers`, `POST /api/attendance/periods`, `PATCH /api/attendance/periods/:id`가 센터·교시를 관리합니다.
- `PUT /api/attendance/pages/:id/photo`는 `photo` JPEG 파일과 `periodId` multipart 필드를 받습니다. 기기가 만든 페이지 ID로 재시도하며 같은 사진을 중복 생성하지 않습니다. 다른 사진/교시로 같은 ID를 재사용하면 409입니다.
- `GET /api/attendance/pages/:id`는 `InkDocumentV2`를 포함합니다. `GET .../:id/photo`는 JPEG를 반환합니다. `PATCH .../:id`는 `expectedRevision`과 필기·순서·휴지통 변경을 받습니다. 출석부 필기는 고정 1페이지, 최대 5,000획·50,000점·1MiB입니다.
- 기기 DB `node-audio-player-attendance`는 사진 Blob, 필기 기준본/편집본, 메타데이터와 설정을 따로 저장합니다. 한 사진과 초기 페이지 등록은 하나의 트랜잭션입니다. 저장 중의 추가 입력과 늦은 서버 응답을 보호합니다.
- 다른 기기의 필기는 획 ID 기준으로 병합하고, 충돌한 획만 사용자에게 선택시킵니다. 409는 최초 요청 후 최대 세 번 재시도하고 수동 재시도로 전환합니다.
- 사진 처리는 한 장씩, 다운로드는 최대 두 장씩 실행합니다. 한 사진의 다운로드/전송 실패가 다른 사진을 막지 않습니다. 다른 탭에는 BroadcastChannel과 storage 이벤트로 변경을 알립니다.
- 서비스 워커는 `/attendance` 화면 및 보정 Worker를 저장합니다. API·사진·인증 응답은 일반 런타임 캐시에 저장하지 않습니다. `/attendance?reauth=1`은 화면 캐시를 우회합니다.

## 공용 필기 패키지

`/Users/min/Documents/workspace/npm-packages/react-ink-canvas`의 v0.2.0 소스와 생성된 배포 파일도 이번 변경에 포함됩니다. `backgroundImage`, `fixedPage`, `compactTools`는 선택형 속성이며 기존 노트의 기본 동작을 유지합니다.

공용 패키지의 `v0.2.0` Git 태그를 먼저 게시한 뒤 앱 의존성을 해당 태그로 고정했습니다. lockfile은 실제 커밋 SHA를 고정하며 `npm ci`로 재현할 수 있습니다.

## 검증과 격리된 미리보기

Node.js 22에서 실행합니다.

```sh
npm --prefix server-nestjs run build
npm --prefix server-nestjs test -- --runInBand
npm --prefix server-nestjs run test:e2e -- --runInBand
npm --prefix client test -- --watchAll=false --runInBand
npm --prefix client run build
node client/scripts/attendance-preview.mjs
```

미리보기는 임시 DB·사진·재생목록·작업 폴더를 만들고 샘플 센터 2개와 교시를 준비합니다. 실제 운영 DB와 사용자 사진을 변경하지 않습니다. UI는 `http://127.0.0.1:4174/attendance`, NestJS는 4001번 포트를 사용합니다. 콘솔 명령: `offline`은 UI/API 접근 서버를 닫고, `online`은 다시 열며, `auth`는 HTML 로그인 응답을 흉내냅니다. `state`는 샘플 페이지의 revision과 획 개수만 출력합니다. `quit`은 두 서버를 종료합니다. 출력된 임시 폴더를 인자로 전달하면 이전 샘플 기록으로 재시작합니다.

기기 수용 검증은 iPad Safari·홈 화면 앱, Android Chrome·설치 앱에서 각각 실제 촬영, 네 모서리 보정, 작은 이름 가독성, Pencil/손가락 입력, 비행기 모드 재실행·사진 추가, 재연결 전송을 확인해야 합니다. Chromium 검증은 실제 기기 검증을 대신하지 않습니다.

## 배포와 백업

사진은 JSON 본문에 넣지 않습니다. `ops/nginx/node-audio-player.conf`의 출석부 API 경로에만 `client_max_body_size 10m`를 적용하며 기존 JSON 2MiB 제한은 유지합니다.

```sh
cd server-nestjs
npm run attendance:backup
```

백업 명령은 SQLite 스냅샷을 먼저 만들고 그 스냅샷이 참조하는 사진(휴지통 포함)을 복사·해시 검증합니다. 모두 완료된 경우에만 `manifest.json`의 `complete: true`를 기록합니다. 경로는 `ATTENDANCE_BACKUP_DIR` 아래이며 기본값은 `data/backups/`입니다. `db:backup`은 DB만 백업하므로 출석부의 완전한 백업을 대신하지 않습니다. 복구는 서비스 정지 상태에서 일치하는 DB·사진 묶음으로 수행합니다.

v6 서버를 시작하기 전에 기존 DB·사진·배포 파일을 백업하고, 배포 뒤 PWA 자산·출석부 API와 기존 음악 Range 응답을 검증해야 합니다.

## 2026-09-10 로컬 검증 기록

- 클라이언트 전체 테스트 79개, 서버 단위 테스트 43개·e2e 6개, 공용 필기 패키지 테스트 22개가 통과했습니다. 클라이언트·서버 production 빌드와 공용 패키지 타입 검사·빌드도 통과했습니다.
- Aside Chromium에서 샘플 출석부 가져오기·모서리 조정·체크를 확인했습니다. HTTP 서버를 닫은 상태에서 새 사진을 보정·등록하고 필기한 뒤 탭을 재실행해 복원했습니다. 재연결 후 새 사진과 필기가 서버에 자동 반영됐습니다.
- HTML 로그인 응답을 반환하는 상황에서도 필기를 유지했고, 다시 로그인 경로로 돌아온 뒤 전송했습니다. 이는 로컬 인증 모의 검증이며 운영 Cloudflare Access 세션 검증은 아닙니다.
- 820×1180 및 390×844 iframe viewport에서 가로 넘침이 없고 사진과 필기 영역의 위치·크기가 일치했습니다. 이는 Chromium의 반응형 화면 확인이며 실제 iPad/Android 기기 검증은 아닙니다.
- 임시 저장소로 실행한 NestJS에서 한글·공백을 포함한 중첩 경로의 재생목록 HTTP 200, 음악 Range HTTP 206과 원본 32바이트 일치를 확인했습니다. 음악 파일을 변경하지 않았습니다.
- 실제 카메라·Apple Pencil·설치 앱 검증은 미실시입니다. 운영 배포는 아래 백업·검증 절차를 별도로 적용합니다.
