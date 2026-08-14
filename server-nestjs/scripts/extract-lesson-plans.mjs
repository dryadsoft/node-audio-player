import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { basename, dirname, extname, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hwpToMarkdown } from '@ssabrojs/hwpxjs';

const DEFAULT_EXPECTED_COUNT = 216;
const DEFAULT_EXPECTED_SNAPSHOT =
  '0555167721ba7df07b572e04ee32d95a6fc5b57c64053e641e4db18afb9a31ef';

const TERM_BY_FOLDER = new Map([
  ['01.봄학기', 'spring'],
  ['02.여름학기', 'summer'],
  ['03.가을학기', 'fall'],
  ['04.겨울학기', 'winter'],
]);

const DAY_LABELS = {
  월: '월요일',
  화: '화요일',
  수: '수요일',
  목: '목요일',
  금: '금요일',
  토: '토요일',
  일: '일요일',
};

const normalizeText = (value) =>
  value.normalize('NFC').trim().replace(/\s+/g, ' ');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const compareCodePoints = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

const parseArgs = (args) => {
  const options = {
    source: resolve(process.cwd(), '../강의계획서'),
    output: resolve(process.cwd(), 'data/imports/lesson-plans-manifest.json'),
    report: resolve(process.cwd(), 'data/imports/lesson-plans-report.csv'),
    expectedCount: DEFAULT_EXPECTED_COUNT,
    expectedSnapshot: DEFAULT_EXPECTED_SNAPSHOT,
  };
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    const value = args[index + 1];
    if (!value || !name.startsWith('--')) {
      throw new Error(`인수가 올바르지 않습니다: ${name}`);
    }
    if (name === '--source') options.source = resolve(value);
    else if (name === '--output') options.output = resolve(value);
    else if (name === '--report') options.report = resolve(value);
    else if (name === '--expected-count') options.expectedCount = Number(value);
    else if (name === '--expected-snapshot') options.expectedSnapshot = value;
    else throw new Error(`지원하지 않는 인수입니다: ${name}`);
    index += 1;
  }
  return options;
};

const walkFiles = async (root) => {
  const result = [];
  const visit = async (directory) => {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'ko'));
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) result.push(path);
    }
  };
  await visit(root);
  return result;
};

const relativeNfcPath = (root, path) =>
  relative(root, path).split(sep).join('/').normalize('NFC');

export const parseSourceMetadata = (relativePath) => {
  const normalizedPath = relativePath.normalize('NFC');
  const parts = normalizedPath.split('/');
  if (parts.length < 3) {
    throw new Error(`연도·학기 폴더를 확인할 수 없습니다: ${normalizedPath}`);
  }
  const yearMatch = parts[0].match(/^(\d{4})_/);
  const year = yearMatch ? Number(yearMatch[1]) : NaN;
  const term = TERM_BY_FOLDER.get(parts[1]);
  if (!Number.isInteger(year) || !term) {
    throw new Error(`연도·학기 폴더가 올바르지 않습니다: ${normalizedPath}`);
  }

  const fileName = basename(normalizedPath, extname(normalizedPath));
  const tokens = fileName.split('_').map(normalizeText);
  const durationMatch = tokens[0]?.match(/^\((\d+)주\)/);
  const programName = normalizeText(tokens[0]?.replace(/^\(\d+주\)/, '') || '');
  if (!programName) {
    throw new Error(`프로그램명을 확인할 수 없습니다: ${normalizedPath}`);
  }

  let locationToken = tokens.at(-1) || '';
  if (locationToken === '변경') locationToken = tokens.at(-2) || '';
  let locationName = locationToken === '강의계획서' ? '공통' : locationToken;
  const sectionParts = [];
  const dayMatch = locationName.match(/\(([월화수목금토일])(?:요일)?\)$/);
  if (dayMatch) {
    sectionParts.push(DAY_LABELS[dayMatch[1]]);
    locationName = locationName.slice(0, dayMatch.index);
  }
  if (durationMatch && Number(durationMatch[1]) !== 12) {
    sectionParts.push(`${Number(durationMatch[1])}주`);
  }
  locationName = normalizeText(locationName);
  if (!locationName) {
    throw new Error(`장소를 확인할 수 없습니다: ${normalizedPath}`);
  }

  return {
    year,
    term,
    locationName,
    programName,
    sectionName: sectionParts.join(' · '),
  };
};

