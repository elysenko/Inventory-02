import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LowStockRow, ReportsService } from './reports.service';
import { MANAGER_ROLES, Roles } from '../auth/roles.decorator';

@ApiTags('reports')
@ApiBearerAuth()
@Roles(...MANAGER_ROLES)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('low-stock')
  lowStock(@Query('sort') sort?: string): Promise<LowStockRow[]> {
    return this.reportsService.lowStock(sort);
  }
}
