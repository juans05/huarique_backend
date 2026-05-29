import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { bootstrapApp, closeApp, registerTestUser } from './setup';

describe('Business / Onboarding (e2e)', () => {
    let app: INestApplication;
    let token: string;

    beforeAll(async () => {
        app = await bootstrapApp();
        const auth = await registerTestUser();
        token = auth.token;
    });

    afterAll(async () => {
        await closeApp();
    });

    describe('GET /api/business/onboarding/search', () => {
        it('should search in Wuarike and Google', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/business/onboarding/search?q=test')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('wuarike');
            expect(res.body).toHaveProperty('google');
            expect(Array.isArray(res.body.wuarike)).toBe(true);
            expect(Array.isArray(res.body.google)).toBe(true);
        });

        it('should return empty for short query', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/business/onboarding/search?q=ab')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.wuarike).toHaveLength(0);
            expect(res.body.google).toHaveLength(0);
        });

        it('should require auth', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/business/onboarding/search?q=test');

            expect(res.status).toBe(401);
        });
    });

    describe('POST /api/business/onboarding/create', () => {
        it('should create a new place', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/business/onboarding/create')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: `Mi Huarique ${Date.now()}`,
                    address: 'Av. Test 789',
                });

            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty('placeId');
            expect(res.body).toHaveProperty('message');
            expect(res.body.message).toContain('éxito');
        });

        it('should reject without name', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/business/onboarding/create')
                .set('Authorization', `Bearer ${token}`)
                .send({ address: 'Av. Test' });

            expect(res.status).toBe(400);
        });

        it('should reject with short name', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/business/onboarding/create')
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'A' });

            expect(res.status).toBe(400);
        });

        it('should require auth', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/business/onboarding/create')
                .send({ name: 'No Auth Place' });

            expect(res.status).toBe(401);
        });
    });

    describe('POST /api/business/onboarding/claim/:id', () => {
        it('should reject claiming non-existent place', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/business/onboarding/claim/00000000-0000-0000-0000-000000000000')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(404);
        });
    });

    describe('POST /api/business/onboarding/import', () => {
        it('should handle import request', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/business/onboarding/import')
                .set('Authorization', `Bearer ${token}`)
                .send({});

            expect(res.status).toBe(201);
        });
    });

    describe('GET /api/business/my-places', () => {
        it('should return places owned by user', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/business/my-places')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });

        it('should require auth', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/business/my-places');

            expect(res.status).toBe(401);
        });
    });
});
