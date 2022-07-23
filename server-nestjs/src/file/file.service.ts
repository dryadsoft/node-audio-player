import { Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs, readdirSync } from 'fs';
import { join } from 'path';
import { IGetDirectorysProps } from 'src/api/api.interface';

@Injectable()
export class FileService {
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

  getFilesByKeyword(keyword: string) {
    const AssetRootPath = join(process.cwd(), `music/songs`);
    const rootAssetsFiles = readdirSync(AssetRootPath, {
      encoding: 'utf-8',
      withFileTypes: true,
    });
    const rootAssetsPostDirs = rootAssetsFiles
      .filter((obj) => obj[Object.getOwnPropertySymbols(obj)[0]] === 2)
      .map((directory) => `${directory.name}`);

    let postFiles = rootAssetsFiles
      .filter(
        (obj) =>
          obj[Object.getOwnPropertySymbols(obj)[0]] === 1 &&
          obj.name !== '.DS_Store' &&
          obj.name !== '.gitkeep' &&
          obj.name.includes(keyword),
      )
      .map((file) => file.name);

    const recursiveCall = (postDirectory) => {
      if (postDirectory.length > 0) {
        const directoryName = postDirectory[0];
        const filesAndAssetDirectoryByDirectoryName = readdirSync(
          join(AssetRootPath, directoryName),
          {
            encoding: 'utf-8',
            withFileTypes: true,
          },
        );
        const filteredDirectorys = filesAndAssetDirectoryByDirectoryName.filter(
          (obj) => obj[Object.getOwnPropertySymbols(obj)[0]] === 2,
        );
        const filteredFiles = filesAndAssetDirectoryByDirectoryName.filter(
          (obj) =>
            obj[Object.getOwnPropertySymbols(obj)[0]] === 1 &&
            obj.name !== '.DS_Store' &&
            obj.name !== '.gitkeep' &&
            obj.name.includes(keyword),
        );
        if (filteredFiles.length > 0) {
          postFiles = postFiles.concat(
            filteredFiles.map((file) => `${directoryName}/${file.name}`),
          );
        }
        postDirectory = postDirectory.concat(
          filteredDirectorys.map(
            (directory) => `${directoryName}/${directory.name}`,
          ),
        );
        recursiveCall(postDirectory.slice(1));
      }
    };
    recursiveCall(rootAssetsPostDirs);
    return postFiles;
  }
}
