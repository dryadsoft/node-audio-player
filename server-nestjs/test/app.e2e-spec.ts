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
        programName: '오감별',
        sectionName: '월요일',
        weeks: initialWeeks,
      })
      .expect(201);
    expect(created.body).toMatchObject({
      completedWeeks: 3,
      status: 'draft',
      programName: '오감별',
      sectionName: '월요일',
      revision: 1,
      documentTitle: '오감별 강의계획서 - 봄학기',
      courseName: '오감별',
    });

    const downloaded = await request(app.getHttpServer())
      .get(`/api/lesson-plans/${created.body.id}/docx`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200)
      .expect(
        'Content-Type',
        /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/,
      )
      .expect('Cache-Control', 'private, no-store');
    expect(downloaded.headers['content-disposition']).toContain(
      "filename*=UTF-8''",
    );
    expect(Buffer.from(downloaded.body).subarray(0, 2).toString()).toBe('PK');

    const listed = await request(app.getHttpServer())
      .get('/api/lesson-plans')
      .query({ year: 2026, term: 'spring', programName: '오감별' })
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
        programName: '오감별',
        sectionName: '월요일',
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
        programName: '오감별',
        sectionName: '월요일',
        weeks: initialWeeks,
        expectedRevision: 1,
      })
      .expect(409);
  });

  it('/api/lesson-curricula shares one weekly note across locations', async () => {
    const firstLocation = await request(app.getHttpServer())
      .post('/api/lesson-locations')
      .send({ name: '서초 문화센터' })
      .expect(201);
    const secondLocation = await request(app.getHttpServer())
      .post('/api/lesson-locations')
      .send({ name: '마포 문화센터' })
      .expect(201);
    const weeks = Array.from({ length: 12 }, (_, index) => ({
      week: index + 1,
      className: `${index + 1}주 수업`,
      content: `${index + 1}주 내용`,
    }));
    const source = await request(app.getHttpServer())
      .post('/api/lesson-plans')
      .send({
        year: 2026,
        term: 'fall',
        locationId: firstLocation.body.id,
        programName: '오감별',
        sectionName: '',
        weeks,
      })
      .expect(201);
    const curriculum = await request(app.getHttpServer())
      .post('/api/lesson-curricula')
      .send({
        year: 2026,
        term: 'fall',
        programName: '오감별',
        sourcePlanId: source.body.id,
      })
      .expect(201);
    expect(curriculum.body.weeks).toHaveLength(12);

    await request(app.getHttpServer())
      .put(`/api/lesson-curricula/${curriculum.body.id}/weeks/1`)
      .send({
        className: '가을 열매 놀이',
        content: '열매의 모양과 소리를 탐색합니다.',
        lessonPlan: '인사 후 열매 탐색',
        materials: '도토리, 바구니',
        inkDocument: {
          version: 1,
          aspectRatio: 4 / 3,
          strokes: [
            {
              id: 'stroke-1',
              color: '#1d4ed8',
              width: 4,
              points: [[0.1, 0.2, 0.7, 1, 0, 0]],
            },
          ],
        },
        expectedRevision: 1,
      })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          className: '가을 열매 놀이',
          lessonPlan: '인사 후 열매 탐색',
          materials: '도토리, 바구니',
          hasInk: true,
          revision: 2,
          inkDocument: {
            version: 2,
            pageCount: 2,
            strokes: [expect.objectContaining({ page: 0 })],
          },
        });
      });

    const linked = await request(app.getHttpServer())
      .post('/api/lesson-plans')
      .send({
        year: 2026,
        term: 'fall',
        locationId: secondLocation.body.id,
        programName: '오감별',
        sectionName: '',
        curriculumId: curriculum.body.id,
        weeks,
      })
      .expect(201);
    expect(linked.body.weeks[0]).toEqual({
      week: 1,
      className: '가을 열매 놀이',
      content: '열매의 모양과 소리를 탐색합니다.',
    });

    const listed = await request(app.getHttpServer())
      .get('/api/lesson-curricula')
      .query({ year: 2026, term: 'fall', programName: '오감별' })
      .expect(200);
    expect(listed.body[0]).toMatchObject({
      id: curriculum.body.id,
      linkedPlanCount: 1,
    });

    const current = await request(app.getHttpServer())
      .get(`/api/lesson-curricula/${curriculum.body.id}`)
      .expect(200);
    const replaced = await request(app.getHttpServer())
      .put(`/api/lesson-curricula/${curriculum.body.id}/weeks`)
      .send({
        sourcePlanId: source.body.id,
        expectedUpdatedAt: current.body.updatedAt,
      })
      .expect(200);
    expect(replaced.body.weeks[0]).toMatchObject({
      className: '1주 수업',
      content: '1주 내용',
    });
    await request(app.getHttpServer())
      .get(`/api/lesson-curricula/${curriculum.body.id}/weeks/1`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          className: '1주 수업',
          content: '1주 내용',
          lessonPlan: '인사 후 열매 탐색',
          materials: '도토리, 바구니',
          hasInk: true,
        });
      });

    const deleted = await request(app.getHttpServer())
      .delete(`/api/lesson-curricula/${curriculum.body.id}`)
      .send({ expectedUpdatedAt: replaced.body.updatedAt })
      .expect(200);
    expect(deleted.body).toEqual({
      id: curriculum.body.id,
      detachedPlanCount: 1,
    });
    await request(app.getHttpServer())
      .get(`/api/lesson-curricula/${curriculum.body.id}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/lesson-plans/${linked.body.id}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.curriculumId).toBeNull();
        expect(response.body.weeks[0]).toEqual({
          week: 1,
          className: '1주 수업',
          content: '1주 내용',
        });
      });
  });
});
