import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseLessonWeeks,
  parseSourceMetadata,
} from './extract-lesson-plans.mjs';

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
