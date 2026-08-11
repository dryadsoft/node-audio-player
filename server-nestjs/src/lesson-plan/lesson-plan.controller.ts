import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { LessonPlanService } from './lesson-plan.service';

@Controller('api/lesson-plans')
export class LessonPlanController {
  constructor(private readonly plans: LessonPlanService) {}

  @Get()
  list(
    @Query('year') year?: string,
    @Query('term') term?: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.plans.list({ year, term, locationId });
  }

  @Get(':planId')
  get(@Param('planId') planId: string) {
    return this.plans.get(planId);
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
