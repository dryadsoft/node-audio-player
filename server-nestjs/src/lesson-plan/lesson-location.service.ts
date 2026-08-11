import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SqliteService } from '../database/sqlite.service';
import { LessonLocationResponse } from './lesson-plan.interface';

interface LocationRow {
  id: string;
  name: string;
  active: number;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class LessonLocationService {
  constructor(private readonly sqlite: SqliteService) {}

  list(includeInactive = false): LessonLocationResponse[] {
    const rows = this.sqlite.database
      .prepare(
        `SELECT id, name, active, created_at, updated_at
         FROM lesson_locations
         ${includeInactive ? '' : 'WHERE active = 1'}
         ORDER BY active DESC, name COLLATE NOCASE ASC`,
      )
      .all() as LocationRow[];
    return rows.map((row) => this.toResponse(row));
  }

  create(name: unknown): LessonLocationResponse {
    const normalizedName = this.validateName(name);
    const normalizedKey = this.normalizeKey(normalizedName);
    return this.sqlite.transaction((database) => {
      if (
        database
          .prepare('SELECT id FROM lesson_locations WHERE normalized_name = ?')
          .get(normalizedKey)
      ) {
        throw new ConflictException('같은 이름의 장소가 있습니다.');
      }
      const now = new Date().toISOString();
      const location: LocationRow = {
        id: randomUUID(),
        name: normalizedName,
        active: 1,
        created_at: now,
        updated_at: now,
      };
      database
        .prepare(
          `INSERT INTO lesson_locations
           (id, name, normalized_name, active, created_at, updated_at)
           VALUES (?, ?, ?, 1, ?, ?)`,
        )
        .run(location.id, location.name, normalizedKey, now, now);
      return this.toResponse(location);
    });
  }

  update(
    id: string,
    body: { name?: unknown; active?: unknown },
  ): LessonLocationResponse {
    return this.sqlite.transaction((database) => {
      const current = database
        .prepare(
          `SELECT id, name, active, created_at, updated_at
           FROM lesson_locations WHERE id = ?`,
        )
        .get(id) as LocationRow | undefined;
      if (!current) {
        throw new NotFoundException('장소가 존재하지 않습니다.');
      }
      if (body.name === undefined && body.active === undefined) {
        throw new BadRequestException('변경할 장소 정보를 입력하세요.');
      }

      const name =
        body.name === undefined ? current.name : this.validateName(body.name);
      const normalizedKey = this.normalizeKey(name);
      if (
        database
          .prepare(
            'SELECT id FROM lesson_locations WHERE normalized_name = ? AND id <> ?',
          )
          .get(normalizedKey, id)
      ) {
        throw new ConflictException('같은 이름의 장소가 있습니다.');
      }
      const active =
        body.active === undefined
          ? current.active
          : this.validateActive(body.active)
          ? 1
          : 0;
      const updatedAt = new Date().toISOString();
      database
        .prepare(
          `UPDATE lesson_locations
           SET name = ?, normalized_name = ?, active = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(name, normalizedKey, active, updatedAt, id);
      return this.toResponse({
        ...current,
        name,
        active,
        updated_at: updatedAt,
      });
    });
  }

  private validateName(value: unknown) {
    if (typeof value !== 'string') {
      throw new BadRequestException('장소 이름을 입력하세요.');
    }
    const name = value.trim().replace(/\s+/g, ' ');
    if (!name) {
      throw new BadRequestException('장소 이름을 입력하세요.');
    }
    return name;
  }

  private validateActive(value: unknown) {
    if (typeof value !== 'boolean') {
      throw new BadRequestException('장소 사용 상태가 올바르지 않습니다.');
    }
    return value;
  }

  private normalizeKey(name: string) {
    return name.toLocaleLowerCase('ko');
  }

  private toResponse(row: LocationRow): LessonLocationResponse {
    return {
      id: row.id,
      name: row.name,
      active: Boolean(row.active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
