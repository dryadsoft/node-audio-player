import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { PlaylistService } from './playlist.service';
import { PlaylistDownloadService } from './playlist-download.service';

@Controller('api/playlists')
export class PlaylistController {
  constructor(
    private readonly playlistService: PlaylistService,
    private readonly playlistDownloadService: PlaylistDownloadService,
  ) {}

  @Get()
  list() {
    return this.playlistService.list();
  }

  @Post()
  create(@Body() body: { title?: unknown }) {
    return this.playlistService.create(body?.title);
  }

  @Patch(':playlistId')
  rename(
    @Param('playlistId') playlistId: string,
    @Body() body: { title?: unknown },
  ) {
    return this.playlistService.rename(playlistId, body?.title);
  }

  @Delete(':playlistId')
  @HttpCode(204)
  remove(@Param('playlistId') playlistId: string) {
    return this.playlistService.remove(playlistId);
  }

  @Post(':playlistId/tracks')
  addTrack(
    @Param('playlistId') playlistId: string,
    @Body() body: { path?: unknown },
  ) {
    return this.playlistService.addTrack(playlistId, body?.path);
  }

  @Delete(':playlistId/tracks')
  removeTrack(
    @Param('playlistId') playlistId: string,
    @Body() body: { path?: unknown },
  ) {
    return this.playlistService.removeTrack(playlistId, body?.path);
  }

  @Put(':playlistId/tracks/order')
  reorderTracks(
    @Param('playlistId') playlistId: string,
    @Body() body: { paths?: unknown },
  ) {
    return this.playlistService.reorderTracks(playlistId, body?.paths);
  }

  @Post(':playlistId/downloads')
  @HttpCode(HttpStatus.ACCEPTED)
  startDownload(@Param('playlistId') playlistId: string) {
    return this.playlistDownloadService.start(playlistId);
  }
}
