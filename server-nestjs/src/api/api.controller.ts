import { Controller, Get, Query } from '@nestjs/common';
import { ApiService } from './api.service';

@Controller('api')
export class ApiController {
  constructor(private readonly apiService: ApiService) {}
  @Get('playlist')
  playList(@Query('dir') dir: string) {
    return this.apiService.playList(dir);
  }

  @Get('search')
  search(@Query('keyword') keyword: string) {
    return this.apiService.search(keyword);
  }
}
