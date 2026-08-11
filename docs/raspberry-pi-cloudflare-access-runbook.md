# Raspberry Pi + Cloudflare Access 보안 원격 접속 런북

이 문서는 Raspberry Pi에서 실행 중인 웹 애플리케이션을 외부에 직접
포트 포워딩하지 않고, 지정한 Google 계정만 접속할 수 있도록 구성하는
재사용 절차다.

이 저장소의 기준 구조는 다음과 같다.

```text
스마트폰 브라우저
  -> Cloudflare Access
  -> Google OAuth 로그인
  -> 명시적 이메일 허용 정책
  -> Cloudflare Tunnel
  -> Nginx 127.0.0.1:8080
  -> NestJS 127.0.0.1:4000
```

OAuth Client Secret, Cloudflare Tunnel Token, 실제 허용 이메일은 저장소,
쉘 스크립트, 작업 로그에 기록하지 않는다.

## 0. 준비값

작업 전에 다음 값을 정한다.

| 항목 | 예시 |
| --- | --- |
| Raspberry Pi SSH 주소 | `pi@raspberrypi.local` |
| Pi 프로젝트 경로 | `/home/pi/workspace/node-audio-player` |
| 공개 호스트명 | `music.example.com` |
| Cloudflare 팀 이름 | `my-team.cloudflareaccess.com` |
| PM2 앱 이름 | `nmp` |
| 허용 Google 계정 | 소유자가 지정한 개별 이메일 |
| Access 세션 시간 | `1 week` |

Cloudflare가 DNS를 관리하는 도메인과 Google Cloud 계정이 필요하다.

## 1. 로컬 소스에서 원점을 loopback으로 제한

`server-nestjs/src/main.ts`에서 NestJS를 모든 인터페이스가 아니라
loopback에만 바인딩한다.

```ts
await app.listen(4000, '127.0.0.1');
```

Nginx는 저장소의
[`ops/nginx/node-audio-player.conf`](../ops/nginx/node-audio-player.conf)를
사용한다. 핵심 조건은 다음과 같다.

```nginx
listen 127.0.0.1:8080 default_server;
listen [::1]:8080 default_server;
```

`/api/`, `/api/audio`, `/songs/`를 NestJS의 `127.0.0.1:4000`으로 전달한다.
오디오 재생을 위해 `Range`, `If-Range`, `proxy_buffering off` 설정을
유지한다.

## 2. 로컬 빌드와 테스트

백엔드와 프런트엔드를 각각 검증한다.

```sh
cd server-nestjs
npm ci
npm run build
npm test -- --runInBand --no-watchman
npm run test:e2e -- --runInBand --no-watchman
command -v ffmpeg

cd ../client
npm ci
npm test -- --watchAll=false --no-watchman
npm run build

cd ..
git diff --check
git status --short
```

`.DS_Store`, 음악 파일, `client/build/`, `server-nestjs/dist/`를 직접
편집하거나 커밋하지 않는다.

## 3. SSH 공개키 등록

이 명령은 Raspberry Pi가 아니라 접속에 사용할 Mac 또는 PC에서 실행한다.

```sh
ssh-copy-id -i ~/.ssh/id_rsa.pub pi@raspberrypi.local
```

공개키 접속을 확인한다.

```sh
ssh -o BatchMode=yes -o PasswordAuthentication=no pi@raspberrypi.local
```

이 확인이 실패하면 SSH 비밀번호 인증을 끄지 않는다.

## 4. Pi 현재 상태 확인과 백업

Pi에 접속해 현재 서비스와 포트를 확인한다.

```sh
uname -m
sudo ss -ltnp
sudo nginx -T
pm2 status
pm2 describe nmp
command -v ffmpeg
df -h /home/pi/workspace/node-audio-player/server-nestjs
sudo systemctl status ssh --no-pager
```

배포 폴더가 Git 저장소라고 가정하지 않는다. 복사 배포일 수 있다.

백업 경로를 만들고 실제 값이 안전한지 출력해 확인한다.

