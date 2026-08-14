import { Module } from '@nestjs/common';
import { LessonLocationController } from './lesson-location.controller';
import { LessonLocationService } from './lesson-location.service';
import { LessonPlanDocumentService } from './lesson-plan-document.service';
import { LessonPlanController } from './lesson-plan.controller';
import { LessonPlanService } from './lesson-plan.service';

@Module({
  controllers: [LessonLocationController, LessonPlanController],
  providers: [
    LessonLocationService,
    LessonPlanService,
    LessonPlanDocumentService,
  ],
  exports: [LessonLocationService, LessonPlanService],
})
export class LessonPlanModule {}
