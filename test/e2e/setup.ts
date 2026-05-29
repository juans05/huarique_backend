import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { DatabaseConfig } from '../../src/config/database.config';
import { CloudinaryService } from '../../src/common/services/cloudinary.service';
import { MailService } from '../../src/common/services/mail.service';
import { CommonModule } from '../../src/common/common.module';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { UsersModule } from '../../src/modules/users/users.module';
import { PlacesModule } from '../../src/modules/places/places.module';
import { AdminModule } from '../../src/modules/admin/admin.module';
import { UbigeoModule } from '../../src/modules/ubigeo/ubigeo.module';
import { CheckinsModule } from '../../src/modules/checkins/checkins.module';
import { UploadModule } from '../../src/modules/upload/upload.module';
import { SubscriptionsModule } from '../../src/modules/subscriptions/subscriptions.module';
import { DevicesModule } from '../../src/modules/devices/devices.module';

let app: INestApplication;

export async function bootstrapApp(): Promise<INestApplication> {
    if (app) return app;

    const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [
            ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
            ScheduleModule.forRoot(),
            EventEmitterModule.forRoot(),
            TypeOrmModule.forRootAsync({ useClass: DatabaseConfig }),
            ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
            CommonModule,
            AuthModule,
            UsersModule,
            PlacesModule,
            CheckinsModule,
            AdminModule,
            UploadModule,
            UbigeoModule,
            SubscriptionsModule,
            DevicesModule,
        ],
    })
        .overrideProvider(CloudinaryService)
        .useValue({
            uploadImage: () => Promise.resolve({ secure_url: 'https://test.cloudinary.com/test.jpg', public_id: 'test' }),
            uploadVideo: () => Promise.resolve({ secure_url: 'https://test.cloudinary.com/test.mp4', duration: 10 }),
            deleteFile: () => Promise.resolve(),
        })
        .overrideProvider(MailService)
        .useValue({
            sendVerificationCode: () => Promise.resolve(),
            sendPasswordReset: () => Promise.resolve(),
            sendReport: () => Promise.resolve(),
        })
        .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
            transformOptions: { enableImplicitConversion: true },
        }),
    );
    app.enableCors();

    await app.init();
    return app;
}

export async function getApp(): Promise<INestApplication> {
    return bootstrapApp();
}

export async function closeApp() {
    if (app) {
        await app.close();
        app = null;
    }
}

export async function loginAs(email: string, password: string): Promise<{ token: string; userId: string }> {
    const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password });

    if (res.status !== 200 && res.status !== 201) {
        throw new Error(`Login failed for ${email}: ${res.body.message || res.status}`);
    }

    return {
        token: res.body.accessToken,
        userId: res.body.user.id,
    };
}

let testUserCounter = Date.now();

export async function registerTestUser(): Promise<{ token: string; userId: string; email: string; password: string }> {
    const email = `test_${testUserCounter++}@example.com`;
    const password = 'TestPass123!';
    const dataSource = app.get(DataSource);
    const schema = process.env.DB_SCHEMA || 'wuarike_db';

    const regRes = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password, fullName: 'Test User' });

    if (regRes.status !== 201) {
        throw new Error(`Registration failed for ${email}: ${JSON.stringify(regRes.body)}`);
    }

    const userRow = await dataSource.query(
        `SELECT id, verification_code FROM "${schema}".users WHERE email = $1`, [email]
    );
    const code = userRow[0]?.verification_code;
    if (!code) throw new Error(`No verification code found for ${email}`);

    await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ email, code });

    const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password });

    if (loginRes.status !== 200 && loginRes.status !== 201) {
        throw new Error(`Login failed for ${email}: ${JSON.stringify(loginRes.body)}`);
    }

    return {
        token: loginRes.body.accessToken,
        userId: loginRes.body.user.id,
        email,
        password,
    };
}

export async function registerAdminUser(): Promise<{ token: string; userId: string; email: string; password: string }> {
    const user = await registerTestUser();
    const dataSource = app.get(DataSource);
    const schema = process.env.DB_SCHEMA || 'wuarike_db';

    await dataSource.query(`UPDATE "${schema}".users SET role = 'admin' WHERE id = $1`, [user.userId]);

    const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: user.email, password: user.password });

    if (loginRes.status !== 200 && loginRes.status !== 201) {
        throw new Error(`Admin login failed for ${user.email}: ${JSON.stringify(loginRes.body)}`);
    }

    return {
        token: loginRes.body.accessToken,
        userId: user.userId,
        email: user.email,
        password: user.password,
    };
}

export async function getApp(): Promise<INestApplication> {
    return bootstrapApp();
}

export async function closeApp() {
    if (app) {
        await app.close();
        app = null;
    }
}

export async function loginAs(email: string, password: string): Promise<{ token: string; userId: string }> {
    const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password });

    if (res.status !== 200 && res.status !== 201) {
        throw new Error(`Login failed for ${email}: ${res.body.message || res.status}`);
    }

    return {
        token: res.body.accessToken,
        userId: res.body.user.id,
    };
}

let testUserCounter = Date.now();

export async function registerTestUser(): Promise<{ token: string; userId: string; email: string; password: string }> {
    const email = `test_${testUserCounter++}@example.com`;
    const password = 'TestPass123!';
    const dataSource = app.get(DataSource);
    const schema = process.env.DB_SCHEMA || 'wuarike_db';

    const regRes = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password, fullName: 'Test User' });

    if (regRes.status !== 201) {
        throw new Error(`Registration failed for ${email}: ${JSON.stringify(regRes.body)}`);
    }

    const userRow = await dataSource.query(
        `SELECT id, verification_code FROM "${schema}".users WHERE email = $1`, [email]
    );
    const code = userRow[0]?.verification_code;
    if (!code) throw new Error(`No verification code found for ${email}`);

    await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ email, code });

    const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password });

    if (loginRes.status !== 200 && loginRes.status !== 201) {
        throw new Error(`Login failed for ${email}: ${JSON.stringify(loginRes.body)}`);
    }

    return {
        token: loginRes.body.accessToken,
        userId: loginRes.body.user.id,
        email,
        password,
    };
}

export async function registerAdminUser(): Promise<{ token: string; userId: string; email: string; password: string }> {
    const user = await registerTestUser();
    const dataSource = app.get(DataSource);
    const schema = process.env.DB_SCHEMA || 'wuarike_db';

    await dataSource.query(`UPDATE "${schema}".users SET role = 'admin' WHERE id = $1`, [user.userId]);

    const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: user.email, password: user.password });

    if (loginRes.status !== 200 && loginRes.status !== 201) {
        throw new Error(`Admin login failed for ${user.email}: ${JSON.stringify(loginRes.body)}`);
    }

    return {
        token: loginRes.body.accessToken,
        userId: user.userId,
        email: user.email,
        password: user.password,
    };
}
