## Server with Nest.js

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
