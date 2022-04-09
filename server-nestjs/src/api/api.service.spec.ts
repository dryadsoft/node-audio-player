import { NotFoundException } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundError } from 'rxjs';
import { ApiService } from './api.service';

describe('ApiService', () => {
  let service: ApiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApiService],
    }).compile();

    service = module.get<ApiService>(ApiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
  describe('playlist', () => {
    it('should return an Object', () => {
      const result = service.playList('');
      expect(result).toBeInstanceOf(Object);
    });
    it('should throw 404 not found', async () => {
      try {
        await service.playList('aaa');
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundException);
        expect(err.message).toEqual('디렉토리가 존재하지 않습니다.');
      }
    });
  });
});
