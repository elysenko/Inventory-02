import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AdminSettingsService, ServiceSettingsView } from './admin-settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { Roles } from '../auth/roles.decorator';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly settings: AdminSettingsService) {}

  @Get()
  list(): Promise<ServiceSettingsView[]> {
    return this.settings.list();
  }

  @Patch()
  update(@Body() dto: UpdateSettingsDto): Promise<ServiceSettingsView[]> {
    return this.settings.update(dto.settings);
  }
}
