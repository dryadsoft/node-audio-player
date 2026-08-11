## Server with Nest.js

Node.js 22.16 or newer in the Node.js 22 LTS line is required. The server uses
the built-in `node:sqlite` module and its online backup API.

## pm2

```s
$ pm2 start dist/main.js --name "nmp" -o /home/pi/log/nmp.log -e /home/pi/log/nmp.log --merge-logs
$ pm2 delete nmp && pm2 start dist/main.js --name "nmp" -o /home/pi/log/nmp.log -e /home/pi/log/nmp.log --merge-logs
```

## WMA MP3 cache

WMA playback requires FFmpeg. NestJS keeps original WMA files unchanged and
stores generated MP3 files outside `music/songs/`.

```sh
command -v ffmpeg
export AUDIO_CACHE_PATH="$PWD/data/audio-cache"
# Optional when ffmpeg is not on PATH:
# export FFMPEG_PATH=/usr/bin/ffmpeg
npm run start:dev
```

`AUDIO_CACHE_PATH` must be writable by the account running NestJS. Cache files
are generated data and can be deleted when the application is stopped.

## Playlist MP3 ZIP downloads

Playlist downloads use FFmpeg to copy existing MP3 audio or convert other
formats, then write ordered MP3 metadata and create a ZIP in a generated work
directory. Source files under `music/songs/` remain unchanged.

```sh
command -v ffmpeg
export DOWNLOAD_WORK_PATH="$PWD/data/downloads"
npm run start:dev
```

`DOWNLOAD_WORK_PATH` must be writable by the NestJS account. Jobs run one at a
time, ready files expire after one hour, and generated work is removed after a
download or server restart.

## Lesson plan SQLite data

Lesson locations and 12-week plans are stored in a SQLite database outside the
source tree.

```sh
export LESSON_PLAN_DB_PATH="$PWD/data/lesson-plans.sqlite"
npm run start:dev
```

`LESSON_PLAN_DB_PATH` defaults to the path above. The database uses foreign-key
constraints, WAL mode, startup migrations, and optimistic revisions. Do not
commit the database, WAL files, or backups.

Build the server before running a verified online backup:

```sh
npm run build
export LESSON_PLAN_BACKUP_DIR="$PWD/data/backups"
npm run db:backup
```

The command prints the timestamped backup path after SQLite reports a valid
copy.
