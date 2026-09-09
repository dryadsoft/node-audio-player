import { promises as fs } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';
import { loadSqlite } from '../database/sqlite.types';
export async function backupAttendance(
  databasePath: string,
  imageRoot: string,
  destination: string,
) {
  const { DatabaseSync, backup } = loadSqlite();
  await fs.mkdir(destination, { recursive: true });
  const source = new DatabaseSync(databasePath),
    databaseCopy = resolve(destination, 'lesson-plans.sqlite');
  try {
    await backup(source, databaseCopy);
  } finally {
    source.close();
  }
  const copied = new DatabaseSync(databaseCopy);
  let hashes: string[];
  try {
    if (
      (copied.prepare('PRAGMA integrity_check').get() as any)
        .integrity_check !== 'ok'
    )
      throw new Error('백업 DB 무결성 검사 실패');
    hashes = (
      copied
        .prepare('SELECT DISTINCT image_hash FROM attendance_pages')
        .all() as any[]
    ).map((r) => r.image_hash);
  } finally {
    copied.close();
  }
  await fs.mkdir(resolve(destination, 'attendance'), { recursive: true });
  for (const hash of hashes) {
    if (!/^[a-f0-9]{64}$/.test(hash))
      throw new Error('사진 식별자가 올바르지 않습니다.');
    const bytes = await fs.readFile(resolve(imageRoot, `${hash}.jpg`));
    if (createHash('sha256').update(bytes).digest('hex') !== hash)
      throw new Error('백업 사진 무결성 검사 실패');
    await fs.writeFile(
      resolve(destination, 'attendance', `${hash}.jpg`),
      bytes,
      { flag: 'wx' },
    );
  }
  await fs.writeFile(
    resolve(destination, 'manifest.json'),
    JSON.stringify(
      { createdAt: new Date().toISOString(), images: hashes, complete: true },
      null,
      2,
    ),
  );
  return destination;
}
if (require.main === module) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  backupAttendance(
    resolve(process.env.LESSON_PLAN_DB_PATH || 'data/lesson-plans.sqlite'),
    resolve(process.env.ATTENDANCE_IMAGE_DIR || 'data/attendance'),
    resolve(
      process.env.ATTENDANCE_BACKUP_DIR || 'data/backups',
      `attendance-${stamp}`,
    ),
  )
    .then((path) => process.stdout.write(`${path}\n`))
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
