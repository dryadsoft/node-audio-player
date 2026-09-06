# 수업노트 동기화 검증 (2026-09-06)

## 변경

- 수업명 한 줄·수업내용 두 줄 상시 입력. 모바일은 내용을 다음 줄에 배치.
- 주차 메뉴는 200ms 왼쪽 슬라이드·페이드 후 닫힘. 종료 이벤트와 220ms 대체 타이머, 중복 닫기 방지, 동작 줄이기 지원.
- 보이는 화면에서 2초마다 학기 요약을 확인하고 revision 변경 시 해당 주차 조회. 화면 복귀·온라인 복귀에도 확인.
- 기준본·편집본·서버본의 텍스트 및 획 ID 병합. 충돌 항목만 선택하며 자동 저장 중단. 409는 최대 3회 재시도.
- IndexedDB에 기준본과 편집본을 함께 저장. 기존 기록의 `lessonPlan`, `materials`만 제외하며 기준본 없는 기록은 비교 후 복구.
- v5는 두 미사용 컬럼만 제거. v1–v4 마이그레이션은 보존.
- 공용 패키지 태그 `v0.1.1`: `e0049e61c2c4ce4b4308ad7ec7bdeb0fefbd4688`. 앱 lockfile도 같은 SHA 고정.

## 검증 환경과 결과

Node `v22.22.0`. 실제 사용자 DB 대신 `/tmp/nmp-sync-verification/lesson-plans.sqlite` 사용. 기존 4000번 서비스와 분리한 NestJS 4400번·클라이언트 3400번에서 검증.

| 검사 | 결과 |
| --- | --- |
| `npm --prefix client test -- --watchAll=false` | 47개 통과 |
| `npm --prefix client run build` | 통과 |
| `npm --prefix server-nestjs test -- --runInBand` | 38개 통과 |
| `npm --prefix server-nestjs run test:e2e -- --runInBand` | 5개 통과 |
| `npm --prefix server-nestjs run build` | 통과 |
| 공용 패키지 `npm test`, `npm run typecheck`, `npm run build` | 21개·타입 검사·빌드 통과 |
| `git diff --check` | 통과 |

임시 DB에서 신규 v5와 v4→v5를 검사했다. 필기 JSON, 수업명·내용, 주차 revision, 계획서 revision·연결·주차 내용, 외래 키와 무결성을 확인했다. 기존 `db:backup` 명령의 임시 DB 백업·무결성 검사도 통과했다.

Chrome의 독립 BrowserContext 두 개로 최신 텍스트 반영, 동일 텍스트 충돌·선택 후 수렴, 동시 획 추가, 삭제·추가 병합, 외부 동기화 후 실행 취소, 네트워크 재연결, 새로고침 후 기준본·편집본 복구를 확인했다. 저장 중 입력·늦은 응답·주차 이동·한글 조합·재시도 상한·기준본 없는 임시 복구·서버 텍스트 정규화는 자동 테스트로 검증했다.

1440×900, 1024×768, 768×1024, 390×844에서 긴 입력과 가로 넘침을 검사했다. 필기 영역 높이는 각각 약 517px, 368px, 635px, 490px였다. 모바일 필기 도구는 기존 가로 스크롤을 유지하며 전체화면 버튼 접근·복귀를 확인했다. 강의계획서 390px·1440px에서도 제목 헤더 제거와 가로 넘침 없음을 확인했다. 스크린샷은 `/tmp/nmp-sync-verification/`에 보관했다.

실제 iPad/Pencil 하드웨어, Production DB, Pi 배포는 이번 검증 범위에 포함하지 않았다. 기존 React 18 테스트 렌더러 경고, Browserslist 데이터 노후 안내, Node SQLite 실험 기능 안내가 남아 있다.

## 배포 시 순서

앱 커밋과 Pi 배포는 별도 단계다. 실제 DB 적용 전 기존 DB 경로를 명시해 `npm run db:backup`을 실행하고 성공·백업 경로를 확인한다. 이후 서버와 클라이언트를 함께 갱신하고 v5 스키마 및 API·필기를 확인한다. 초기 로컬 검증에서는 실제 DB에 마이그레이션을 적용하지 않았다. 이후 승인된 배포 결과는 아래와 같다.


## Pi 배포 결과 (2026-09-06 21:04 KST)

- 배포한 앱 커밋: `929490df87efb6a89aca1fc77378f4684adecccb`.
- 릴리스 경로: `/home/pi/releases/node-audio-player-929490d`.
- 배포 경로: `/home/pi/workspace/node-audio-player`.
- 코드·빌드·PM2 설정·DB 백업: `/home/pi/backups/node-audio-player-929490d-20260906-210357`.
- Pi Node `v22.23.2`에서 별도 릴리스 폴더의 서버 빌드, 단위 테스트 38개, e2e 5개 통과.
- 기존 백업 명령의 무결성 검사 및 DB 복사본 마이그레이션 후, `nmp`를 중지하고 최종 DB를 다시 백업했다.
- 실제 DB v5 적용 전후 두 제거 컬럼과 마이그레이션 이력을 제외한 모든 테이블·열·행이 일치했다. 장소 25개, 계획서 216개, 계획서 주차 2,592개, 가져오기 이력 216개, 공통 원본 1개·주차 12개를 보존했다. `integrity_check=ok`, 외래 키 오류 0.
- 서버·클라이언트를 함께 교체하고 PM2 `nmp` 재시작·프로세스 목록 저장 완료.
- 배포 후 `/lesson-notes`, `/lesson-plans`, `/api/playlist`, 주차 조회 API HTTP 200. 제거한 필드가 응답에 없고 revision·필기 문서가 유지됨을 확인했다.
- Nginx가 반환한 HTML·JS·CSS 해시가 배포 파일과 일치했다. 서버 소스·dist 및 클라이언트 소스·build도 검증한 릴리스와 일치했다.
- 실제 음악 파일 Range 요청 HTTP 206. 공개 `https://music.mcdryad.com/lesson-notes`는 Access 로그인 경로의 HTTP 302.
- 인증된 공개 브라우저 화면과 실제 iPad/Pencil 입력은 배포 후 별도 검증하지 않았다.
