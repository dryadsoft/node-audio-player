import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import {
  LessonPlanImportManifest,
  importLessonPlanManifest,
  manifestChecksum,
} from './import-lesson-plans';
import { SqliteService } from './sqlite.service';

const createManifest = (): LessonPlanImportManifest => {
  const body: Omit<LessonPlanImportManifest, 'manifestSha256'> = {
    schemaVersion: 1,
    createdAt: '2026-08-11T00:00:00.000Z',
    source: {
      directoryName: '강의계획서',
      fileCount: 1,
      snapshotSha256: 'a'.repeat(64),
      ignoredFiles: [],
    },
    summary: {
      planCount: 1,
      locationCount: 1,
      completedPlanCount: 0,
      draftPlanCount: 1,
      programCounts: { 오감별: 1 },
    },
    plans: [
      {
        sourcePath: '2020_강의계획서/01.봄학기/계획서.hwp',
        sourceSha256: 'b'.repeat(64),
        year: 2020,
        term: 'spring',
        locationName: '건대점',
        programName: '오감별',
        sectionName: '월요일 · 8주',
        weeks: Array.from({ length: 12 }, (_, index) => ({
          week: index + 1,
          className: index < 8 ? `${index + 1}주 수업` : '',
          content: index < 8 ? `${index + 1}주 내용` : '',
        })),
      },
    ],
  };
  return { ...body, manifestSha256: manifestChecksum(body) };
};

describe('lesson plan manifest import', () => {
  let directory: string;
  let sqlite: SqliteService;

  beforeEach(async () => {
    directory = await fs.mkdtemp(resolve(tmpdir(), 'lesson-plan-import-'));
    process.env.LESSON_PLAN_DB_PATH = resolve(directory, 'lesson-plans.sqlite');
    sqlite = new SqliteService();
    sqlite.onModuleInit();
  });

  afterEach(async () => {
    sqlite.onModuleDestroy();
    delete process.env.LESSON_PLAN_DB_PATH;
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('imports a manifest atomically and skips the same source on replay', () => {
    expect(importLessonPlanManifest(sqlite, createManifest())).toEqual({
      imported: 1,
      skipped: 0,
      total: 1,
    });
    expect(importLessonPlanManifest(sqlite, createManifest())).toEqual({
      imported: 0,
      skipped: 1,
      total: 1,
    });
    expect(
      sqlite.database
        .prepare('SELECT COUNT(*) AS count FROM lesson_plans')
        .get(),
    ).toEqual({ count: 1 });
    expect(sqlite.integrityCheck()).toBe(true);
  });

  it('rejects a changed source that collides with an existing plan', () => {
    importLessonPlanManifest(sqlite, createManifest());
    const changed = createManifest();
    changed.plans[0].sourceSha256 = 'c'.repeat(64);
    const { manifestSha256: _checksum, ...body } = changed;
    changed.manifestSha256 = manifestChecksum(body);

    expect(() => importLessonPlanManifest(sqlite, changed)).toThrow(
      '기존 계획서와 충돌합니다',
    );
    expect(
      sqlite.database
        .prepare('SELECT COUNT(*) AS count FROM lesson_plans')
        .get(),
    ).toEqual({ count: 1 });
  });
});
