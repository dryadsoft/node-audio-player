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
  it('creates independent weekdays and updates a registration by id without moving its periods', async () => {
    const p = await upload();
    const { id, revision, deletedAt, ...input } = center;
    const other = service.saveCenter({ ...input, weekday: 4 });
    expect(other.id).not.toBe(id);
    expect(() => service.saveCenter(input)).toThrow(ConflictException);
    expect(() =>
      service.saveCenter({ ...center, weekday: 4, expectedRevision: revision }),
    ).toThrow(ConflictException);
    const changed = service.saveCenter({
      ...center,
      weekday: 5,
      expectedRevision: revision,
    });
    expect(changed).toMatchObject({ id, weekday: 5, revision: 2 });
    expect(service.snapshot(2026, 'fall').periods[0].centerId).toBe(id);
    expect(service.getPage(p.id).periodId).toBe(period.id);
    expect(() =>
      service.saveCenter({ ...center, weekday: 6, expectedRevision: revision }),
    ).toThrow(ConflictException);
    expect(() =>
      service.saveCenter({ ...changed, year: 2027, expectedRevision: 2 }),
    ).toThrow(BadRequestException);
    expect(service.snapshot(2026, 'fall').centers).toHaveLength(2);
  });
  it('trashes only the chosen registration, preserves descendants, and restores their previous trash states', async () => {
    const p = await upload();
    const { id, revision, deletedAt, ...input } = center;
    const other = service.saveCenter({ ...input, weekday: 4 });
    const spring = service.saveCenter({ ...input, term: 'spring' });
    const trashedPeriod = service.createPeriod({
      centerId: center.id,
      name: '휴지통 반',
    });
    service.updatePeriod(trashedPeriod.id, {
      deleted: true,
      expectedRevision: 1,
    });
    service.updatePage(p.id, { deleted: true, expectedRevision: 1 });
    const before = service.snapshot(2026, 'fall');
    const removed = service.saveCenter({
      ...center,
      deleted: true,
      expectedRevision: revision,
    });
    expect(removed).toMatchObject({
      id,
      revision: 2,
      deletedAt: expect.any(String),
    });
    expect(service.snapshot(2026, 'fall').periods).toEqual(before.periods);
    expect(service.snapshot(2026, 'fall').pages).toEqual(before.pages);
    expect(
      service.snapshot(2026, 'fall').centers.find((c) => c.id === other.id)
        ?.deletedAt,
    ).toBeNull();
    expect(service.snapshot(2026, 'spring').centers[0]).toEqual(spring);
    expect(
      db.database
        .prepare('SELECT active FROM lesson_locations WHERE id=?')
        .get(center.locationId),
    ).toEqual({ active: 1 });
    expect(() => service.saveCenter(input)).toThrow('휴지통에 같은 센터·요일');
    expect(() => service.createPeriod({ centerId: id, name: '새 반' })).toThrow(
      ConflictException,
    );
    expect(() =>
      service.updatePeriod(period.id, { name: '변경', expectedRevision: 1 }),
    ).toThrow(ConflictException);
    expect(() =>
      service.updatePeriod(trashedPeriod.id, {
        deleted: false,
        expectedRevision: 2,
      }),
    ).toThrow(ConflictException);
    expect(() =>
      service.updatePage(p.id, { deleted: false, expectedRevision: 2 }),
    ).toThrow(ConflictException);
    expect(() =>
      service.updatePage(p.id, {
        inkDocument: p.inkDocument,
        expectedRevision: 2,
      }),
    ).toThrow(ConflictException);
    await expect(
      service.upload('new-photo', period.id, {
        buffer: jpeg,
        mimetype: 'image/jpeg',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(upload()).rejects.toBeInstanceOf(ConflictException);
    expect(await service.photo(p.id)).toEqual(jpeg);
    expect(() =>
      service.saveCenter({ ...removed, deleted: false, expectedRevision: 1 }),
    ).toThrow(ConflictException);
    const restored = service.saveCenter({
      ...removed,
      deleted: false,
      expectedRevision: 2,
    });
    expect(restored).toMatchObject({ id, revision: 3, deletedAt: null });
    expect(service.snapshot(2026, 'fall').periods).toEqual(before.periods);
    expect(service.snapshot(2026, 'fall').pages).toEqual(before.pages);
    service.updatePage(p.id, { deleted: false, expectedRevision: 2 });
    expect(
      service.createPeriod({ centerId: id, name: '다시 추가' }).centerId,
    ).toBe(id);
  });
  it('rejects invalid center delete flags and can restore a registration at an inactive shared location', () => {
    expect(() =>
      service.saveCenter({ ...center, deleted: 'true', expectedRevision: 1 }),
    ).toThrow(BadRequestException);
    db.database
      .prepare('UPDATE lesson_locations SET active=0 WHERE id=?')
      .run(center.locationId);
    const removed = service.saveCenter({
      ...center,
      deleted: true,
      expectedRevision: 1,
    });
    expect(
      service.saveCenter({ ...removed, deleted: false, expectedRevision: 2 })
        .deletedAt,
    ).toBeNull();
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
    service.createNote('mixed-note', { periodId: period.id });
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
  it('creates a photo-free note idempotently and preserves ink through sorting and trash', async () => {
    const note = service.createNote('note-1', { periodId: period.id });
    expect(note).toMatchObject({
      pageType: 'note',
      imageHash: null,
      width: 1000,
      height: 1414,
    });
    const ink = {
      ...note.inkDocument,
      strokes: [
        {
          id: 'note-stroke',
          page: 0,
          color: '#111827',
          width: 2,
          points: [[0.1, 0.2, 0.5, 0]],
        },
      ],
    };
    const saved = service.updatePage(note.id, {
      expectedRevision: 1,
      inkDocument: ink,
      position: 4,
    });
    expect(service.createNote(note.id, { periodId: period.id })).toEqual(saved);
    await expect(service.photo(note.id)).rejects.toThrow('사진이 없는 노트');
    expect(
      service.snapshot(2026, 'fall').pages.find((p: any) => p.id === note.id)
        .pageType,
    ).toBe('note');
    service.updatePage(note.id, { expectedRevision: 2, deleted: true });
    expect(() =>
      service.updatePage(note.id, { expectedRevision: 3, inkDocument: ink }),
    ).toThrow(ConflictException);
    const restored = service.updatePage(note.id, {
      expectedRevision: 3,
      deleted: false,
    });
    expect(restored.inkDocument).toEqual(ink);
    expect(restored.position).toBe(4);
    expect(() =>
      service.updatePage(note.id, { expectedRevision: 1, inkDocument: ink }),
    ).toThrow(ConflictException);
    const other = service.createPeriod({
      centerId: center.id,
      name: '다른 반',
    });
    expect(() => service.createNote(note.id, { periodId: other.id })).toThrow(
      ConflictException,
    );
    await expect(
      service.upload(note.id, period.id, {
        buffer: jpeg,
        mimetype: 'image/jpeg',
      }),
    ).rejects.toThrow(ConflictException);
    const photo = await upload();
    expect(() => service.createNote(photo.id, { periodId: period.id })).toThrow(
      ConflictException,
    );
  });
  it('rejects note creation below deleted parents and backs up notes without photo files', async () => {
    service.createNote('note-backup', { periodId: period.id });
    const destination = resolve(root, 'notes-backup');
    await backupAttendance(db.dataPath, service.photoRoot, destination);
    expect(
      JSON.parse(
        await fs.readFile(resolve(destination, 'manifest.json'), 'utf8'),
      ),
    ).toMatchObject({ images: [], complete: true });
    const { DatabaseSync } = await import('../database/sqlite.types').then(
      (m) => m.loadSqlite(),
    );
    const copy = new DatabaseSync(resolve(destination, 'lesson-plans.sqlite'));
    try {
      expect(
        copy
          .prepare(
            "SELECT page_type FROM attendance_pages WHERE id='note-backup'",
          )
          .get(),
      ).toEqual({ page_type: 'note' });
    } finally {
      copy.close();
    }
    service.updatePeriod(period.id, { expectedRevision: 1, deleted: true });
    expect(() =>
      service.createNote('deleted-period', { periodId: period.id }),
    ).toThrow(ConflictException);
    service.saveCenter({ ...center, expectedRevision: 1, deleted: true });
    expect(() =>
      service.createNote('deleted-center', { periodId: period.id }),
    ).toThrow(ConflictException);
    expect(() => service.createNote('../bad', { periodId: period.id })).toThrow(
      BadRequestException,
    );
    expect(() => service.createNote('bad-period', {})).toThrow(
      BadRequestException,
    );
  });
  it('round-trips erased fragments without losing their original stroke identity', async () => {
    const p = await upload();
    const ink = { ...p.inkDocument, strokes: ['original', 'fragment'].map((id, i) => ({
      id, sourceStrokeId: 'original', page: 0, color: '#111827', width: 4,
      points: [[i * 0.6, 0.5, 0.5, 0], [i * 0.6 + 0.3, 0.5, 0.5, 1]],
    })) };
    service.updatePage(p.id, { expectedRevision: 1, inkDocument: ink });
    expect(service.getPage(p.id).inkDocument).toEqual(ink);
    for (const sourceStrokeId of ['', 2, null, {}, 'a'.repeat(151)]) {
      expect(() => service.updatePage(p.id, {
        expectedRevision: 2,
        inkDocument: { ...ink, strokes: [{ ...ink.strokes[0], sourceStrokeId }] },
      })).toThrow(BadRequestException);
    }
    expect(service.getPage(p.id).inkDocument).toEqual(ink);
  });

});
