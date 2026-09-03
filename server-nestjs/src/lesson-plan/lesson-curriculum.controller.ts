import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { LessonCurriculumService } from './lesson-curriculum.service';

@Controller('api/lesson-curricula')
export class LessonCurriculumController {
  constructor(private readonly curricula: LessonCurriculumService) {}

  @Get()
  list(
    @Query('year') year?: string,
    @Query('term') term?: string,
    @Query('programName') programName?: string,
  ) {
    return this.curricula.list({ year, term, programName });
  }

  @Get(':curriculumId')
  get(@Param('curriculumId') curriculumId: string) {
    return this.curricula.get(curriculumId);
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.curricula.create(body || {});
  }

  @Get(':curriculumId/weeks/:week')
  getWeek(
    @Param('curriculumId') curriculumId: string,
    @Param('week') week: string,
  ) {
    return this.curricula.getWeek(curriculumId, week);
  }

  @Put(':curriculumId/weeks/:week')
  updateWeek(
    @Param('curriculumId') curriculumId: string,
    @Param('week') week: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.curricula.updateWeek(curriculumId, week, body || {});
  }
}
