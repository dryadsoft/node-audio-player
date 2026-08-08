import { UnsupportedMediaTypeException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { extname, resolve } from 'path';
import { FileService } from '../file/file.service';
import { FfmpegService } from './ffmpeg.service';

interface CacheMetadata {
  sourcePath: string;
  sourceSize: number;
  sourceMtimeMs: number;
}

interface CachedAudio {
  path: string;
}

@Injectable()
export class AudioService {
  private readonly cacheRoot = resolve(
    process.env.AUDIO_CACHE_PATH || resolve(process.cwd(), 'data/audio-cache'),
  );
  private readonly conversions = new Map<string, Promise<CachedAudio>>();
  private conversionQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly fileService: FileService,
    private readonly ffmpegService: FfmpegService,
  ) {}

  async getPlayableFile(input: unknown): Promise<CachedAudio> {
    const source = await this.fileService.resolveMusicFile(input);
    if (extname(source.normalized).toLowerCase() !== '.wma') {
      throw new UnsupportedMediaTypeException(
        'WMA 파일만 변환 재생할 수 있습니다.',
      );
    }

    const cacheKey = createHash('sha256')
      .update(source.normalized)
      .digest('hex');
    const cachedPath = resolve(this.cacheRoot, `${cacheKey}.mp3`);
    const metadataPath = resolve(this.cacheRoot, `${cacheKey}.json`);

    if (await this.isFresh(source, cachedPath, metadataPath)) {
      return { path: cachedPath };
    }

    const pending = this.conversions.get(cacheKey);
    if (pending) {
      return pending;
    }

    const conversion = this.enqueue(async () => {
      if (await this.isFresh(source, cachedPath, metadataPath)) {
        return { path: cachedPath };
      }
      return this.convert(source, cachedPath, metadataPath);
    });
    this.conversions.set(cacheKey, conversion);

    try {
      return await conversion;
    } finally {
      if (this.conversions.get(cacheKey) === conversion) {
        this.conversions.delete(cacheKey);
      }
    }
  }

  private enqueue<T>(work: () => Promise<T>) {
    const result = this.conversionQueue.then(work, work);
    this.conversionQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async isFresh(
    source: { normalized: string; path: string },
    cachedPath: string,
    metadataPath: string,
  ) {
    try {
      const [sourceStats, cachedStats, metadataText] = await Promise.all([
        fs.stat(source.path),
        fs.stat(cachedPath),
        fs.readFile(metadataPath, 'utf8'),
      ]);
      const metadata = JSON.parse(metadataText) as CacheMetadata;
      return (
        cachedStats.isFile() &&
        cachedStats.size > 0 &&
        metadata.sourcePath === source.normalized &&
        metadata.sourceSize === sourceStats.size &&
        metadata.sourceMtimeMs === sourceStats.mtimeMs
      );
    } catch (_error) {
      return false;
    }
  }

  private async convert(
    source: { normalized: string; path: string },
    cachedPath: string,
    metadataPath: string,
  ): Promise<CachedAudio> {
    await fs.mkdir(this.cacheRoot, { recursive: true });

    const suffix = `${process.pid}-${Date.now()}-${randomBytes(6).toString(
      'hex',
    )}`;
    const temporaryAudioPath = `${cachedPath}.${suffix}.tmp.mp3`;
    const temporaryMetadataPath = `${metadataPath}.${suffix}.tmp`;

    try {
      const sourceStatsBefore = await fs.stat(source.path);
      await this.ffmpegService.transcode(source.path, temporaryAudioPath);
      const [sourceStatsAfter, cachedStats] = await Promise.all([
        fs.stat(source.path),
        fs.stat(temporaryAudioPath),
      ]);
      if (
        cachedStats.size === 0 ||
        sourceStatsBefore.size !== sourceStatsAfter.size ||
        sourceStatsBefore.mtimeMs !== sourceStatsAfter.mtimeMs
      ) {
        throw new Error('변환 중 원본 WMA 파일이 변경되었습니다.');
      }

      const metadata: CacheMetadata = {
        sourcePath: source.normalized,
        sourceSize: sourceStatsAfter.size,
        sourceMtimeMs: sourceStatsAfter.mtimeMs,
      };
      await fs.writeFile(temporaryMetadataPath, JSON.stringify(metadata));
      await fs.rename(temporaryAudioPath, cachedPath);
      await fs.rename(temporaryMetadataPath, metadataPath);
      return { path: cachedPath };
    } finally {
      await Promise.all([
        fs.rm(temporaryAudioPath, { force: true }),
        fs.rm(temporaryMetadataPath, { force: true }),
      ]);
    }
  }
}
