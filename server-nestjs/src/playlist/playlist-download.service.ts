import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createWriteStream, promises as fs } from 'fs';
import { extname, parse, resolve } from 'path';
import * as yazl from 'yazl';
import { FfmpegService } from '../audio/ffmpeg.service';
import { FileService } from '../file/file.service';
import { PlaylistResponse } from './playlist.interface';
import { PlaylistDownloadStatus } from './playlist-download.interface';
import { PlaylistService } from './playlist.service';

const DOWNLOAD_TTL_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const DOWNLOAD_JOB_DIRECTORY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface DownloadJob extends PlaylistDownloadStatus {
  revision: string;
  playlist: PlaylistResponse;
  workDirectory: string;
  archivePath?: string;
  expiresAt?: number;
}

interface PreparedTrack {
  path: string;
  fileName: string;
}

export const sanitizeDownloadName = (input: string, fallback: string) => {
  const sanitized = input
    .normalize('NFC')
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  return sanitized || fallback;
};

export const getOrderedDownloadName = (
  sourceName: string,
  position: number,
  total: number,
) => {
  const sourceTitle = parse(sourceName).name.replace(/^\d+\.\s*/, '');
  const title = sanitizeDownloadName(sourceTitle, 'track');
  const order = String(position).padStart(
    Math.max(2, String(total).length),
    '0',
  );
  return {
    fileName: `${order}.${title}.mp3`,
    title: `${order}.${title}`,
  };
};

