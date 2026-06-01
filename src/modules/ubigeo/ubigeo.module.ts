import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ubigeo } from './entities/ubigeo.entity';
import { SpainLocation } from './entities/spain-location.entity';
import { UbigeoRawService } from './ubigeo-raw.service';
import { UbigeoRawController } from './ubigeo.raw-controller';
import { SpainLocationSeeder } from './spain-location.seeder';

@Module({
    imports: [TypeOrmModule.forFeature([Ubigeo, SpainLocation])],
    controllers: [UbigeoRawController],
    providers: [UbigeoRawService, SpainLocationSeeder],
    exports: [UbigeoRawService],
})
export class UbigeoModule { }
