import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MovementPage, MovementsService, MovementView } from './movements.service';
import { CreateMovementDto } from './dto/create-movement.dto';
import { QueryMovementsDto } from './dto/query-movements.dto';
import { MANAGER_ROLES, Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';

@ApiTags('movements')
@ApiBearerAuth()
@Controller('movements')
export class MovementsController {
  constructor(private readonly movementsService: MovementsService) {}

  /** Recording stock is the clerk's core job — any authenticated user may post. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateMovementDto, @CurrentUser() user: AuthUser): Promise<MovementView> {
    return this.movementsService.create(dto, user.userId);
  }

  /** The audit log is manager-level only. */
  @Roles(...MANAGER_ROLES)
  @Get()
  findAll(@Query() query: QueryMovementsDto): Promise<MovementPage> {
    return this.movementsService.findAll(query);
  }
}
