import { createHash, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  LESSON_TERMS,
  LessonPlanDocumentFields,
  LessonTerm,
} from '../lesson-plan/lesson-plan.interface';
import { SqliteService } from './sqlite.service';

export interface LessonPlanImportWeek {
  week: number;
  className: string;
  content: string;
}

export interface LessonPlanImportRecord
  extends Partial<LessonPlanDocumentFields> {
  sourcePath: string;
  sourceSha256: string;
  year: number;
  term: LessonTerm;
  locationName: string;
  programName: string;
  sectionName: string;
  weeks: LessonPlanImportWeek[];
}

export interface LessonPlanImportManifest {
  schemaVersion: number;
  createdAt: string;
  source: {
    directoryName: string;
    fileCount: number;
    snapshotSha256: string;
    ignoredFiles: string[];
  };
  summary: {
    planCount: number;
    locationCount: number;
    completedPlanCount: number;
    draftPlanCount: number;
    programCounts: Record<string, number>;
  };
  plans: LessonPlanImportRecord[];
  manifestSha256: string;
}

export interface LessonPlanImportResult {
  imported: number;
  enriched: number;
  skipped: number;
  total: number;
}

const normalizeText = (value: string) =>
  value.normalize('NFC').trim().replace(/\s+/g, ' ');

const normalizeDocumentText = (value: string) =>
  value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/[ \t]+/g, ' '))
    .join('\n')
    .trim();

const DOCUMENT_FIELDS: Array<keyof LessonPlanDocumentFields> = [
  'documentTitle',
  'courseName',
  'instructorName',
  'representativeProfile',
  'courseIntroduction',
  'audience',
  'capacity',
  'scheduleDetails',
  'tuition',
  'materialFee',
  'openLecture',
  'notice',
];

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

export const manifestChecksum = (
  manifest: Omit<LessonPlanImportManifest, 'manifestSha256'>,
) => sha256(JSON.stringify(manifest));

const assertString = (value: unknown, label: string, allowEmpty = false) => {
  if (typeof value !== 'string' || (!allowEmpty && !normalizeText(value))) {
    throw new Error(`${label} 값이 올바르지 않습니다.`);
  }
};

export const validateLessonPlanManifest = (
  value: unknown,
): LessonPlanImportManifest => {
  if (!value || typeof value !== 'object') {
    throw new Error('manifest 형식이 올바르지 않습니다.');
  }
  const manifest = value as LessonPlanImportManifest;
  if (
    ![1, 2].includes(manifest.schemaVersion) ||
    !Array.isArray(manifest.plans)
  ) {
    throw new Error('지원하지 않는 manifest 버전입니다.');
  }
  const { manifestSha256, ...body } = manifest;
  if (
    typeof manifestSha256 !== 'string' ||
    manifestChecksum(body) !== manifestSha256
  ) {
    throw new Error('manifest 체크섬이 일치하지 않습니다.');
  }
  if (
    !manifest.source ||
    manifest.source.fileCount !== manifest.plans.length ||
    manifest.summary?.planCount !== manifest.plans.length
  ) {
    throw new Error('manifest 파일 수와 계획서 수가 일치하지 않습니다.');
  }

  const sourceIdentities = new Set<string>();
  const logicalKeys = new Set<string>();
  for (const plan of manifest.plans) {
    assertString(plan.sourcePath, '원본 경로');
    assertString(plan.sourceSha256, '원본 체크섬');
    assertString(plan.locationName, '장소');
    assertString(plan.programName, '프로그램명');
    assertString(plan.sectionName, '수업 구분', true);
    if (manifest.schemaVersion === 2) {
      for (const field of DOCUMENT_FIELDS) {
        assertString(plan[field], field, true);
      }
    }
    if (!/^[a-f0-9]{64}$/.test(plan.sourceSha256)) {
      throw new Error(`원본 체크섬이 올바르지 않습니다: ${plan.sourcePath}`);
    }
    const sourceIdentity = `${plan.sourcePath.normalize('NFC')}\0${
      plan.sourceSha256
    }`;
    if (sourceIdentities.has(sourceIdentity)) {
      throw new Error(`원본 정보가 중복됩니다: ${plan.sourcePath}`);
    }
    sourceIdentities.add(sourceIdentity);
    if (
      !Number.isInteger(plan.year) ||
      plan.year < 2000 ||
      plan.year > 9999 ||
      !LESSON_TERMS.includes(plan.term)
    ) {
      throw new Error(`연도·학기가 올바르지 않습니다: ${plan.sourcePath}`);
    }
    if (!Array.isArray(plan.weeks) || plan.weeks.length !== 12) {
      throw new Error(`12주 데이터가 필요합니다: ${plan.sourcePath}`);
    }
    const weekNumbers = new Set<number>();
    for (const week of plan.weeks) {
      if (
        !Number.isInteger(week.week) ||
        week.week < 1 ||
        week.week > 12 ||
        typeof week.className !== 'string' ||
        typeof week.content !== 'string'
      ) {
        throw new Error(`주차 데이터가 올바르지 않습니다: ${plan.sourcePath}`);
      }
      weekNumbers.add(week.week);
    }
    if (weekNumbers.size !== 12) {
      throw new Error(`주차 번호가 중복됩니다: ${plan.sourcePath}`);
    }
    const key = [
      plan.year,
      plan.term,
      normalizeText(plan.locationName),
      normalizeText(plan.programName),
      normalizeText(plan.sectionName),
    ].join('\0');
    if (logicalKeys.has(key)) {
      throw new Error(`계획서 고유키가 중복됩니다: ${plan.sourcePath}`);
    }
    logicalKeys.add(key);
  }
  return manifest;
};

