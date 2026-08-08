import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { FfmpegService } from './../src/audio/ffmpeg.service';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let temporaryDirectory: string;

  beforeEach(async () => {
    temporaryDirectory = await fs.mkdtemp(
      resolve(tmpdir(), 'node-audio-player-e2e-'),
    );
    const musicRoot = resolve(temporaryDirectory, 'music/songs');
    process.env.MUSIC_ROOT_PATH = musicRoot;
    process.env.AUDIO_CACHE_PATH = resolve(temporaryDirectory, 'audio-cache');
    await fs.mkdir(resolve(musicRoot, '수업 음악'), { recursive: true });
    await fs.writeFile(resolve(musicRoot, '수업 음악/첫 곡.wma'), 'wma');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(FfmpegService)
      .useValue({
        transcode: async (_inputPath: string, outputPath: string) => {
          await fs.writeFile(outputPath, 'ID3-generated-mp3');
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.MUSIC_ROOT_PATH;
    delete process.env.AUDIO_CACHE_PATH;
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('/api (GET)', () => {
    return request(app.getHttpServer()).get('/api').expect(404);
  });

  it('/api/audio (GET) creates and range-streams a cached MP3', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/audio')
      .query({ path: '수업 음악/첫 곡.wma' })
      .set('Range', 'bytes=0-1')
      .expect(206)
      .expect('Content-Type', /audio\/mpeg/)
      .expect('Accept-Ranges', 'bytes')
      .expect('Cache-Control', 'private, no-store');

    expect(response.headers['content-range']).toBe('bytes 0-1/17');
    expect(response.headers['content-length']).toBe('2');
  });
});
