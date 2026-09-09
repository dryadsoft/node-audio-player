import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { AttendanceModule } from '../src/attendance/attendance.module';
import { DatabaseModule } from '../src/database/database.module';
import { SqliteService } from '../src/database/sqlite.service';
import { LessonLocationService } from '../src/lesson-plan/lesson-location.service';
const jpeg = Buffer.from([
  255, 216, 255, 192, 0, 17, 8, 0, 100, 0, 100, 3, 1, 17, 0, 2, 17, 0, 3, 17, 0,
  255, 217,
]);
describe('Attendance API', () => {
  let app: INestApplication, root: string, locationId: string;
  beforeAll(async () => {
    root = await fs.mkdtemp(resolve(tmpdir(), 'attendance-http-'));
    process.env.LESSON_PLAN_DB_PATH = resolve(root, 'db.sqlite');
    process.env.ATTENDANCE_IMAGE_DIR = resolve(root, 'photos');
    const module = await Test.createTestingModule({
      imports: [DatabaseModule, AttendanceModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    locationId = new LessonLocationService(app.get(SqliteService)).create(
      '사진 센터',
    ).id;
  });
  afterAll(async () => {
    await app.close();
    delete process.env.LESSON_PLAN_DB_PATH;
    delete process.env.ATTENDANCE_IMAGE_DIR;
    await fs.rm(root, { recursive: true, force: true });
  });
  it('creates arbitrary periods, persists multipart photos and rejects stale edits', async () => {
    const http = app.getHttpServer();
    const center = await request(http)
      .put('/api/attendance/centers')
      .send({ year: 2026, term: 'fall', locationId, weekday: 2 })
      .expect(200);
    const period = await request(http)
      .post('/api/attendance/periods')
      .send({ centerId: center.body.id, name: '오감 놀이' })
      .expect(201);
    const path = '/api/attendance/pages/photo-1';
    await request(http)
      .put(path + '/photo')
      .field('periodId', period.body.id)
      .attach('photo', jpeg, {
        filename: '출석부.jpg',
        contentType: 'image/jpeg',
      })
      .expect(200);
    const photo = await request(http)
      .get(path + '/photo')
      .expect(200)
      .expect('Content-Type', /image\/jpeg/);
    expect(photo.body).toEqual(jpeg);
    await request(http)
      .patch(path)
      .send({ expectedRevision: 1, position: 3 })
      .expect(200);
    await request(http)
      .patch(path)
      .send({ expectedRevision: 1, deleted: true })
      .expect(409);
    await request(http)
      .patch(path)
      .send({ expectedRevision: 2, deleted: true })
      .expect(200);
    await request(http)
      .patch(path)
      .send({ expectedRevision: 3, deleted: false })
      .expect(200);
    const snapshot = await request(http)
      .get('/api/attendance/snapshot?year=2026&term=fall')
      .expect(200);
    expect(snapshot.body.pages[0].position).toBe(3);
    expect(snapshot.body.pages[0].inkDocument).toBeUndefined();
    await request(http)
      .put('/api/attendance/pages/bad/photo')
      .field('periodId', period.body.id)
      .attach('photo', Buffer.from('<html>'), {
        filename: 'fake.jpg',
        contentType: 'image/jpeg',
      })
      .expect(400);
    await request(http)
      .put('/api/attendance/pages/large/photo')
      .field('periodId', period.body.id)
      .attach('photo', Buffer.alloc(8 * 1024 * 1024 + 1), {
        filename: 'large.jpg',
        contentType: 'image/jpeg',
      })
      .expect(413);
  });
});
