import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AudioService } from './audio.service';

@Controller('api/audio')
export class AudioController {
  constructor(private readonly audioService: AudioService) {}

  @Get()
  async stream(@Query('path') path: string, @Res() response: Response) {
    const cachedAudio = await this.audioService.getPlayableFile(path);

    response.set({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      'Content-Type': 'audio/mpeg',
    });
    return response.sendFile(cachedAudio.path);
  }
}
