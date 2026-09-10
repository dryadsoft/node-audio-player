import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { SqliteService } from './sqlite.service';
import { loadSqlite } from './sqlite.types';

describe('SqliteService migrations', () => {
  let directory: string;
  let databasePath: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(resolve(tmpdir(), 'lesson-plan-schema-'));
    databasePath = resolve(directory, 'lesson-plans.sqlite');
    process.env.LESSON_PLAN_DB_PATH = databasePath;
  });

  afterEach(async () => {
    delete process.env.LESSON_PLAN_DB_PATH;
    await fs.rm(directory, { recursive: true, force: true });
  });

  function legacyAttendance(orphan = false) {
    const { DatabaseSync } = loadSqlite();
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      PRAGMA foreign_keys=OFF;
      CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO schema_migrations VALUES(6,'t');
      CREATE TABLE lesson_locations(id TEXT PRIMARY KEY);
      INSERT INTO lesson_locations VALUES('loc');
      CREATE TABLE attendance_centers (
        id TEXT PRIMARY KEY, year INTEGER NOT NULL, term TEXT NOT NULL,
        location_id TEXT NOT NULL REFERENCES lesson_locations(id),
        weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
        revision INTEGER NOT NULL DEFAULT 1, UNIQUE(year,term,location_id)
      );
      CREATE TABLE attendance_periods (
        id TEXT PRIMARY KEY, center_id TEXT NOT NULL REFERENCES attendance_centers(id),
        name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0,
        revision INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
      );
      CREATE TABLE attendance_pages (
        id TEXT PRIMARY KEY, period_id TEXT NOT NULL REFERENCES attendance_periods(id),
        image_hash TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
        ink_json TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0,
        revision INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, updated_at TEXT NOT NULL
      );
      CREATE INDEX attendance_period_center ON attendance_periods(center_id);
      CREATE INDEX attendance_page_period ON attendance_pages(period_id);
      INSERT INTO attendance_centers VALUES('center',2026,'fall','loc',1,8);
      INSERT INTO attendance_periods VALUES('period','${
        orphan ? 'missing' : 'center'
      }','한글 반',3,5,'trashed');
      INSERT INTO attendance_pages VALUES('page','period','hash',100,200,'{"strokes":[{"id":"keep"}]}',4,9,NULL,'updated');
    `);
    const before = {
      centers: legacy.prepare('SELECT * FROM attendance_centers').all(),
      periods: legacy.prepare('SELECT * FROM attendance_periods').all(),
      pages: legacy.prepare('SELECT * FROM attendance_pages').all(),
    };
    legacy.close();
    return before;
  }

  it('upgrades populated v6 attendance without changing ids, revisions, ink or child links and is restart-safe', () => {
    const before = legacyAttendance();
    for (let restart = 0; restart < 2; restart++) {
      const sqlite = new SqliteService();
      sqlite.onModuleInit();
      try {
        const db = sqlite.database;
        expect(db.prepare('SELECT * FROM attendance_centers').all()).toEqual(
          before.centers.map((c: any) => ({ ...c, deleted_at: null })),
        );
        expect(db.prepare('SELECT * FROM attendance_periods').all()).toEqual(
          before.periods,
        );
        expect(db.prepare('SELECT * FROM attendance_pages').all()).toEqual(
          before.pages,
        );
        expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
        expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({
          foreign_keys: 1,
        });
        expect(
          db
            .prepare('SELECT MAX(version) AS version FROM schema_migrations')
            .get(),
        ).toEqual({ version: 7 });
        expect(sqlite.integrityCheck()).toBe(true);
        db.prepare(
          "INSERT INTO attendance_centers VALUES('other',2026,'fall','loc',3,1,NULL)",
        ).run();
        expect(() =>
          db
            .prepare(
              "INSERT INTO attendance_centers VALUES('duplicate',2026,'fall','loc',1,1,NULL)",
            )
            .run(),
        ).toThrow();
        db.prepare("DELETE FROM attendance_centers WHERE id='other'").run();
      } finally {
        sqlite.onModuleDestroy();
      }
    }
  });

  it('rolls back the v7 replacement and re-enables foreign keys if reference validation fails', () => {
    const before = legacyAttendance(true);
    const sqlite = new SqliteService();
    try {
      expect(() => sqlite.onModuleInit()).toThrow('참조 검증');
      expect(
        sqlite.database.prepare('SELECT * FROM attendance_centers').all(),
      ).toEqual(before.centers);
      expect(
        sqlite.database.prepare('SELECT * FROM attendance_pages').all(),
      ).toEqual(before.pages);
      expect(
        sqlite.database
          .prepare('SELECT MAX(version) AS version FROM schema_migrations')
          .get(),
      ).toEqual({ version: 6 });
      expect(sqlite.database.prepare('PRAGMA foreign_keys').get()).toEqual({
        foreign_keys: 1,
      });
    } finally {
      sqlite.onModuleDestroy();
    }
  });

  it('upgrades v1 plans without losing ids, revisions, or weeks', () => {
    const { DatabaseSync } = loadSqlite();
    const legacy = new DatabaseSync(databasePath, {
      enableForeignKeyConstraints: true,
    });
    legacy.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      INSERT INTO schema_migrations VALUES (1, '2026-08-11T00:00:00.000Z');
      CREATE TABLE lesson_locations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL UNIQUE,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE lesson_plans (
        id TEXT PRIMARY KEY,
        year INTEGER NOT NULL,
        term TEXT NOT NULL,
        location_id TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (location_id) REFERENCES lesson_locations(id),
        UNIQUE (year, term, location_id)
      );
      CREATE TABLE lesson_weeks (
        plan_id TEXT NOT NULL,
        week INTEGER NOT NULL,
        class_name TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (plan_id, week),
        FOREIGN KEY (plan_id) REFERENCES lesson_plans(id)
      );
      CREATE INDEX lesson_plans_filter_idx
        ON lesson_plans(year, term, location_id);
      INSERT INTO lesson_locations VALUES (
        'location-1', '건대점', '건대점', 1,
        '2026-08-11T00:00:00.000Z', '2026-08-11T00:00:00.000Z'
      );
      INSERT INTO lesson_plans VALUES (
        'plan-1', 2026, 'spring', 'location-1', 3,
        '2026-08-11T00:00:00.000Z', '2026-08-11T00:00:00.000Z'
      );
      INSERT INTO lesson_weeks VALUES ('plan-1', 1, '첫 수업', '첫 내용');
    `);
    legacy.close();

    const sqlite = new SqliteService();
    sqlite.onModuleInit();
    try {
      expect(
        sqlite.database
          .prepare(
            `SELECT id, program_name, section_name, document_title,
                    course_name, notice, revision
             FROM lesson_plans WHERE id = 'plan-1'`,
          )
          .get(),
      ).toEqual({
        id: 'plan-1',
        program_name: '오감별',
        section_name: '',
        document_title: '',
        course_name: '',
        notice: '',
        revision: 3,
      });
      expect(
        sqlite.database
          .prepare('SELECT MAX(version) AS version FROM schema_migrations')
          .get(),
      ).toEqual({ version: 7 });
      expect(
        sqlite.database
          .prepare(
            "SELECT class_name, content FROM lesson_weeks WHERE plan_id = 'plan-1'",
          )
          .get(),
      ).toEqual({ class_name: '첫 수업', content: '첫 내용' });
      expect(sqlite.database.prepare('PRAGMA foreign_key_check').all()).toEqual(
        [],
      );
      expect(
        sqlite.database.prepare('PRAGMA foreign_key_list(lesson_weeks)').all(),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ table: 'lesson_plans' }),
        ]),
      );
      expect(
        sqlite.database
          .prepare("SELECT curriculum_id FROM lesson_plans WHERE id = 'plan-1'")
          .get(),
      ).toEqual({ curriculum_id: null });
      expect(
        sqlite.database
          .prepare('SELECT COUNT(*) AS count FROM lesson_curricula')
          .get(),
      ).toEqual({ count: 0 });
      expect(sqlite.integrityCheck()).toBe(true);
    } finally {
      sqlite.onModuleDestroy();
    }
  });
  it('migrates v4 preserving ink, revisions and plan links; new databases omit only retired columns', () => {
    let sqlite = new SqliteService();
    sqlite.onModuleInit();
    const db = sqlite.database;
    const columns = () =>
      sqlite.database
        .prepare('PRAGMA table_info(lesson_curriculum_weeks)')
        .all()
        .map((row: { name: string }) => row.name);
    expect(columns()).toEqual([
      'curriculum_id',
      'week',
      'class_name',
      'content',
      'ink_json',
      'revision',
      'updated_at',
    ]);
    db.exec(`
      ALTER TABLE lesson_curriculum_weeks ADD COLUMN lesson_plan TEXT NOT NULL DEFAULT '';
      ALTER TABLE lesson_curriculum_weeks ADD COLUMN materials TEXT NOT NULL DEFAULT '';
      DELETE FROM schema_migrations WHERE version >= 5;
      DROP TABLE attendance_pages; DROP TABLE attendance_periods; DROP TABLE attendance_centers;
      INSERT INTO lesson_curricula VALUES ('c',2026,'fall','수업','수업','t','t');
      INSERT INTO lesson_locations VALUES ('loc','장소','장소',1,'t','t');
      INSERT INTO lesson_plans (id,year,term,location_id,program_name,revision,created_at,updated_at,curriculum_id)
        VALUES ('plan',2026,'fall','loc','수업',3,'t','t','c');
      INSERT INTO lesson_weeks VALUES ('plan',1,'계획서','연결 유지');
      INSERT INTO lesson_curriculum_weeks (curriculum_id,week,class_name,content,ink_json,revision,updated_at,lesson_plan,materials)
      VALUES ('c',1,'이름','내용','{"version":2,"pageCount":2,"aspectRatio":1.3,"strokes":[{"id":"keep"}]}',7,'t','삭제','삭제');
    `);
    const before = db
      .prepare(
        'SELECT curriculum_id,week,class_name,content,ink_json,revision,updated_at FROM lesson_curriculum_weeks',
      )
      .all();
    sqlite.onModuleDestroy();
    sqlite = new SqliteService();
    sqlite.onModuleInit();
    try {
      expect(columns()).not.toContain('lesson_plan');
      expect(columns()).not.toContain('materials');
      expect(
        sqlite.database.prepare('SELECT * FROM lesson_curriculum_weeks').all(),
      ).toEqual(before);
      expect(
        sqlite.database
          .prepare(
            "SELECT curriculum_id,revision FROM lesson_plans WHERE id='plan'",
          )
          .get(),
      ).toEqual({ curriculum_id: 'c', revision: 3 });
      expect(
        sqlite.database
          .prepare("SELECT content FROM lesson_weeks WHERE plan_id='plan'")
          .get(),
      ).toEqual({ content: '연결 유지' });
      expect(sqlite.database.prepare('PRAGMA foreign_key_check').all()).toEqual(
        [],
      );
      expect(sqlite.integrityCheck()).toBe(true);
    } finally {
      sqlite.onModuleDestroy();
    }
  });
});
