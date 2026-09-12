import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { mkdir, writeFile, readFile, rename, unlink } from 'fs/promises';
import { resolve } from 'path';
import { SqliteService } from '../database/sqlite.service';

const invalid = (message = '출석부 입력이 올바르지 않습니다.'): never => {
  throw new BadRequestException(message);
};
export const idValue = (v: unknown): string =>
  typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v) ? v : invalid();
const textValue = (v: unknown): string =>
  typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 100
    ? v.trim()
    : invalid();
const integer = (v: unknown, min = 0, max = 100000): number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
    ? v
    : invalid();
export function semester(year: unknown, term: unknown) {
  if (
    !/^\d{4}$/.test(String(year)) ||
    Number(year) < 2000 ||
    !['spring', 'summer', 'fall', 'winter'].includes(String(term))
  )
    invalid();
  return { year: Number(year), term: String(term) };
}
export function jpegSize(data: Buffer) {
  if (
    !data ||
    data.length < 4 ||
    data.length > 8 * 1024 * 1024 ||
    data.readUInt16BE(0) !== 0xffd8 ||
    data.readUInt16BE(data.length - 2) !== 0xffd9
  )
    invalid('8MiB 이하 JPEG 사진만 저장할 수 있습니다.');
  let offset = 2;
  while (offset + 4 <= data.length) {
    if (data[offset++] !== 0xff) break;
    while (data[offset] === 0xff) offset++;
    const marker = data[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (offset + 2 > data.length) break;
    const size = data.readUInt16BE(offset);
    if (size < 2 || offset + size > data.length) break;
    if ([0xc0, 0xc1, 0xc2].includes(marker) && size >= 8) {
      const height = data.readUInt16BE(offset + 3),
        width = data.readUInt16BE(offset + 5);
      if (
        !width ||
        !height ||
        Math.max(width, height) > 4096 ||
        width / height < 0.2 ||
        width / height > 5
      )
        invalid('사진 크기를 확인하세요.');
      return { width, height };
    }
    offset += size;
  }
  return invalid('JPEG 사진을 읽을 수 없습니다.');
}
export function validateInk(v: any, ratio: number) {
  if (
    !v ||
    v.version !== 2 ||
    v.pageCount !== 1 ||
    v.aspectRatio !== ratio ||
    !Array.isArray(v.strokes) ||
    v.strokes.length > 5000
  )
    invalid('필기 형식이 올바르지 않습니다.');
  let points = 0;
  const ids = new Set();
  const strokes = v.strokes.map((s: any) => {
    if (
      !s ||
      typeof s.id !== 'string' ||
      !s.id ||
      s.id.length > 150 ||
      (s.sourceStrokeId !== undefined &&
        (typeof s.sourceStrokeId !== 'string' ||
          !s.sourceStrokeId ||
          s.sourceStrokeId.length > 150)) ||
      ids.has(s.id) ||
      s.page !== 0 ||
      !/^#[0-9a-f]{6}$/i.test(s.color) ||
      ![2, 4, 7].includes(s.width) ||
      !Array.isArray(s.points) ||
      !s.points.length
    )
      invalid('필기 획이 올바르지 않습니다.');
    ids.add(s.id);
    points += s.points.length;
    for (const p of s.points)
      if (
        !Array.isArray(p) ||
        p.length < 4 ||
        p.length > 6 ||
        p.some((n: unknown) => typeof n !== 'number' || !Number.isFinite(n)) ||
        p[0] < 0 ||
        p[0] > 1 ||
        p[1] < 0 ||
        p[1] > 1 ||
        p[2] < 0 ||
        p[2] > 1 ||
        p[3] < 0
      )
        invalid('필기 좌표가 올바르지 않습니다.');
    return {
      id: s.id,
      ...(s.sourceStrokeId !== undefined
        ? { sourceStrokeId: s.sourceStrokeId }
        : {}),
      page: 0,
      color: s.color,
      width: s.width,
      points: s.points,
    };
  });
  const ink = { version: 2, pageCount: 1, aspectRatio: ratio, strokes };
  if (points > 50000 || Buffer.byteLength(JSON.stringify(ink)) > 1024 * 1024)
    invalid('페이지 한 장의 필기 저장 한도를 초과했습니다.');
  return ink;
}
@Injectable()
export class AttendanceService {
  readonly photoRoot = resolve(
    process.env.ATTENDANCE_IMAGE_DIR ||
      resolve(process.cwd(), 'data/attendance'),
  );
  constructor(private readonly sqlite: SqliteService) {}
  private db() {
    return this.sqlite.database;
  }
  private row(table: string, id: string): any {
    const row = this.db()
      .prepare(`SELECT * FROM ${table} WHERE id=?`)
      .get(idValue(id));
    if (!row) throw new NotFoundException('출석부 기록이 없습니다.');
    return row;
  }
  private expect(row: any, revision: unknown) {
    if (row.revision !== integer(revision, 1))
      throw new ConflictException(
        '다른 기기에서 변경됐습니다. 다시 확인하세요.',
      );
  }
  private center(row: any) {
    return {
      id: row.id,
      year: row.year,
      term: row.term,
      locationId: row.location_id,
      weekday: row.weekday,
      revision: row.revision,
      deletedAt: row.deleted_at,
    };
  }
  private period(row: any) {
    return {
      id: row.id,
      centerId: row.center_id,
      name: row.name,
      position: row.position,
      revision: row.revision,
      deletedAt: row.deleted_at,
    };
  }
  private page(row: any, ink = true) {
    return {
      id: row.id,
      periodId: row.period_id,
      pageType: row.page_type,
      imageHash: row.image_hash,
      width: row.width,
      height: row.height,
      position: row.position,
      revision: row.revision,
      deletedAt: row.deleted_at,
      updatedAt: row.updated_at,
      ...(ink ? { inkDocument: JSON.parse(row.ink_json) } : {}),
    };
  }
  snapshot(year: unknown, term: unknown) {
    const s = semester(year, term);
    return {
      centers: this.db()
        .prepare('SELECT * FROM attendance_centers WHERE year=? AND term=?')
        .all(s.year, s.term)
        .map((r) => this.center(r)),
      periods: this.db()
        .prepare(
          'SELECT p.* FROM attendance_periods p JOIN attendance_centers c ON p.center_id=c.id WHERE c.year=? AND c.term=? ORDER BY p.position,p.id',
        )
        .all(s.year, s.term)
        .map((r) => this.period(r)),
      pages: this.db()
        .prepare(
          'SELECT p.* FROM attendance_pages p JOIN attendance_periods t ON p.period_id=t.id JOIN attendance_centers c ON t.center_id=c.id WHERE c.year=? AND c.term=? ORDER BY p.position,p.id',
        )
        .all(s.year, s.term)
        .map((r) => this.page(r, false)),
    };
  }
  saveCenter(input: any) {
    const s = semester(input.year, input.term),
      locationId = idValue(input.locationId),
      weekday = integer(input.weekday, 0, 6);
    const loc: any = this.db()
      .prepare('SELECT * FROM lesson_locations WHERE id=?')
      .get(locationId);
    return this.sqlite.transaction((db) => {
      const row =
        input.id === undefined
          ? undefined
          : this.row('attendance_centers', input.id);
      if (row) {
        this.expect(row, input.expectedRevision);
        if (
          row.year !== s.year ||
          row.term !== s.term ||
          row.location_id !== locationId
        )
          invalid('등록된 센터의 학기와 장소는 변경할 수 없습니다.');
        if (input.deleted !== undefined && typeof input.deleted !== 'boolean')
          invalid();
        if (row.deleted_at && input.deleted !== false)
          throw new ConflictException('센터를 먼저 복구하세요.');
      } else {
        if (!loc?.active) invalid('사용 중인 센터를 선택하세요.');
        if (input.expectedRevision !== undefined || input.deleted !== undefined)
          invalid();
      }
      const duplicate: any = db
        .prepare(
          'SELECT * FROM attendance_centers WHERE year=? AND term=? AND location_id=? AND weekday=?',
        )
        .get(s.year, s.term, locationId, weekday);
      if (duplicate && duplicate.id !== row?.id)
        throw new ConflictException(
          duplicate.deleted_at
            ? '휴지통에 같은 센터·요일이 있습니다. 기존 등록을 복구하세요.'
            : '이미 등록된 센터·요일입니다.',
        );
      if (row) {
        const deleted =
          input.deleted === undefined
            ? row.deleted_at
            : input.deleted
            ? new Date().toISOString()
            : null;
        db.prepare(
          'UPDATE attendance_centers SET weekday=?,deleted_at=?,revision=revision+1 WHERE id=?',
        ).run(weekday, deleted, row.id);
        return this.center(this.row('attendance_centers', row.id));
      }
      const id = randomUUID();
      db.prepare(
        'INSERT INTO attendance_centers(id,year,term,location_id,weekday) VALUES(?,?,?,?,?)',
      ).run(id, s.year, s.term, locationId, weekday);
      return this.center(this.row('attendance_centers', id));
    });
  }
  private requireActiveCenter(centerId: string) {
    if (this.row('attendance_centers', centerId).deleted_at)
      throw new ConflictException('삭제된 센터입니다. 센터를 먼저 복구하세요.');
  }
  createPeriod(input: any) {
    const center = this.row('attendance_centers', input.centerId),
      name = textValue(input.name),
      id = randomUUID();
    this.requireActiveCenter(center.id);
    const loc: any = this.db()
      .prepare('SELECT active FROM lesson_locations WHERE id=?')
      .get(center.location_id);
    if (!loc?.active)
      invalid('사용 중지된 센터에는 교시를 추가할 수 없습니다.');
    this.db()
      .prepare(
        'INSERT INTO attendance_periods(id,center_id,name,position) VALUES(?,?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM attendance_periods WHERE center_id=?))',
      )
      .run(id, center.id, name, center.id);
    return this.period(this.row('attendance_periods', id));
  }
  updatePeriod(id: string, input: any) {
    return this.sqlite.transaction((db) => {
      const row = this.row('attendance_periods', id);
      this.requireActiveCenter(row.center_id);
      this.expect(row, input.expectedRevision);
      const name = input.name === undefined ? row.name : textValue(input.name),
        position =
          input.position === undefined ? row.position : integer(input.position);
      if (input.deleted !== undefined && typeof input.deleted !== 'boolean')
        invalid();
      const deleted =
        input.deleted === undefined
          ? row.deleted_at
          : input.deleted
          ? new Date().toISOString()
          : null;
      db.prepare(
        'UPDATE attendance_periods SET name=?,position=?,deleted_at=?,revision=revision+1 WHERE id=?',
      ).run(name, position, deleted, id);
      return this.period(this.row('attendance_periods', id));
    });
  }
  getPage(id: string) {
    return this.page(this.row('attendance_pages', id));
  }
  async photo(id: string) {
    const row = this.row('attendance_pages', id);
    if (row.page_type !== 'photo')
      throw new NotFoundException('사진이 없는 노트입니다.');
    return readFile(resolve(this.photoRoot, `${row.image_hash}.jpg`));
  }
  createNote(id: string, input: any) {
    idValue(id);
    const periodId = idValue(input.periodId);
    return this.sqlite.transaction((db) => {
      const period = this.row('attendance_periods', periodId);
      this.requireActiveCenter(period.center_id);
      if (period.deleted_at)
        throw new ConflictException(
          '삭제된 교시입니다. 기록을 복구한 뒤 다시 전송하세요.',
        );
      const existing: any = db
        .prepare('SELECT * FROM attendance_pages WHERE id=?')
        .get(id);
      if (existing) {
        if (existing.page_type !== 'note' || existing.period_id !== periodId)
          throw new ConflictException(
            '페이지 식별자가 다른 기록에 사용됐습니다.',
          );
        return this.page(existing);
      }
      const ink = {
        version: 2,
        pageCount: 1,
        aspectRatio: 1000 / 1414,
        strokes: [],
      };
      db.prepare(
        `INSERT INTO attendance_pages
        (id,period_id,page_type,image_hash,width,height,ink_json,position,updated_at)
        VALUES(?,?,'note',NULL,1000,1414,?,(SELECT COALESCE(MAX(position),-1)+1 FROM attendance_pages WHERE period_id=?),?)`,
      ).run(
        id,
        periodId,
        JSON.stringify(ink),
        periodId,
        new Date().toISOString(),
      );
      return this.page(this.row('attendance_pages', id));
    });
  }
  async upload(
    id: string,
    periodId: string,
    file: { buffer: Buffer; mimetype: string },
  ) {
    idValue(id);
    idValue(periodId);
    if (!file || file.mimetype !== 'image/jpeg')
      invalid('JPEG 사진을 선택하세요.');
    const size = jpegSize(file.buffer),
      hash = createHash('sha256').update(file.buffer).digest('hex');
    this.requireActiveCenter(
      this.row('attendance_periods', periodId).center_id,
    );
    await mkdir(this.photoRoot, { recursive: true });
    const staged = resolve(this.photoRoot, `${hash}.${randomUUID()}.tmp`);
    try {
      await writeFile(staged, file.buffer, { flag: 'wx' });
      // Publish only a complete photo; interrupted uploads never leave a partial final file.
      await rename(staged, resolve(this.photoRoot, `${hash}.jpg`));
    } finally {
      await unlink(staged).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
    return this.sqlite.transaction((db) => {
      this.requireActiveCenter(
        this.row('attendance_periods', periodId).center_id,
      );
      const existing: any = db
        .prepare('SELECT * FROM attendance_pages WHERE id=?')
        .get(id);
      if (existing) {
        if (
          existing.page_type !== 'photo' ||
          existing.image_hash !== hash ||
          existing.period_id !== periodId
        )
          throw new ConflictException(
            '사진 식별자가 다른 기록에 사용됐습니다.',
          );
        return this.page(existing);
      }
      const period = this.row('attendance_periods', periodId);
      if (period.deleted_at)
        throw new ConflictException(
          '삭제된 교시입니다. 기록을 복구한 뒤 다시 전송하세요.',
        );
      const ink = {
        version: 2,
        pageCount: 1,
        aspectRatio: size.width / size.height,
        strokes: [],
      };
      db.prepare(
        'INSERT INTO attendance_pages(id,period_id,image_hash,width,height,ink_json,position,updated_at) VALUES(?,?,?,?,?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM attendance_pages WHERE period_id=?),?)',
      ).run(
        id,
        periodId,
        hash,
        size.width,
        size.height,
        JSON.stringify(ink),
        periodId,
        new Date().toISOString(),
      );
      return this.page(this.row('attendance_pages', id));
    });
  }
  updatePage(id: string, input: any) {
    return this.sqlite.transaction((db) => {
      const row = this.row('attendance_pages', id);
      this.expect(row, input.expectedRevision);
      const period = this.row('attendance_periods', row.period_id);
      this.requireActiveCenter(period.center_id);
      if (
        input.inkDocument !== undefined &&
        (row.deleted_at || period.deleted_at)
      )
        throw new ConflictException('삭제된 출석부입니다. 먼저 복구하세요.');
      if (input.deleted !== undefined && typeof input.deleted !== 'boolean')
        invalid();
      const ink =
        input.inkDocument === undefined
          ? row.ink_json
          : JSON.stringify(
              validateInk(input.inkDocument, row.width / row.height),
            );
      const position =
        input.position === undefined ? row.position : integer(input.position);
      const deleted =
        input.deleted === undefined
          ? row.deleted_at
          : input.deleted
          ? new Date().toISOString()
          : null;
      if (input.deleted === false && period.deleted_at)
        throw new ConflictException('교시를 먼저 복구하세요.');
      db.prepare(
        'UPDATE attendance_pages SET ink_json=?,position=?,deleted_at=?,revision=revision+1,updated_at=? WHERE id=?',
      ).run(ink, position, deleted, new Date().toISOString(), id);
      return this.page(this.row('attendance_pages', id));
    });
  }
}
