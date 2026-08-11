import { tmpdir } from 'os';
import { resolve } from 'path';
import { buildDownloadMp3Arguments, FfmpegService } from './ffmpeg.service';

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

  it('copies MP3 audio while setting ordered download metadata', () => {
    const args = buildDownloadMp3Arguments(
      '/music/source.mp3',
      '/tmp/01.첫 곡.mp3',
      true,
      {
        title: '01.첫 곡',
        track: '1/3',
        album: '아침 음악',
        albumArtist: '오감별 음악',
        disc: '1/1',
      },
    );

    expect(args).toContain('copy');
    expect(args).not.toContain('libmp3lame');
    expect(args).toEqual(
      expect.arrayContaining([
        'title=01.첫 곡',
        'track=1/3',
        'album=아침 음악',
        'album_artist=오감별 음악',
        'artist=오감별 음악',
        'disc=1/1',
        'compilation=1',
      ]),
    );
    expect(args).toEqual(expect.arrayContaining(['-map_metadata', '-1']));
  });

  it('encodes non-MP3 audio with libmp3lame quality 2', () => {
    const args = buildDownloadMp3Arguments(
      '/music/source.wav',
      '/tmp/02.둘째 곡.mp3',
      false,
      {
        title: '02.둘째 곡',
        track: '2/3',
        album: '아침 음악',
        albumArtist: '오감별 음악',
        disc: '1/1',
      },
    );

    expect(args).toEqual(expect.arrayContaining(['libmp3lame', '-q:a', '2']));
    expect(args).not.toContain('copy');
  });
});
