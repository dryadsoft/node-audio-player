import { BadRequestException, ConflictException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { AttendanceService, jpegSize } from './attendance.service';
import { SqliteService } from '../database/sqlite.service';
import { LessonLocationService } from '../lesson-plan/lesson-location.service';
import { backupAttendance } from './backup';
// Minimal JPEG structure for validation; actual camera JPEG is exercised in browser QA.
const jpeg = Buffer.from([
  255, 216, 255, 192, 0, 17, 8, 0, 100, 0, 100, 3, 1, 17, 0, 2, 17, 0, 3, 17, 0,
  255, 217,
]);
describe('Attendance persistence', () => {
  let root: string,
    db: SqliteService,
    service: AttendanceService,
    center: any,
    period: any;
  beforeEach(async () => {
    root = await fs.mkdtemp(resolve(tmpdir(), 'attendance-test-'));
    process.env.LESSON_PLAN_DB_PATH = resolve(root, 'test.sqlite');
    process.env.ATTENDANCE_IMAGE_DIR = resolve(root, 'photos');
    db = new SqliteService();
    db.onModuleInit();
    service = new AttendanceService(db);
    const location = new LessonLocationService(db).create('한글 센터');
    center = service.saveCenter({
      year: 2026,
      term: 'fall',
      locationId: location.id,
      weekday: 2,
    });
    period = service.createPeriod({ centerId: center.id, name: '유아반' });
  });
  afterEach(async () => {
    db.onModuleDestroy();
    delete process.env.LESSON_PLAN_DB_PATH;
    delete process.env.ATTENDANCE_IMAGE_DIR;
    await fs.rm(root, { recursive: true, force: true });
  });
  const upload = () =>
    service.upload('page-1', period.id, {
      buffer: jpeg,
      mimetype: 'image/jpeg',
    });
  it('keeps independent semesters and arbitrary periods', () => {
    const spring = service.saveCenter({
      year: 2026,
      term: 'spring',
      locationId: center.locationId,
      weekday: 3,
    });
    expect(spring.id).not.toBe(center.id);
    for (let n = 0; n < 7; n++)
      service.createPeriod({ centerId: center.id, name: `${n + 1}교시` });
    expect(service.snapshot(2026, 'fall').periods).toHaveLength(8);
    expect(service.snapshot(2026, 'spring').periods).toHaveLength(0);
  });
  it('retries upload without duplicating or resetting existing ink', async () => {
    const p = await upload();
    const ink = {
      ...p.inkDocument,
      strokes: [
        {
          id: 'a',
          page: 0,
          width: 2,
          color: '#111827',
          points: [[0.1, 0.2, 0.5, 0]],
        },
      ],
    };
    service.updatePage(p.id, { expectedRevision: 1, inkDocument: ink });
    const again = await upload();
    expect(again.revision).toBe(2);
    expect(again.inkDocument).toEqual(ink);
    expect(service.snapshot(2026, 'fall').pages).toHaveLength(1);
    await expect(
      service.upload(
        'page-1',
        service.createPeriod({ centerId: center.id, name: '다른반' }).id,
        { buffer: jpeg, mimetype: 'image/jpeg' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('preserves photo and ink across sorting, trash and restore; rejects stale writes', async () => {
    const p = await upload();
    service.updatePage(p.id, { position: 42, expectedRevision: 1 });
    expect(() =>
      service.updatePage(p.id, { deleted: true, expectedRevision: 1 }),
    ).toThrow(ConflictException);
    service.updatePeriod(period.id, {
      name: '새 교시',
      position: 12,
      expectedRevision: 1,
    });
    service.updatePage(p.id, { deleted: true, expectedRevision: 2 });
    expect(() =>
      service.updatePage(p.id, {
        inkDocument: p.inkDocument,
        expectedRevision: 3,
      }),
    ).toThrow(ConflictException);
    const restored = service.updatePage(p.id, {
      deleted: false,
      expectedRevision: 3,
    });
    expect(restored.position).toBe(42);
    expect(await service.photo(p.id)).toEqual(jpeg);
    service.updatePeriod(period.id, { deleted: true, expectedRevision: 2 });
    expect(() =>
      service.updatePage(p.id, {
        inkDocument: p.inkDocument,
        expectedRevision: 4,
      }),
    ).toThrow(ConflictException);
  });
  it('rejects traversal, malformed photos, invalid coordinates and non-finite values', async () => {
    expect(() => service.getPage('../secret')).toThrow(BadRequestException);
    expect(() => jpegSize(Buffer.from('<html>login</html>'))).toThrow(
      BadRequestException,
    );
    await expect(
      service.upload('x', period.id, { buffer: jpeg, mimetype: 'text/html' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const p = await upload();
    expect(() =>
      service.updatePage(p.id, {
        expectedRevision: 1,
        inkDocument: {
          ...p.inkDocument,
          strokes: [
            {
              id: 'x',
              page: 0,
              color: '#111827',
              width: 2,
              points: [[Infinity, 0, 1, 0]],
            },
          ],
        },
      }),
    ).toThrow(BadRequestException);
  });
  it('backs up a matching SQLite snapshot and immutable photos including trash', async () => {
    const p = await upload();
    service.updatePage(p.id, { expectedRevision: 1, deleted: true });
    const destination = resolve(root, 'backup');
    await backupAttendance(db.dataPath, service.photoRoot, destination);
    const manifest = JSON.parse(
      await fs.readFile(resolve(destination, 'manifest.json'), 'utf8'),
    );
    expect(manifest.complete).toBe(true);
    expect(manifest.images).toEqual([p.imageHash]);
    expect(
      await fs.readFile(
        resolve(destination, 'attendance', `${p.imageHash}.jpg`),
      ),
    ).toEqual(jpeg);
  });
});
