import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { LessonLocationService } from './lesson-location.service';

@Controller('api/lesson-locations')
export class LessonLocationController {
  constructor(private readonly locations: LessonLocationService) {}

  @Get()
  list(@Query('includeInactive') includeInactive?: string) {
    return this.locations.list(includeInactive === 'true');
  }

  @Post()
  create(@Body() body: { name?: unknown }) {
    return this.locations.create(body?.name);
  }

  @Patch(':locationId')
  update(
    @Param('locationId') locationId: string,
    @Body() body: { name?: unknown; active?: unknown },
  ) {
    return this.locations.update(locationId, body || {});
  }
}
