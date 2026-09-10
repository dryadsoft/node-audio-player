import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { DatabaseModule } from '../src/database/database.module';
import { LessonPlanModule } from '../src/lesson-plan/lesson-plan.module';
import { LessonCurriculumService } from '../src/lesson-plan/lesson-curriculum.service';
import { configureBodyParsers } from '../src/common/body-parsers';

describe('Lesson note request limits', () => {
  let app: INestApplication, root: string, id: string;
  beforeAll(async () => {
    root = await fs.mkdtemp(resolve(tmpdir(), 'note-size-'));
    process.env.LESSON_PLAN_DB_PATH = resolve(root, 'db.sqlite');
    const module = await Test.createTestingModule({ imports: [DatabaseModule, LessonPlanModule] }).compile();
    app = module.createNestApplication(undefined, { bodyParser: false });
    configureBodyParsers(app);
    await app.init();
    id = app.get(LessonCurriculumService).create({ year: 2026, term: 'fall', programName: '용량 검증' }).id;
  });
  afterAll(async () => {
    await app.close(); delete process.env.LESSON_PLAN_DB_PATH;
    await fs.rm(root, { recursive: true, force: true });
  });
  const document = (points: number, strokeId = 'existing-stroke') => ({
    version: 2, pageCount: 2, aspectRatio: 4 / 3,
    strokes: [{ id: strokeId, page: 0, color: '#111827', width: 4,
      points: Array.from({ length: points }, (_, n) => [0.1234567890123456, 0.9876543210987654, 0.7777777777777777, 100000 + n, 2, -1]) }],
  });
  it('accepts an existing full-precision draft larger than 2MiB without dropping points', async () => {
    const inkDocument = document(40000);
    expect(Buffer.byteLength(JSON.stringify(inkDocument))).toBeGreaterThan(2 * 1024 * 1024);
    const response = await request(app.getHttpServer()).put(`/api/lesson-curricula/${id}/weeks/1`)
      .send({ className: '', content: '', expectedRevision: 1, inkDocument }).expect(200);
    expect(response.body.inkDocument).toEqual(inkDocument);
    await request(app.getHttpServer()).put(`/api/lesson-curricula/${id}/weeks/1`)
      .send({ className: '', content: '', expectedRevision: 1, inkDocument }).expect(409);
  });
  it('rejects ink over 4MiB and requests over 8MiB without changing saved notes', async () => {
    const path = `/api/lesson-curricula/${id}/weeks/1`;
    await request(app.getHttpServer()).put(path)
      .send({ className: '', content: '', expectedRevision: 2, inkDocument: document(1, 'x'.repeat(4 * 1024 * 1024)) })
      .expect(400).expect(r => expect(r.body.message).toContain('너무 큽니다'));
    await request(app.getHttpServer()).put(path).send({ excess: 'x'.repeat(8 * 1024 * 1024) }).expect(413);
    expect(app.get(LessonCurriculumService).getWeek(id, 1).revision).toBe(2);
    await request(app.getHttpServer()).post('/api/lesson-locations').send({ name: 'x'.repeat(3 * 1024 * 1024) }).expect(413);
  });
});
