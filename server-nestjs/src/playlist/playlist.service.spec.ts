import {
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { FileService } from '../file/file.service';
import { PlaylistService } from './playlist.service';

describe('PlaylistService', () => {
  let tempDirectory: string;
  let musicRoot: string;
  let dataPath: string;
  let service: PlaylistService;

  beforeEach(async () => {
    tempDirectory = await fs.mkdtemp(resolve(tmpdir(), 'node-audio-player-'));
    musicRoot = resolve(tempDirectory, 'music/songs');
    dataPath = resolve(tempDirectory, 'data/playlists.json');
    await fs.mkdir(resolve(musicRoot, '수업 음악'), { recursive: true });
    await Promise.all([
      fs.writeFile(resolve(musicRoot, '수업 음악/첫 곡.mp3'), 'audio'),
      fs.writeFile(resolve(musicRoot, '수업 음악/둘째 곡.mp3'), 'audio'),
    ]);
    process.env.MUSIC_ROOT_PATH = musicRoot;
    process.env.PLAYLIST_DATA_PATH = dataPath;
    service = new PlaylistService(new FileService());
  });

  afterEach(async () => {
    delete process.env.MUSIC_ROOT_PATH;
    delete process.env.PLAYLIST_DATA_PATH;
    await fs.rm(tempDirectory, { recursive: true, force: true });
  });

  it('persists playlist titles, path references, and order', async () => {
    const created = await service.create('아침 음악');
    await service.addTrack(created.id, '수업 음악/첫 곡.mp3');
    await service.addTrack(created.id, '수업 음악/둘째 곡.mp3');
    await service.reorderTracks(created.id, [
      '수업 음악/둘째 곡.mp3',
      '수업 음악/첫 곡.mp3',
    ]);

    const reloaded = new PlaylistService(new FileService());
    const [playlist] = await reloaded.list();
    expect(playlist.title).toBe('아침 음악');
    expect(playlist.tracks.map((track) => track.path)).toEqual([
      '수업 음악/둘째 곡.mp3',
      '수업 음악/첫 곡.mp3',
    ]);
    expect(playlist.tracks.every((track) => track.available)).toBe(true);
  });

  it('rejects duplicate titles and duplicate tracks', async () => {
    const created = await service.create('집중 음악');
    await expect(service.create(' 집중 음악 ')).rejects.toBeInstanceOf(
      ConflictException,
    );
    await service.addTrack(created.id, '수업 음악/첫 곡.mp3');
    await expect(
      service.addTrack(created.id, '수업 음악/첫 곡.mp3'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps missing source paths and marks them unavailable', async () => {
    const created = await service.create('보존 목록');
    await service.addTrack(created.id, '수업 음악/첫 곡.mp3');
    await fs.unlink(resolve(musicRoot, '수업 음악/첫 곡.mp3'));

    const [playlist] = await service.list();
    expect(playlist.tracks[0]).toMatchObject({
      path: '수업 음악/첫 곡.mp3',
      available: false,
    });
  });

  it('serializes concurrent writes and preserves corrupt JSON', async () => {
    await Promise.all([
      service.create('목록 1'),
      service.create('목록 2'),
      service.create('목록 3'),
    ]);
    expect(await service.list()).toHaveLength(3);

    await fs.writeFile(dataPath, '{broken', 'utf8');
    await expect(service.list()).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(await fs.readFile(dataPath, 'utf8')).toBe('{broken');
  });
});
