import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { PlatformProfile } from './platform-profile.entity';
import { PlatformAccessService } from './platform-access.service';

/** Global: RolesGuard lo usa en todos los módulos para validar permisos del equipo de Wuarikes. */
@Global()
@Module({
    imports: [TypeOrmModule.forFeature([PlatformProfile, User])],
    providers: [PlatformAccessService],
    exports: [PlatformAccessService],
})
export class PlatformAccessModule { }
