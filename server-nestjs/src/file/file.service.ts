import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import { basename, isAbsolute, posix, relative, resolve, sep } from 'path';

@Injectable()
export class FileService {
  private readonly musicRoot = resolve(
    process.env.MUSIC_ROOT_PATH || resolve(__dirname, '../../music/songs'),
  );

  normalizeRelativePath(input: unknown, allowEmpty = false) {
    if (
      typeof input !== 'string' ||
      input.includes('\0') ||
      input.includes('\\')
    ) {
      throw new BadRequestException('올바르지 않은 음악 경로입니다.');
    }

    if (input === '' && allowEmpty) {
      return '';
    }

    if (input === '' || isAbsolute(input)) {
      throw new BadRequestException('올바르지 않은 음악 경로입니다.');
    }

    const segments = input.split('/');
    if (
      segments.some(
        (segment) => segment === '' || segment === '.' || segment === '..',
      )
    ) {
      throw new BadRequestException('올바르지 않은 음악 경로입니다.');
    }

    const normalized = posix.normalize(input);
    if (normalized !== input || normalized.startsWith('../')) {
      throw new BadRequestException('올바르지 않은 음악 경로입니다.');
    }

    return normalized;
  }

  private ensureInsideRoot(targetPath: string, rootPath = this.musicRoot) {
    const relativePath = relative(rootPath, targetPath);
    if (
      relativePath === '..' ||
      relativePath.startsWith(`..${sep}`) ||
      isAbsolute(relativePath)
    ) {
      throw new BadRequestException(
        '음악 폴더 밖의 경로는 사용할 수 없습니다.',
      );
    }
  }

  async resolveDirectory(input: unknown) {
    const normalized = this.normalizeRelativePath(input, true);
    const targetPath = resolve(
      this.musicRoot,
      ...normalized.split('/').filter(Boolean),
    );
    this.ensureInsideRoot(targetPath);

    try {
      const [realRoot, realTarget, stats] = await Promise.all([
        fs.realpath(this.musicRoot),
        fs.realpath(targetPath),
        fs.stat(targetPath),
      ]);
      this.ensureInsideRoot(realTarget, realRoot);
      if (!stats.isDirectory()) {
        throw new Error('not-directory');
      }
      return { normalized, path: realTarget };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new NotFoundException('디렉토리가 존재하지 않습니다.');
    }
  }

  async listDirectory(input: unknown) {
    const directory = await this.resolveDirectory(input);
    const entries = await fs.readdir(directory.path, { withFileTypes: true });
    return {
      directories: entries
        .filter((entry) => entry.isDirectory())
        .map(({ name }) => ({ name })),
      files: entries
        .filter(
          (entry) =>
            entry.isFile() &&
            entry.name !== '.DS_Store' &&
            entry.name !== '.gitkeep',
        )
        .map(({ name }) => ({ name })),
    };
  }

  async resolveMusicFile(input: unknown) {
    const normalized = this.normalizeRelativePath(input);
    const targetPath = resolve(this.musicRoot, ...normalized.split('/'));
    this.ensureInsideRoot(targetPath);

    try {
      const [realRoot, realTarget, stats] = await Promise.all([
        fs.realpath(this.musicRoot),
        fs.realpath(targetPath),
        fs.stat(targetPath),
      ]);
      this.ensureInsideRoot(realTarget, realRoot);
      if (!stats.isFile()) {
        throw new Error('not-file');
      }
      return { normalized, path: realTarget };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new NotFoundException('음악 파일이 존재하지 않습니다.');
    }
  }

  async isMusicFileAvailable(input: string) {
    try {
      await this.resolveMusicFile(input);
      return true;
    } catch (_error) {
      return false;
    }
  }

  async getFilesByKeyword(keyword: string) {
    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) {
      return [];
    }

    const results: string[] = [];
    const visit = async (directoryPath: string, relativePath: string) => {
      const entries = await fs.readdir(directoryPath, { withFileTypes: true });
      await Promise.all(
        entries.map(async (entry) => {
          const entryRelativePath = relativePath
            ? `${relativePath}/${entry.name}`
            : entry.name;
          const entryPath = resolve(directoryPath, entry.name);
          if (entry.isDirectory()) {
            await visit(entryPath, entryRelativePath);
          } else if (
            entry.isFile() &&
            entry.name !== '.DS_Store' &&
            entry.name !== '.gitkeep' &&
            entry.name.includes(trimmedKeyword)
          ) {
            results.push(entryRelativePath);
          }
        }),
      );
    };

    await visit(this.musicRoot, '');
    return results.sort((left, right) => left.localeCompare(right, 'ko'));
  }

  getFileName(path: string) {
    return basename(path);
  }
}
