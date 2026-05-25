import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ubigeo } from './entities/ubigeo.entity';
import { UbigeoRawService } from './ubigeo-raw.service';
import { UbigeoRawController } from './ubigeo.raw-controller';

@Module({
    imports: [TypeOrmModule.forFeature([Ubigeo])],
    controllers: [UbigeoRawController],
    providers: [UbigeoRawService],
    exports: [UbigeoRawService],
})
export class UbigeoModule { }
