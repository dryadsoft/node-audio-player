import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AttendanceService } from './attendance.service';
@Controller('api/attendance')
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}
  @Get('snapshot') snapshot(
    @Query('year') year: string,
    @Query('term') term: string,
  ) {
    return this.service.snapshot(year, term);
  }
  @Put('centers') center(@Body() body: any) {
    return this.service.saveCenter(body || {});
  }
  @Post('periods') period(@Body() body: any) {
    return this.service.createPeriod(body || {});
  }
  @Patch('periods/:id') periodChange(
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.service.updatePeriod(id, body || {});
  }
  @Get('pages/:id') page(@Param('id') id: string) {
    return this.service.getPage(id);
  }
  @Patch('pages/:id') pageChange(@Param('id') id: string, @Body() body: any) {
    return this.service.updatePage(id, body || {});
  }
  @Put('pages/:id/note')
  note(@Param('id') id: string, @Body() body: any) {
    return this.service.createNote(id, body || {});
  }
  @Put('pages/:id/photo')
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: {
        fileSize: 8 * 1024 * 1024,
        files: 1,
        fields: 1,
        fieldSize: 1024,
      },
    }),
  )
  upload(
    @Param('id') id: string,
    @Body('periodId') periodId: string,
    @UploadedFile() file: any,
  ) {
    return this.service.upload(id, periodId, file);
  }
  @Get('pages/:id/photo') async photo(
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const bytes = await this.service.photo(id);
    response
      .set({
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(bytes);
  }
}
