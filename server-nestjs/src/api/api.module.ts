import { Module } from '@nestjs/common';
import { FileService } from 'src/file/file.service';
import { ApiController } from './api.controller';
import { ApiService } from './api.service';

@Module({
  controllers: [ApiController],
  providers: [ApiService, FileService],
})
export class ApiModule {}