const splitMarkdownRow = (line) => {
  const source = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let current = '';
  let escaped = false;
  for (const character of source) {
    if (character === '|' && !escaped) {
      cells.push(current);
      current = '';
    } else {
      current += character;
    }
    escaped = character === '\\' && !escaped;
    if (character !== '\\') escaped = false;
  }
  cells.push(current);
  return cells;
};

const cleanMarkdownCell = (value) =>
  normalizeText(
    value
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/\*\*|__/g, '')
      .replace(/\\([\\`*{}\[\]()#+\-.!_>~|])/g, '$1'),
  );

const cleanDocumentCell = (value) =>
  value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\*\*|__/g, '')
    .replace(/\\([\\`*{}\[\]()#+\-.!_>~|])/g, '$1')
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/[ \t]+/g, ' '))
    .join('\n')
    .trim();

const normalizeLabel = (value) =>
  value.replace(/\s+/g, '').replace(/[()/]/g, '');

const TERM_LABELS = {
  spring: '봄학기',
  summer: '여름학기',
  fall: '가을학기',
  winter: '겨울학기',
};

const DEFAULT_NOTICE = '※ 사정상 수업의 순서는 바뀔 수 있습니다.';

export const parseDocumentFields = (markdown, metadata) => {
  const lines = markdown.split(/\r?\n/);
  const title = cleanDocumentCell(
    lines.find((line) => line.trim() && !line.trim().startsWith('|')) || '',
  );
  const notice = cleanDocumentCell(
    lines.find((line) => line.trim().startsWith('※')) || DEFAULT_NOTICE,
  );
  const rows = lines
    .filter((line) => line.trim().startsWith('|'))
    .map((line) => splitMarkdownRow(line).map(cleanDocumentCell))
    .filter(
      (cells) => !cells.every((cell) => !cell || /^:?-{3,}:?$/.test(cell)),
    );

  const findValue = (...labels) => {
    for (const cells of rows) {
      const index = cells.findIndex((cell) =>
        labels.some((label) => normalizeLabel(cell).includes(label)),
      );
      if (index === -1) continue;
      for (const value of cells.slice(index + 1)) {
        if (value && !labels.includes(normalizeLabel(value))) return value;
      }
      return '';
    }
    return '';
  };

  const courseName = findValue('강좌명') || metadata.programName;
  return {
    documentTitle:
      title || `${courseName} 강의계획서 - ${TERM_LABELS[metadata.term]}`,
    courseName,
    instructorName: findValue('강사명'),
    representativeProfile: findValue('대표프로필'),
    courseIntroduction: findValue('강좌소개'),
    audience: findValue('강의대상'),
    capacity: findValue('정원'),
    scheduleDetails: findValue('세부연령개월강의일정포함', '세부연령개월'),
    tuition: findValue('교육비'),
    materialFee: findValue('교재비'),
    openLecture: findValue('공개강좌'),
    notice,
  };
};

export const parseLessonWeeks = (markdown) => {
  const rows = new Map();
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = splitMarkdownRow(line).map(cleanMarkdownCell);
    const weekMatch = cells[0]?.match(/^(\d{1,2})\s*주$/);
    if (!weekMatch) continue;
    const week = Number(weekMatch[1]);
    if (week < 1 || week > 12) continue;
    if (rows.has(week)) throw new Error(`${week}주차가 중복되어 있습니다.`);

    const values = [];
    for (const cell of cells.slice(1)) {
      if (cell && values.at(-1) !== cell) values.push(cell);
    }
    rows.set(week, {
      week,
      className: values[0] || '',
      content: values[1] || '',
    });
  }
  if (rows.size === 0) throw new Error('주차별 강의 표를 찾지 못했습니다.');
  return Array.from(
    { length: 12 },
    (_, index) =>
      rows.get(index + 1) || { week: index + 1, className: '', content: '' },
  );
};

const csvCell = (value) => `"${String(value).replace(/"/g, '""')}"`;

