import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from './entities/device.entity';
import { DeviceRequest, DeviceRequestStatus, TAP_UNIT_PRICE } from './entities/device-request.entity';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { CreateDeviceRequestDto } from './dto/create-device-request.dto';

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device)
    private devicesRepository: Repository<Device>,
    @InjectRepository(DeviceRequest)
    private deviceRequestsRepository: Repository<DeviceRequest>,
  ) {}

  async findAll(placeId: string): Promise<Device[]> {
    return this.devicesRepository.find({
      where: { placeId },
      order: { createdAt: 'ASC' },
    });
  }

  async findOne(id: string, placeId: string): Promise<Device> {
    return this.devicesRepository.findOne({ where: { id, placeId } });
  }

  async findById(id: string): Promise<Device | null> {
    return this.devicesRepository.findOne({ where: { id } });
  }

  async create(placeId: string, dto: CreateDeviceDto): Promise<Device> {
    const device = this.devicesRepository.create({
      ...dto,
      placeId,
    });
    return this.devicesRepository.save(device);
  }

  async update(id: string, placeId: string, dto: UpdateDeviceDto): Promise<Device> {
    await this.devicesRepository.update(
      { id, placeId },
      dto,
    );
    return this.findOne(id, placeId);
  }

  async remove(id: string, placeId: string): Promise<void> {
    await this.devicesRepository.delete({ id, placeId });
  }

  async syncDevice(id: string, placeId: string): Promise<Device> {
    const device = await this.findOne(id, placeId);
    if (device) {
      device.lastSyncAt = new Date();
      return this.devicesRepository.save(device);
    }
    return null;
  }

  async createRequest(placeId: string, dto: CreateDeviceRequestDto): Promise<DeviceRequest> {
    const unitPrice = TAP_UNIT_PRICE[dto.tapType];
    const request = this.deviceRequestsRepository.create({
      placeId,
      tapType: dto.tapType,
      quantity: dto.quantity,
      unitPrice,
      totalPrice: unitPrice * dto.quantity,
    });
    return this.deviceRequestsRepository.save(request);
  }

  async findRequestsByPlace(placeId: string): Promise<DeviceRequest[]> {
    return this.deviceRequestsRepository.find({ where: { placeId }, order: { createdAt: 'DESC' } });
  }

  async findAllRequests(): Promise<DeviceRequest[]> {
    return this.deviceRequestsRepository.find({ order: { createdAt: 'DESC' } });
  }

  async updateRequestStatus(id: string, status: DeviceRequestStatus): Promise<DeviceRequest> {
    await this.deviceRequestsRepository.update({ id }, { status });
    return this.deviceRequestsRepository.findOne({ where: { id } });
  }
}
