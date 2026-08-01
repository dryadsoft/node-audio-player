# Repository Guidelines

## Active Project Scope

- This repository is an audio player. NestJS serves song files and JSON APIs; React renders the client player.
- Use `client/` for frontend work and `server-nestjs/` for backend work.
- Do not use or modify `server/`. It is the retired Express implementation and exists only as legacy reference.
- Treat `client/build/` and `server-nestjs/dist/` as generated output. Change source files instead.
- Treat files under `server-nestjs/music/songs/` as user media/content. Do not rename, move, delete, or commit song files unless the task explicitly requires it.

## Architecture and Runtime Contract

- `server-nestjs/src/main.ts` starts NestJS on port `4000`.
- `ServeStaticModule` exposes `server-nestjs/music/`; browser audio URLs begin with `/songs/`.
- Playlist and search endpoints are `GET /api/playlist?dir=...` and `GET /api/search?keyword=...`.
- `client/package.json` proxies development requests to `http://localhost:4000`.
- Keep client URL construction and NestJS static/API paths compatible when changing either side.

## Source Layout

- `client/src/api/`: API calls.
- `client/src/components/`: reusable UI and audio player controls.
- `client/src/context/`: shared React context.
- `client/src/screens/`: route-level screens.
- `server-nestjs/src/api/`: playlist and search endpoints.
- `server-nestjs/src/file/`: filesystem traversal and filtering.
- `server-nestjs/src/common/`: shared NestJS services.
- `server-nestjs/test/`: backend end-to-end tests.

## Local Commands

Install dependencies separately because each active app owns its own `package-lock.json`.

```sh
cd server-nestjs && npm ci
cd client && npm ci
```

Run the backend before the frontend during local development:

```sh
cd server-nestjs && npm run start:dev
cd client && npm start
```

Use these checks after changes:

```sh
cd server-nestjs && npm run build
cd server-nestjs && npm test -- --runInBand
cd server-nestjs && npm run test:e2e -- --runInBand
cd client && npm test -- --watchAll=false
cd client && npm run build
```

Run the checks relevant to the changed area. For cross-stack changes, build and test both apps.

## Implementation Rules

- Keep the existing TypeScript, React, and NestJS patterns unless the task explicitly includes a migration.
- Prefer focused changes. Do not modernize dependencies or reformat unrelated files as part of a feature or bug fix.
- Preserve URL encoding for Korean, spaces, and nested directory names. Test these cases when changing path, playlist, search, or playback logic.
- Do not expose arbitrary filesystem paths. Resolve media access within `server-nestjs/music/songs/` and reject traversal outside that root.
- Keep API response shapes compatible with current client consumers, or update and verify both sides in the same change.
- Do not edit generated `build/` or `dist/` files manually.

## Verification and Delivery

- For backend changes, verify the NestJS build plus the closest unit or e2e test.
- For frontend changes, verify the client build plus the closest test.
- For playback or static-file changes, manually verify playlist loading and one audio request against a running NestJS server when media is available.
- Before delivery, run `git diff --check` and inspect `git status --short` so unrelated files such as `.DS_Store` are not included.
- Report commands run, results, and any runtime checks that could not be completed.