```sh
BACKUP_DIR="/home/pi/backups/node-audio-player-security-$(date +%Y%m%d-%H%M%S)"
case "$BACKUP_DIR" in
  /home/pi/backups/node-audio-player-security-*) ;;
  *) echo "잘못된 백업 경로"; exit 1 ;;
esac
mkdir -p "$BACKUP_DIR/server-nestjs" "$BACKUP_DIR/nginx" "$BACKUP_DIR/ssh"
printf '%s\n' "$BACKUP_DIR"

cp -a /home/pi/workspace/node-audio-player/server-nestjs/src/main.ts \
  "$BACKUP_DIR/server-nestjs/main.ts"
cp -a /home/pi/workspace/node-audio-player/server-nestjs/dist \
  "$BACKUP_DIR/server-nestjs/dist"
sudo cp -a /etc/ssh/sshd_config "$BACKUP_DIR/ssh/sshd_config"
```

## 5. Pi에 소스와 Nginx 설정 배포

Mac 또는 PC의 저장소 루트에서 필요한 파일만 복사한다.

```sh
scp server-nestjs/src/main.ts \
  ops/nginx/node-audio-player.conf \
  pi@raspberrypi.local:/tmp/
```

Pi에서 설치한다.

```sh
PROJECT_DIR=/home/pi/workspace/node-audio-player

install -m 0644 /tmp/main.ts \
  "$PROJECT_DIR/server-nestjs/src/main.ts"

sudo install -m 0644 /tmp/node-audio-player.conf \
  /etc/nginx/sites-available/node-audio-player-loopback
sudo ln -sfn /etc/nginx/sites-available/node-audio-player-loopback \
  /etc/nginx/sites-enabled/node-audio-player-loopback

sudo nginx -t
```

기존 공개 Nginx 사이트는 아직 비활성화하지 않는다.

## 6. Pi에서 백엔드 빌드와 PM2 재시작

Pi의 실제 Node 경로를 먼저 확인한다.

```sh
readlink -f /proc/$(sudo ss -ltnp 'sport = :4000' \
  | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | head -n1)/exe
uname -m
getconf LONG_BIT
```

이 저장소는 Node.js 24 LTS가 필요하다. Pi OS와 아키텍처에서 Node 24를 실행할
수 있는지 먼저 확인한다. 실행할 수 없으면 현재 서비스를 변경하지 않는다.
NVM을 사용한다면 Node 24를 선택하고 실제 버전을 다시 확인한다.

```sh
export NVM_DIR=/home/pi/.nvm
. "$NVM_DIR/nvm.sh"
nvm use 24
node --version
cd /home/pi/workspace/node-audio-player/server-nestjs
mkdir -p data/audio-cache
export AUDIO_CACHE_PATH="$PWD/data/audio-cache"
export LESSON_PLAN_DB_PATH="$PWD/data/lesson-plans.sqlite"
export LESSON_PLAN_BACKUP_DIR="$PWD/data/backups"

if [ -f "$LESSON_PLAN_DB_PATH" ] && [ -f dist/database/backup.js ]; then
  npm run db:backup
fi

npm ci --include=dev
npm run build
npm test -- --runInBand --no-watchman
npm run test:e2e -- --runInBand --no-watchman
pm2 restart nmp --update-env
pm2 save
```

빌드가 실패하면 PM2를 재시작하지 않고 백업된 `dist/`를 유지하거나 복원한다.

Nginx를 적용하고 원점을 확인한다.

```sh
sudo systemctl reload nginx
curl -fsS 'http://127.0.0.1:8080/api/playlist?dir=' >/dev/null
sudo ss -ltnp 'sport = :4000 or sport = :8080'
```

정상 결과:

- NestJS: `127.0.0.1:4000`
- Nginx: `127.0.0.1:8080`, `[::1]:8080`
- LAN 주소의 `:4000`, `:8080`에는 접속할 수 없음

## 7. SSH를 공개키 전용으로 전환

기존 SSH 연결을 유지한 상태에서 두 번째 터미널을 준비한다.

`/etc/ssh/sshd_config`에 다음 값을 설정한다.

```text
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
```

적용 전에 반드시 문법을 검사한다.

```sh
sudo sshd -t
sudo systemctl reload ssh
sudo sshd -T | grep -E \
  '^(passwordauthentication|pubkeyauthentication|permitrootlogin) '
```

