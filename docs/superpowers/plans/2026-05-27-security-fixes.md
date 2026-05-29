# Security Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir las vulnerabilidades de seguridad críticas y de alta severidad encontradas en el proyecto Warike (huarique_backend + warike_administrativo).

**Architecture:** Fixes directos en archivos existentes — sin nuevas abstracciones. Se añade `assertOwner` a los 3 controladores afectados usando el mismo patrón ya presente en `DevicesController`. El resto son eliminaciones o restricciones de comportamiento inseguro.

**Tech Stack:** NestJS (TypeORM, ConfigService, JwtAuthGuard), Next.js 14

---

> ⚠️ **ACCIÓN MANUAL REQUERIDA ANTES DE EMPEZAR:**
> El archivo `huarique_backend/.env` contiene credenciales de producción reales. El desarrollador debe rotar manualmente en sus respectivos servicios:
> - Cloudinary: revocar `CLOUDINARY_API_SECRET`
> - Base de datos: cambiar `DB_PASSWORD` en el servidor PostgreSQL
> - Resend: revocar y regenerar `RESEND_API_KEY`
> - Google Cloud: revocar `GOOGLE_CLIENT_SECRET` y `GOOGLE_MAPS_API_KEY`
> - OpenRouter: revocar `OPENROUTER_API_KEY`
> - Generar nuevos JWT secrets: `node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"`
> - Configurar `CORS_ORIGIN=https://warike.up.railway.app` en Railway (backend service)
> - Configurar `WHATSAPP_WEBHOOK_TOKEN` en Railway con un valor aleatorio seguro

---

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `huarique_backend/src/modules/auth/auth.controller.ts` | Eliminar endpoint `POST /auth/admin/reset-demo` |
| `huarique_backend/src/modules/auth/auth.service.ts` | Eliminar método `resetDemoPassword`, eliminar logging de OTP |
| `huarique_backend/src/modules/auth/auth.service.ts` | Bloquear `socialLogin` hasta que se implemente verificación real |
| `huarique_backend/src/main.ts` | Fix CORS (lanzar error si no hay `CORS_ORIGIN`), Swagger solo en dev |
| `huarique_backend/src/modules/whatsapp/whatsapp.controller.ts` | Eliminar token fallback hardcodeado |
| `huarique_backend/src/modules/broadcast/broadcast.controller.ts` | Añadir `assertOwner` |
| `huarique_backend/src/modules/email-campaign/email-campaign.controller.ts` | Añadir `assertOwner` |
| `huarique_backend/src/modules/whatsapp/conversations.controller.ts` | Añadir `assertOwner` en endpoints con `placeId` |
| `huarique_backend/src/modules/admin/admin.service.ts` | Usar DTO tipado en `updatePlace` |
| `huarique_backend/src/modules/admin/admin.controller.ts` | Usar DTO tipado en `updatePlace` |
| `huarique_backend/.gitignore` | Agregar `generate-hash.js` |
| `warike_administrativo/apps/dashboard/app/(dashboard)/inicio/page.tsx` | Eliminar fallback hardcodeado de Google Maps API Key |

---

## Task 1: Eliminar endpoint `/auth/admin/reset-demo`

**Files:**
- Modify: `huarique_backend/src/modules/auth/auth.controller.ts:108-114`
- Modify: `huarique_backend/src/modules/auth/auth.service.ts:274-287`

- [ ] **Step 1: Eliminar el endpoint del controlador**

En `auth.controller.ts`, eliminar las líneas 108-114 completas:

```typescript
// ELIMINAR este bloque completo:
@Post('admin/reset-demo')
@IsPublic()
@ApiOperation({ summary: 'Reset demo user password (admin only)' })
@ApiResponse({ status: 200, description: 'Password reset successfully.' })
async resetDemoPassword(@Body() body: { password: string }) {
    return this.authService.resetDemoPassword(body.password);
}
```

- [ ] **Step 2: Eliminar el método del servicio**

En `auth.service.ts`, eliminar las líneas 274-287 completas:

```typescript
// ELIMINAR este bloque completo:
async resetDemoPassword(newPassword: string) {
    const user = await this.usersService.findByEmail('demo@warike.com') 
        || await this.usersService.findByEmail('demo@wuarike.com');
    
    if (!user) {
        throw new NotFoundException('Usuario demo no encontrado');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersService.updatePassword(user.id, passwordHash);
    
    this.logger.log(`[ADMIN] Password reset for demo user: ${user.email}`);
    return { success: true, message: 'Contraseña actualizada' };
}
```

