import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ubigeo } from './entities/ubigeo.entity';
import { UbigeoService } from './ubigeo.service';
import { UbigeoController } from './ubigeo.controller';

@Module({
    imports: [TypeOrmModule.forFeature([Ubigeo])],
    controllers: [UbigeoController],
    providers: [UbigeoService],
    exports: [UbigeoService],
})
export class UbigeoModule { }
