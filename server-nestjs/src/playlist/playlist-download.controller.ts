import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { PlaylistDownloadService } from './playlist-download.service';

@Controller('api/playlist-downloads')
export class PlaylistDownloadController {
  constructor(
    private readonly playlistDownloadService: PlaylistDownloadService,
  ) {}

  @Get(':downloadId')
  status(@Param('downloadId') downloadId: string) {
    return this.playlistDownloadService.status(downloadId);
  }

  @Get(':downloadId/file')
  async file(
    @Param('downloadId') downloadId: string,
    @Res() response: Response,
  ) {
    const file = await this.playlistDownloadService.getFile(downloadId);
    response.set({
      'Cache-Control': 'private, no-store',
      'X-Accel-Buffering': 'no',
    });
    return new Promise<void>((resolvePromise, reject) => {
      response.download(file.path, file.fileName, (error) => {
        if (error) {
          if (!response.headersSent) {
            reject(error);
            return;
          }
          resolvePromise();
          return;
        }
        void this.playlistDownloadService
          .consume(downloadId)
          .finally(resolvePromise);
      });
    });
  }
}
