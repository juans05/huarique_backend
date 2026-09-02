import 'dotenv/config';
import { DataSource } from 'typeorm';

// El CLI de TypeORM necesita un archivo que exporte una instancia de DataSource
// directamente — database.config.ts exporta una clase NestJS (TypeOrmOptionsFactory),
// que el CLI no puede usar. Este archivo es solo para migration:generate/migration:run.
const url = process.env.DATABASE_URL;
const schema = process.env.DB_SCHEMA || 'wuarike_db';
const ssl = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

export default new DataSource(
  url
    ? {
        type: 'postgres',
        url,
        schema,
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
        ssl,
      }
    : {
        type: 'postgres',
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 5432,
        username: process.env.DB_USER || process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        schema,
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
        ssl,
      },
);
