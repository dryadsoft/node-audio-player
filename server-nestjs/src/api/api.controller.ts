import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiService } from './api.service';

@Controller('api')
export class ApiController {
  constructor(private readonly apiService: ApiService) {}
  @Get('connection')
  @Header('Cache-Control', 'no-store')
  connection() {
    return { ok: true };
  }

  @Get('playlist')
  playList(@Query('dir') dir: string) {
    return this.apiService.playList(dir);
  }

  @Get('search')
  search(@Query('keyword') keyword: string) {
    return this.apiService.search(keyword);
  }
}
