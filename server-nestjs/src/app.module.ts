import { AuthModule } from './auth/auth.module';
import { AttendanceModule } from './attendance/attendance.module';
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
    AuthModule,
    ServeStaticModule.forRootAsync({
      useFactory: () => [{
        rootPath: process.env.MUSIC_ROOT_PATH || join(__dirname, '..', 'music', 'songs'),
        serveRoot: '/songs',
        serveStaticOptions: { index: false, dotfiles: 'deny', setHeaders: (res) => res.setHeader('Cache-Control', 'private, no-store') },
      }],
    }),
    AttendanceModule,
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