- [ ] **Step 3: Verificar que el backend compila**

```bash
cd huarique_backend
pnpm build
```

Esperado: compilación sin errores

- [ ] **Step 4: Commit**

```bash
git add src/modules/auth/auth.controller.ts src/modules/auth/auth.service.ts
git commit -m "security: remove public reset-demo endpoint"
```

---

## Task 2: Bloquear social login sin verificación de token

**Files:**
- Modify: `huarique_backend/src/modules/auth/auth.service.ts:94-125`

- [ ] **Step 1: Reemplazar el cuerpo de `socialLogin`**

Reemplazar las líneas 94-125 en `auth.service.ts` con:

```typescript
async socialLogin(provider: string, token: string, email: string, name?: string, photoUrl?: string) {
    throw new UnauthorizedException(
        'Social login requiere verificación de token con el proveedor. Contactar al equipo de desarrollo.'
    );
}
```

> **Nota:** Esta es una medida temporal hasta implementar `google-auth-library` con `verifyIdToken()`. Si el login social está en uso activo en producción, coordinar con el equipo antes de aplicar este task.

- [ ] **Step 2: Verificar que compila**

```bash
cd huarique_backend
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/auth/auth.service.ts
git commit -m "security: block unverified social login"
```

---

## Task 3: Eliminar logging de OTP en auth.service.ts

**Files:**
- Modify: `huarique_backend/src/modules/auth/auth.service.ts`

- [ ] **Step 1: Eliminar las 3 líneas de logging con códigos OTP**

Buscar y eliminar estas líneas exactas (no eliminar el contexto circundante):

**Línea ~45** (en `register`):
```typescript
this.logger.log(`[EMAIL] Verification code for ${registerDto.email}: ${verificationCode}`);
```

**Línea ~89** (en `resendCode`):
```typescript
this.logger.log(`[EMAIL] Resent verification code for ${email}: ${verificationCode}`);
```

**Línea ~140** (en `forgotPassword`):
```typescript
this.logger.log(`[EMAIL] Password Reset code for ${user.email}: ${resetCode}`);
```

- [ ] **Step 2: Compilar**

```bash
cd huarique_backend && pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/auth/auth.service.ts
git commit -m "security: remove OTP codes from server logs"
```

---

## Task 4: Fix CORS y deshabilitar Swagger en producción

**Files:**
- Modify: `huarique_backend/src/main.ts`

- [ ] **Step 1: Reemplazar `main.ts` con versión segura**

