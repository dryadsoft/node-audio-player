import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SqliteDatabase } from '../database/sqlite.types';
import { SqliteService } from '../database/sqlite.service';
import {
  LESSON_TERMS,
  LessonPlanDocumentFields,
  LessonPlanResponse,
  LessonPlanSummary,
  LessonTerm,
  LessonWeek,
} from './lesson-plan.interface';

interface PlanRow {
  id: string;
  year: number;
  term: LessonTerm;
  location_id: string;
  location_name: string;
  location_active: number;
  program_name: string;
  section_name: string;
  document_title: string;
  course_name: string;
  instructor_name: string;
  representative_profile: string;
  course_introduction: string;
  audience: string;
  capacity: string;
  schedule_details: string;
  tuition: string;
  material_fee: string;
  open_lecture: string;
  notice: string;
  completed_weeks: number;
  revision: number;
  created_at: string;
  updated_at: string;
}

interface WeekRow {
  week: number;
  class_name: string;
  content: string;
}

interface LocationRow {
  id: string;
  active: number;
}

interface PlanInput {
  year?: unknown;
  term?: unknown;
  locationId?: unknown;
  programName?: unknown;
  sectionName?: unknown;
  documentTitle?: unknown;
  courseName?: unknown;
  instructorName?: unknown;
  representativeProfile?: unknown;
  courseIntroduction?: unknown;
  audience?: unknown;
  capacity?: unknown;
  scheduleDetails?: unknown;
  tuition?: unknown;
  materialFee?: unknown;
  openLecture?: unknown;
  notice?: unknown;
  weeks?: unknown;
}

const TERM_LABELS: Record<LessonTerm, string> = {
  spring: '봄학기',
  summer: '여름학기',
  fall: '가을학기',
  winter: '겨울학기',
};

const DEFAULT_NOTICE = '※ 사정상 수업의 순서는 바뀔 수 있습니다.';

@Injectable()
export class LessonPlanService {
  constructor(private readonly sqlite: SqliteService) {}

  list(filters: {
    year?: unknown;
    term?: unknown;
    locationId?: unknown;
    programName?: unknown;
  }): LessonPlanSummary[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filters.year !== undefined && filters.year !== '') {
      clauses.push('p.year = ?');
      params.push(this.validateYear(filters.year));
    }
    if (filters.term !== undefined && filters.term !== '') {
      clauses.push('p.term = ?');
      params.push(this.validateTerm(filters.term));
    }
    if (filters.locationId !== undefined && filters.locationId !== '') {
      if (typeof filters.locationId !== 'string') {
        throw new BadRequestException('장소가 올바르지 않습니다.');
      }
      clauses.push('p.location_id = ?');
      params.push(filters.locationId);
    }
    if (filters.programName !== undefined && filters.programName !== '') {
      clauses.push('p.program_name = ?');
      params.push(this.validateProgramName(filters.programName));
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.sqlite.database
      .prepare(
        `${this.summarySelect()}
         ${where}
         GROUP BY p.id, l.id
         ORDER BY p.year DESC,
           CASE p.term
             WHEN 'spring' THEN 1 WHEN 'summer' THEN 2
             WHEN 'fall' THEN 3 ELSE 4
           END ASC,
           l.name COLLATE NOCASE ASC,
           p.program_name COLLATE NOCASE ASC,
           p.section_name COLLATE NOCASE ASC`,
      )
      .all(...params) as PlanRow[];
    return rows.map((row) => this.toSummary(row));
  }

  get(id: string): LessonPlanResponse {
    const row = this.findPlan(this.sqlite.database, id);
    const weeks = this.sqlite.database
      .prepare(
        `SELECT week, class_name, content
         FROM lesson_weeks WHERE plan_id = ? ORDER BY week ASC`,
      )
      .all(id) as WeekRow[];
    return {
      ...this.toSummary(row),
      ...this.toDocumentFields(row),
      weeks: weeks.map((week) => ({
        week: week.week,
        className: week.class_name,
        content: week.content,
      })),
    };
  }

