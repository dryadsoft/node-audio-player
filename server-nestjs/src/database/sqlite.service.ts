import {
  Injectable,
  InternalServerErrorException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { loadSqlite, SqliteDatabase } from './sqlite.types';

const MIGRATION_VERSION = 3;

@Injectable()
export class SqliteService implements OnModuleInit, OnModuleDestroy {
  private connection?: SqliteDatabase;
  readonly dataPath = resolve(
    process.env.LESSON_PLAN_DB_PATH ||
      resolve(process.cwd(), 'data/lesson-plans.sqlite'),
  );

  onModuleInit() {
    mkdirSync(dirname(this.dataPath), { recursive: true });
    const { DatabaseSync } = loadSqlite();
    this.connection = new DatabaseSync(this.dataPath, {
      timeout: 5000,
      enableForeignKeyConstraints: true,
    });
    this.connection.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);
    this.applyMigrations();
  }

  onModuleDestroy() {
    this.connection?.close();
    this.connection = undefined;
  }

  get database() {
    if (!this.connection) {
      throw new InternalServerErrorException(
        '강의계획서 데이터베이스가 준비되지 않았습니다.',
      );
    }
    return this.connection;
  }

  transaction<T>(task: (database: SqliteDatabase) => T): T {
    const database = this.database;
    database.exec('BEGIN IMMEDIATE');
    try {
      const result = task(database);
      database.exec('COMMIT');
      return result;
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }

  integrityCheck() {
    const row = this.database.prepare('PRAGMA integrity_check').get() as {
      integrity_check?: string;
    };
    return row?.integrity_check === 'ok';
  }

  private applyMigrations() {
    const latest = this.database
      .prepare('SELECT MAX(version) AS version FROM schema_migrations')
      .get() as { version?: number | null };
    if (Number(latest?.version || 0) > MIGRATION_VERSION) {
      throw new InternalServerErrorException(
        '현재 서버보다 새로운 강의계획서 데이터베이스입니다.',
      );
    }
    const currentVersion = Number(latest?.version || 0);
    for (
      let version = currentVersion + 1;
      version <= MIGRATION_VERSION;
      version += 1
    ) {
      this.transaction((database) => {
        if (version === 1) {
          database.exec(`
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
          year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 9999),
          term TEXT NOT NULL CHECK (
            term IN ('spring', 'summer', 'fall', 'winter')
          ),
          location_id TEXT NOT NULL,
          revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (location_id) REFERENCES lesson_locations(id)
            ON UPDATE CASCADE ON DELETE RESTRICT,
          UNIQUE (year, term, location_id)
        );

        CREATE TABLE lesson_weeks (
          plan_id TEXT NOT NULL,
          week INTEGER NOT NULL CHECK (week BETWEEN 1 AND 12),
          class_name TEXT NOT NULL DEFAULT '',
          content TEXT NOT NULL DEFAULT '',
          PRIMARY KEY (plan_id, week),
          FOREIGN KEY (plan_id) REFERENCES lesson_plans(id)
            ON UPDATE CASCADE ON DELETE CASCADE
        );

        CREATE INDEX lesson_plans_filter_idx
          ON lesson_plans(year, term, location_id);
      `);
        } else if (version === 2) {
          database.exec(`
        CREATE TABLE lesson_plans_v2 (
          id TEXT PRIMARY KEY,
          year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 9999),
          term TEXT NOT NULL CHECK (
            term IN ('spring', 'summer', 'fall', 'winter')
          ),
          location_id TEXT NOT NULL,
          program_name TEXT NOT NULL,
          section_name TEXT NOT NULL DEFAULT '',
          revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (location_id) REFERENCES lesson_locations(id)
            ON UPDATE CASCADE ON DELETE RESTRICT,
          UNIQUE (year, term, location_id, program_name, section_name)
        );

        INSERT INTO lesson_plans_v2
          (id, year, term, location_id, program_name, section_name,
           revision, created_at, updated_at)
        SELECT id, year, term, location_id, '오감별', '',
               revision, created_at, updated_at
        FROM lesson_plans;

        CREATE TABLE lesson_weeks_v2 (
          plan_id TEXT NOT NULL,
          week INTEGER NOT NULL CHECK (week BETWEEN 1 AND 12),
          class_name TEXT NOT NULL DEFAULT '',
          content TEXT NOT NULL DEFAULT '',
          PRIMARY KEY (plan_id, week),
          FOREIGN KEY (plan_id) REFERENCES lesson_plans_v2(id)
            ON UPDATE CASCADE ON DELETE CASCADE
        );

        INSERT INTO lesson_weeks_v2 (plan_id, week, class_name, content)
        SELECT plan_id, week, class_name, content FROM lesson_weeks;

        DROP TABLE lesson_weeks;
        DROP TABLE lesson_plans;
        ALTER TABLE lesson_plans_v2 RENAME TO lesson_plans;
        ALTER TABLE lesson_weeks_v2 RENAME TO lesson_weeks;

        CREATE INDEX lesson_plans_filter_idx
          ON lesson_plans(
            year, term, location_id, program_name, section_name
          );

        CREATE TABLE lesson_plan_import_sources (
          plan_id TEXT PRIMARY KEY,
          source_path TEXT NOT NULL,
          source_sha256 TEXT NOT NULL,
          imported_at TEXT NOT NULL,
          FOREIGN KEY (plan_id) REFERENCES lesson_plans(id)
            ON UPDATE CASCADE ON DELETE CASCADE,
          UNIQUE (source_path, source_sha256)
        );
      `);
        } else if (version === 3) {
          database.exec(`
        ALTER TABLE lesson_plans
          ADD COLUMN document_title TEXT NOT NULL DEFAULT '';
        ALTER TABLE lesson_plans
          ADD COLUMN course_name TEXT NOT NULL DEFAULT '';
        ALTER TABLE lesson_plans
          ADD COLUMN instructor_name TEXT NOT NULL DEFAULT '';
        ALTER TABLE lesson_plans
          ADD COLUMN representative_profile TEXT NOT NULL DEFAULT '';
        ALTER TABLE lesson_plans
          ADD COLUMN course_introduction TEXT NOT NULL DEFAULT '';
        ALTER TABLE lesson_plans
          ADD COLUMN audience TEXT NOT NULL DEFAULT '';
        ALTER TABLE lesson_plans
          ADD COLUMN capacity TEXT NOT NULL DEFAULT '';
        ALTER TABLE lesson_plans
          ADD COLUMN schedule_details TEXT NOT NULL DEFAULT '';
        ALTER TABLE lesson_plans
          ADD COLUMN tuition TEXT NOT NULL DEFAULT '';
        ALTER TABLE lesson_plans
          ADD COLUMN material_fee TEXT NOT NULL DEFAULT '';
        ALTER TABLE lesson_plans
          ADD COLUMN open_lecture TEXT NOT NULL DEFAULT '';
        ALTER TABLE lesson_plans
          ADD COLUMN notice TEXT NOT NULL DEFAULT '';
        ALTER TABLE lesson_plan_import_sources
          ADD COLUMN metadata_version INTEGER NOT NULL DEFAULT 1;
      `);
        }
        database
          .prepare(
            'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
          )
          .run(version, new Date().toISOString());
      });
    }
  }
}
