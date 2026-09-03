import { Module } from '@nestjs/common';
import { LessonLocationController } from './lesson-location.controller';
import { LessonLocationService } from './lesson-location.service';
import { LessonCurriculumController } from './lesson-curriculum.controller';
import { LessonCurriculumService } from './lesson-curriculum.service';
import { LessonPlanDocumentService } from './lesson-plan-document.service';
import { LessonPlanController } from './lesson-plan.controller';
import { LessonPlanService } from './lesson-plan.service';

@Module({
  controllers: [
    LessonLocationController,
    LessonCurriculumController,
    LessonPlanController,
  ],
  providers: [
    LessonLocationService,
    LessonCurriculumService,
    LessonPlanService,
    LessonPlanDocumentService,
  ],
  exports: [LessonLocationService, LessonCurriculumService, LessonPlanService],
})
export class LessonPlanModule {}
