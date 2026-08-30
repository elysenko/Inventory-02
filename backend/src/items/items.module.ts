import { Module } from '@nestjs/common';
import { ItemsController } from './items.controller';
import { StockLevelsController } from './stock-levels.controller';
import { ItemsService } from './items.service';

@Module({
  controllers: [ItemsController, StockLevelsController],
  providers: [ItemsService],
  exports: [ItemsService],
})
export class ItemsModule {}