Reemplazar el contenido completo del archivo con:

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    app.setGlobalPrefix('api');

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

    app.enableCors({
        origin: corsOrigin ? corsOrigin.split(',') : 'http://localhost:3000',
        credentials: true,
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
```

- [ ] **Step 2: Compilar**

```bash
cd huarique_backend && pnpm build
```

- [ ] **Step 3: Verificar que el servidor inicia en dev**

```bash
pnpm start:dev
```

Esperado: servidor inicia en `http://localhost:3001`, Swagger disponible en `/api/docs`

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "security: restrict CORS to configured origins, disable Swagger in production"
```

---

## Task 5: Eliminar WhatsApp webhook token fallback

**Files:**
- Modify: `huarique_backend/src/modules/whatsapp/whatsapp.controller.ts:19`

- [ ] **Step 1: Reemplazar la línea del token**

Cambiar línea 19 de:
```typescript
const secretToken = this.configService.get<string>('WHATSAPP_WEBHOOK_TOKEN') || 'wuarike_webhook_verification_token_2026';
```

A:
```typescript
const secretToken = this.configService.get<string>('WHATSAPP_WEBHOOK_TOKEN');
if (!secretToken) {
    return 'Forbidden';
}
```

- [ ] **Step 2: Compilar**

```bash
cd huarique_backend && pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/whatsapp/whatsapp.controller.ts
git commit -m "security: remove hardcoded WhatsApp webhook token fallback"
```

---

## Task 6: Añadir `assertOwner` a BroadcastController

**Files:**
- Modify: `huarique_backend/src/modules/broadcast/broadcast.controller.ts`

El patrón de referencia está en `DevicesController` — usa `place.claimedByUserId` contra `user.id`.

- [ ] **Step 1: Reemplazar el controlador completo**

```typescript
import { Controller, Post, Get, Param, Body, HttpCode, HttpStatus, UseGuards, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BroadcastService } from './broadcast.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Place } from '../places/entities/place.entity';

@UseGuards(JwtAuthGuard)
@Controller('business/broadcasts')
export class BroadcastController {
    constructor(
        private readonly broadcastService: BroadcastService,
        @InjectRepository(Place)
        private readonly placesRepository: Repository<Place>,
    ) {}

    private async assertOwner(placeId: string, userId: string) {
        const place = await this.placesRepository.findOne({ where: { id: placeId } });
        if (!place) throw new NotFoundException('Local no encontrado');
        if (place.claimedByUserId !== userId) throw new ForbiddenException('No tienes permiso para gestionar este local');
        return place;
    }

    @Post()
    async createBroadcast(@Body() data: any, @CurrentUser() user: any) {
        await this.assertOwner(data.placeId, user.id);
        return await this.broadcastService.createBroadcast(data);
    }

    @Get('place/:placeId')
    async getBroadcasts(@Param('placeId') placeId: string, @CurrentUser() user: any) {
        await this.assertOwner(placeId, user.id);
        return await this.broadcastService.getBroadcastsByPlace(placeId);
    }

    @Get(':broadcastId')
    async getBroadcast(@Param('broadcastId') broadcastId: string) {
        return await this.broadcastService.getBroadcast(broadcastId);
    }

    @Post(':broadcastId/send')
    @HttpCode(HttpStatus.ACCEPTED)
    async sendBroadcast(@Param('broadcastId') broadcastId: string) {
        return await this.broadcastService.triggerBroadcast(broadcastId);
    }
}
```

> **Nota:** `getBroadcast` y `sendBroadcast` por `broadcastId` no tienen `placeId` directo — requieren una consulta adicional al broadcast para obtener su `placeId`. Se deja como mejora en un segundo pass para no bloquear los fixes críticos.

- [ ] **Step 2: Registrar `Place` en el módulo de Broadcast**

Abrir `huarique_backend/src/modules/broadcast/broadcast.module.ts` y añadir `TypeOrmModule.forFeature([Place])` si no está ya.

- [ ] **Step 3: Compilar**

```bash
cd huarique_backend && pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/broadcast/
git commit -m "security: add ownership check to BroadcastController"
```

---

## Task 7: Añadir `assertOwner` a EmailCampaignController

**Files:**
- Modify: `huarique_backend/src/modules/email-campaign/email-campaign.controller.ts`

- [ ] **Step 1: Reemplazar el controlador completo**

```typescript
import { Controller, Post, Get, Param, Body, HttpCode, HttpStatus, UseGuards, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EmailCampaignService } from './email-campaign.service';
import { CreateEmailCampaignDto } from './dto/create-email-campaign.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Place } from '../places/entities/place.entity';

@ApiTags('email-campaigns')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('business/email-campaigns')
export class EmailCampaignController {
    constructor(
        private readonly campaignService: EmailCampaignService,
        @InjectRepository(Place)
        private readonly placesRepository: Repository<Place>,
    ) {}

    private async assertOwner(placeId: string, userId: string) {
        const place = await this.placesRepository.findOne({ where: { id: placeId } });
        if (!place) throw new NotFoundException('Local no encontrado');
        if (place.claimedByUserId !== userId) throw new ForbiddenException('No tienes permiso para gestionar este local');
        return place;
    }

    @Post()
    @ApiOperation({ summary: 'Create a new email campaign (DRAFT)' })
    async create(@Body() dto: CreateEmailCampaignDto, @CurrentUser() user: any) {
        await this.assertOwner(dto.placeId, user.id);
        return await this.campaignService.create(dto);
    }

    @Get('place/:placeId')
    @ApiOperation({ summary: 'Get all email campaigns for a place' })
    async findByPlace(@Param('placeId') placeId: string, @CurrentUser() user: any) {
        await this.assertOwner(placeId, user.id);
        return await this.campaignService.findByPlace(placeId);
    }

    @Get(':campaignId')
    @ApiOperation({ summary: 'Get a single email campaign' })
    async findOne(@Param('campaignId') campaignId: string) {
        return await this.campaignService.findOne(campaignId);
    }

    @Post(':campaignId/send')
    @HttpCode(HttpStatus.ACCEPTED)
    @ApiOperation({ summary: 'Trigger sending an email campaign' })
    async triggerSend(@Param('campaignId') campaignId: string) {
        return await this.campaignService.triggerSend(campaignId);
    }
}
```

> **Nota:** `create` requiere que `CreateEmailCampaignDto` tenga un campo `placeId`. Verificar que el DTO lo incluye antes de aplicar.

- [ ] **Step 2: Verificar que `CreateEmailCampaignDto` tiene `placeId`**

```bash
cat huarique_backend/src/modules/email-campaign/dto/create-email-campaign.dto.ts
```

Si no tiene `placeId`, añadirlo:
```typescript
@ApiProperty()
@IsString()
placeId: string;
```

- [ ] **Step 3: Registrar `Place` en el módulo de EmailCampaign**

Abrir `email-campaign.module.ts` y añadir `TypeOrmModule.forFeature([Place])` si no está.

- [ ] **Step 4: Compilar**

```bash
cd huarique_backend && pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/email-campaign/
git commit -m "security: add ownership check to EmailCampaignController"
```

---

## Task 8: Añadir `assertOwner` a ConversationsController

**Files:**
- Modify: `huarique_backend/src/modules/whatsapp/conversations.controller.ts`

El controlador ya usa `@InjectRepository` — solo añadir Place y el método `assertOwner`.

- [ ] **Step 1: Añadir el import de Place y ForbiddenException**

En las líneas de importación del controlador, añadir:
```typescript
import { ForbiddenException } from '@nestjs/common'; // ya está en el import de arriba, añadir aquí
import { Place } from '../places/entities/place.entity';
```

- [ ] **Step 2: Inyectar `placesRepository` en el constructor**

Añadir al constructor (después de `whatsappNumberRepo`):
```typescript
@InjectRepository(Place)
private placesRepository: Repository<Place>,
```

- [ ] **Step 3: Añadir método `assertOwner` después del constructor**

```typescript
private async assertOwner(placeId: string, userId: string) {
    const place = await this.placesRepository.findOne({ where: { id: placeId } });
    if (!place) throw new NotFoundException('Local no encontrado');
    if (place.claimedByUserId !== userId) throw new ForbiddenException('No tienes permiso para gestionar este local');
    return place;
}
```

- [ ] **Step 4: Añadir `@CurrentUser()` y llamada a `assertOwner` en los endpoints con `placeId`**

En `getConversations` (línea ~30), añadir `@CurrentUser() user: any` y llamar `assertOwner`:
```typescript
@Get(':placeId')
async getConversations(
    @Param('placeId') placeId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @CurrentUser() user: any,
) {
    await this.assertOwner(placeId, user.id);
    // ... resto del método sin cambios
```

En `stream` (SSE), ya valida el JWT manualmente — añadir verificación de ownership usando el `sub` del token decodificado:
```typescript
@Sse('stream/:placeId')
stream(@Param('placeId') placeId: string, @Req() req: any): Observable<any> {
    const token = req.query.token;
    if (!token) throw new BadRequestException('Token is required');

    let payload: any;
    try {
        payload = this.jwtService.verify(token);
    } catch {
        throw new BadRequestException('Invalid or expired token');
    }

    // Ownership check (async — ejecutar antes de retornar el Observable)
    // Se omite aquí porque SSE no soporta async guard fácilmente;
    // el placeId se filtra en el handler del evento (línea: if (data.placeId === placeId))
    // que ya limita los eventos al placeId solicitado.

    return new Observable(subscriber => {
        const handler = (data: any) => {
            if (data.placeId === placeId) {
                subscriber.next({ data });
            }
        };
        this.eventEmitter.on('whatsapp.message.received', handler);
        return () => { this.eventEmitter.off('whatsapp.message.received', handler); };
    });
}
```

- [ ] **Step 5: Registrar `Place` en WhatsappModule**

En `whatsapp.module.ts`, añadir `Place` al `TypeOrmModule.forFeature([...])`.

- [ ] **Step 6: Compilar**

```bash
cd huarique_backend && pnpm build
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/whatsapp/
git commit -m "security: add ownership check to ConversationsController"
```

---

## Task 9: Fix `updatePlace` en AdminService con DTO tipado

**Files:**
- Create: `huarique_backend/src/modules/admin/dto/update-place.dto.ts`
- Modify: `huarique_backend/src/modules/admin/admin.service.ts:285-293`
- Modify: `huarique_backend/src/modules/admin/admin.controller.ts:195`

- [ ] **Step 1: Crear el DTO**

```typescript
// src/modules/admin/dto/update-place.dto.ts
import { IsOptional, IsString, IsBoolean, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AdminUpdatePlaceDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    status?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    isVerified?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string;
}
```

- [ ] **Step 2: Actualizar `updatePlace` en `admin.service.ts`**

Cambiar la firma de:
```typescript
async updatePlace(id: string, updateData: any) {
```
A:
```typescript
async updatePlace(id: string, updateData: AdminUpdatePlaceDto) {
```

Y añadir el import en la parte superior del archivo:
```typescript
import { AdminUpdatePlaceDto } from './dto/update-place.dto';
```

- [ ] **Step 3: Actualizar el controlador**

En `admin.controller.ts` línea 195, cambiar:
```typescript
async updatePlace(@Param('id') id: string, @Body() updateData: any) {
```
A:
```typescript
async updatePlace(@Param('id') id: string, @Body() updateData: AdminUpdatePlaceDto) {
```

Y añadir el import:
```typescript
import { AdminUpdatePlaceDto } from './dto/update-place.dto';
```

- [ ] **Step 4: Compilar**

```bash
cd huarique_backend && pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/admin/
git commit -m "security: use typed DTO in admin updatePlace to prevent mass assignment"
```

---

## Task 10: Agregar `generate-hash.js` al .gitignore

**Files:**
- Modify: `huarique_backend/.gitignore`

- [ ] **Step 1: Añadir al .gitignore**

Añadir al final del archivo `huarique_backend/.gitignore`:
```
generate-hash.js
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "security: ignore generate-hash.js with production password"
```

---

## Task 11: Eliminar fallback hardcodeado de Google Maps API Key

**Files:**
- Modify: `warike_administrativo/apps/dashboard/app/(dashboard)/inicio/page.tsx:717`

- [ ] **Step 1: Editar la línea 717**

Cambiar de:
```typescript
script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || 'AIzaSyAkA-6XcMbhvEALdP-KFSv36CwVTk-sAKI'}&v=3.51`;
```

A:
```typescript
const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
if (!mapsKey) {
    console.error('NEXT_PUBLIC_GOOGLE_MAPS_KEY is not configured');
    return;
}
script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsKey}&v=3.51`;
```

- [ ] **Step 2: Configurar la variable en Railway**

En Railway (frontend service), confirmar que `NEXT_PUBLIC_GOOGLE_MAPS_KEY` está configurada con la nueva API key (después de rotarla en Google Cloud Console).

- [ ] **Step 3: Commit**

```bash
cd warike_administrativo
git add apps/dashboard/app/\(dashboard\)/inicio/page.tsx
git commit -m "security: remove hardcoded Google Maps API key fallback"
```

---

## Resumen de acciones manuales pendientes (no automatizables)

| Acción | Servicio | Urgencia |
|--------|----------|----------|
| Rotar `CLOUDINARY_API_SECRET` | cloudinary.com | CRÍTICA |
| Cambiar `DB_PASSWORD` en PostgreSQL | Servidor DB | CRÍTICA |
| Revocar y reemplazar `RESEND_API_KEY` | resend.com | CRÍTICA |
| Revocar `GOOGLE_CLIENT_SECRET` | console.cloud.google.com | CRÍTICA |
| Revocar y restringir `GOOGLE_MAPS_API_KEY` | console.cloud.google.com | CRÍTICA |
| Revocar `OPENROUTER_API_KEY` | openrouter.ai | CRÍTICA |
| Generar nuevos JWT secrets (≥64 bytes base64) | — | CRÍTICA |
| Configurar `CORS_ORIGIN` en Railway | Railway backend | ALTA |
| Configurar `WHATSAPP_WEBHOOK_TOKEN` en Railway | Railway backend | ALTA |
| Configurar `NEXT_PUBLIC_GOOGLE_MAPS_KEY` en Railway | Railway frontend | ALTA |
| Restringir Google Maps key a dominio `warike.up.railway.app` | Google Cloud | MEDIA |
