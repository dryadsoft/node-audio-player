import { Module } from '@nestjs/common';
import { FileModule } from '../file/file.module';
import { ApiController } from './api.controller';
import { ApiService } from './api.service';

@Module({
  imports: [FileModule],
  controllers: [ApiController],
  providers: [ApiService],
})
export class ApiModule {}
