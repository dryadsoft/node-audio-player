import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { LessonPlanDocumentService } from './lesson-plan-document.service';
import { LessonPlanService } from './lesson-plan.service';

@Controller('api/lesson-plans')
export class LessonPlanController {
  constructor(
    private readonly plans: LessonPlanService,
    private readonly documents: LessonPlanDocumentService,
  ) {}

  @Get()
  list(
    @Query('year') year?: string,
    @Query('term') term?: string,
    @Query('locationId') locationId?: string,
    @Query('programName') programName?: string,
  ) {
    return this.plans.list({ year, term, locationId, programName });
  }

  @Get(':planId')
  get(@Param('planId') planId: string) {
    return this.plans.get(planId);
  }

  @Get(':planId/docx')
  async docx(@Param('planId') planId: string, @Res() response: Response) {
    const document = await this.documents.create(planId);
    const encodedName = encodeURIComponent(document.fileName).replace(
      /'/g,
      '%27',
    );
    response.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="lesson-plan.docx"; filename*=UTF-8''${encodedName}`,
      'Content-Length': String(document.buffer.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.send(document.buffer);
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.plans.create(body || {});
  }

  @Put(':planId')
  update(
    @Param('planId') planId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.plans.update(planId, body || {});
  }
}
