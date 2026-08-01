import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ApiModule } from './api/api.module';
import { CommonModule } from './common/common.module';
import { FileModule } from './file/file.module';
import { PlaylistModule } from './playlist/playlist.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'music'),
    }),
    ApiModule,
    CommonModule,
    FileModule,
    PlaylistModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
