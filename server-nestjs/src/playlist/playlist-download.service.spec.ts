import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { FfmpegService } from '../audio/ffmpeg.service';
import { FileService } from '../file/file.service';
import { PlaylistDownloadService } from './playlist-download.service';
import { PlaylistResponse } from './playlist.interface';
import { PlaylistService } from './playlist.service';

describe('PlaylistDownloadService', () => {
  let temporaryDirectory: string;
  let musicRoot: string;
  let downloadRoot: string;
  let playlist: PlaylistResponse;
  let prepareDownloadMp3: jest.Mock;
  let service: PlaylistDownloadService;

  beforeEach(async () => {
    temporaryDirectory = await fs.mkdtemp(
      resolve(tmpdir(), 'node-audio-player-download-'),
    );
    musicRoot = resolve(temporaryDirectory, 'music/songs');
    downloadRoot = resolve(temporaryDirectory, 'downloads');
    await fs.mkdir(resolve(musicRoot, '수업 음악'), { recursive: true });
    await Promise.all([
      fs.writeFile(resolve(musicRoot, '수업 음악/03.통통통.mp3'), 'mp3'),
      fs.writeFile(resolve(musicRoot, '수업 음악/01.하이헬로.wma'), 'wma'),
      fs.writeFile(resolve(musicRoot, '수업 음악/반짝.wav'), 'wav'),
    ]);
    process.env.MUSIC_ROOT_PATH = musicRoot;
    process.env.DOWNLOAD_WORK_PATH = downloadRoot;
    await fs.mkdir(
      resolve(downloadRoot, '00000000-0000-4000-8000-000000000000'),
      { recursive: true },
    );
    await fs.writeFile(resolve(downloadRoot, 'operator-note.txt'), 'keep');
    playlist = {
      id: 'playlist-1',
      title: '아침 음악',
      tracks: [
        {
          path: '수업 음악/03.통통통.mp3',
          name: '03.통통통.mp3',
          available: true,
        },
        {
          path: '수업 음악/01.하이헬로.wma',
          name: '01.하이헬로.wma',
          available: true,
        },
        {
          path: '수업 음악/반짝.wav',
          name: '반짝.wav',
          available: true,
        },
      ],
      createdAt: '2026-08-11T00:00:00.000Z',
      updatedAt: '2026-08-11T00:00:00.000Z',
    };
    prepareDownloadMp3 = jest.fn(async (_input, output: string) =>
      fs.writeFile(output, 'prepared-mp3'),
    );
    service = new PlaylistDownloadService(
      { get: jest.fn(async () => playlist) } as unknown as PlaylistService,
      new FileService(),
      { prepareDownloadMp3 } as unknown as FfmpegService,
    );
    await service.onModuleInit();
  });

  afterEach(async () => {
    service.onModuleDestroy();
    delete process.env.MUSIC_ROOT_PATH;
    delete process.env.DOWNLOAD_WORK_PATH;
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  });

  const waitForTerminal = async (id: string) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const status = await service.status(id);
      if (status.status === 'ready' || status.status === 'failed') {
        return status;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
    }
    throw new Error('download job did not finish');
  };

  it('clears only stale job directories from the configured work root', async () => {
    await expect(
      fs.stat(resolve(downloadRoot, '00000000-0000-4000-8000-000000000000')),
    ).rejects.toThrow();
    await expect(
      fs.readFile(resolve(downloadRoot, 'operator-note.txt'), 'utf8'),
    ).resolves.toBe('keep');
  });

  it('prepares ordered MP3 files and one reusable playlist ZIP', async () => {
    const started = await service.start(playlist.id);
    const duplicate = await service.start(playlist.id);
    expect(duplicate.id).toBe(started.id);

    const status = await waitForTerminal(started.id);
    expect(status).toMatchObject({
      status: 'ready',
      completed: 3,
      total: 3,
      fileName: '아침 음악.zip',
    });
    expect(prepareDownloadMp3.mock.calls.map((call) => call[2])).toEqual([
      true,
      false,
      false,
    ]);
    expect(prepareDownloadMp3.mock.calls.map((call) => call[3])).toEqual([
      expect.objectContaining({ title: '01.통통통', track: '1/3' }),
      expect.objectContaining({ title: '02.하이헬로', track: '2/3' }),
      expect.objectContaining({ title: '03.반짝', track: '3/3' }),
    ]);

    const file = await service.getFile(started.id);
    const archive = await fs.readFile(file.path);
    expect(archive.subarray(0, 2).toString()).toBe('PK');
    ['01.통통통.mp3', '02.하이헬로.mp3', '03.반짝.mp3'].forEach((name) =>
      expect(archive.includes(Buffer.from(name))).toBe(true),
    );

    await service.consume(started.id);
    await expect(fs.stat(resolve(downloadRoot, started.id))).rejects.toThrow();
  });

  it('rejects empty and unavailable playlists before queuing', async () => {
    playlist.tracks = [];
    await expect(service.start(playlist.id)).rejects.toThrow(
      '다운로드할 곡이 없습니다.',
    );

    playlist.tracks = [
      { path: '수업 음악/없음.mp3', name: '없음.mp3', available: false },
    ];
    await expect(service.start(playlist.id)).rejects.toThrow(
      '없음.mp3 원본 파일이 없습니다.',
    );
  });

  it('fails the whole job and removes partial output on conversion errors', async () => {
    prepareDownloadMp3
      .mockImplementationOnce(async (_input, output: string) =>
        fs.writeFile(output, 'prepared-mp3'),
      )
      .mockRejectedValueOnce(new Error('conversion failed'));

    const started = await service.start(playlist.id);
    const status = await waitForTerminal(started.id);
    expect(status).toMatchObject({
      status: 'failed',
      completed: 1,
      error: '01.하이헬로.wma 파일을 준비하지 못했습니다.',
    });
    await expect(service.getFile(started.id)).rejects.toThrow(
      '다운로드 파일이 아직 준비되지 않았습니다.',
    );
    await expect(fs.stat(resolve(downloadRoot, started.id))).rejects.toThrow();
  });
});
