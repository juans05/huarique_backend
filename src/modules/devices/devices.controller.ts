import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DevicesService } from './devices.service';
import { Device } from './entities/device.entity';
import { Place } from '../places/entities/place.entity';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';

// ── Endpoint público para que la página de scan sepa qué acción ejecutar ──
@ApiTags('devices')
@Controller('public/device')
export class PublicDeviceController {
  constructor(private devicesService: DevicesService) {}

  @Get(':deviceId')
  @ApiOperation({ summary: 'Get device action and placeId (public, no auth)' })
  async getPublicDevice(@Param('deviceId') deviceId: string) {
    const device = await this.devicesService.findById(deviceId);
    if (!device) throw new NotFoundException('Dispositivo no encontrado');
    return { action: device.action, placeId: device.placeId, name: device.name };
  }
}

@ApiTags('devices')
@ApiBearerAuth()
@Controller('business/places/:placeId/devices')
@UseGuards(JwtAuthGuard)
export class DevicesController {
  constructor(
    private devicesService: DevicesService,
    @InjectRepository(Place)
    private placesRepository: Repository<Place>,
  ) {}

  private async assertOwner(placeId: string, userId: string) {
    const place = await this.placesRepository.findOne({
      where: { id: placeId },
    });
    if (!place) {
      throw new NotFoundException('Local no encontrado');
    }
    if (place.claimedByUserId !== userId) {
      throw new ForbiddenException('No tienes permiso para gestionar este local');
    }
    return place;
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los dispositivos de un local' })
  async findAll(
    @Param('placeId') placeId: string,
    @CurrentUser() user: any,
  ): Promise<Device[]> {
    await this.assertOwner(placeId, user.id);
    return this.devicesService.findAll(placeId);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo dispositivo' })
  async create(
    @Param('placeId') placeId: string,
    @Body() dto: CreateDeviceDto,
    @CurrentUser() user: any,
  ): Promise<Device> {
    await this.assertOwner(placeId, user.id);
    return this.devicesService.create(placeId, dto);
  }

  @Patch(':deviceId')
  @ApiOperation({ summary: 'Actualizar un dispositivo' })
  async update(
    @Param('placeId') placeId: string,
    @Param('deviceId') deviceId: string,
    @Body() dto: UpdateDeviceDto,
    @CurrentUser() user: any,
  ): Promise<Device> {
    await this.assertOwner(placeId, user.id);
    const device = await this.devicesService.findOne(deviceId, placeId);
    if (!device) {
      throw new NotFoundException('Dispositivo no encontrado');
    }
    return this.devicesService.update(deviceId, placeId, dto);
  }

  @Delete(':deviceId')
  @ApiOperation({ summary: 'Eliminar un dispositivo' })
  async remove(
    @Param('placeId') placeId: string,
    @Param('deviceId') deviceId: string,
    @CurrentUser() user: any,
  ): Promise<{ message: string }> {
    await this.assertOwner(placeId, user.id);
    const device = await this.devicesService.findOne(deviceId, placeId);
    if (!device) {
      throw new NotFoundException('Dispositivo no encontrado');
    }
    await this.devicesService.remove(deviceId, placeId);
    return { message: 'Dispositivo eliminado correctamente' };
  }

  @Patch(':deviceId/sync')
  @ApiOperation({ summary: 'Marcar dispositivo como sincronizado' })
  async sync(
    @Param('placeId') placeId: string,
    @Param('deviceId') deviceId: string,
    @CurrentUser() user: any,
  ): Promise<Device> {
    await this.assertOwner(placeId, user.id);
    const device = await this.devicesService.findOne(deviceId, placeId);
    if (!device) {
      throw new NotFoundException('Dispositivo no encontrado');
    }
    return this.devicesService.syncDevice(deviceId, placeId);
  }
}
