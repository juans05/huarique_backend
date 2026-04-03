
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import 'reflect-metadata';

config();

const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    schema: process.env.DB_SCHEMA,
    ssl: false,
});

async function listUsers() {
    try {
        await AppDataSource.initialize();
        console.log('connected');
        const results = await AppDataSource.query('SELECT id, email, role FROM "users"');
        console.log('Users in DB:');
        console.table(results);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

listUsers();