두 번째 터미널에서 새 연결을 검증한다.

```sh
ssh -o BatchMode=yes \
  -o PreferredAuthentications=publickey \
  -o PasswordAuthentication=no \
  pi@raspberrypi.local
```

새 연결 성공을 확인하기 전에는 기존 SSH 세션을 종료하지 않는다.

## 8. Google OAuth 구성

Google Cloud Console에서 전용 프로젝트를 만든다.

1. Google Auth Platform에서 OAuth 구성을 생성한다.
2. Audience는 `External`을 선택한다.
3. 게시 상태를 `Testing`으로 유지한다면 허용할 계정을 Test users에 모두 추가한다.
4. OAuth Client 유형은 `Web application`을 선택한다.
5. 이름은 `Cloudflare Access - <서비스 이름>`처럼 지정한다.
6. Cloudflare Zero Trust가 안내하는 JavaScript origin과 callback URL을 등록한다.

형식은 다음과 같다.

```text
JavaScript origin:
https://<team-name>.cloudflareaccess.com

Redirect URI:
https://<team-name>.cloudflareaccess.com/cdn-cgi/access/callback
```

Client ID와 Client Secret은 비밀번호 관리자에 보관한다. 저장소 파일이나
터미널 명령에 직접 기록하지 않는다.

## 9. Cloudflare Google Identity Provider 구성

Cloudflare Zero Trust에서 다음 순서로 진행한다.

1. `Integrations` → `Identity providers`
2. `Add an identity provider`
3. `Google` 선택
4. Google Client ID와 Client Secret 입력
5. PKCE 활성화
6. 저장
7. `Test` 실행

테스트 결과에 로그인한 사용자의 `name`과 `email`이 표시되어야 한다.

브라우저 비밀번호 관리자가 Cloudflare 계정 이메일이나 비밀번호를 Client ID,
Client Secret 입력란에 자동으로 채울 수 있다. 저장 전에 반드시 실제 OAuth
값인지 확인한다.

## 10. Access 애플리케이션을 먼저 생성

Tunnel의 공개 호스트명을 만들기 전에 Access 정책부터 생성한다.

1. `Access controls` → `Applications`
2. `Create new application`
3. `Self-hosted and private` → `Public DNS`
4. 공개 호스트명 입력
5. 새 Allow 정책 생성
6. Selector는 `Emails`
7. 소유자가 지정한 이메일만 개별 등록
8. Action은 `Allow`
9. `Accept all available identity providers` 비활성화
10. Google만 선택
11. Instant authentication 활성화
12. Session Duration을 `1 week`로 설정

추가하면 안 되는 규칙:

- `Everyone`
- 이메일 도메인 전체 허용
- `Bypass`
- 공개 Allow 규칙

정책은 일치하지 않는 사용자를 기본 거부한다.

## 11. Cloudflare Tunnel 설치

Cloudflare Zero Trust에서 remotely-managed Tunnel을 만든다.

1. `Networks` → `Tunnels & Mesh`
2. `Create a tunnel`
3. `cloudflared` 선택
4. 이름 입력
5. Raspberry Pi 아키텍처에 맞는 설치 옵션 선택

Raspberry Pi 3가 `armv7l`이면 `arm32-bit`를 선택한다. 일반 `32-bit`는
x86일 수 있으므로 사용하지 않는다.

Cloudflare가 보여 주는 `cloudflared service install <TOKEN>` 명령을 Pi에서
한 번만 실행한다. Token을 문서나 셸 스크립트에 저장하지 않는다.

```sh
sudo systemctl is-enabled cloudflared
sudo systemctl is-active cloudflared
cloudflared --version
```

Tunnel 상태가 `Healthy`가 될 때까지 공개 경로를 전환하지 않는다.

## 12. Tunnel 공개 애플리케이션 경로 생성

Tunnel의 `Published application routes`에서 다음 값을 등록한다.

```text
Hostname: <공개 호스트명>
Service Type: HTTP
URL: 127.0.0.1:8080
Path: 비움
```

Catch-all 규칙은 `http_status:404`를 유지한다.

