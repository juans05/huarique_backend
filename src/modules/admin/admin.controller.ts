import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    UseGuards,
    HttpCode,
    Query,
    Patch,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@ApiBearerAuth()
export class AdminController {
    constructor(private readonly adminService: AdminService) { }

    @Get('submissions')
    @ApiOperation({ summary: 'List pending place submissions' })
    async getPendingSubmissions() {
        return this.adminService.getPendingSubmissions();
    }

    @Post('submissions/:id/approve')
    @HttpCode(200)
    @ApiOperation({ summary: 'Approve a place submission' })
    async approveSubmission(@Param('id') id: string, @CurrentUser() admin: any) {
        return this.adminService.approveSubmission(id, admin.id);
    }

    @Post('submissions/:id/reject')
    @HttpCode(200)
    @ApiOperation({ summary: 'Reject a place submission' })
    async rejectSubmission(
        @Param('id') id: string,
        @Body('reason') reason: string,
        @CurrentUser() admin: any,
    ) {
        return this.adminService.rejectSubmission(id, admin.id, reason);
    }

    @Get('claims')
    @ApiOperation({ summary: 'List pending business claims' })
    async getPendingClaims() {
        return this.adminService.getPendingClaims();
    }

    @Get('stats')
    @ApiOperation({ summary: 'Get dashboard statistics' })
    async getStats() {
        return this.adminService.getDashboardStats();
    }

    @Post('generate-description')
    @HttpCode(200)
    @ApiOperation({ summary: 'Generate AI description' })
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

    @Post('claims/:id/verify')
    @HttpCode(200)
    @ApiOperation({ summary: 'Verify a business claim' })
    async verifyClaim(@Param('id') id: string, @CurrentUser() admin: any) {
        return this.adminService.verifyClaim(id, admin.id);
    }

    // --- Users ---

    @Get('users')
    @ApiOperation({ summary: 'List users' })
    async getUsers(
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10,
        @Query('search') search?: string,
    ) {
        return this.adminService.getUsers(Number(page), Number(limit), search);
    }

    @Post('users')
    @ApiOperation({ summary: 'Create a new user' })
    async createUser(@Body() createUserDto: any) {
        return this.adminService.createUser(createUserDto);
    }

    @Patch('users/:id/ban')
    @ApiOperation({ summary: 'Ban a user' })
    async banUser(@Param('id') id: string) {
        return this.adminService.banUser(id);
    }

    @Patch('users/:id/activate')
    @ApiOperation({ summary: 'Activate a user' })
    async activateUser(@Param('id') id: string) {
        return this.adminService.activateUser(id);
    }
}