@Injectable()
export class PlaylistDownloadService implements OnModuleInit, OnModuleDestroy {
  private readonly workRoot = resolve(
    process.env.DOWNLOAD_WORK_PATH || resolve(process.cwd(), 'data/downloads'),
  );
  private readonly jobs = new Map<string, DownloadJob>();
  private workQueue: Promise<void> = Promise.resolve();
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    private readonly playlistService: PlaylistService,
    private readonly fileService: FileService,
    private readonly ffmpegService: FfmpegService,
  ) {}

  async onModuleInit() {
    await fs.mkdir(this.workRoot, { recursive: true });
    await this.removeStaleWork();
    this.cleanupTimer = setInterval(
      () => void this.cleanupExpiredJobs(),
      CLEANUP_INTERVAL_MS,
    );
    this.cleanupTimer.unref();
  }

  onModuleDestroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  async start(playlistId: string) {
    await this.cleanupExpiredJobs();
    const playlist = await this.playlistService.get(playlistId);
    if (playlist.tracks.length === 0) {
      throw new BadRequestException('다운로드할 곡이 없습니다.');
    }
    const unavailable = playlist.tracks.find((track) => !track.available);
    if (unavailable) {
      throw new UnprocessableEntityException(
        `${unavailable.name} 원본 파일이 없습니다.`,
      );
    }

    const existing = [...this.jobs.values()].find(
      (job) =>
        job.playlistId === playlist.id &&
        job.revision === playlist.updatedAt &&
        job.status !== 'failed',
    );
    if (existing) {
      return this.toStatus(existing);
    }

    const id = randomUUID();
    const job: DownloadJob = {
      id,
      playlistId: playlist.id,
      status: 'queued',
      completed: 0,
      total: playlist.tracks.length,
      revision: playlist.updatedAt,
      playlist,
      workDirectory: resolve(this.workRoot, id),
    };
    this.jobs.set(id, job);
    this.workQueue = this.workQueue.then(
      () => this.process(job),
      () => this.process(job),
    );
    return this.toStatus(job);
  }

  async status(id: string) {
    await this.cleanupExpiredJobs();
    return this.toStatus(this.findJob(id));
  }

  async getFile(id: string) {
    await this.cleanupExpiredJobs();
    const job = this.findJob(id);
    if (job.status !== 'ready' || !job.archivePath || !job.fileName) {
      throw new ConflictException('다운로드 파일이 아직 준비되지 않았습니다.');
    }
    return { path: job.archivePath, fileName: job.fileName };
  }

  async consume(id: string) {
    const job = this.jobs.get(id);
    if (!job) return;
    this.jobs.delete(id);
    await fs.rm(job.workDirectory, { recursive: true, force: true });
  }

  private async process(job: DownloadJob) {
    let currentTrack = '';
    try {
      job.status = 'processing';
      await fs.mkdir(job.workDirectory, { recursive: true });
      const prepared: PreparedTrack[] = [];
      const folderName = sanitizeDownloadName(
        job.playlist.title,
        `playlist-${job.playlist.id.slice(0, 8)}`,
      );

      for (const [index, track] of job.playlist.tracks.entries()) {
        currentTrack = track.name;
        const source = await this.fileService.resolveMusicFile(track.path);
        const orderedName = getOrderedDownloadName(
          track.name,
          index + 1,
          job.total,
        );
        const outputPath = resolve(job.workDirectory, orderedName.fileName);
        await this.ffmpegService.prepareDownloadMp3(
          source.path,
          outputPath,
          extname(source.normalized).toLowerCase() === '.mp3',
          {
            title: orderedName.title,
            track: `${index + 1}/${job.total}`,
            album: job.playlist.title,
            albumArtist: '오감별 음악',
            disc: '1/1',
          },
        );
        const outputStats = await fs.stat(outputPath);
        if (!outputStats.isFile() || outputStats.size === 0) {
          throw new Error('empty-output');
        }
        prepared.push({ path: outputPath, fileName: orderedName.fileName });
        job.completed += 1;
      }

      job.fileName = `${folderName}.zip`;
      job.archivePath = resolve(job.workDirectory, job.fileName);
      await this.createArchive(job.archivePath, folderName, prepared);
      job.status = 'ready';
      job.expiresAt = Date.now() + DOWNLOAD_TTL_MS;
    } catch (error) {
      job.error = currentTrack
        ? `${currentTrack} 파일을 준비하지 못했습니다.`
        : '다운로드 파일을 준비하지 못했습니다.';
      job.expiresAt = Date.now() + DOWNLOAD_TTL_MS;
      await fs.rm(job.workDirectory, { recursive: true, force: true });
      job.status = 'failed';
    }
  }

  private createArchive(
    archivePath: string,
    folderName: string,
    tracks: PreparedTrack[],
  ) {
    return new Promise<void>((resolvePromise, reject) => {
      const output = createWriteStream(archivePath);
      const archive = new yazl.ZipFile();
      output.once('close', resolvePromise);
      output.once('error', reject);
      archive.outputStream.once('error', reject);
      archive.outputStream.pipe(output);
      tracks.forEach((track) =>
        archive.addFile(track.path, `${folderName}/${track.fileName}`, {
          compress: false,
        }),
      );
      archive.end();
    });
  }

  private findJob(id: string) {
    const job = this.jobs.get(id);
    if (!job) {
      throw new NotFoundException('다운로드 작업이 존재하지 않습니다.');
    }
    return job;
  }

  private toStatus(job: DownloadJob): PlaylistDownloadStatus {
    return {
      id: job.id,
      playlistId: job.playlistId,
      status: job.status,
      completed: job.completed,
      total: job.total,
      ...(job.fileName ? { fileName: job.fileName } : {}),
      ...(job.error ? { error: job.error } : {}),
    };
  }

  private async cleanupExpiredJobs() {
    const expired = [...this.jobs.values()].filter(
      (job) => job.expiresAt && job.expiresAt <= Date.now(),
    );
    await Promise.all(expired.map((job) => this.consume(job.id)));
  }

  private async removeStaleWork() {
    const entries = await fs.readdir(this.workRoot, { withFileTypes: true });
    await Promise.all(
      entries
        .filter(
          (entry) =>
            entry.isDirectory() &&
            DOWNLOAD_JOB_DIRECTORY_PATTERN.test(entry.name),
        )
        .map((entry) =>
          fs.rm(resolve(this.workRoot, entry.name), {
            recursive: true,
            force: true,
          }),
        ),
    );
  }
}
