import { Injectable } from '@nestjs/common';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DatabaseConfig implements TypeOrmOptionsFactory {
    constructor(private configService: ConfigService) { }

    createTypeOrmOptions(): TypeOrmModuleOptions {
        return {
            type: 'postgres',
            host: this.configService.get('DB_HOST'),
            port: Number(this.configService.get('DB_PORT')) || 5432,
            username: this.configService.get('DB_USER'),
            password: this.configService.get('DB_PASSWORD'),
            database: this.configService.get('DB_NAME'),
            schema: this.configService.get('DB_SCHEMA') || 'wuarike_db',
            entities: [__dirname + '/../**/*.entity{.ts,.js}'],
            synchronize: true, // Forced to true to fix schema mismatch on production
            logging: this.configService.get('NODE_ENV') === 'development',
            migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
            migrationsRun: false,
            ssl: this.configService.get('DB_SSL') === 'true' ? {
                rejectUnauthorized: false
            } : false,
        };
    }
}
