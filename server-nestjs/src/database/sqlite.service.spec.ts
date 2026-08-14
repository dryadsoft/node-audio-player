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
      ).toEqual({ version: 3 });
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
      expect(sqlite.integrityCheck()).toBe(true);
    } finally {
      sqlite.onModuleDestroy();
    }
  });
});
