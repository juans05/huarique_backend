
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { User } from '../modules/users/entities/user.entity';
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
    entities: [User],
    ssl: false,
});

async function verify() {
    try {
        await AppDataSource.initialize();
        console.log('connected');
        const userRepo = AppDataSource.getRepository(User);
        
        const user = await userRepo.findOne({ where: { email: 'juans0520@gmail.com' } });
        
        if (user) {
            console.log(`User found: ${user.email}, Role: ${user.role}`);
            if (user.role !== 'admin') {
                console.log('Updating role to admin...');
                user.role = 'admin' as any;
                await userRepo.save(user);
                console.log('Role updated successfully.');
            }
        } else {
            console.log('User not found.');
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

verify();
