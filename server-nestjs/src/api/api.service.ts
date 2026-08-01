import { Injectable } from '@nestjs/common';
import { FileService } from '../file/file.service';

@Injectable()
export class ApiService {
  constructor(private readonly fileService: FileService) {}

  async playList(dir = '') {
    const { directories, files } = await this.fileService.listDirectory(dir);

    return {
      directory: dir.includes('00.오감별 수업 음악')
        ? directories.reverse()
        : directories,
      playlist: files,
    };
  }

  search(keyword: string) {
    return this.fileService.getFilesByKeyword(keyword || '');
  }
}
