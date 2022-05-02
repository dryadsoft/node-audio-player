import { Injectable, NotFoundException } from '@nestjs/common';
import { IGetDirectorysProps } from './api.interface';
import { promises as fs } from 'fs';
import { join } from 'path';

const BASIC_MUSIC_PATH = '../../music/songs';

@Injectable()
export class ApiService {
  async playList(dir: string) {
    let musicPath = BASIC_MUSIC_PATH;
    if (dir !== '') {
      musicPath = `${musicPath}/${dir}`;
    }

    const dirs = await this.getDirectorys({
      path: join(__dirname, musicPath),
      type: 'd',
    });
    const files = await this.getDirectorys({
      path: join(__dirname, musicPath),
      type: 'f',
    });

    return {
      directory: dir === '00.오감별 수업 음악' ? dirs.reverse() : dirs,
      playlist: files.filter((music) => music.name !== '.gitkeep'),
    };
  }

  async getDirectorys({ path, type }: IGetDirectorysProps) {
    try {
      const types = { f: 1, d: 2 };
      const dirs = await fs.readdir(path, {
        encoding: 'utf-8',
        withFileTypes: true,
      });

      const filteredDirectorys = dirs.filter(
        (obj: any) => obj[Object.getOwnPropertySymbols(obj)[0]] === types[type],
      );
      return filteredDirectorys;
    } catch (err) {
      throw new NotFoundException('디렉토리가 존재하지 않습니다.');
    }
  }
}
