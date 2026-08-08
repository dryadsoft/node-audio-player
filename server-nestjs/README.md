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
