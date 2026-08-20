import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QrService } from './qr.service';
import { QrPublicController } from './qr-public.controller';
import { QrAdminController } from './qr-admin.controller';
import { QrCode } from './entities/qr-code.entity';
import { QrAssignment } from './entities/qr-assignment.entity';
import { QrScan } from './entities/qr-scan.entity';
import { Place } from '../places/entities/place.entity';
import { Category } from '../places/entities/category.entity';
import { Ubigeo } from '../ubigeo/entities/ubigeo.entity';

@Module({
    imports: [TypeOrmModule.forFeature([QrCode, QrAssignment, QrScan, Place, Category, Ubigeo])],
    controllers: [QrPublicController, QrAdminController],
    providers: [QrService],
})
export class QrModule { }
