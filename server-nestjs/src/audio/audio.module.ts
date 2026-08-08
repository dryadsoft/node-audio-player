import { Module } from '@nestjs/common';
import { FileModule } from '../file/file.module';
import { AudioController } from './audio.controller';
import { AudioService } from './audio.service';
import { FfmpegService } from './ffmpeg.service';

@Module({
  imports: [FileModule],
  controllers: [AudioController],
  providers: [AudioService, FfmpegService],
})
export class AudioModule {}
