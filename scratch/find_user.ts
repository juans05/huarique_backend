
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import 'reflect-metadata';
import { User } from '../src/modules/users/entities/user.entity';

config();

const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    schema: process.env.DB_SCHEMA,
    entities: [User],
    ssl: false,
});

async function findUser() {
    try {
        await AppDataSource.initialize();
        console.log('Connected to DB');
        const userRepo = AppDataSource.getRepository(User);
        
        // Try exact match first
        let user = await userRepo.findOne({ where: { email: 'demo@warike.com' } });
        if (!user) {
            console.log('demo@warike.com not found. Searching for similar...');
            // Try with 'u' (wuarike)
            user = await userRepo.findOne({ where: { email: 'demo@wuarike.com' } });
        }
        
        if (!user) {
             console.log('demo@wuarike.com not found. Searching for all users...');
             const users = await userRepo.find();
             console.log('All users:', users.map(u => u.email));
        } else {
            console.log('Found user:', user.email);
            console.log('Password hash:', user.passwordHash);
        }
        
        await AppDataSource.destroy();
    } catch (error) {
        console.error('Error:', error);
    }
}

findUser();
