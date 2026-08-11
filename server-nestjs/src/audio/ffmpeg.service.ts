import {
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { spawn } from 'child_process';

export interface DownloadMp3Metadata {
  title: string;
  track: string;
  album: string;
  albumArtist: string;
  disc: string;
}

export const buildDownloadMp3Arguments = (
  inputPath: string,
  outputPath: string,
  copyAudio: boolean,
  metadata: DownloadMp3Metadata,
) => [
  '-nostdin',
  '-hide_banner',
  '-loglevel',
  'error',
  '-y',
  '-i',
  inputPath,
  '-map',
  '0:a:0',
  '-vn',
  '-map_metadata',
  '-1',
  '-c:a',
  copyAudio ? 'copy' : 'libmp3lame',
  ...(copyAudio ? [] : ['-q:a', '2']),
  '-id3v2_version',
  '3',
  '-metadata',
  `title=${metadata.title}`,
  '-metadata',
  `track=${metadata.track}`,
  '-metadata',
  `album=${metadata.album}`,
  '-metadata',
  `album_artist=${metadata.albumArtist}`,
  '-metadata',
  `artist=${metadata.albumArtist}`,
  '-metadata',
  `disc=${metadata.disc}`,
  '-metadata',
  'compilation=1',
  '-f',
  'mp3',
  outputPath,
];

@Injectable()
export class FfmpegService {
  private readonly executable = process.env.FFMPEG_PATH || 'ffmpeg';

  transcode(inputPath: string, outputPath: string) {
    return this.run(
      [
        '-nostdin',
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        inputPath,
        '-map',
        '0:a:0',
        '-vn',
        '-map_metadata',
        '0',
        '-c:a',
        'libmp3lame',
        '-q:a',
        '2',
        '-f',
        'mp3',
        outputPath,
      ],
      'WMA 변환 도구를 사용할 수 없습니다.',
      'WMA 파일을 MP3로 변환하지 못했습니다.',
    );
  }

  prepareDownloadMp3(
    inputPath: string,
    outputPath: string,
    copyAudio: boolean,
    metadata: DownloadMp3Metadata,
  ) {
    return this.run(
      buildDownloadMp3Arguments(inputPath, outputPath, copyAudio, metadata),
      'MP3 변환 도구를 사용할 수 없습니다.',
      '다운로드용 MP3 파일을 만들지 못했습니다.',
    );
  }

  private run(
    args: string[],
    missingExecutableMessage: string,
    failureMessage: string,
  ) {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(this.executable, args, {
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      child.stderr.resume();
      child.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          reject(new ServiceUnavailableException(missingExecutableMessage));
          return;
        }
        reject(new UnprocessableEntityException(failureMessage));
      });
      child.once('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new UnprocessableEntityException(failureMessage));
      });
    });
  }
}
