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
    process.env.DOWNLOAD_WORK_PATH = resolve(temporaryDirectory, 'downloads');
    process.env.PLAYLIST_DATA_PATH = resolve(
      temporaryDirectory,
      'playlists.json',
    );
    process.env.LESSON_PLAN_DB_PATH = resolve(
      temporaryDirectory,
      'lesson-plans.sqlite',
    );
    await fs.mkdir(resolve(musicRoot, '수업 음악'), { recursive: true });
    await Promise.all([
      fs.writeFile(resolve(musicRoot, '수업 음악/첫 곡.wma'), 'wma'),
      fs.writeFile(resolve(musicRoot, '수업 음악/둘째 곡.mp3'), 'mp3'),
    ]);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(FfmpegService)
      .useValue({
        transcode: async (_inputPath: string, outputPath: string) => {
          await fs.writeFile(outputPath, 'ID3-generated-mp3');
        },
        prepareDownloadMp3: async (_inputPath: string, outputPath: string) => {
          await fs.writeFile(outputPath, 'ID3-download-mp3');
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
    delete process.env.DOWNLOAD_WORK_PATH;
    delete process.env.PLAYLIST_DATA_PATH;
    delete process.env.LESSON_PLAN_DB_PATH;
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

  it('/api/playlists/:id/downloads prepares and downloads an ordered ZIP', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/playlists')
      .send({ title: '수업 음악' })
      .expect(201);
    const playlistId = created.body.id;
    await request(app.getHttpServer())
      .post(`/api/playlists/${playlistId}/tracks`)
      .send({ path: '수업 음악/둘째 곡.mp3' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/playlists/${playlistId}/tracks`)
      .send({ path: '수업 음악/첫 곡.wma' })
      .expect(201);

    const started = await request(app.getHttpServer())
      .post(`/api/playlists/${playlistId}/downloads`)
      .expect(202);
    let status = started.body;
    for (
      let attempt = 0;
      attempt < 100 && status.status !== 'ready';
      attempt += 1
    ) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
      status = (
        await request(app.getHttpServer())
          .get(`/api/playlist-downloads/${started.body.id}`)
          .expect(200)
      ).body;
    }
    expect(status).toMatchObject({
      status: 'ready',
      completed: 2,
      total: 2,
      fileName: '수업 음악.zip',
    });

    const downloaded = await request(app.getHttpServer())
      .get(`/api/playlist-downloads/${started.body.id}/file`)
      .expect(200)
      .expect('Content-Type', /application\/zip/)
      .expect('Cache-Control', 'private, no-store');
    expect(downloaded.headers['content-disposition']).toContain(
      "filename*=UTF-8''",
    );
  });

  it('/api/lesson-plans creates, filters, and updates a 12-week plan', async () => {
    const location = await request(app.getHttpServer())
      .post('/api/lesson-locations')
      .send({ name: '서초 문화센터' })
      .expect(201);
    const initialWeeks = Array.from({ length: 12 }, (_, index) => ({
      week: index + 1,
      className: index < 3 ? `${index + 1}주 수업` : '',
      content: index < 3 ? `${index + 1}주 내용` : '',
    }));
    const created = await request(app.getHttpServer())
      .post('/api/lesson-plans')
      .send({
        year: 2026,
        term: 'spring',
        locationId: location.body.id,
        weeks: initialWeeks,
      })
      .expect(201);
    expect(created.body).toMatchObject({
      completedWeeks: 3,
      status: 'draft',
      revision: 1,
    });

    const listed = await request(app.getHttpServer())
      .get('/api/lesson-plans')
      .query({ year: 2026, term: 'spring' })
      .expect(200);
    expect(listed.body).toHaveLength(1);

    const completedWeeks = initialWeeks.map((week) => ({
      ...week,
      className: week.className || `${week.week}주 수업`,
      content: week.content || `${week.week}주 내용`,
    }));
    await request(app.getHttpServer())
      .put(`/api/lesson-plans/${created.body.id}`)
      .send({
        year: 2026,
        term: 'spring',
        locationId: location.body.id,
        weeks: completedWeeks,
        expectedRevision: 1,
      })
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe('complete');
        expect(response.body.revision).toBe(2);
      });

    await request(app.getHttpServer())
      .put(`/api/lesson-plans/${created.body.id}`)
      .send({
        year: 2026,
        term: 'spring',
        locationId: location.body.id,
        weeks: initialWeeks,
        expectedRevision: 1,
      })
      .expect(409);
  });
});