  create(input: PlanInput): LessonPlanResponse {
    const year = this.validateYear(input.year);
    const term = this.validateTerm(input.term);
    const locationId = this.validateLocationId(input.locationId);
    const programName = this.validateProgramName(input.programName);
    const sectionName = this.validateSectionName(input.sectionName);
    const documentFields = this.validateDocumentFields(input, {
      documentTitle: `${programName} 강의계획서 - ${TERM_LABELS[term]}`,
      courseName: programName,
      instructorName: '',
      representativeProfile: '',
      courseIntroduction: '',
      audience: '',
      capacity: '',
      scheduleDetails: '',
      tuition: '',
      materialFee: '',
      openLecture: '',
      notice: DEFAULT_NOTICE,
    });
    const weeks = this.validateWeeks(input.weeks);
    const id = randomUUID();
    this.sqlite.transaction((database) => {
      this.ensureLocation(database, locationId, true);
      this.ensureUniqueCombination(
        database,
        year,
        term,
        locationId,
        programName,
        sectionName,
      );
      const now = new Date().toISOString();
      database
        .prepare(
          `INSERT INTO lesson_plans
           (id, year, term, location_id, program_name, section_name,
            document_title, course_name, instructor_name,
            representative_profile, course_introduction, audience, capacity,
            schedule_details, tuition, material_fee, open_lecture, notice,
            revision, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                   1, ?, ?)`,
        )
        .run(
          id,
          year,
          term,
          locationId,
          programName,
          sectionName,
          ...this.documentFieldValues(documentFields),
          now,
          now,
        );
      this.insertWeeks(database, id, weeks);
    });
    return this.get(id);
  }

  update(
    id: string,
    input: PlanInput & { expectedRevision?: unknown },
  ): LessonPlanResponse {
    const year = this.validateYear(input.year);
    const term = this.validateTerm(input.term);
    const locationId = this.validateLocationId(input.locationId);
    const programName = this.validateProgramName(input.programName);
    const sectionName = this.validateSectionName(input.sectionName);
    const weeks = this.validateWeeks(input.weeks);
    const expectedRevision = this.validateRevision(input.expectedRevision);

    this.sqlite.transaction((database) => {
      const current = this.findPlan(database, id);
      const documentFields = this.validateDocumentFields(
        input,
        this.toDocumentFields(current),
      );
      if (current.revision !== expectedRevision) {
        throw new ConflictException(
          '다른 사용자가 먼저 수정했습니다. 최신 내용을 다시 불러오세요.',
        );
      }
      this.ensureLocation(
        database,
        locationId,
        locationId !== current.location_id,
      );
      this.ensureUniqueCombination(
        database,
        year,
        term,
        locationId,
        programName,
        sectionName,
        id,
      );
      const updated = database
        .prepare(
          `UPDATE lesson_plans
           SET year = ?, term = ?, location_id = ?,
               program_name = ?, section_name = ?,
               document_title = ?, course_name = ?, instructor_name = ?,
               representative_profile = ?, course_introduction = ?,
               audience = ?, capacity = ?, schedule_details = ?,
               tuition = ?, material_fee = ?, open_lecture = ?, notice = ?,
               revision = revision + 1, updated_at = ?
           WHERE id = ? AND revision = ?`,
        )
        .run(
          year,
          term,
          locationId,
          programName,
          sectionName,
          ...this.documentFieldValues(documentFields),
          new Date().toISOString(),
          id,
          expectedRevision,
        );
      if (updated.changes !== 1) {
        throw new ConflictException(
          '다른 사용자가 먼저 수정했습니다. 최신 내용을 다시 불러오세요.',
        );
      }
      database.prepare('DELETE FROM lesson_weeks WHERE plan_id = ?').run(id);
      this.insertWeeks(database, id, weeks);
    });
    return this.get(id);
  }

