import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ItemDetailView, ItemsService, ItemView } from './items.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { QueryItemsDto } from './dto/query-items.dto';
import { MANAGER_ROLES, Roles } from '../auth/roles.decorator';

@ApiTags('items')
@ApiBearerAuth()
@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  /** Any authenticated user — clerks need the catalog to record movements. */
  @Get()
  findAll(@Query() query: QueryItemsDto): Promise<ItemView[]> {
    return this.itemsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<ItemDetailView> {
    return this.itemsService.findOne(id);
  }

  @Roles(...MANAGER_ROLES)
  @Post()
  create(@Body() dto: CreateItemDto): Promise<ItemDetailView> {
    return this.itemsService.create(dto);
  }

  @Roles(...MANAGER_ROLES)
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateItemDto,
  ): Promise<ItemDetailView> {
    return this.itemsService.update(id, dto);
  }

  @Roles(...MANAGER_ROLES)
  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<{ id: string; deleted: true }> {
    return this.itemsService.remove(id);
  }
}