저장 후 인증되지 않은 터미널에서 확인한다.

```sh
curl -sS -o /dev/null -D - 'https://music.example.com/' \
  | grep -Ei '^(HTTP/|location:|server:)'
```

정상 결과는 `302`와 `<team-name>.cloudflareaccess.com` 로그인 URL이다.

## 13. Cloudflare 캐시 우회

오디오 Range 요청과 개인 API 응답이 공유 캐시에 남지 않도록 호스트 전체의
캐시를 우회한다.

1. Cloudflare 도메인 대시보드 열기
2. `Caching` → `Cache Rules`
3. 새 Cache Rule 생성
4. 표현식 입력
5. `Bypass cache` 선택
6. Deploy

```text
(http.host eq "music.example.com")
```

API 또는 오디오 응답의 `cf-cache-status`가 `DYNAMIC`인지 확인한다.

## 14. 외부 인수 테스트

스마트폰의 Wi-Fi를 끄고 셀룰러 네트워크에서 검사한다.

1. 로그아웃 또는 시크릿 브라우저에서 URL을 열면 Google 로그인이 표시된다.
2. 허용 계정으로 로그인하면 음악 보관함이 열린다.
3. 한글, 공백, 중첩 폴더 검색이 동작한다.
4. 재생목록 조회·생성·삭제가 동작한다.
5. WMA를 선택하면 `WMA 재생 준비 중` 표시 후 자동 재생되고 탐색이 동작한다.
6. 비허용 Google 계정은 Access에서 거부된다.

서버/API 검증 기준:

```text
루트 문서: 200
재생목록 API: 200 application/json
오디오 Range: 206 Partial Content
cf-cache-status: DYNAMIC
```

Range 요청 예시:

```sh
curl -H 'Range: bytes=0-1' -D - -o /dev/null \
  'https://music.example.com/songs/<URL-ENCODED-PATH>'
```

WMA 캐시 재생은 `path` 전체를 query 값으로 URL 인코딩한다.

```sh
curl --get --data-urlencode 'path=<RELATIVE-WMA-PATH>' \
  -H 'Range: bytes=0-1' -D - -o /dev/null \
  'https://music.example.com/api/audio'
```

최초 요청 후 `data/audio-cache/`에 MP3와 메타데이터가 생성되어야 한다.
두 번째 요청에서는 캐시 파일 수정시간이 바뀌지 않아야 한다. 응답은
`206 Partial Content`, `Content-Type: audio/mpeg`이어야 한다.

이 명령은 Access 인증 쿠키가 없는 터미널에서는 로그인 리디렉션을 받는다.
실제 Range 검증은 로그인된 브라우저 개발자 도구나 인증 쿠키가 있는 요청으로
수행한다.

## 15. 기존 무인증 경로 차단

보호 URL의 로그인, API, Range 요청이 모두 검증된 뒤에만 기존 공개 경로를
차단한다.

먼저 현재 Nginx 사이트별 포트를 확인한다.

```sh
for site in /etc/nginx/sites-enabled/*; do
  printf '%s -> %s\n' "$site" "$(readlink -f "$site")"
done
sudo nginx -T 2>/dev/null | grep -E '^[[:space:]]*listen[[:space:]]'
```

음악 앱 전용 `:80` 사이트인지 확인한 후 해당 enabled 링크만 백업 위치로
이동한다. 다른 포트와 다른 애플리케이션 사이트는 보존한다.

```sh
sudo mv /etc/nginx/sites-enabled/default \
  /home/pi/backups/node-audio-player-security-YYYYMMDD-HHMMSS/nginx/default-enabled-symlink
sudo nginx -t
sudo systemctl reload nginx
```

공유기의 음악 앱 전용 포트 포워딩 규칙이 있다면 그것만 제거한다. SSH와
다른 홈서비스 규칙은 건드리지 않는다.

최종적으로 확인한다.

```sh
sudo ss -ltnp
curl --connect-timeout 2 'http://<PI-LAN-IP>:80/'
curl --connect-timeout 2 'http://<PI-LAN-IP>:4000/'
```