  private summarySelect() {
    return `SELECT p.id, p.year, p.term, p.location_id,
      p.program_name, p.section_name,
      p.document_title, p.course_name, p.instructor_name,
      p.representative_profile, p.course_introduction, p.audience,
      p.capacity, p.schedule_details, p.tuition, p.material_fee,
      p.open_lecture, p.notice,
      l.name AS location_name, l.active AS location_active,
      p.revision, p.created_at, p.updated_at,
      COALESCE(SUM(CASE
        WHEN TRIM(w.class_name) <> '' AND TRIM(w.content) <> '' THEN 1
        ELSE 0 END), 0) AS completed_weeks
      FROM lesson_plans p
      JOIN lesson_locations l ON l.id = p.location_id
      LEFT JOIN lesson_weeks w ON w.plan_id = p.id`;
  }

  private findPlan(database: SqliteDatabase, id: string): PlanRow {
    const row = database
      .prepare(`${this.summarySelect()} WHERE p.id = ? GROUP BY p.id, l.id`)
      .get(id) as PlanRow | undefined;
    if (!row) {
      throw new NotFoundException('강의계획서가 존재하지 않습니다.');
    }
    return row;
  }

  private ensureLocation(
    database: SqliteDatabase,
    locationId: string,
    requireActive: boolean,
  ) {
    const location = database
      .prepare('SELECT id, active FROM lesson_locations WHERE id = ?')
      .get(locationId) as LocationRow | undefined;
    if (!location) {
      throw new NotFoundException('장소가 존재하지 않습니다.');
    }
    if (requireActive && !location.active) {
      throw new BadRequestException('사용 중지된 장소는 선택할 수 없습니다.');
    }
  }

  private ensureUniqueCombination(
    database: SqliteDatabase,
    year: number,
    term: LessonTerm,
    locationId: string,
    programName: string,
    sectionName: string,
    exceptId?: string,
  ) {
    const duplicate = database
      .prepare(
        `SELECT id FROM lesson_plans
         WHERE year = ? AND term = ? AND location_id = ?
           AND program_name = ? AND section_name = ?
           AND (? IS NULL OR id <> ?)`,
      )
      .get(
        year,
        term,
        locationId,
        programName,
        sectionName,
        exceptId || null,
        exceptId || null,
      );
    if (duplicate) {
      throw new ConflictException(
        '해당 연도·학기·장소·프로그램·수업 구분의 강의계획서가 이미 있습니다.',
      );
    }
  }

  private insertWeeks(
    database: SqliteDatabase,
    planId: string,
    weeks: LessonWeek[],
  ) {
    const statement = database.prepare(
      `INSERT INTO lesson_weeks (plan_id, week, class_name, content)
       VALUES (?, ?, ?, ?)`,
    );
    weeks.forEach((week) =>
      statement.run(planId, week.week, week.className, week.content),
    );
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

  private validateLocationId(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException('장소를 선택하세요.');
    }
    return value;
  }

  private validateProgramName(value: unknown) {
    if (typeof value !== 'string') {
      throw new BadRequestException('프로그램명을 입력하세요.');
    }
    const programName = this.normalizeText(value);
    if (!programName) {
      throw new BadRequestException('프로그램명을 입력하세요.');
    }
    return programName;
  }

