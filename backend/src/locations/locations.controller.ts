import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LocationsService, LocationView } from './locations.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { MANAGER_ROLES, Roles } from '../auth/roles.decorator';

@ApiTags('locations')
@ApiBearerAuth()
@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  /** Readable by any authenticated user — the movement form needs this list. */
  @Get()
  findAll(): Promise<LocationView[]> {
    return this.locationsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<LocationView> {
    return this.locationsService.findOne(id);
  }

  @Roles(...MANAGER_ROLES)
  @Post()
  create(@Body() dto: CreateLocationDto): Promise<LocationView> {
    return this.locationsService.create(dto);
  }

  @Roles(...MANAGER_ROLES)
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateLocationDto,
  ): Promise<LocationView> {
    return this.locationsService.update(id, dto);
  }

  @Roles(...MANAGER_ROLES)
  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<{ id: string; deleted: true }> {
    return this.locationsService.remove(id);
  }
}
