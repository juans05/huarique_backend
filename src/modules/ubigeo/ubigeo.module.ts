import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ubigeo } from './entities/ubigeo.entity';
import { UbigeoService } from './ubigeo.service';
import { UbigeoRawService } from './ubigeo-raw.service';
import { UbigeoController } from './ubigeo.controller';
import { UbigeoRawController } from './ubigeo.raw-controller';

@Module({
    imports: [TypeOrmModule.forFeature([Ubigeo])],
    controllers: [UbigeoController, UbigeoRawController],
    providers: [UbigeoService, UbigeoRawService],
    exports: [UbigeoService, UbigeoRawService],
})
export class UbigeoModule { }
