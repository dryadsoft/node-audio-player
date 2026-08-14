import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseDocumentFields,
  parseLessonWeeks,
  parseSourceMetadata,
} from './extract-lesson-plans.mjs';

test('extracts legacy document header fields and notice', () => {
  const fields = parseDocumentFields(
    `오감별 강의계획서 - 봄학기(상상놀이터! 오감별)

| 강좌명 | 오감별 / &Gym | 강사명 | 홍길동 | 대표 프로필 | 오감별 대표 |
| --- | --- | --- | --- | --- | --- |
| 강좌 소개 | 첫째 줄<br>둘째 줄 | 첫째 줄<br>둘째 줄 | 첫째 줄<br>둘째 줄 | 첫째 줄<br>둘째 줄 | 첫째 줄<br>둘째 줄 |
| 강의 대상 | 베이비 엔 토들러 | 정원 | 12명 | 세부 연령 / 개월 (강의 일정 포함) | 10:00 ~ 10:40 5 ~ 12개월 |
| 교육비 | 110,000원 | 교재비 | 30,000원 | | |
| 공개강좌 | 3월 2일 | | | | |

※ 사정상 수업의 순서는 변경될 수 있습니다.`,
    { programName: '오감별', term: 'spring' },
  );

  assert.deepEqual(fields, {
    documentTitle: '오감별 강의계획서 - 봄학기(상상놀이터! 오감별)',
    courseName: '오감별 / &Gym',
    instructorName: '홍길동',
    representativeProfile: '오감별 대표',
    courseIntroduction: '첫째 줄\n둘째 줄',
    audience: '베이비 엔 토들러',
    capacity: '12명',
    scheduleDetails: '10:00 ~ 10:40 5 ~ 12개월',
    tuition: '110,000원',
    materialFee: '30,000원',
    openLecture: '3월 2일',
    notice: '※ 사정상 수업의 순서는 변경될 수 있습니다.',
  });
});

test('parses folder, program, place, weekday, and duration metadata', () => {
  assert.deepEqual(
    parseSourceMetadata(
      '2020_강의계획서/01.봄학기/(8주)오감별_봄_강의계획서_건대점(월요일).hwp',
    ),
    {
      year: 2020,
      term: 'spring',
      locationName: '건대점',
      programName: '오감별',
      sectionName: '월요일 · 8주',
    },
  );
});

test('uses 공통 for a plan without a location suffix', () => {
  assert.deepEqual(
    parseSourceMetadata(
      '2026_강의계획서/03.가을학기/오감별_가을_강의계획서.hwp',
    ),
    {
      year: 2026,
      term: 'fall',
      locationName: '공통',
      programName: '오감별',
      sectionName: '',
    },
  );
});

test('collapses merged table cells and fills missing weeks', () => {
  const weeks = parseLessonWeeks(`
| 일정 | 수업주제 | 수업주제 | 수업내용 | 수업내용 |
| --- | --- | --- | --- | --- |
| 1주 | **나비별** | **나비별** | 나비 놀이 | 나비 놀이 |
| 2주 | 소리별 | 소리별 | 악기 놀이 | 악기 놀이 |
`);
  assert.equal(weeks.length, 12);
  assert.deepEqual(weeks[0], {
    week: 1,
    className: '나비별',
    content: '나비 놀이',
  });
  assert.deepEqual(weeks[11], { week: 12, className: '', content: '' });
});

test('keeps subject-only legacy rows as draft content', () => {
  const weeks = parseLessonWeeks(`
| 일정 | 수업주제 | 수업주제 |
| --- | --- | --- |
| 1주 | 탐정 놀이 | 탐정 놀이 |
`);
  assert.deepEqual(weeks[0], {
    week: 1,
    className: '탐정 놀이',
    content: '',
  });
});
