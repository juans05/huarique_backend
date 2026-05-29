import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { bootstrapApp, closeApp, registerTestUser } from './setup';

describe('Places (e2e)', () => {
    let app: INestApplication;
    let token: string;
    let categoryId: string;
    let placeId: string;
    let submissionId: string;

    beforeAll(async () => {
        app = await bootstrapApp();
        const auth = await registerTestUser();
        token = auth.token;
    });

    afterAll(async () => {
        await closeApp();
    });

    describe('GET /api/places/categories', () => {
        it('should return categories list', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/places/categories');

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);

            if (res.body.length > 0) {
                categoryId = res.body[0].id;
                expect(res.body[0]).toHaveProperty('id');
                expect(res.body[0]).toHaveProperty('name');
            }
        });
    });

    describe('GET /api/places/amenities', () => {
        it('should return amenities list', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/places/amenities');

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);

            if (res.body.length > 0) {
                expect(res.body[0]).toHaveProperty('id');
                expect(res.body[0]).toHaveProperty('name');
            }
        });
    });

    describe('POST /api/places/submissions', () => {
        const uniqueName = `Test Place ${Date.now()}`;

        it('should create a new submission', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/places/submissions')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: uniqueName,
                    description: 'Test description',
                    categoryId,
                    district: 'San Miguel',
                    address: 'Av. Test 123',
                    latitude: -12.0833,
                    longitude: -77.0833,
                });

            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty('id');
            submissionId = res.body.id;
        });

        it('should reject duplicate submission name in same district', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/places/submissions')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: uniqueName,
                    description: 'Test description',
                    categoryId,
                    district: 'San Miguel',
                    address: 'Av. Test 456',
                    latitude: -12.0833,
                    longitude: -77.0833,
                });

            expect(res.status).toBe(409);
        });

        it('should reject without auth', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/places/submissions')
                .send({
                    name: `Unauth Place ${Date.now()}`,
                    categoryId,
                    district: 'San Miguel',
                    latitude: -12.0833,
                    longitude: -77.0833,
                });

            expect(res.status).toBe(401);
        });

        it('should reject with missing required fields', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/places/submissions')
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Incomplete' });

            expect(res.status).toBe(400);
        });
    });

    describe('GET /api/places', () => {
        it('should return active places with pagination', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/places?page=1&limit=10');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('data');
            expect(res.body).toHaveProperty('meta');
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body.meta).toHaveProperty('page', 1);
            expect(res.body.meta).toHaveProperty('size');
        });

        it('should filter by category', async () => {
            const res = await request(app.getHttpServer())
                .get(`/api/places?category=${categoryId}`);

            expect(res.status).toBe(200);
        });

        it('should search by name', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/places?search=test');

            expect(res.status).toBe(200);
        });
    });

    describe('GET /api/places/:id', () => {
        it('should return 404 for non-existent place', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/places/00000000-0000-0000-0000-000000000000');

            expect(res.status).toBe(404);
        });
    });

    describe('GET /api/places/my-submissions', () => {
        it('should return user submissions', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/places/my-submissions')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });

        it('should require auth', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/places/my-submissions');

            expect(res.status).toBe(401);
        });
    });
});
