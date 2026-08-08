import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FileService } from '../file/file.service';
import { ApiService } from './api.service';

describe('ApiService', () => {
  let service: ApiService;
  let fileService: {
    listDirectory: jest.Mock;
    getFilesByKeyword: jest.Mock;
  };

  beforeEach(async () => {
    fileService = {
      listDirectory: jest.fn(),
      getFilesByKeyword: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiService,
        {
          provide: FileService,
          useValue: fileService,
        },
      ],
    }).compile();

    service = module.get<ApiService>(ApiService);
  });

  it('returns the requested directory and its entries', async () => {
    fileService.listDirectory.mockResolvedValue({
      directories: [{ name: '가' }],
      files: [{ name: '첫 곡.mp3' }],
    });

    await expect(service.playList('수업 음악')).resolves.toEqual({
      directory: [{ name: '가' }],
      playlist: [{ name: '첫 곡.mp3' }],
    });
  });

  it('propagates directory lookup errors', async () => {
    fileService.listDirectory.mockRejectedValue(
      new NotFoundException('디렉토리가 존재하지 않습니다.'),
    );

    await expect(service.playList('없는 폴더')).rejects.toThrow(
      '디렉토리가 존재하지 않습니다.',
    );
  });

  it('delegates search to FileService', async () => {
    fileService.getFilesByKeyword.mockResolvedValue(['수업 음악/첫 곡.mp3']);

    await expect(service.search('첫 곡')).resolves.toEqual([
      '수업 음악/첫 곡.mp3',
    ]);
    expect(fileService.getFilesByKeyword).toHaveBeenCalledWith('첫 곡');
  });
});
