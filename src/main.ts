import './instrument';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
    // rawBody: true — necesario para verificar la firma HMAC del webhook de Zernio
    // (necesita los bytes exactos del body, no el JSON re-serializado).
    const app = await NestFactory.create(AppModule, { rawBody: true });

    // Validate critical secrets at startup
    const requiredSecrets = ['JWT_SECRET', 'JWT_REFRESH_SECRET'];
    for (const key of requiredSecrets) {
        if (!process.env[key]) {
            throw new Error(`Missing required environment variable: ${key}`);
        }
    }

    app.setGlobalPrefix('api');
    app.use(
        helmet({
            crossOriginResourcePolicy: { policy: 'cross-origin' },
            referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        }),
    );
    app.use(cookieParser());

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
            transformOptions: {
                enableImplicitConversion: true,
            },
        }),
    );

    const corsOrigin = process.env.CORS_ORIGIN;
    if (!corsOrigin && process.env.NODE_ENV === 'production') {
        throw new Error('CORS_ORIGIN must be set in production');
    }

    const allowedOrigins = corsOrigin
        ? corsOrigin.split(',').map((o) => o.trim()).filter(Boolean)
        : ['http://localhost:3000', 'https://wuarikes.com', 'https://admin.wuarikes.com', 'http://localhost:8080', 'https://wuarikes-2-b73941025455.railway.app',
            'https://admin.wuarikes-2-b73941025455.railway.app', 'https://www.wuarikes.com', 'https://www.admin.wuarikes.com'];

    app.enableCors({
        origin: (origin, callback) => {
            // Permitir requests sin Origin (server-to-server, curl, mobile apps)
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                console.warn(`🚫 CORS blocked origin: ${origin}`);
                callback(new Error(`Origin ${origin} not allowed by CORS`));
            }
        },
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
        credentials: true,
        maxAge: 3600,
    });

    if (process.env.NODE_ENV !== 'production') {
        const config = new DocumentBuilder()
            .setTitle('Lima Food Discovery API')
            .setDescription('API for discovering food places in Lima')
            .setVersion('1.0')
            .addBearerAuth()
            .build();
        const document = SwaggerModule.createDocument(app, config);
        SwaggerModule.setup('api/docs', app, document);
        console.log(`📚 API Documentation: http://localhost:${process.env.PORT || 3001}/api/docs`);
    }

    let port = process.env.PORT || 3001;
    const portIndex = process.argv.indexOf('--port');
    if (portIndex !== -1 && process.argv[portIndex + 1]) {
        const parsedPort = parseInt(process.argv[portIndex + 1], 10);
        if (!isNaN(parsedPort)) {
            port = parsedPort.toString();
        }
    }
    await app.listen(port);
    console.log(`🚀 Application is running on: http://localhost:${port}`);
}

bootstrap();
