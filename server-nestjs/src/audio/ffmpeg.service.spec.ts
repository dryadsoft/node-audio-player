import { tmpdir } from 'os';
import { resolve } from 'path';
import { FfmpegService } from './ffmpeg.service';

describe('FfmpegService', () => {
  afterEach(() => {
    delete process.env.FFMPEG_PATH;
  });

  it('reports a missing FFmpeg executable without invoking a shell', async () => {
    process.env.FFMPEG_PATH = resolve(
      tmpdir(),
      'node-audio-player-missing-ffmpeg',
    );
    const service = new FfmpegService();

    await expect(
      service.transcode('/tmp/input.wma', '/tmp/output.mp3'),
    ).rejects.toThrow('WMA 변환 도구를 사용할 수 없습니다.');
  });
});
