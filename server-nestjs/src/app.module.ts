import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ApiModule } from './api/api.module';
import { AudioModule } from './audio/audio.module';
import { CommonModule } from './common/common.module';
import { DatabaseModule } from './database/database.module';
import { FileModule } from './file/file.module';
import { LessonPlanModule } from './lesson-plan/lesson-plan.module';
import { PlaylistModule } from './playlist/playlist.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'music'),
    }),
    ApiModule,
    AudioModule,
    CommonModule,
    DatabaseModule,
    FileModule,
    LessonPlanModule,
    PlaylistModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
