import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsBoolean, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlaceRoleGuard } from '../../common/guards/place-role.guard';
import { RequiresPlaceRole } from '../../common/decorators/requires-place-role.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlaceTeamService } from '../team/place-team.service';
import { InventoryService } from './inventory.service';
import type { MovementType } from './entities/inventory.entity';

const MERMA_REASONS = ['QUEMADO', 'VENCIDO', 'DERRAME', 'DEVOLUCION', 'ERROR_COMANDA', 'CONTAMINACION', 'OTRO'] as const;

export class ItemDto {
    @IsString() @MinLength(1) @MaxLength(150) name: string;
    @IsOptional() @IsString() @MaxLength(20) code?: string;
    @IsOptional() @IsString() @MaxLength(80) category?: string | null;
    @IsOptional() @IsString() @MaxLength(12) unit?: string;
    /** Solo al crear: stock inicial (queda en el kardex como ingreso). */
    @IsOptional() @IsNumber() @Min(0) @Max(1e9) stock?: number;
    @IsOptional() @IsNumber() @Min(0) @Max(1e9) minStock?: number;
    /** Céntimos por unidad. */
    @IsOptional() @IsInt() @Min(0) @Max(100_000_000) unitCost?: number;
    @IsOptional() @IsUUID() supplierId?: string | null;
    @IsOptional() @IsBoolean() active?: boolean;
}

export class IngresoDto {
    @IsUUID() itemId: string;
    @IsNumber() @Min(0.001) @Max(1e9) quantity: number;
    @IsOptional() @IsInt() @Min(0) @Max(100_000_000) unitCost?: number;
    @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class AjusteDto {
    @IsUUID() itemId: string;
    @IsNumber() @Min(0) @Max(1e9) counted: number;
    @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class MermaDto {
    @IsOptional() @IsUUID() itemId?: string;
    @IsOptional() @IsUUID() dishId?: string;
    @IsNumber() @Min(0.001) @Max(1e6) quantity: number;
    @IsIn(MERMA_REASONS) mermaReason: (typeof MERMA_REASONS)[number];
    @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class SupplierDto {
    @IsString() @MinLength(1) @MaxLength(150) name: string;
    @IsOptional() @Matches(/^\d{11}$/, { message: 'El RUC tiene 11 dígitos' }) ruc?: string | null;
    @IsOptional() @IsString() @MaxLength(80) category?: string | null;
    @IsOptional() @IsString() @MaxLength(120) contactName?: string | null;
    @IsOptional() @IsString() @MaxLength(30) phone?: string | null;
    @IsOptional() @IsEmail() email?: string | null;
    @IsOptional() @IsString() @MaxLength(300) notes?: string | null;
}

export class RecipeLineDto {
    @IsUUID() itemId: string;
    @IsNumber() @Min(0.001) @Max(1e6) quantity: number;
}

export class RecipeDto {
    @ValidateNested({ each: true }) @Type(() => RecipeLineDto) @ArrayMaxSize(60) lines: RecipeLineDto[];
}

/** Inventario del local. Cocina puede ver y registrar mermas; el resto lo gestiona el supervisor o admin. */
@UseGuards(JwtAuthGuard, PlaceRoleGuard)
@Controller('business/places/:placeId/inventory')
export class InventoryController {
    constructor(private inventory: InventoryService, private team: PlaceTeamService) { }

    @Get()
    @RequiresPlaceRole('cocina')
    async overview(@Param('placeId') placeId: string) {
        await this.team.assertPlaceTier(placeId, 'reputacion');
        return this.inventory.overview(placeId);
    }

    @Post('items')
    @RequiresPlaceRole('supervisor')
    async createItem(@Param('placeId') placeId: string, @Body() dto: ItemDto) {
        await this.team.assertPlaceTier(placeId, 'reputacion');
        return this.inventory.saveItem(placeId, null, dto);
    }

    @Patch('items/:id')
    @RequiresPlaceRole('supervisor')
    async updateItem(@Param('placeId') placeId: string, @Param('id') id: string, @Body() dto: ItemDto) {
        await this.team.assertPlaceTier(placeId, 'reputacion');
        return this.inventory.saveItem(placeId, id, dto);
    }

    @Post('ingresos')
    @RequiresPlaceRole('supervisor')
    async ingreso(@Param('placeId') placeId: string, @Body() dto: IngresoDto, @CurrentUser() user: any) {
        await this.team.assertPlaceTier(placeId, 'reputacion');
        return this.inventory.ingreso(placeId, user.id, dto);
    }

    @Post('ajustes')
    @RequiresPlaceRole('supervisor')
    async ajuste(@Param('placeId') placeId: string, @Body() dto: AjusteDto, @CurrentUser() user: any) {
        await this.team.assertPlaceTier(placeId, 'reputacion');
        return this.inventory.ajuste(placeId, user.id, dto);
    }

    @Post('mermas')
    @RequiresPlaceRole('cocina')
    async merma(@Param('placeId') placeId: string, @Body() dto: MermaDto, @CurrentUser() user: any) {
        await this.team.assertPlaceTier(placeId, 'reputacion');
        return this.inventory.merma(placeId, user.id, dto);
    }

    @Get('kardex')
    @RequiresPlaceRole('cocina')
    async kardex(@Param('placeId') placeId: string, @Query('type') type?: MovementType) {
        await this.team.assertPlaceTier(placeId, 'reputacion');
        return this.inventory.kardex(placeId, ['INGRESO', 'VENTA', 'COCINA', 'MERMA', 'AJUSTE'].includes(type ?? '') ? type : undefined);
    }

    @Get('suppliers')
    @RequiresPlaceRole('supervisor')
    async suppliers(@Param('placeId') placeId: string) {
        await this.team.assertPlaceTier(placeId, 'reputacion');
        return this.inventory.suppliers(placeId);
    }

    @Post('suppliers')
    @RequiresPlaceRole('supervisor')
    async createSupplier(@Param('placeId') placeId: string, @Body() dto: SupplierDto) {
        await this.team.assertPlaceTier(placeId, 'reputacion');
        return this.inventory.saveSupplier(placeId, null, dto);
    }

    @Patch('suppliers/:id')
    @RequiresPlaceRole('supervisor')
    async updateSupplier(@Param('placeId') placeId: string, @Param('id') id: string, @Body() dto: SupplierDto) {
        await this.team.assertPlaceTier(placeId, 'reputacion');
        return this.inventory.saveSupplier(placeId, id, dto);
    }

    @Get('recipes')
    @RequiresPlaceRole('cocina')
    async recipes(@Param('placeId') placeId: string) {
        await this.team.assertPlaceTier(placeId, 'reputacion');
        return this.inventory.recipes(placeId);
    }

    @Put('recipes/:dishId')
    @RequiresPlaceRole('supervisor')
    async setRecipe(@Param('placeId') placeId: string, @Param('dishId') dishId: string, @Body() dto: RecipeDto) {
        await this.team.assertPlaceTier(placeId, 'reputacion');
        return this.inventory.setRecipe(placeId, dishId, dto.lines);
    }
}
