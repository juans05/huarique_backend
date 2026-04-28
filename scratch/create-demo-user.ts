import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import 'reflect-metadata';
import { User } from '../src/modules/users/entities/user.entity';
import { Place } from '../src/modules/places/entities/place.entity';
import { Category } from '../src/modules/places/entities/category.entity';
import { Ubigeo } from '../src/modules/ubigeo/entities/ubigeo.entity';
import { Tag } from '../src/modules/places/entities/tag.entity';
import { Amenity } from '../src/modules/places/entities/amenity.entity';

config();

const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    schema: process.env.DB_SCHEMA,
    entities: [User, Place, Category, Ubigeo, Tag, Amenity],
    ssl: false,
});

async function createDemoUser() {
    await AppDataSource.initialize();
    console.log('📦 Connected to DB');

    const userRepo = AppDataSource.getRepository(User);
    const placeRepo = AppDataSource.getRepository(Place);

    const email = 'chef@warique.com';
    const password = 'password123';
    const hashedPassword = await bcrypt.hash(password, 10);

    let user = await userRepo.findOne({ where: { email } });
    if (!user) {
        user = userRepo.create({
            email,
            passwordHash: hashedPassword,
            fullName: 'Chef Demo',
            role: 'business',
            isVerified: true
        });
        await userRepo.save(user);
        console.log('✅ User created: chef@warique.com / password123');
    } else {
        user.role = 'business';
        await userRepo.save(user);
        console.log('⚠️ User already exists, role updated to business');
    }

    // Assign "El Bolivariano" to this user
    const place = await placeRepo.findOne({ where: { name: 'El Bolivariano' } });
    if (place) {
        place.claimedByUserId = user.id;
        await placeRepo.save(place);
        console.log(`✅ Place "${place.name}" assigned to Chef Demo`);
    }

    await AppDataSource.destroy();
}

createDemoUser();
