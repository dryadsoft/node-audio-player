# node-audio-player

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
