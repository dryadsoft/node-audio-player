import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Buffer } from 'buffer';
import { SqliteService } from '../database/sqlite.service';
import { LESSON_TERMS, LessonTerm } from './lesson-plan.interface';
import {
  DeleteLessonCurriculumResult,
  InkDocumentV2,
  InkPoint,
  InkStrokeV2,
  LessonCurriculumResponse,
  LessonCurriculumSummary,
  LessonCurriculumWeek,
  LessonCurriculumWeekSummary,
} from './lesson-curriculum.interface';

const EMPTY_INK: InkDocumentV2 = {
  version: 2,
  aspectRatio: 4 / 3,
  pageCount: 2,
  strokes: [],
};
const MAX_INK_BYTES = 1024 * 1024;
const MAX_INK_POINTS = 50000;
const MAX_INK_STROKES = 5000;
const MAX_INK_PAGES = 20;
const INK_COLORS = new Set(['#111827', '#1d4ed8', '#dc2626']);
const INK_WIDTHS = new Set([2, 4, 7]);

interface CurriculumRow {
  id: string;
  year: number;
  term: LessonTerm;
  program_name: string;
  completed_weeks: number;
  linked_plan_count: number;
  created_at: string;
  updated_at: string;
}

interface CurriculumIdentityRow {
  id: string;
  year: number;
  term: LessonTerm;
  program_name: string;
}

interface SourcePlanRow extends CurriculumIdentityRow {
  curriculum_id: string | null;
}

interface LinkedPlanRow {
  id: string;
}

interface CurriculumWeekRow {
  week: number;
  class_name: string;
  content: string;
  lesson_plan: string;
  materials: string;
  ink_json: string;
  revision: number;
  updated_at: string;
}

interface CurriculumInput {
  year?: unknown;
  term?: unknown;
  programName?: unknown;
  sourcePlanId?: unknown;
}

interface WeekInput {
  className?: unknown;
  content?: unknown;
  lessonPlan?: unknown;
  materials?: unknown;
  inkDocument?: unknown;
  expectedRevision?: unknown;
}

interface ReplaceWeeksInput {
  sourcePlanId?: unknown;
  expectedUpdatedAt?: unknown;
}

interface DeleteInput {
  expectedUpdatedAt?: unknown;
}

@Injectable()
export class LessonCurriculumService {
  constructor(private readonly sqlite: SqliteService) {}

  list(filters: {
    year?: unknown;
    term?: unknown;
    programName?: unknown;
  }): LessonCurriculumSummary[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filters.year !== undefined && filters.year !== '') {
      clauses.push('c.year = ?');
      params.push(this.validateYear(filters.year));
    }
    if (filters.term !== undefined && filters.term !== '') {
      clauses.push('c.term = ?');
      params.push(this.validateTerm(filters.term));
    }
    if (filters.programName !== undefined && filters.programName !== '') {
      clauses.push('c.normalized_program_name = ?');
      params.push(this.normalizedProgramName(filters.programName));
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.sqlite.database
      .prepare(
        `${this.summarySelect()} ${where}
         GROUP BY c.id
         ORDER BY c.year DESC,
           CASE c.term WHEN 'spring' THEN 1 WHEN 'summer' THEN 2
             WHEN 'fall' THEN 3 ELSE 4 END,
           c.program_name COLLATE NOCASE`,
      )
      .all(...params) as CurriculumRow[];
    return rows.map((row) => this.toSummary(row));
  }

  get(id: string): LessonCurriculumResponse {
    const row = this.findCurriculum(id);
    const weeks = this.sqlite.database
      .prepare(
        `SELECT week, class_name, content, lesson_plan, materials, ink_json,
                revision, updated_at
         FROM lesson_curriculum_weeks
         WHERE curriculum_id = ? ORDER BY week`,
      )
      .all(id) as CurriculumWeekRow[];
    return {
      ...this.toSummary(row),
      weeks: weeks.map((week) => this.toWeekSummary(week)),
    };
  }

  getWeek(curriculumId: string, weekValue: unknown): LessonCurriculumWeek {
    this.findCurriculum(curriculumId);
    const week = this.validateWeekNumber(weekValue);
    const row = this.sqlite.database
      .prepare(
        `SELECT week, class_name, content, lesson_plan, materials, ink_json,
                revision, updated_at
         FROM lesson_curriculum_weeks
         WHERE curriculum_id = ? AND week = ?`,
      )
      .get(curriculumId, week) as CurriculumWeekRow | undefined;
    if (!row) {
      throw new NotFoundException('공통 수업 주차가 존재하지 않습니다.');
    }
    return {
      ...this.toWeekSummary(row),
      inkDocument: this.parseInk(row.ink_json),
    };
  }

