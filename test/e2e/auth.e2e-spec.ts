import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { bootstrapApp, closeApp, registerTestUser } from './setup';

describe('Auth (e2e)', () => {
    let app: INestApplication;
    let testUser: { token: string; userId: string; email: string; password: string };

    beforeAll(async () => {
        app = await bootstrapApp();
        testUser = await registerTestUser();
    });

    afterAll(async () => {
        await closeApp();
    });

    describe('POST /api/auth/register', () => {
        const testEmail = `reg_${Date.now()}@test.com`;
        const testPassword = 'Test123456!';

        it('should register a new user', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/auth/register')
                .send({
                    email: testEmail,
                    password: testPassword,
                    fullName: 'Test User',
                });

            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty('message');
            expect(res.body.message).toContain('verificación');
        });

        it('should reject duplicate email', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/auth/register')
                .send({
                    email: testEmail,
                    password: testPassword,
                    fullName: 'Test User',
                });

            expect(res.status).toBe(409);
        });

        it('should reject invalid email', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/auth/register')
                .send({
                    email: 'invalid-email',
                    password: testPassword,
                    fullName: 'Test User',
                });

            expect(res.status).toBe(400);
        });

        it('should reject short password', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/auth/register')
                .send({
                    email: 'short@test.com',
                    password: '123',
                    fullName: 'Test User',
                });

            expect(res.status).toBe(400);
        });
    });

    describe('POST /api/auth/login', () => {
        it('should login with valid credentials', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/auth/login')
                .send({ email: testUser.email, password: testUser.password });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('accessToken');
            expect(res.body).toHaveProperty('refreshToken');
            expect(res.body.user.email).toBe(testUser.email);
        });

        it('should reject invalid password', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/auth/login')
                .send({ email: testUser.email, password: 'wrongpass' });

            expect(res.status).toBe(401);
        });

        it('should reject non-existent email', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/auth/login')
                .send({ email: 'noexists@test.com', password: testUser.password });

            expect(res.status).toBe(401);
        });

        it('should reject empty body', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/auth/login')
                .send({});

            expect(res.status).toBe(400);
        });
    });

    describe('GET /api/users/me/profile', () => {
        it('should return profile with valid token', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/users/me/profile')
                .set('Authorization', `Bearer ${testUser.token}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('email');
            expect(res.body).toHaveProperty('role');
        });

        it('should reject without token', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/users/me/profile');

            expect(res.status).toBe(401);
        });

        it('should reject with invalid token', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/users/me/profile')
                .set('Authorization', 'Bearer invalidtoken');

            expect(res.status).toBe(401);
        });
    });
});
