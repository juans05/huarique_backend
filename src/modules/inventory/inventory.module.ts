import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { TeamModule } from '../team/team.module';
import { Dish } from '../places/entities/dish.entity';
import { InventoryItem, InventoryMovement, RecipeItem, Supplier } from './entities/inventory.entity';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';

@Module({
    imports: [TypeOrmModule.forFeature([InventoryItem, InventoryMovement, Supplier, RecipeItem, Dish]), TeamModule, AuthModule],
    controllers: [InventoryController],
    providers: [InventoryService],
    exports: [InventoryService],
})
export class InventoryModule { }