  create(input: CurriculumInput): LessonCurriculumResponse {
    const year = this.validateYear(input.year);
    const term = this.validateTerm(input.term);
    const programName = this.validateProgramName(input.programName);
    const sourcePlanId = this.validateOptionalId(input.sourcePlanId);
    const id = randomUUID();

    this.sqlite.transaction((database) => {
      const duplicate = database
        .prepare(
          `SELECT id FROM lesson_curricula
           WHERE year = ? AND term = ? AND normalized_program_name = ?`,
        )
        .get(year, term, this.normalizedProgramName(programName));
      if (duplicate) {
        throw new ConflictException(
          '해당 연도·학기·프로그램의 공통 수업노트가 이미 있습니다.',
        );
      }

      let sourceWeeks: Array<{
        week: number;
        class_name: string;
        content: string;
      }> = [];
      if (sourcePlanId) {
        const source = database
          .prepare(
            `SELECT id, year, term, program_name FROM lesson_plans WHERE id = ?`,
          )
          .get(sourcePlanId) as CurriculumIdentityRow | undefined;
        if (!source) {
          throw new NotFoundException('가져올 강의계획서가 존재하지 않습니다.');
        }
        if (
          source.year !== year ||
          source.term !== term ||
          this.normalizedProgramName(source.program_name) !==
            this.normalizedProgramName(programName)
        ) {
          throw new BadRequestException(
            '같은 연도·학기·프로그램의 계획서만 가져올 수 있습니다.',
          );
        }
        sourceWeeks = database
          .prepare(
            `SELECT week, class_name, content FROM lesson_weeks
             WHERE plan_id = ? ORDER BY week`,
          )
          .all(sourcePlanId) as Array<{
          week: number;
          class_name: string;
          content: string;
        }>;
      }

      const now = new Date().toISOString();
      database
        .prepare(
          `INSERT INTO lesson_curricula
           (id, year, term, program_name, normalized_program_name,
            created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          year,
          term,
          programName,
          this.normalizedProgramName(programName),
          now,
          now,
        );
      const insert = database.prepare(
        `INSERT INTO lesson_curriculum_weeks
         (curriculum_id, week, class_name, content, lesson_plan, materials,
          ink_json, revision, updated_at)
         VALUES (?, ?, ?, ?, '', '', ?, 1, ?)`,
      );
      for (let week = 1; week <= 12; week += 1) {
        const source = sourceWeeks.find((item) => item.week === week);
        insert.run(
          id,
          week,
          source?.class_name || '',
          source?.content || '',
          JSON.stringify(EMPTY_INK),
          now,
        );
      }
    });
    return this.get(id);
  }

  updateWeek(
    curriculumId: string,
    weekValue: unknown,
    input: WeekInput,
  ): LessonCurriculumWeek {
    const week = this.validateWeekNumber(weekValue);
    const className = this.validateText(input.className, '수업명', 500);
    const content = this.validateText(input.content, '수업할 내용', 5000);
    const lessonPlan = this.validateText(input.lessonPlan, '진행 플랜', 5000);
    const materials = this.validateText(input.materials, '사용 교구', 3000);
    const inkDocument = this.validateInk(input.inkDocument);
    const expectedRevision = this.validateRevision(input.expectedRevision);

    this.sqlite.transaction((database) => {
      const curriculum = this.findCurriculum(curriculumId);
      const now = this.nextUpdatedAt(curriculum.updated_at);
      const result = database
        .prepare(
          `UPDATE lesson_curriculum_weeks
           SET class_name = ?, content = ?, lesson_plan = ?, materials = ?,
               ink_json = ?, revision = revision + 1, updated_at = ?
           WHERE curriculum_id = ? AND week = ? AND revision = ?`,
        )
        .run(
          className,
          content,
          lessonPlan,
          materials,
          JSON.stringify(inkDocument),
          now,
          curriculumId,
          week,
          expectedRevision,
        );
      if (result.changes !== 1) {
        throw new ConflictException(
          '다른 화면에서 먼저 수정했습니다. 최신 내용을 다시 불러오세요.',
        );
      }
      database
        .prepare('UPDATE lesson_curricula SET updated_at = ? WHERE id = ?')
        .run(now, curriculumId);
    });
    return this.getWeek(curriculumId, week);
  }

  replaceWeeks(
    curriculumId: string,
    input: ReplaceWeeksInput,
  ): LessonCurriculumResponse {
    const sourcePlanId = this.validateOptionalId(input.sourcePlanId);
    const expectedUpdatedAt = this.validateExpectedUpdatedAt(
      input.expectedUpdatedAt,
    );

    this.sqlite.transaction((database) => {
      const curriculum = this.findCurriculum(curriculumId);
      this.assertCurrent(curriculum, expectedUpdatedAt);

      let sourceWeeks: Array<{
        week: number;
        class_name: string;
        content: string;
      }> = [];
      if (sourcePlanId) {
        const source = database
          .prepare(
            `SELECT id, year, term, program_name, curriculum_id
             FROM lesson_plans WHERE id = ?`,
          )
          .get(sourcePlanId) as SourcePlanRow | undefined;
        if (!source) {
          throw new NotFoundException('가져올 강의계획서가 존재하지 않습니다.');
        }
        if (source.curriculum_id) {
          throw new BadRequestException(
            '공통 수업노트에 연결되지 않은 계획서만 가져올 수 있습니다.',
          );
        }
        if (
          source.year !== curriculum.year ||
          source.term !== curriculum.term ||
          this.normalizedProgramName(source.program_name) !==
            this.normalizedProgramName(curriculum.program_name)
        ) {
          throw new BadRequestException(
            '같은 연도·학기·프로그램의 계획서만 가져올 수 있습니다.',
          );
        }
        sourceWeeks = database
          .prepare(
            `SELECT week, class_name, content FROM lesson_weeks
             WHERE plan_id = ? ORDER BY week`,
          )
          .all(sourcePlanId) as typeof sourceWeeks;
        if (sourceWeeks.length !== 12) {
          throw new BadRequestException(
            '가져올 계획서의 12주 정보가 올바르지 않습니다.',
          );
        }
      }

      const sourceByWeek = new Map(
        sourceWeeks.map((week) => [week.week, week]),
      );
      const now = this.nextUpdatedAt(curriculum.updated_at);
      const update = database.prepare(
        `UPDATE lesson_curriculum_weeks
         SET class_name = ?, content = ?, revision = revision + 1,
             updated_at = ?
         WHERE curriculum_id = ? AND week = ?`,
      );
      for (let week = 1; week <= 12; week += 1) {
        const source = sourceByWeek.get(week);
        const result = update.run(
          source?.class_name || '',
          source?.content || '',
          now,
          curriculumId,
          week,
        );
        if (result.changes !== 1) {
          throw new ConflictException(
            '공통 수업 12주 정보가 올바르지 않습니다.',
          );
        }
      }
      database
        .prepare('UPDATE lesson_curricula SET updated_at = ? WHERE id = ?')
        .run(now, curriculumId);
    });

    return this.get(curriculumId);
  }

  delete(
    curriculumId: string,
    input: DeleteInput,
  ): DeleteLessonCurriculumResult {
    const expectedUpdatedAt = this.validateExpectedUpdatedAt(
      input.expectedUpdatedAt,
    );
    let detachedPlanCount = 0;

    this.sqlite.transaction((database) => {
      const curriculum = this.findCurriculum(curriculumId);
      this.assertCurrent(curriculum, expectedUpdatedAt);
      const weeks = database
        .prepare(
          `SELECT week, class_name, content
           FROM lesson_curriculum_weeks
           WHERE curriculum_id = ? ORDER BY week`,
        )
        .all(curriculumId) as Array<{
        week: number;
        class_name: string;
        content: string;
      }>;
      if (weeks.length !== 12) {
        throw new ConflictException('공통 수업 12주 정보가 올바르지 않습니다.');
      }

      const linkedPlans = database
        .prepare('SELECT id FROM lesson_plans WHERE curriculum_id = ?')
        .all(curriculumId) as LinkedPlanRow[];
      const deleteWeeks = database.prepare(
        'DELETE FROM lesson_weeks WHERE plan_id = ?',
      );
      const insertWeek = database.prepare(
        `INSERT INTO lesson_weeks
         (plan_id, week, class_name, content) VALUES (?, ?, ?, ?)`,
      );
      const detachPlan = database.prepare(
        `UPDATE lesson_plans
         SET curriculum_id = NULL, revision = revision + 1, updated_at = ?
         WHERE id = ? AND curriculum_id = ?`,
      );
      const now = new Date().toISOString();
      for (const plan of linkedPlans) {
        deleteWeeks.run(plan.id);
        for (const week of weeks) {
          insertWeek.run(plan.id, week.week, week.class_name, week.content);
        }
        const detached = detachPlan.run(now, plan.id, curriculumId);
        if (detached.changes !== 1) {
          throw new ConflictException('연결된 계획서를 분리하지 못했습니다.');
        }
      }
      const deleted = database
        .prepare('DELETE FROM lesson_curricula WHERE id = ?')
        .run(curriculumId);
      if (deleted.changes !== 1) {
        throw new ConflictException('공통 수업노트를 삭제하지 못했습니다.');
      }
      detachedPlanCount = linkedPlans.length;
    });

    return { id: curriculumId, detachedPlanCount };
  }

  assertMatches(
    curriculumId: string,
    year: number,
    term: LessonTerm,
    programName: string,
  ) {
    const row = this.sqlite.database
      .prepare(
        `SELECT id, year, term, program_name FROM lesson_curricula WHERE id = ?`,
      )
      .get(curriculumId) as CurriculumIdentityRow | undefined;
    if (!row) {
      throw new NotFoundException('공통 수업노트가 존재하지 않습니다.');
    }
    if (
      row.year !== year ||
      row.term !== term ||
      this.normalizedProgramName(row.program_name) !==
        this.normalizedProgramName(programName)
    ) {
      throw new BadRequestException(
        '같은 연도·학기·프로그램의 공통 수업노트만 연결할 수 있습니다.',
      );
    }
  }

  private summarySelect() {
    return `SELECT c.id, c.year, c.term, c.program_name,
      c.created_at, c.updated_at,
      COALESCE(SUM(CASE
        WHEN TRIM(w.class_name) <> '' OR TRIM(w.content) <> ''
          OR TRIM(w.lesson_plan) <> '' OR TRIM(w.materials) <> ''
          OR COALESCE(json_array_length(w.ink_json, '$.strokes'), 0) > 0
        THEN 1 ELSE 0 END), 0) AS completed_weeks,
      (SELECT COUNT(*) FROM lesson_plans p WHERE p.curriculum_id = c.id)
        AS linked_plan_count
      FROM lesson_curricula c
      LEFT JOIN lesson_curriculum_weeks w ON w.curriculum_id = c.id`;
  }

  private findCurriculum(id: string): CurriculumRow {
    const row = this.sqlite.database
      .prepare(`${this.summarySelect()} WHERE c.id = ? GROUP BY c.id`)
      .get(id) as CurriculumRow | undefined;
    if (!row) {
      throw new NotFoundException('공통 수업노트가 존재하지 않습니다.');
    }
    return row;
  }

  private toSummary(row: CurriculumRow): LessonCurriculumSummary {
    return {
      id: row.id,
      year: row.year,
      term: row.term,
      programName: row.program_name,
      completedWeeks: Number(row.completed_weeks),
      linkedPlanCount: Number(row.linked_plan_count),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toWeekSummary(row: CurriculumWeekRow): LessonCurriculumWeekSummary {
    return {
      week: row.week,
      className: row.class_name,
      content: row.content,
      lessonPlan: row.lesson_plan,
      materials: row.materials,
      hasInk: this.parseInk(row.ink_json).strokes.length > 0,
      revision: row.revision,
      updatedAt: row.updated_at,
    };
  }

  private parseInk(value: string): InkDocumentV2 {
    try {
      return this.normalizeInk(JSON.parse(value));
    } catch {
      return { ...EMPTY_INK, strokes: [] };
    }
  }

  private validateInk(value: unknown): InkDocumentV2 {
    return this.normalizeInk(value);
  }

  private normalizeInk(value: unknown): InkDocumentV2 {
    if (!value || typeof value !== 'object') {
      throw new BadRequestException('필기 데이터가 올바르지 않습니다.');
    }
    const document = value as Record<string, unknown>;
    const version = document.version;
    const pageCount = version === 1 ? 2 : Number(document.pageCount);
    if (
      (version !== 1 && version !== 2) ||
      typeof document.aspectRatio !== 'number' ||
      document.aspectRatio < 0.5 ||
      document.aspectRatio > 3 ||
      !Number.isInteger(pageCount) ||
      pageCount < 2 ||
      pageCount > MAX_INK_PAGES ||
      !Array.isArray(document.strokes) ||
      document.strokes.length > MAX_INK_STROKES
    ) {
      throw new BadRequestException('필기 데이터가 올바르지 않습니다.');
    }
    const strokes: InkStrokeV2[] = [];
    let pointCount = 0;
    for (const item of document.strokes) {
      if (!item || typeof item !== 'object') {
        throw new BadRequestException('필기 선 데이터가 올바르지 않습니다.');
      }
      const stroke = item as Record<string, unknown>;
      const page = version === 1 ? 0 : Number(stroke.page);
      if (
        typeof stroke.id !== 'string' ||
        !stroke.id ||
        !INK_COLORS.has(String(stroke.color)) ||
        !INK_WIDTHS.has(Number(stroke.width)) ||
        !Number.isInteger(page) ||
        page < 0 ||
        page >= pageCount ||
        !Array.isArray(stroke.points) ||
        stroke.points.length < 1
      ) {
        throw new BadRequestException('필기 선 데이터가 올바르지 않습니다.');
      }
      pointCount += stroke.points.length;
      if (pointCount > MAX_INK_POINTS) {
        throw new BadRequestException('한 주차의 필기 점이 너무 많습니다.');
      }
      const points = stroke.points.map((point) => this.validatePoint(point));
      strokes.push({
        id: stroke.id,
        page,
        color: stroke.color as InkStrokeV2['color'],
        width: Number(stroke.width) as InkStrokeV2['width'],
        points,
      });
    }
    const result: InkDocumentV2 = {
      version: 2,
      aspectRatio: document.aspectRatio,
      pageCount,
      strokes,
    };
    if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_INK_BYTES) {
      throw new BadRequestException('한 주차의 필기 데이터가 너무 큽니다.');
    }
    return result;
  }

  private validatePoint(value: unknown): InkPoint {
    if (!Array.isArray(value) || value.length < 4 || value.length > 6) {
      throw new BadRequestException('필기 좌표가 올바르지 않습니다.');
    }
    const values = value.map(Number);
    if (
      values.some((item) => !Number.isFinite(item)) ||
      values[0] < 0 ||
      values[0] > 1 ||
      values[1] < 0 ||
      values[1] > 1 ||
      values[2] < 0 ||
      values[2] > 1 ||
      values[3] < 0
    ) {
      throw new BadRequestException('필기 좌표가 올바르지 않습니다.');
    }
    return values as InkPoint;
  }

  private validateText(value: unknown, label: string, maxLength: number) {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${label} 값이 올바르지 않습니다.`);
    }
    const normalized = value.normalize('NFC').replace(/\r\n?/g, '\n').trim();
    if (normalized.length > maxLength) {
      throw new BadRequestException(`${label} 값이 너무 깁니다.`);
    }
    return normalized;
  }

  private validateYear(value: unknown) {
    const year = typeof value === 'string' && value ? Number(value) : value;
    if (!Number.isInteger(year) || Number(year) < 2000 || Number(year) > 9999) {
      throw new BadRequestException('연도가 올바르지 않습니다.');
    }
    return Number(year);
  }

  private validateTerm(value: unknown): LessonTerm {
    if (
      typeof value !== 'string' ||
      !LESSON_TERMS.includes(value as LessonTerm)
    ) {
      throw new BadRequestException('학기가 올바르지 않습니다.');
    }
    return value as LessonTerm;
  }

  private validateProgramName(value: unknown) {
    if (typeof value !== 'string' || !this.normalizeText(value)) {
      throw new BadRequestException('프로그램명을 입력하세요.');
    }
    return this.normalizeText(value);
  }

  private normalizedProgramName(value: unknown) {
    if (typeof value !== 'string' || !this.normalizeText(value)) {
      throw new BadRequestException('프로그램명이 올바르지 않습니다.');
    }
    return this.normalizeText(value).toLocaleLowerCase('ko');
  }

  private normalizeText(value: string) {
    return value.normalize('NFC').trim().replace(/\s+/g, ' ');
  }

  private validateOptionalId(value: unknown): string | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') {
      throw new BadRequestException('계획서 선택이 올바르지 않습니다.');
    }
    return value;
  }

  private validateWeekNumber(value: unknown) {
    const week = typeof value === 'string' ? Number(value) : value;
    if (!Number.isInteger(week) || Number(week) < 1 || Number(week) > 12) {
      throw new BadRequestException('주차가 올바르지 않습니다.');
    }
    return Number(week);
  }

  private validateRevision(value: unknown) {
    if (!Number.isInteger(value) || Number(value) < 1) {
      throw new BadRequestException('수정 버전이 올바르지 않습니다.');
    }
    return Number(value);
  }

  private validateExpectedUpdatedAt(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException('공통 원본 수정 시점이 올바르지 않습니다.');
    }
    return value;
  }

  private assertCurrent(curriculum: CurriculumRow, expectedUpdatedAt: string) {
    if (curriculum.updated_at !== expectedUpdatedAt) {
      throw new ConflictException(
        '다른 화면에서 먼저 수정했습니다. 최신 내용을 다시 불러오세요.',
      );
    }
  }

  private nextUpdatedAt(previous: string) {
    const previousTime = Date.parse(previous);
    const nextTime = Number.isFinite(previousTime)
      ? Math.max(Date.now(), previousTime + 1)
      : Date.now();
    return new Date(nextTime).toISOString();
  }
}