  private validateSectionName(value: unknown) {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string') {
      throw new BadRequestException('수업 구분이 올바르지 않습니다.');
    }
    return this.normalizeText(value);
  }

  private normalizeText(value: string) {
    return value.normalize('NFC').trim().replace(/\s+/g, ' ');
  }

  private normalizeDocumentText(value: string) {
    return value
      .normalize('NFC')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.trim().replace(/[ \t]+/g, ' '))
      .join('\n')
      .trim();
  }

  private validateDocumentFields(
    input: PlanInput,
    current: LessonPlanDocumentFields,
  ): LessonPlanDocumentFields {
    const field = (
      key: keyof LessonPlanDocumentFields,
      label: string,
      maxLength: number,
    ) => {
      const value = input[key];
      if (value === undefined) return current[key];
      if (typeof value !== 'string') {
        throw new BadRequestException(`${label} 값이 올바르지 않습니다.`);
      }
      const normalized = this.normalizeDocumentText(value);
      if (normalized.length > maxLength) {
        throw new BadRequestException(`${label} 값이 너무 깁니다.`);
      }
      return normalized;
    };

    return {
      documentTitle: field('documentTitle', '문서 제목', 300),
      courseName: field('courseName', '강좌명', 100),
      instructorName: field('instructorName', '강사명', 100),
      representativeProfile: field('representativeProfile', '대표 프로필', 300),
      courseIntroduction: field('courseIntroduction', '강좌 소개', 2000),
      audience: field('audience', '강의 대상', 500),
      capacity: field('capacity', '정원', 100),
      scheduleDetails: field('scheduleDetails', '세부 연령·일정', 2000),
      tuition: field('tuition', '교육비', 200),
      materialFee: field('materialFee', '교재비', 200),
      openLecture: field('openLecture', '공개강좌', 1000),
      notice: field('notice', '안내문', 500),
    };
  }

  private toDocumentFields(row: PlanRow): LessonPlanDocumentFields {
    return {
      documentTitle: row.document_title,
      courseName: row.course_name,
      instructorName: row.instructor_name,
      representativeProfile: row.representative_profile,
      courseIntroduction: row.course_introduction,
      audience: row.audience,
      capacity: row.capacity,
      scheduleDetails: row.schedule_details,
      tuition: row.tuition,
      materialFee: row.material_fee,
      openLecture: row.open_lecture,
      notice: row.notice,
    };
  }

  private documentFieldValues(fields: LessonPlanDocumentFields) {
    return [
      fields.documentTitle,
      fields.courseName,
      fields.instructorName,
      fields.representativeProfile,
      fields.courseIntroduction,
      fields.audience,
      fields.capacity,
      fields.scheduleDetails,
      fields.tuition,
      fields.materialFee,
      fields.openLecture,
      fields.notice,
    ];
  }

  private validateRevision(value: unknown) {
    if (!Number.isInteger(value) || Number(value) < 1) {
      throw new BadRequestException('수정 버전이 올바르지 않습니다.');
    }
    return Number(value);
  }

  private validateWeeks(value: unknown): LessonWeek[] {
    if (!Array.isArray(value) || value.length !== 12) {
      throw new BadRequestException('1주차부터 12주차까지 모두 필요합니다.');
    }
    const weeks = value.map((item) => {
      if (!item || typeof item !== 'object') {
        throw new BadRequestException('주차 정보가 올바르지 않습니다.');
      }
      const row = item as Record<string, unknown>;
      if (
        !Number.isInteger(row.week) ||
        Number(row.week) < 1 ||
        Number(row.week) > 12 ||
        typeof row.className !== 'string' ||
        typeof row.content !== 'string'
      ) {
        throw new BadRequestException('주차 정보가 올바르지 않습니다.');
      }
      return {
        week: Number(row.week),
        className: row.className.trim(),
        content: row.content.trim(),
      };
    });
    const numbers = new Set(weeks.map((week) => week.week));
    if (numbers.size !== 12) {
      throw new BadRequestException(
        '주차 번호는 1부터 12까지 중복 없이 필요합니다.',
      );
    }
    return weeks.sort((left, right) => left.week - right.week);
  }

  private toSummary(row: PlanRow): LessonPlanSummary {
    const completedWeeks = Number(row.completed_weeks);
    return {
      id: row.id,
      year: row.year,
      term: row.term,
      locationId: row.location_id,
      locationName: row.location_name,
      locationActive: Boolean(row.location_active),
      programName: row.program_name,
      sectionName: row.section_name,
      completedWeeks,
      status: completedWeeks === 12 ? 'complete' : 'draft',
      revision: row.revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
