import { BadRequestException, ConflictException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { SqliteService } from '../database/sqlite.service';
import { LessonLocationService } from './lesson-location.service';
import { LessonWeek } from './lesson-plan.interface';
import { LessonPlanService } from './lesson-plan.service';

const weeks = (completed = 0): LessonWeek[] =>
  Array.from({ length: 12 }, (_, index) => ({
    week: index + 1,
    className: index < completed ? `${index + 1}주 수업` : '',
    content: index < completed ? `${index + 1}주 내용` : '',
  }));

describe('LessonPlanService', () => {
  let directory: string;
  let sqlite: SqliteService;
  let locations: LessonLocationService;
  let plans: LessonPlanService;

  beforeEach(async () => {
    directory = await fs.mkdtemp(resolve(tmpdir(), 'lesson-plans-'));
    process.env.LESSON_PLAN_DB_PATH = resolve(directory, 'lesson-plans.sqlite');
    sqlite = new SqliteService();
    sqlite.onModuleInit();
    locations = new LessonLocationService(sqlite);
    plans = new LessonPlanService(sqlite);
  });

  afterEach(async () => {
    sqlite.onModuleDestroy();
    delete process.env.LESSON_PLAN_DB_PATH;
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('persists a 12-week draft and reports completion', () => {
    const location = locations.create('서초 문화센터');
    const created = plans.create({
      year: 2026,
      term: 'spring',
      locationId: location.id,
      weeks: weeks(4),
    });

    expect(created).toMatchObject({
      year: 2026,
      term: 'spring',
      completedWeeks: 4,
      status: 'draft',
      revision: 1,
    });
    expect(created.weeks).toHaveLength(12);
    expect(plans.list({ year: '2026', term: 'spring' })).toHaveLength(1);
    expect(sqlite.integrityCheck()).toBe(true);
  });

  it('enforces one plan per year, term, and location', () => {
    const location = locations.create('강남 교육관');
    plans.create({
      year: 2026,
      term: 'summer',
      locationId: location.id,
      weeks: weeks(),
    });

    expect(() =>
      plans.create({
        year: 2026,
        term: 'summer',
        locationId: location.id,
        weeks: weeks(),
      }),
    ).toThrow(ConflictException);
  });

  it('updates all weeks atomically and rejects stale revisions', () => {
    const location = locations.create('마포 배움터');
    const created = plans.create({
      year: 2026,
      term: 'fall',
      locationId: location.id,
      weeks: weeks(2),
    });
    const updated = plans.update(created.id, {
      year: 2026,
      term: 'fall',
      locationId: location.id,
      weeks: weeks(12),
      expectedRevision: created.revision,
    });

    expect(updated).toMatchObject({
      completedWeeks: 12,
      status: 'complete',
      revision: 2,
    });
    expect(() =>
      plans.update(created.id, {
        year: 2026,
        term: 'fall',
        locationId: location.id,
        weeks: weeks(1),
        expectedRevision: 1,
      }),
    ).toThrow(ConflictException);
    expect(plans.get(created.id).completedWeeks).toBe(12);
  });

  it('keeps inactive locations in history but blocks new plans', () => {
    const location = locations.create('종로 교실');
    const created = plans.create({
      year: 2025,
      term: 'winter',
      locationId: location.id,
      weeks: weeks(),
    });
    locations.update(location.id, { active: false });

    expect(plans.get(created.id).locationActive).toBe(false);
    expect(() =>
      plans.create({
        year: 2026,
        term: 'winter',
        locationId: location.id,
        weeks: weeks(),
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects missing or duplicate week numbers', () => {
    const location = locations.create('송파 교실');
    const invalidWeeks = weeks();
    invalidWeeks[11].week = 11;

    expect(() =>
      plans.create({
        year: 2026,
        term: 'spring',
        locationId: location.id,
        weeks: invalidWeeks,
      }),
    ).toThrow(BadRequestException);
  });
});
