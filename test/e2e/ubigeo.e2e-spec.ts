import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { bootstrapApp, closeApp } from './setup';

describe('Ubigeo (e2e)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        app = await bootstrapApp();
    });

    afterAll(async () => {
        await closeApp();
    });

    describe('GET /api/ubigeo/departments', () => {
        it('should return departments list', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/ubigeo/departments');

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            if (res.body.length > 0) {
                expect(typeof res.body[0]).toBe('string');
            }
        });
    });

    describe('GET /api/ubigeo/provinces', () => {
        it('should return provinces for a department', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/ubigeo/provinces?department=Lima');

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });

        it('should return empty array without department param', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/ubigeo/provinces');

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body).toHaveLength(0);
        });
    });

    describe('GET /api/ubigeo/districts', () => {
        it('should return districts for a province', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/ubigeo/districts?department=Lima&province=Lima');

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });

        it('should return empty array without params', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/ubigeo/districts');

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body).toHaveLength(0);
        });
    });
});
