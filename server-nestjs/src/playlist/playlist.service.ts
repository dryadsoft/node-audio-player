import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { dirname, resolve } from 'path';
import { FileService } from '../file/file.service';
import {
  PlaylistResponse,
  PlaylistStore,
  StoredPlaylist,
} from './playlist.interface';

const EMPTY_STORE: PlaylistStore = { version: 1, playlists: [] };

@Injectable()
export class PlaylistService {
  private readonly dataPath = resolve(
    process.env.PLAYLIST_DATA_PATH ||
      resolve(process.cwd(), 'data/playlists.json'),
  );
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly fileService: FileService) {}

  async list() {
    await this.writeQueue;
    const store = await this.readStore();
    return Promise.all(
      store.playlists.map((playlist) => this.toResponse(playlist)),
    );
  }

  async get(id: string) {
    await this.writeQueue;
    const store = await this.readStore();
    return this.toResponse(this.findPlaylist(store, id));
  }

  create(title: unknown) {
    return this.enqueue(async () => {
      const store = await this.readStore();
      const normalizedTitle = this.validateTitle(title);
      this.ensureUniqueTitle(store, normalizedTitle);
      const now = new Date().toISOString();
      const playlist: StoredPlaylist = {
        id: randomUUID(),
        title: normalizedTitle,
        tracks: [],
        createdAt: now,
        updatedAt: now,
      };
      store.playlists.push(playlist);
      await this.writeStore(store);
      return this.toResponse(playlist);
    });
  }

  rename(id: string, title: unknown) {
    return this.enqueue(async () => {
      const store = await this.readStore();
      const playlist = this.findPlaylist(store, id);
      const normalizedTitle = this.validateTitle(title);
      this.ensureUniqueTitle(store, normalizedTitle, id);
      playlist.title = normalizedTitle;
      playlist.updatedAt = new Date().toISOString();
      await this.writeStore(store);
      return this.toResponse(playlist);
    });
  }

  remove(id: string) {
    return this.enqueue(async () => {
      const store = await this.readStore();
      const index = store.playlists.findIndex((playlist) => playlist.id === id);
      if (index < 0) {
        throw new NotFoundException('재생목록이 존재하지 않습니다.');
      }
      store.playlists.splice(index, 1);
      await this.writeStore(store);
    });
  }

  addTrack(id: string, path: unknown) {
    return this.enqueue(async () => {
      const store = await this.readStore();
      const playlist = this.findPlaylist(store, id);
      const { normalized } = await this.fileService.resolveMusicFile(path);
      if (playlist.tracks.includes(normalized)) {
        throw new ConflictException('이미 재생목록에 있는 곡입니다.');
      }
      playlist.tracks.push(normalized);
      playlist.updatedAt = new Date().toISOString();
      await this.writeStore(store);
      return this.toResponse(playlist);
    });
  }

  removeTrack(id: string, path: unknown) {
    return this.enqueue(async () => {
      const store = await this.readStore();
      const playlist = this.findPlaylist(store, id);
      const normalized = this.fileService.normalizeRelativePath(path);
      const index = playlist.tracks.indexOf(normalized);
      if (index < 0) {
        throw new NotFoundException('재생목록에 곡이 존재하지 않습니다.');
      }
      playlist.tracks.splice(index, 1);
      playlist.updatedAt = new Date().toISOString();
      await this.writeStore(store);
      return this.toResponse(playlist);
    });
  }

  reorderTracks(id: string, paths: unknown) {
    return this.enqueue(async () => {
      if (!Array.isArray(paths)) {
        throw new BadRequestException('곡 순서는 배열이어야 합니다.');
      }
      const normalizedPaths = paths.map((path) =>
        this.fileService.normalizeRelativePath(path),
      );
      const store = await this.readStore();
      const playlist = this.findPlaylist(store, id);
      const expected = [...playlist.tracks].sort();
      const received = [...normalizedPaths].sort();
      if (
        expected.length !== received.length ||
        expected.some((path, index) => path !== received[index])
      ) {
        throw new BadRequestException(
          '현재 곡 목록과 같은 경로를 모두 포함해야 합니다.',
        );
      }
      playlist.tracks = normalizedPaths;
      playlist.updatedAt = new Date().toISOString();
      await this.writeStore(store);
      return this.toResponse(playlist);
    });
  }

  private validateTitle(title: unknown) {
    if (typeof title !== 'string' || title.trim() === '') {
      throw new BadRequestException('재생목록 제목을 입력하세요.');
    }
    return title.trim();
  }

  private ensureUniqueTitle(
    store: PlaylistStore,
    title: string,
    exceptId?: string,
  ) {
    const normalized = title.toLocaleLowerCase('ko');
    if (
      store.playlists.some(
        (playlist) =>
          playlist.id !== exceptId &&
          playlist.title.toLocaleLowerCase('ko') === normalized,
      )
    ) {
      throw new ConflictException('같은 제목의 재생목록이 있습니다.');
    }
  }

  private findPlaylist(store: PlaylistStore, id: string) {
    const playlist = store.playlists.find((item) => item.id === id);
    if (!playlist) {
      throw new NotFoundException('재생목록이 존재하지 않습니다.');
    }
    return playlist;
  }

  private async toResponse(
    playlist: StoredPlaylist,
  ): Promise<PlaylistResponse> {
    const tracks = await Promise.all(
      playlist.tracks.map(async (path) => ({
        path,
        name: this.fileService.getFileName(path),
        available: await this.fileService.isMusicFileAvailable(path),
      })),
    );
    return { ...playlist, tracks };
  }

  private enqueue<T>(task: () => Promise<T>) {
    const result = this.writeQueue.then(task, task);
    this.writeQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async readStore(): Promise<PlaylistStore> {
    try {
      const contents = await fs.readFile(this.dataPath, 'utf8');
      const store = JSON.parse(contents) as PlaylistStore;
      if (store.version !== 1 || !Array.isArray(store.playlists)) {
        throw new Error('invalid-schema');
      }
      return store;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { ...EMPTY_STORE, playlists: [] };
      }
      throw new InternalServerErrorException(
        '재생목록 저장 파일을 읽을 수 없습니다. 원본 파일은 유지되었습니다.',
      );
    }
  }

  private async writeStore(store: PlaylistStore) {
    const dataDirectory = dirname(this.dataPath);
    const tempPath = resolve(
      dataDirectory,
      `.playlists-${process.pid}-${Date.now()}.tmp`,
    );
    await fs.mkdir(dataDirectory, { recursive: true });
    const handle = await fs.open(tempPath, 'w');
    try {
      await handle.writeFile(`${JSON.stringify(store, null, 2)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tempPath, this.dataPath);
  }
}
