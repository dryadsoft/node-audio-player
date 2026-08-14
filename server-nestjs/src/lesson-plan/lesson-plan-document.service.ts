import { Injectable } from '@nestjs/common';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import { LessonPlanResponse, LessonTerm } from './lesson-plan.interface';
import { LessonPlanService } from './lesson-plan.service';

const TERM_LABELS: Record<LessonTerm, string> = {
  spring: '봄학기',
  summer: '여름학기',
  fall: '가을학기',
  winter: '겨울학기',
};

const COLUMN_WIDTHS = [1115, 1172, 1059, 945, 1285, 2894];
const TABLE_WIDTH = COLUMN_WIDTHS.reduce((sum, width) => sum + width, 0);
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const CELL_MARGINS = {
  marginUnitType: WidthType.DXA,
  top: 28,
  bottom: 28,
  left: 102,
  right: 102,
};

@Injectable()
export class LessonPlanDocumentService {
  constructor(private readonly plans: LessonPlanService) {}

  async create(planId: string) {
    const plan = this.plans.get(planId);
    const document = this.buildDocument(plan);
    return {
      buffer: await Packer.toBuffer(document),
      fileName: this.fileName(plan),
    };
  }

  buildDocument(plan: LessonPlanResponse) {
    const title =
      plan.documentTitle ||
      `${plan.courseName || plan.programName} 강의계획서 - ${
        TERM_LABELS[plan.term]
      }`;
    const rows = [
      this.row(
        [
          this.labelCell('강좌명', 0),
          this.valueCell(plan.courseName || plan.programName, 1, 1, true),
          this.labelCell('강사명', 2),
          this.valueCell(plan.instructorName, 3, 1, true),
          this.labelCell('대표 프로필', 4),
          this.valueCell(plan.representativeProfile, 5, 1, true),
        ],
        483,
      ),
      this.row(
        [
          this.labelCell('강좌 소개', 0),
          this.valueCell(plan.courseIntroduction, 1, 5, false),
        ],
        1532,
      ),
      this.row(
        [
          this.labelCell('강의 대상', 0),
          this.valueCell(plan.audience, 1, 1, true),
          this.labelCell('정원', 2),
          this.valueCell(plan.capacity, 3, 1, true),
          this.labelCell('세부 연령 / 개월\n(강의 일정 포함)', 4, 3),
          this.valueCell(plan.scheduleDetails, 5, 1, false, 3),
        ],
        610,
      ),
      this.row(
        [
          this.labelCell('교육비', 0),
          this.valueCell(plan.tuition, 1, 1, true),
          this.labelCell('교재비', 2),
          this.valueCell(plan.materialFee, 3, 1, true),
        ],
        496,
      ),
      this.row(
        [
          this.labelCell('공개강좌', 0),
          this.valueCell(plan.openLecture, 1, 3, false),
        ],
        836,
      ),
      this.row(
        [
          this.labelCell('일정', 0),
          this.labelCell('수업주제', 1, 1, 2),
          this.labelCell('수업내용', 3, 1, 3),
        ],
        709,
      ),
      ...plan.weeks.map((week) =>
        this.row(
          [
            this.labelCell(`${week.week}주`, 0),
            this.valueCell(week.className, 1, 2, true, 1, true),
            this.valueCell(week.content, 3, 3, false, 1, false, 16),
          ],
          596,
        ),
      ),
    ];

    const table = new Table({
      rows,
      width: { size: TABLE_WIDTH, type: WidthType.DXA },
      columnWidths: COLUMN_WIDTHS,
      layout: TableLayoutType.FIXED,
      margins: CELL_MARGINS,
      borders: {
        top: BORDER,
        bottom: BORDER,
        left: BORDER,
        right: BORDER,
        insideHorizontal: BORDER,
        insideVertical: BORDER,
      },
    });

    return new Document({
      creator: 'node-audio-player',
      title,
      description: `${plan.year}년 ${TERM_LABELS[plan.term]} ${
        plan.locationName
      } 강의계획서`,
      sections: [
        {
          properties: {
            page: {
              size: {
                width: 11906,
                height: 16838,
                orientation: PageOrientation.PORTRAIT,
              },
              margin: {
                top: 1134,
                right: 1701,
                bottom: 850,
                left: 1701,
                header: 850,
                footer: 850,
              },
            },
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 140, line: 320 },
              children: [
                new TextRun({
                  text: title,
                  font: '옥수수',
                  size: 30,
                }),
              ],
            }),
            table,
            new Paragraph({
              alignment: AlignmentType.LEFT,
              spacing: { before: 80, line: 240 },
              children: [
                new TextRun({
                  text: plan.notice,
                  font: '한양신명조',
                  size: 18,
                }),
              ],
            }),
          ],
        },
      ],
    });
  }

  private row(cells: TableCell[], height: number) {
    return new TableRow({
      children: cells,
      cantSplit: true,
      height: { value: height, rule: HeightRule.ATLEAST },
    });
  }

  private labelCell(
    text: string,
    column: number,
    rowSpan = 1,
    columnSpan = 1,
    fontSize = 20,
  ) {
    return this.cell({
      text,
      column,
      columnSpan,
      rowSpan,
      alignment: AlignmentType.CENTER,
      font: '옥수수',
      fontSize,
      shading: 'D6D6D6',
    });
  }

  private valueCell(
    text: string,
    column: number,
    columnSpan = 1,
    centered = false,
    rowSpan = 1,
    bold = false,
    fontSize = 20,
  ) {
    return this.cell({
      text,
      column,
      columnSpan,
      rowSpan,
      alignment: centered ? AlignmentType.CENTER : AlignmentType.LEFT,
      font: '한양신명조',
      fontSize,
      bold,
    });
  }

  private cell(options: {
    text: string;
    column: number;
    columnSpan: number;
    rowSpan: number;
    alignment: typeof AlignmentType[keyof typeof AlignmentType];
    font: string;
    fontSize: number;
    bold?: boolean;
    shading?: string;
  }) {
    const width = COLUMN_WIDTHS.slice(
      options.column,
      options.column + options.columnSpan,
    ).reduce((sum, value) => sum + value, 0);
    const lines = (options.text || '').split('\n');
    return new TableCell({
      width: { size: width, type: WidthType.DXA },
      columnSpan: options.columnSpan,
      rowSpan: options.rowSpan,
      margins: CELL_MARGINS,
      verticalAlign: VerticalAlign.CENTER,
      shading: options.shading
        ? {
            fill: options.shading,
            color: 'auto',
            type: ShadingType.CLEAR,
          }
        : undefined,
      borders: {
        top: BORDER,
        bottom: BORDER,
        left: BORDER,
        right: BORDER,
      },
      children: lines.map(
        (line) =>
          new Paragraph({
            alignment: options.alignment,
            spacing: { before: 0, after: 0, line: 240 },
            children: [
              new TextRun({
                text: line,
                font: options.font,
                size: options.fontSize,
                bold: options.bold,
              }),
            ],
          }),
      ),
    });
  }

  private fileName(plan: LessonPlanResponse) {
    const parts = [
      String(plan.year),
      TERM_LABELS[plan.term],
      plan.programName,
      plan.locationName,
      plan.sectionName,
      '강의계획서',
    ].filter(Boolean);
    return `${parts
      .join('_')
      .normalize('NFC')
      .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '-')
      .replace(/\s+/g, ' ')
      .slice(0, 180)}.docx`;
  }
}
