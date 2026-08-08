import {
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { spawn } from 'child_process';

@Injectable()
export class FfmpegService {
  private readonly executable = process.env.FFMPEG_PATH || 'ffmpeg';

  transcode(inputPath: string, outputPath: string) {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(
        this.executable,
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
        { stdio: ['ignore', 'ignore', 'pipe'] },
      );

      child.stderr.resume();
      child.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          reject(
            new ServiceUnavailableException(
              'WMA 변환 도구를 사용할 수 없습니다.',
            ),
          );
          return;
        }
        reject(
          new UnprocessableEntityException(
            'WMA 파일을 MP3로 변환하지 못했습니다.',
          ),
        );
      });
      child.once('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(
          new UnprocessableEntityException(
            'WMA 파일을 MP3로 변환하지 못했습니다.',
          ),
        );
      });
    });
  }
}
