import { BadRequestException, ConflictException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { SqliteService } from '../database/sqlite.service';
import { LessonCurriculumService } from './lesson-curriculum.service';
import { LessonLocationService } from './lesson-location.service';
import { LessonWeek } from './lesson-plan.interface';
import { LessonPlanService } from './lesson-plan.service';

const weeks = (): LessonWeek[] =>
  Array.from({ length: 12 }, (_, index) => ({
    week: index + 1,
    className: `${index + 1}주 수업`,
    content: `${index + 1}주 내용`,
  }));

describe('LessonCurriculumService', () => {
  let directory: string;
  let sqlite: SqliteService;
  let curricula: LessonCurriculumService;
  let locations: LessonLocationService;
  let plans: LessonPlanService;

  beforeEach(async () => {
    directory = await fs.mkdtemp(resolve(tmpdir(), 'lesson-curricula-'));
    process.env.LESSON_PLAN_DB_PATH = resolve(directory, 'lesson-plans.sqlite');
    sqlite = new SqliteService();
    sqlite.onModuleInit();
    curricula = new LessonCurriculumService(sqlite);
    locations = new LessonLocationService(sqlite);
    plans = new LessonPlanService(sqlite, curricula);
  });

  afterEach(async () => {
    sqlite.onModuleDestroy();
    delete process.env.LESSON_PLAN_DB_PATH;
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('creates twelve shared weeks from an existing plan without changing it', () => {
    const location = locations.create('공통');
    const source = plans.create({
      year: 2026,
      term: 'fall',
      locationId: location.id,
      programName: '오감별',
      sectionName: '',
      weeks: weeks(),
    });

    const curriculum = curricula.create({
      year: 2026,
      term: 'fall',
      programName: '오감별',
      sourcePlanId: source.id,
    });

    expect(curriculum.weeks).toHaveLength(12);
    expect(curricula.getWeek(curriculum.id, 1)).toMatchObject({
      className: '1주 수업',
      content: '1주 내용',
      lessonPlan: '',
      materials: '',
      hasInk: false,
      revision: 1,
    });
    expect(plans.get(source.id).weeks[0].content).toBe('1주 내용');
    expect(() =>
      curricula.create({
        year: 2026,
        term: 'fall',
        programName: ' 오감별 ',
      }),
    ).toThrow(ConflictException);
  });

  it('shares current class names and content with linked location plans', () => {
    const location = locations.create('다산점');
    const curriculum = curricula.create({
      year: 2026,
      term: 'winter',
      programName: '오감별',
    });
    const created = plans.create({
      year: 2026,
      term: 'winter',
      locationId: location.id,
      programName: '오감별',
      sectionName: '',
      curriculumId: curriculum.id,
      weeks: weeks(),
    });

    const updatedWeek = curricula.updateWeek(curriculum.id, 1, {
      className: '눈 놀이',
      content: '겨울 감각을 느낍니다.',
      lessonPlan: '인사 후 눈 촉감 놀이',
      materials: '솜, 흰 천',
      inkDocument: {
        version: 1,
        aspectRatio: 4 / 3,
        strokes: [
          {
            id: 'stroke-1',
            color: '#111827',
            width: 4,
            points: [[0.1, 0.2, 0.6, 1]],
          },
        ],
      },
      expectedRevision: 1,
    });

    expect(updatedWeek.hasInk).toBe(true);
    expect(updatedWeek.inkDocument).toEqual({
      version: 2,
      aspectRatio: 4 / 3,
      pageCount: 2,
      strokes: [
        {
          id: 'stroke-1',
          page: 0,
          color: '#111827',
          width: 4,
          points: [[0.1, 0.2, 0.6, 1]],
        },
      ],
    });
    expect(plans.get(created.id).weeks[0]).toEqual({
      week: 1,
      className: '눈 놀이',
      content: '겨울 감각을 느낍니다.',
    });
    expect(plans.get(created.id).curriculumId).toBe(curriculum.id);
    expect(() =>
      curricula.updateWeek(curriculum.id, 1, {
        ...updatedWeek,
        expectedRevision: 1,
      }),
    ).toThrow(ConflictException);
  });

  it('rejects malformed ink and mismatched plan links', () => {
    const location = locations.create('방학점');
    const curriculum = curricula.create({
      year: 2026,
      term: 'spring',
      programName: '뮤직별',
    });
    expect(() =>
      curricula.updateWeek(curriculum.id, 1, {
        className: '',
        content: '',
        lessonPlan: '',
        materials: '',
        inkDocument: {
          version: 1,
          aspectRatio: 4 / 3,
          strokes: [
            {
              id: 'bad',
              color: '#000000',
              width: 4,
              points: [[2, 0, 0.5, 1]],
            },
          ],
        },
        expectedRevision: 1,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      plans.create({
        year: 2026,
        term: 'spring',
        locationId: location.id,
        programName: '오감별',
        sectionName: '',
        curriculumId: curriculum.id,
        weeks: weeks(),
      }),
    ).toThrow(BadRequestException);
  });

  it('stores paged ink and rejects out-of-range pages', () => {
    const curriculum = curricula.create({
      year: 2026,
      term: 'summer',
      programName: '페이지 필기',
    });
    const updated = curricula.updateWeek(curriculum.id, 1, {
      className: '',
      content: '',
      lessonPlan: '',
      materials: '',
      inkDocument: {
        version: 2,
        aspectRatio: 4 / 3,
        pageCount: 3,
        strokes: [
          {
            id: 'page-3-stroke',
            page: 2,
            color: '#1d4ed8',
            width: 2,
            points: [[0.5, 0.9, 0.8, 1]],
          },
        ],
      },
      expectedRevision: 1,
    });

    expect(updated.inkDocument.pageCount).toBe(3);
    expect(updated.inkDocument.strokes[0].page).toBe(2);
    expect(() =>
      curricula.updateWeek(curriculum.id, 1, {
        ...updated,
        inkDocument: {
          ...updated.inkDocument,
          strokes: [{ ...updated.inkDocument.strokes[0], page: 3 }],
        },
        expectedRevision: updated.revision,
      }),
    ).toThrow(BadRequestException);
  });

  it('does not count a legacy empty ink document as a completed week', () => {
    const curriculum = curricula.create({
      year: 2027,
      term: 'spring',
      programName: '기존 빈 필기',
    });
    sqlite.database
      .prepare(
        `UPDATE lesson_curriculum_weeks SET ink_json = ?
         WHERE curriculum_id = ? AND week = 1`,
      )
      .run(
        JSON.stringify({ version: 1, aspectRatio: 4 / 3, strokes: [] }),
        curriculum.id,
      );

    expect(curricula.get(curriculum.id).completedWeeks).toBe(0);
    expect(curricula.getWeek(curriculum.id, 1).inkDocument).toMatchObject({
      version: 2,
      pageCount: 2,
      strokes: [],
    });
  });
});