export const importLessonPlanManifest = (
  sqlite: SqliteService,
  manifestValue: unknown,
): LessonPlanImportResult => {
  const manifest = validateLessonPlanManifest(manifestValue);
  return sqlite.transaction((database) => {
    let imported = 0;
    let enriched = 0;
    let skipped = 0;
    const now = new Date().toISOString();
    const findSource = database.prepare(
      `SELECT plan_id, metadata_version FROM lesson_plan_import_sources
       WHERE source_path = ? AND source_sha256 = ?`,
    );
    const enrichPlan = database.prepare(
      `UPDATE lesson_plans
       SET document_title = ?, course_name = ?, instructor_name = ?,
           representative_profile = ?, course_introduction = ?, audience = ?,
           capacity = ?, schedule_details = ?, tuition = ?, material_fee = ?,
           open_lecture = ?, notice = ?, revision = revision + 1,
           updated_at = ?
       WHERE id = ?`,
    );
    const markMetadataVersion = database.prepare(
      `UPDATE lesson_plan_import_sources SET metadata_version = ?
       WHERE plan_id = ?`,
    );
    const findLocation = database.prepare(
      'SELECT id FROM lesson_locations WHERE normalized_name = ?',
    );
    const insertLocation = database.prepare(
      `INSERT INTO lesson_locations
       (id, name, normalized_name, active, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`,
    );
    const findPlan = database.prepare(
      `SELECT id FROM lesson_plans
       WHERE year = ? AND term = ? AND location_id = ?
         AND program_name = ? AND section_name = ?`,
    );
    const insertPlan = database.prepare(
      `INSERT INTO lesson_plans
       (id, year, term, location_id, program_name, section_name,
        document_title, course_name, instructor_name,
        representative_profile, course_introduction, audience, capacity,
        schedule_details, tuition, material_fee, open_lecture, notice,
        revision, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               1, ?, ?)`,
    );
    const insertWeek = database.prepare(
      `INSERT INTO lesson_weeks (plan_id, week, class_name, content)
       VALUES (?, ?, ?, ?)`,
    );
    const insertSource = database.prepare(
      `INSERT INTO lesson_plan_import_sources
       (plan_id, source_path, source_sha256, imported_at, metadata_version)
       VALUES (?, ?, ?, ?, ?)`,
    );

    for (const source of manifest.plans) {
      const existingSource = findSource.get(
        source.sourcePath.normalize('NFC'),
        source.sourceSha256,
      ) as { plan_id: string; metadata_version: number } | undefined;
      if (existingSource) {
        if (
          manifest.schemaVersion === 2 &&
          existingSource.metadata_version < 2
        ) {
          enrichPlan.run(
            ...DOCUMENT_FIELDS.map((field) =>
              normalizeDocumentText(source[field] || ''),
            ),
            now,
            existingSource.plan_id,
          );
          markMetadataVersion.run(2, existingSource.plan_id);
          enriched += 1;
          continue;
        }
        skipped += 1;
        continue;
      }
      const locationName = normalizeText(source.locationName);
      const normalizedLocation = locationName.toLocaleLowerCase('ko');
      let location = findLocation.get(normalizedLocation) as
        | { id: string }
        | undefined;
      if (!location) {
        location = { id: randomUUID() };
        insertLocation.run(
          location.id,
          locationName,
          normalizedLocation,
          now,
          now,
        );
      }
      const programName = normalizeText(source.programName);
      const sectionName = normalizeText(source.sectionName);
      if (
        findPlan.get(
          source.year,
          source.term,
          location.id,
          programName,
          sectionName,
        )
      ) {
        throw new Error(
          `기존 계획서와 충돌합니다. 덮어쓰지 않았습니다: ${source.sourcePath}`,
        );
      }
      const planId = randomUUID();
      insertPlan.run(
        planId,
        source.year,
        source.term,
        location.id,
        programName,
        sectionName,
        ...DOCUMENT_FIELDS.map((field) =>
          manifest.schemaVersion === 2
            ? normalizeDocumentText(source[field] || '')
            : '',
        ),
        now,
        now,
      );
      for (const week of source.weeks) {
        insertWeek.run(
          planId,
          week.week,
          normalizeText(week.className),
          normalizeText(week.content),
        );
      }
      insertSource.run(
        planId,
        source.sourcePath.normalize('NFC'),
        source.sourceSha256,
        now,
        manifest.schemaVersion,
      );
      imported += 1;
    }
    return { imported, enriched, skipped, total: manifest.plans.length };
  });
};

const main = () => {
  const args = process.argv.slice(2);
  const applyIndex = args.indexOf('--apply');
  const manifestIndex = args.indexOf('--manifest');
  if (applyIndex === -1 || manifestIndex === -1 || !args[manifestIndex + 1]) {
    throw new Error(
      '사용법: npm run lesson-plans:import -- --apply --manifest <manifest.json>',
    );
  }
  const manifestPath = resolve(args[manifestIndex + 1]);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
  const sqlite = new SqliteService();
  sqlite.onModuleInit();
  try {
    const result = importLessonPlanManifest(sqlite, manifest);
    if (!sqlite.integrityCheck()) {
      throw new Error('이관 후 SQLite 무결성 검사에 실패했습니다.');
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    sqlite.onModuleDestroy();
  }
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : '이관에 실패했습니다.'}\n`,
    );
    process.exitCode = 1;
  }
}
