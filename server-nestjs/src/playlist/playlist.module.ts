import { Module } from '@nestjs/common';
import { AudioModule } from '../audio/audio.module';
import { FileModule } from '../file/file.module';
import { PlaylistDownloadController } from './playlist-download.controller';
import { PlaylistDownloadService } from './playlist-download.service';
import { PlaylistController } from './playlist.controller';
import { PlaylistService } from './playlist.service';

@Module({
  imports: [FileModule, AudioModule],
  controllers: [PlaylistController, PlaylistDownloadController],
  providers: [PlaylistService, PlaylistDownloadService],
})
export class PlaylistModule {}