LAN의 기존 무인증 포트는 실패하고 Cloudflare 보호 URL은 계속 동작해야 한다.

## 16. 최종 상태 점검

```sh
sudo systemctl is-active cloudflared
sudo systemctl is-active nginx
pm2 status
sudo sshd -T | grep -E \
  '^(passwordauthentication|pubkeyauthentication|permitrootlogin) '
sudo ss -ltnp 'sport = :4000 or sport = :8080'
curl -fsS 'http://127.0.0.1:8080/api/playlist?dir=' >/dev/null
```

완료 조건:

- `cloudflared`: active
- Nginx: active
- PM2 앱: online
- SSH password authentication: no
- SSH root login: no
- NestJS: `127.0.0.1:4000`
- Nginx origin: `127.0.0.1:8080`
- 공개 URL 미인증 요청: Access 로그인으로 이동
- 허용 계정: 앱과 API 정상
- 비허용 계정: 거부
- 오디오 Range: `206`

## 17. 사용자 추가와 제거

### 사용자 추가

1. Google OAuth가 `Testing` 상태면 Google Test users에 이메일 추가
2. Cloudflare Access Allow 정책의 `Emails`에 같은 이메일 추가
3. 해당 사용자의 스마트폰에서 로그인 검증

### 사용자 제거

1. Cloudflare Access Allow 정책에서 이메일 제거
2. Zero Trust에서 해당 사용자의 Access 세션 취소
3. Google Test users에서도 제거
4. 시크릿 브라우저에서 접근 거부 확인

## 18. OAuth Client Secret 순환

Secret이 화면 공유, 로그, 터미널 출력에 노출되었거나 정기 교체가 필요하면
무중단으로 순환한다.

1. Google OAuth Client에 새 Secret 추가
2. Cloudflare Google IdP에 새 Secret 저장
3. Identity Provider Test 성공 확인
4. 허용 계정의 실제 앱 접속 확인
5. 이전 Secret 사용 중지
6. 이전 Secret 삭제
7. Google에 활성 Secret이 하나만 남았는지 확인

새 Secret 검증 전에 이전 Secret을 삭제하지 않는다.

## 19. 롤백

### NestJS 롤백

```sh
cp -a /home/pi/backups/node-audio-player-security-YYYYMMDD-HHMMSS/server-nestjs/main.ts \
  /home/pi/workspace/node-audio-player/server-nestjs/src/main.ts
cp -a /home/pi/backups/node-audio-player-security-YYYYMMDD-HHMMSS/server-nestjs/dist \
  /home/pi/workspace/node-audio-player/server-nestjs/
pm2 restart nmp
```

### Nginx 기존 사이트 복원

```sh
sudo mv \
  /home/pi/backups/node-audio-player-security-YYYYMMDD-HHMMSS/nginx/default-enabled-symlink \
  /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### SSH 설정 복원

현재 공개키 SSH 연결이 살아 있는 상태에서만 수행한다.

```sh
sudo cp -a \
  /home/pi/backups/node-audio-player-security-YYYYMMDD-HHMMSS/ssh/sshd_config \
  /etc/ssh/sshd_config
sudo sshd -t
sudo systemctl reload ssh
```

### Cloudflare 롤백

1. Tunnel 공개 애플리케이션 경로 비활성화
2. Access 애플리케이션 유지 또는 비활성화
3. 원인 분석 후 보호 경로 복구

자동 롤백으로 무인증 공유기 포트를 다시 열지 않는다.

## 20. 운영상 남는 위험

- 운영체제가 지원 종료된 버전이면 Tunnel과 Access만으로 OS 취약점이
  해결되지 않는다.
- 오래된 OpenSSH는 최신 키 교환 알고리즘을 지원하지 않을 수 있다.
- 주요 Raspberry Pi OS 업그레이드는 기존 SD카드 인플레이스 업그레이드보다
  새 SD카드에 최신 이미지를 설치하고 데이터와 설정을 이전하는 방식이 안전하다.
- Cloudflare Tunnel Token과 Google OAuth Secret은 주기적으로 순환한다.
- 허용 사용자가 바뀔 때 Google Test users와 Cloudflare Access 정책을 함께
  갱신한다.
