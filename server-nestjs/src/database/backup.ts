import { existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { loadSqlite } from './sqlite.types';

const databasePath = resolve(
  process.env.LESSON_PLAN_DB_PATH ||
    resolve(process.cwd(), 'data/lesson-plans.sqlite'),
);
const backupDirectory = resolve(
  process.env.LESSON_PLAN_BACKUP_DIR || resolve(process.cwd(), 'data/backups'),
);
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = resolve(backupDirectory, `lesson-plans-${timestamp}.sqlite`);

async function main() {
  if (!existsSync(databasePath)) {
    throw new Error('백업할 강의계획서 데이터베이스가 없습니다.');
  }
  mkdirSync(dirname(backupPath), { recursive: true });
  const { DatabaseSync, backup } = loadSqlite();
  const source = new DatabaseSync(databasePath, {
    timeout: 5000,
    enableForeignKeyConstraints: true,
  });
  try {
    await backup(source, backupPath, { rate: 100 });
  } finally {
    source.close();
  }

  const copied = new DatabaseSync(backupPath, {
    enableForeignKeyConstraints: true,
  });
  try {
    const result = copied.prepare('PRAGMA integrity_check').get() as {
      integrity_check?: string;
    };
    if (result?.integrity_check !== 'ok') {
      throw new Error('백업 데이터베이스 무결성 검사에 실패했습니다.');
    }
  } finally {
    copied.close();
  }
  process.stdout.write(`${backupPath}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : '백업에 실패했습니다.'}\n`,
  );
  process.exitCode = 1;
});
