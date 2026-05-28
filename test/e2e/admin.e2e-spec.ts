import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { bootstrapApp, closeApp, registerAdminUser } from './setup';

describe('Admin (e2e)', () => {
    let app: INestApplication;
    let adminToken: string;

    beforeAll(async () => {
        app = await bootstrapApp();
        const auth = await registerAdminUser();
        adminToken = auth.token;
    });

    afterAll(async () => {
        await closeApp();
    });

    describe('GET /api/admin/stats', () => {
        it('should return dashboard stats', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/admin/stats')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('overview');
            expect(res.body.overview).toHaveProperty('totalUsers');
            expect(res.body.overview).toHaveProperty('totalPlaces');
        });

        it('should reject without auth', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/admin/stats');

            expect(res.status).toBe(401);
        });
    });

    describe('GET /api/admin/submissions', () => {
        it('should return pending submissions', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/admin/submissions')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });
    });

    describe('GET /api/admin/claims', () => {
        it('should return pending claims', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/admin/claims')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });
    });

    describe('GET /api/admin/users', () => {
        it('should return paginated users', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/admin/users?page=1&limit=10')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('data');
            expect(res.body).toHaveProperty('meta');
            expect(Array.isArray(res.body.data)).toBe(true);
        });

        it('should search users by name', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/admin/users?search=test')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
        });
    });

    describe('GET /api/admin/places', () => {
        it('should return places list', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/admin/places?page=1')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('data');
            expect(res.body).toHaveProperty('meta');
        });
    });

    describe('PATCH /api/admin/places/:id', () => {
        it('should reject updating non-existent place', async () => {
            const res = await request(app.getHttpServer())
                .patch('/api/admin/places/00000000-0000-0000-0000-000000000000')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'active' });

            expect(res.status).toBe(404);
        });

        it('should require auth', async () => {
            const res = await request(app.getHttpServer())
                .patch('/api/admin/places/00000000-0000-0000-0000-000000000000')
                .send({ status: 'active' });

            expect(res.status).toBe(401);
        });
    });

    describe('POST /api/admin/submissions/:id/approve', () => {
        it('should reject approving non-existent submission', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/admin/submissions/00000000-0000-0000-0000-000000000000/approve')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(404);
        });
    });

    describe('POST /api/admin/submissions/:id/reject', () => {
        it('should reject non-existent submission', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/admin/submissions/00000000-0000-0000-0000-000000000000/reject')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ reason: 'Test reject' });

            expect(res.status).toBe(404);
        });

        it('should require reason', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/admin/submissions/00000000-0000-0000-0000-000000000000/reject')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({});

            expect(res.status).toBe(404);
        });
    });

    describe('POST /api/admin/claims/:id/verify', () => {
        it('should reject verifying non-existent claim', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/admin/claims/00000000-0000-0000-0000-000000000000/verify')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(404);
        });
    });
});
