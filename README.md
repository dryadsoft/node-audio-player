# node-audio-player

## Runtime

Active React and NestJS applications require Node.js 24 LTS. Run `nvm use` at
the repository root to use the version in `.nvmrc`.

## server 로컬 실행

> express 버전

```s
$ cd server && yarn dev:watch
```

> nest.js 버전

```s
$ cd server-nestjs && npm run start:dev
```

## client 로컬 실행

```s
$ cd client && npm start
```

## 음악폴더

> express 버전

- server/music/songs

> nest.js 버전

- server-nestjs/music/songs

## server build

> express 버전

```s
$ cd server && yarn build
```

> nest.js 버전

```s
$ cd server-nestjs && npm run build
```

## client build

```s
$ cd client && npm run build
```

## 보안 원격 접속

Raspberry Pi 운영 환경은 공개 포트 대신 Cloudflare Tunnel과 Access를 사용합니다.

- 배포 절차: [`docs/secure-remote-access.md`](docs/secure-remote-access.md)
- 재사용 런북: [`docs/raspberry-pi-cloudflare-access-runbook.md`](docs/raspberry-pi-cloudflare-access-runbook.md)
- Nginx 템플릿: [`ops/nginx/node-audio-player.conf`](ops/nginx/node-audio-player.conf)

## 강의계획서

`/lesson-plans`에서 장소별 봄·여름·가을·겨울학기 12주 계획서를 관리합니다.
NestJS stores this data in SQLite. See `server-nestjs/README.md` for the data
path and backup command.
