import { Injectable } from '@nestjs/common';
import { join } from 'path';

import { FileService } from 'src/file/file.service';

const BASIC_MUSIC_PATH = '../../music/songs';

@Injectable()
export class ApiService {
  constructor(private readonly fileService: FileService) {}

  async playList(dir: string) {
    let musicPath = BASIC_MUSIC_PATH;
    if (dir !== '') {
      musicPath = `${musicPath}/${dir}`;
    }

    const dirs = await this.fileService.getDirectorys({
      path: join(__dirname, musicPath),
      type: 'd',
    });
    const files = await this.fileService.getDirectorys({
      path: join(__dirname, musicPath),
      type: 'f',
    });

    return {
      directory: dir === '00.오감별 수업 음악' ? dirs.reverse() : dirs,
      playlist: files.filter((music) => music.name !== '.gitkeep'),
    };
  }

  search(keyword: string) {
    return this.fileService.getFilesByKeyword(decodeURIComponent(keyword));
  }
}