const createReport = (plans) => {
  const header = [
    'sourcePath',
    'year',
    'term',
    'locationName',
    'programName',
    'sectionName',
    'completedWeeks',
    'warnings',
  ];
  const rows = plans.map((plan) => {
    const completedWeeks = plan.weeks.filter(
      (week) => week.className && week.content,
    ).length;
    const warnings = [];
    if (completedWeeks < 12) warnings.push(`${12 - completedWeeks}주 미작성`);
    return [
      plan.sourcePath,
      plan.year,
      plan.term,
      plan.locationName,
      plan.programName,
      plan.sectionName,
      completedWeeks,
      warnings.join(', '),
    ];
  });
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
};

export const extractLessonPlans = async (options) => {
  const files = await walkFiles(options.source);
  const hwpFiles = files.filter(
    (path) => extname(path).toLowerCase() === '.hwp',
  );
  const ignoredFiles = files
    .filter((path) => extname(path).toLowerCase() !== '.hwp')
    .map((path) => relativeNfcPath(options.source, path));
  const sources = [];
  for (const path of hwpFiles) {
    const bytes = await fs.readFile(path);
    sources.push({
      path,
      sourcePath: relativeNfcPath(options.source, path),
      sourceSha256: sha256(bytes),
      bytes,
    });
  }
  sources.sort((left, right) =>
    compareCodePoints(left.sourcePath, right.sourcePath),
  );
  const snapshotSha256 = sha256(
    sources
      .map((item) => `${item.sourcePath}\0${item.sourceSha256}\n`)
      .join(''),
  );
  if (sources.length !== options.expectedCount) {
    throw new Error(
      `HWP 파일 수가 변경되었습니다: 예상 ${options.expectedCount}, 현재 ${sources.length}`,
    );
  }
  if (snapshotSha256 !== options.expectedSnapshot) {
    throw new Error(`원본 스냅샷이 변경되었습니다: ${snapshotSha256}`);
  }

  const plans = [];
  for (const source of sources) {
    const metadata = parseSourceMetadata(source.sourcePath);
    const markdown = await hwpToMarkdown(new Uint8Array(source.bytes));
    plans.push({
      sourcePath: source.sourcePath,
      sourceSha256: source.sourceSha256,
      ...metadata,
      ...parseDocumentFields(markdown, metadata),
      weeks: parseLessonWeeks(markdown),
    });
  }

  const logicalKeys = new Set();
  for (const plan of plans) {
    const key = [
      plan.year,
      plan.term,
      plan.locationName,
      plan.programName,
      plan.sectionName,
    ].join('\0');
    if (logicalKeys.has(key)) {
      throw new Error(`계획서 고유키가 중복됩니다: ${plan.sourcePath}`);
    }
    logicalKeys.add(key);
  }

  const completedPlans = plans.filter((plan) =>
    plan.weeks.every((week) => week.className && week.content),
  ).length;
  const programCounts = Object.fromEntries(
    [...new Set(plans.map((plan) => plan.programName))]
      .sort((left, right) => left.localeCompare(right, 'ko'))
      .map((name) => [
        name,
        plans.filter((plan) => plan.programName === name).length,
      ]),
  );
  const manifestBody = {
    schemaVersion: 2,
    createdAt: new Date().toISOString(),
    source: {
      directoryName: basename(options.source).normalize('NFC'),
      fileCount: sources.length,
      snapshotSha256,
      ignoredFiles,
    },
    summary: {
      planCount: plans.length,
      locationCount: new Set(plans.map((plan) => plan.locationName)).size,
      completedPlanCount: completedPlans,
      draftPlanCount: plans.length - completedPlans,
      programCounts,
    },
    plans,
  };
  const manifest = {
    ...manifestBody,
    manifestSha256: sha256(JSON.stringify(manifestBody)),
  };
  return { manifest, report: createReport(plans) };
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const { manifest, report } = await extractLessonPlans(options);
  await fs.mkdir(dirname(options.output), { recursive: true });
  await fs.mkdir(dirname(options.report), { recursive: true });
  await fs.writeFile(options.output, `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(options.report, `${report}\n`);
  process.stdout.write(
    `${JSON.stringify(
      {
        manifest: options.output,
        report: options.report,
        source: manifest.source,
        summary: manifest.summary,
        manifestSha256: manifest.manifestSha256,
      },
      null,
      2,
    )}\n`,
  );
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
