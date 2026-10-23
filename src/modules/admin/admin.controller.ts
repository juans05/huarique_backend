import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    UseGuards,
    Req,
    HttpCode,
    Query,
    Patch,
    BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminUpdatePlaceDto } from './dto/update-place.dto';
import { ImportScrapedPlacesDto } from './dto/import-scraped-place.dto';
import { ImportScrapedReviewsDto } from './dto/import-scraped-reviews.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { hasPermission } from '../platform-access/permissions';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@ApiBearerAuth()
export class AdminController {
    constructor(private readonly adminService: AdminService) { }

    @RequirePermission('oportunidades.todas', 'oportunidades.propias')

    @Get('opportunities')
    @ApiOperation({ summary: 'Restaurantes sin reclamar rankeados por actividad — oportunidades comerciales' })
    @ApiQuery({ name: 'status', required: false, type: String })
    async getOpportunities(@Query('status') status: string | undefined, @CurrentUser() user: any, @Req() req: any) {
        // Con "propias" (comercial) solo ve los locales asignados a él.
        const mine = !hasPermission(req.platformPermissions ?? [], ['oportunidades.todas']);
        return this.adminService.getOpportunities(status, mine ? user.id : undefined);
    }

    @RequirePermission('oportunidades.todas', 'oportunidades.propias')
    @Get('my-clients')
    @ApiOperation({ summary: 'Locales asignados al comercial (o a todos con oportunidades.todas), con su suscripción' })
    async myClients(@CurrentUser() user: any, @Req() req: any) {
        const all = hasPermission(req.platformPermissions ?? [], ['oportunidades.todas']);
        return this.adminService.salesClients(all ? undefined : user.id);
    }

    @RequirePermission('oportunidades.todas', 'oportunidades.propias')

    @Patch('opportunities/:placeId')
    @ApiOperation({ summary: 'Actualizar el estado comercial de un local (nuevo/contactado/reunion/negociacion/afiliado/no_interesado)' })
    @ApiParam({ name: 'placeId', description: 'Place UUID' })
    async updateOpportunityStatus(@Param('placeId') placeId: string, @Body('status') status: string, @CurrentUser() user: any, @Req() req: any) {
        if (!hasPermission(req.platformPermissions ?? [], ['oportunidades.todas'])) await this.adminService.assertAssignedTo(placeId, user.id);
        await this.adminService.updateOpportunityStatus(placeId, status);
        return { message: 'Estado actualizado' };
    }

    @RequirePermission('oportunidades.todas')

    @Get('sales-users')
    @ApiOperation({ summary: 'Usuarios con rol comercial (para asignar locales)' })
    async listSalesUsers() {
        return this.adminService.listSalesUsers();
    }

    @RequirePermission('oportunidades.todas')

    @Patch('places/:placeId/sales-user')
    @ApiOperation({ summary: 'Asignar, reasignar o liberar el comercial de un local' })
    @ApiParam({ name: 'placeId', description: 'Place UUID' })
    async assignSalesUser(@Param('placeId') placeId: string, @Body('salesUserId') salesUserId: string | null) {
        return this.adminService.assignSalesUser(placeId, salesUserId || null);
    }

    @RequirePermission('locales.ver')

    @Get('wuarikes-here-requests')
    @ApiOperation({ summary: 'Solicitudes de "Quiero Wuarikes aquí"' })
    @ApiQuery({ name: 'status', required: false, type: String })
    async getWuarikesHereRequests(@Query('status') status?: string) {
        return this.adminService.getWuarikesHereRequests(status);
    }

    @RequirePermission('locales.gestionar')

    @Patch('wuarikes-here-requests/:id')
    @ApiOperation({ summary: 'Actualizar el estado de una solicitud de "Quiero Wuarikes aquí"' })
    @ApiParam({ name: 'id', description: 'Request UUID' })
    async updateWuarikesHereRequestStatus(@Param('id') id: string, @Body('status') status: string) {
        await this.adminService.updateWuarikesHereRequestStatus(id, status);
        return { message: 'Estado actualizado' };
    }

    @RequirePermission('locales.ver')

