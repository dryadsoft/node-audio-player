import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { FileService } from '../file/file.service';
import { AudioService } from './audio.service';
import { FfmpegService } from './ffmpeg.service';

describe('AudioService', () => {
  let temporaryDirectory: string;
  let musicRoot: string;
  let cacheRoot: string;
  let transcode: jest.Mock<Promise<void>, [string, string]>;
  let service: AudioService;

  beforeEach(async () => {
    temporaryDirectory = await fs.mkdtemp(
      resolve(tmpdir(), 'node-audio-player-audio-'),
    );
    musicRoot = resolve(temporaryDirectory, 'music/songs');
    cacheRoot = resolve(temporaryDirectory, 'audio-cache');
    await fs.mkdir(resolve(musicRoot, '수업 음악'), { recursive: true });
    await Promise.all([
      fs.writeFile(resolve(musicRoot, '수업 음악/첫 곡.wma'), 'wma-one'),
      fs.writeFile(resolve(musicRoot, '수업 음악/둘째 곡.WMA'), 'wma-two'),
      fs.writeFile(resolve(musicRoot, '수업 음악/일반 곡.mp3'), 'mp3'),
    ]);
    process.env.MUSIC_ROOT_PATH = musicRoot;
    process.env.AUDIO_CACHE_PATH = cacheRoot;
    transcode = jest.fn(async (_inputPath, outputPath) => {
      await fs.writeFile(outputPath, 'generated-mp3');
    });
    service = new AudioService(new FileService(), {
      transcode,
    } as unknown as FfmpegService);
  });

  afterEach(async () => {
    delete process.env.MUSIC_ROOT_PATH;
    delete process.env.AUDIO_CACHE_PATH;
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('creates one cache and reuses it while the source is unchanged', async () => {
    const first = await service.getPlayableFile('수업 음악/첫 곡.wma');
    const firstStats = await fs.stat(first.path);
    const second = await service.getPlayableFile('수업 음악/첫 곡.wma');
    const secondStats = await fs.stat(second.path);

    expect(first.path).toBe(second.path);
    expect(firstStats.mtimeMs).toBe(secondStats.mtimeMs);
    expect(transcode).toHaveBeenCalledTimes(1);
  });

  it('regenerates the cache after the source changes', async () => {
    await service.getPlayableFile('수업 음악/첫 곡.wma');
    await fs.writeFile(
      resolve(musicRoot, '수업 음악/첫 곡.wma'),
      'updated-wma-source',
    );
    await service.getPlayableFile('수업 음악/첫 곡.wma');

    expect(transcode).toHaveBeenCalledTimes(2);
  });

  it('shares matching work and serializes different cache misses', async () => {
    let active = 0;
    let maximumActive = 0;
    transcode.mockImplementation(async (_inputPath, outputPath) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
      await fs.writeFile(outputPath, 'generated-mp3');
      active -= 1;
    });

    await Promise.all([
      service.getPlayableFile('수업 음악/첫 곡.wma'),
      service.getPlayableFile('수업 음악/첫 곡.wma'),
      service.getPlayableFile('수업 음악/둘째 곡.WMA'),
    ]);

    expect(transcode).toHaveBeenCalledTimes(2);
    expect(maximumActive).toBe(1);
  });

  it('rejects paths outside the music root and non-WMA files', async () => {
    await expect(service.getPlayableFile('../outside.wma')).rejects.toThrow(
      '올바르지 않은 음악 경로입니다.',
    );
    await expect(
      service.getPlayableFile('수업 음악/일반 곡.mp3'),
    ).rejects.toThrow('WMA 파일만 변환 재생할 수 있습니다.');
  });

  it('removes partial cache files after a conversion failure', async () => {
    transcode.mockImplementation(async (_inputPath, outputPath) => {
      await fs.writeFile(outputPath, 'partial');
      throw new Error('conversion failed');
    });

    await expect(
      service.getPlayableFile('수업 음악/첫 곡.wma'),
    ).rejects.toThrow('conversion failed');
    expect(await fs.readdir(cacheRoot)).toEqual([]);
  });
});