    @Get('submissions')
    @ApiOperation({ summary: 'List pending place submissions' })
    @ApiResponse({ status: 200, description: 'Array of pending place submissions.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    @ApiResponse({ status: 403, description: 'Forbidden — admin role required.' })
    async getPendingSubmissions() {
        return this.adminService.getPendingSubmissions();
    }

    @RequirePermission('locales.gestionar')

    @Post('submissions/:id/approve')
    @HttpCode(200)
    @ApiOperation({ summary: 'Approve a place submission' })
    @ApiParam({ name: 'id', description: 'Submission UUID' })
    @ApiResponse({ status: 200, description: 'Submission approved and place published.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    @ApiResponse({ status: 403, description: 'Forbidden — admin role required.' })
    @ApiResponse({ status: 404, description: 'Submission not found.' })
    async approveSubmission(@Param('id') id: string, @CurrentUser() admin: any) {
        return this.adminService.approveSubmission(id, admin.id);
    }

    @RequirePermission('locales.gestionar')

    @Post('submissions/:id/reject')
    @HttpCode(200)
    @ApiOperation({ summary: 'Reject a place submission' })
    @ApiParam({ name: 'id', description: 'Submission UUID' })
    @ApiBody({ schema: { type: 'object', properties: { reason: { type: 'string' } } } })
    @ApiResponse({ status: 200, description: 'Submission rejected.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    @ApiResponse({ status: 403, description: 'Forbidden — admin role required.' })
    @ApiResponse({ status: 404, description: 'Submission not found.' })
    async rejectSubmission(
        @Param('id') id: string,
        @Body('reason') reason: string,
        @CurrentUser() admin: any,
    ) {
        return this.adminService.rejectSubmission(id, admin.id, reason);
    }

    @RequirePermission('locales.ver')

    @Get('claims')
    @ApiOperation({ summary: 'List pending business claims' })
    @ApiResponse({ status: 200, description: 'Array of pending business claims.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    @ApiResponse({ status: 403, description: 'Forbidden — admin role required.' })
    async getPendingClaims() {
        return this.adminService.getPendingClaims();
    }

    @RequirePermission('locales.ver')

    @Get('stats')
    @ApiOperation({ summary: 'Get dashboard statistics' })
    @ApiResponse({ status: 200, description: 'Dashboard stats: users, places, checkins, etc.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    @ApiResponse({ status: 403, description: 'Forbidden — admin role required.' })
    async getStats() {
        return this.adminService.getDashboardStats();
    }

    @RequirePermission('locales.gestionar')

    @Post('generate-description')
    @HttpCode(200)
    @ApiOperation({ summary: 'Generate AI description for a place' })
    @ApiBody({
        schema: {
            type: 'object',
            required: ['name', 'district', 'category'],
            properties: {
                name: { type: 'string' },
                district: { type: 'string' },
                category: { type: 'string' },
                keywords: { type: 'array', items: { type: 'string' } },
            },
        },
    })
    @ApiResponse({ status: 200, description: 'Returns { description } generated by AI.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    @ApiResponse({ status: 403, description: 'Forbidden — admin role required.' })
    async generateDescription(@Body() body: { name: string; district: string; category: string; keywords: string[] }) {
        return {
            description: await this.adminService.generateAiDescription(
                body.name,
                body.district,
                body.category,
                body.keywords || []
            )
        };
    }

    @RequirePermission('locales.gestionar')

    @Post('claims/:id/verify')
    @HttpCode(200)
    @ApiOperation({ summary: 'Verify a business claim' })
    @ApiParam({ name: 'id', description: 'Claim UUID' })
    @ApiResponse({ status: 200, description: 'Claim verified and place ownership assigned.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    @ApiResponse({ status: 403, description: 'Forbidden — admin role required.' })
    @ApiResponse({ status: 404, description: 'Claim not found.' })
    async verifyClaim(@Param('id') id: string, @CurrentUser() admin: any) {
        return this.adminService.verifyClaim(id, admin.id);
    }

    @RequirePermission('locales.gestionar')

    @Post('claims/:id/reject')
    @HttpCode(200)
    @ApiOperation({ summary: 'Reject a business claim' })
    @ApiParam({ name: 'id', description: 'Claim UUID' })
    @ApiResponse({ status: 200, description: 'Claim rejected.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    @ApiResponse({ status: 403, description: 'Forbidden — admin role required.' })
    @ApiResponse({ status: 404, description: 'Claim not found.' })
    async rejectClaim(@Param('id') id: string, @CurrentUser() admin: any) {
        return this.adminService.rejectClaim(id, admin.id);
    }

    @RequirePermission('reclamaciones.gestionar')

    @Get('complaints')
    @ApiOperation({ summary: 'List Libro de Reclamaciones entries' })
    @ApiResponse({ status: 200, description: 'Array of complaint book entries.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    @ApiResponse({ status: 403, description: 'Forbidden — admin role required.' })
    async getComplaints() {
        return this.adminService.getComplaints();
    }

    @RequirePermission('reclamaciones.gestionar')

    @Post('complaints/:id/resolve')
    @HttpCode(200)
    @ApiOperation({ summary: 'Register the provider response and resolve a complaint' })
    @ApiParam({ name: 'id', description: 'Complaint UUID' })
    @ApiBody({ schema: { type: 'object', properties: { response: { type: 'string' } } } })
    @ApiResponse({ status: 200, description: 'Complaint resolved.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    @ApiResponse({ status: 403, description: 'Forbidden — admin role required.' })
    @ApiResponse({ status: 404, description: 'Complaint not found.' })
    async resolveComplaint(
        @Param('id') id: string,
        @Body('response') response: string,
        @CurrentUser() admin: any,
    ) {
        return this.adminService.resolveComplaint(id, admin.id, response);
    }

    // --- Users ---

    @RequirePermission('usuarios.ver', 'usuarios.gestionar')

    @Get('users')
    @ApiOperation({ summary: 'List users with pagination and search' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
    @ApiQuery({ name: 'search', required: false, type: String, description: 'Filter by name or email' })
    @ApiResponse({ status: 200, description: 'Paginated list of users.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    @ApiResponse({ status: 403, description: 'Forbidden — admin role required.' })
    async getUsers(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('search') search?: string,
    ) {
        const pageNum = page ? parseInt(page, 10) : 1;
        const limitNum = limit ? parseInt(limit, 10) : 10;
        if (page && isNaN(pageNum)) throw new BadRequestException('page debe ser un número');
        if (limit && isNaN(limitNum)) throw new BadRequestException('limit debe ser un número');
        return this.adminService.getUsers(pageNum, limitNum, search);
    }

    @RequirePermission('usuarios.gestionar')

    @Post('users')
    @ApiOperation({ summary: 'Create a new user (admin)' })
    @ApiResponse({ status: 201, description: 'User created.' })
    @ApiResponse({ status: 400, description: 'Validation error.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    @ApiResponse({ status: 403, description: 'Forbidden — admin role required.' })
    async createUser(@Body() createUserDto: any) {
        return this.adminService.createUser(createUserDto);
    }

    @RequirePermission('usuarios.gestionar')

    @Patch('users/:id/ban')
    @ApiOperation({ summary: 'Ban a user' })
    @ApiParam({ name: 'id', description: 'User UUID' })
    @ApiResponse({ status: 200, description: 'User banned.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    @ApiResponse({ status: 403, description: 'Forbidden — admin role required.' })
    @ApiResponse({ status: 404, description: 'User not found.' })
    async banUser(@Param('id') id: string) {
        return this.adminService.banUser(id);
    }

    @RequirePermission('usuarios.gestionar')

    @Patch('users/:id/activate')
    @ApiOperation({ summary: 'Activate a user' })
    @ApiParam({ name: 'id', description: 'User UUID' })
    @ApiResponse({ status: 200, description: 'User activated.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    @ApiResponse({ status: 403, description: 'Forbidden — admin role required.' })
    @ApiResponse({ status: 404, description: 'User not found.' })
    async activateUser(@Param('id') id: string) {
        return this.adminService.activateUser(id);
    }

    @RequirePermission('usuarios.gestionar')

    @Post('users/:id/send-access-email')
    @HttpCode(200)
    @ApiOperation({ summary: 'Email the user a link to set a new password (also activates the account)' })
    @ApiParam({ name: 'id', description: 'User UUID' })
    @ApiResponse({ status: 200, description: 'Email sent.' })
    @ApiResponse({ status: 404, description: 'User not found.' })
    async sendAccessEmail(@Param('id') id: string) {
        return this.adminService.sendAccessEmail(id);
    }

    // --- Places ---

    @RequirePermission('locales.ver')

    @Get('places')
    @ApiOperation({ summary: 'List places for administration' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'search', required: false, type: String })
    async getPlaces(
        @Query('page') page: number = 1,
        @Query('search') search?: string,
    ) {
        // Sin ?page, la transformación global lo convierte en NaN: se normaliza a 1.
        return this.adminService.getPlaces(Math.max(1, Number(page) || 1), 10, search);
    }

    @RequirePermission('locales.gestionar')

    @Patch('places/:id')
    @ApiOperation({ summary: 'Update a place (status, verification, etc.)' })
    @ApiParam({ name: 'id', description: 'Place UUID' })
    async updatePlace(@Param('id') id: string, @Body() updateData: AdminUpdatePlaceDto) {
        return this.adminService.updatePlace(id, updateData);
    }

    @RequirePermission('locales.gestionar')

    @Patch('places/:id/business-type')
    @ApiOperation({ summary: 'Fijar el tipo de negocio de un local (p. ej. scrapeado o sin dueño)' })
    @ApiParam({ name: 'id', description: 'Place UUID' })
    async setPlaceBusinessType(@Param('id') id: string, @Body('businessType') businessType: string) {
        return this.adminService.setBusinessType(id, businessType);
    }

    @RequirePermission('locales.gestionar')

    @Post('places/import')
    @ApiOperation({ summary: 'Bulk create restaurants from the Google Maps scraper CSV' })
    @ApiResponse({ status: 201, description: 'Returns { imported, skipped, failed, errors }.' })
    async importScrapedPlaces(@Body() dto: ImportScrapedPlacesDto, @CurrentUser() admin: any) {
        return this.adminService.importScrapedPlaces(dto.places, admin.id);
    }

    @RequirePermission('locales.gestionar')

    @Post('reviews/import')
    @ApiOperation({ summary: 'Bulk import Google reviews into google_reviews table' })
    @ApiResponse({ status: 201, description: 'Returns { imported, skipped, failed, errors, total }.' })
    async importGoogleReviews(@Body() dto: ImportScrapedReviewsDto) {
        return this.adminService.importGoogleReviews(dto.reviews);
    }
}
