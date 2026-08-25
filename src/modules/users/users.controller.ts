import { Controller, Get, Patch, Body, Query, UseGuards, ParseIntPipe, DefaultValuePipe, Post, UseInterceptors, UploadedFile, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator, Logger, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery, ApiConsumes, ApiResponse, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Place } from '../places/entities/place.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePrivacyDto } from './dto/update-privacy.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CloudinaryService } from '../../common/services/cloudinary.service';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
    private readonly logger = new Logger(UsersController.name);

    constructor(
        private readonly usersService: UsersService,
        private readonly cloudinaryService: CloudinaryService,
        @InjectRepository(Place)
        private placesRepo: Repository<Place>,
    ) { }

    @Get('me/profile')
    @ApiOperation({ summary: 'Get current user profile' })
    @ApiResponse({ status: 200, description: 'Returns full profile: level, xp, stats, badges.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    async getMyProfile(@CurrentUser() user: any) {
        return this.usersService.getProfile(user.id);
    }

    @Patch('me/profile')
    @ApiOperation({ summary: 'Update current user profile' })
    @ApiResponse({ status: 200, description: 'Profile updated.' })
    @ApiResponse({ status: 400, description: 'Validation error.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    async updateMyProfile(
        @CurrentUser() user: any,
        @Body() updateProfileDto: UpdateProfileDto,
    ) {
        this.logger.log(`Update profile for user ${user.id}`);
        await this.usersService.updateProfile(user.id, updateProfileDto);
        return { message: 'Perfil actualizado exitosamente' };
    }

    @Patch('me/privacy')
    @ApiOperation({ summary: 'Update current user privacy settings' })
    @ApiResponse({ status: 200, description: 'Privacy settings updated.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    async updateMyPrivacy(@CurrentUser() user: any, @Body() dto: UpdatePrivacyDto) {
        await this.usersService.updatePrivacy(user.id, dto);
        return { message: 'Configuración de privacidad actualizada' };
    }

    @Patch('me/password')
    @ApiOperation({ summary: 'Change the current user password (requires the current one)' })
    @ApiResponse({ status: 200, description: 'Password updated.' })
    @ApiResponse({ status: 400, description: 'Current password is wrong.' })
    async changeMyPassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
        const fullUser = await this.usersService.findById(user.id);
        const isValid = await this.usersService.validatePassword(fullUser, dto.currentPassword);
        // BadRequestException (400), no UnauthorizedException — el interceptor del frontend
        // trata cualquier 401 como "sesión expirada" y desloguea automáticamente.
        if (!isValid) throw new BadRequestException('La contraseña actual no es correcta');

        const newHash = await bcrypt.hash(dto.newPassword, 10);
        await this.usersService.updatePassword(user.id, newHash);
        return { message: 'Contraseña actualizada' };
    }

    @Post('me/avatar')
    @ApiOperation({ summary: 'Upload user avatar image (max 5 MB, jpg/png/webp)' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: { file: { type: 'string', format: 'binary' } },
        },
    })
    @ApiResponse({ status: 201, description: 'Returns { avatarUrl } with the Cloudinary URL.' })
    @ApiResponse({ status: 400, description: 'No file uploaded or invalid format.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    @UseInterceptors(FileInterceptor('file'))
    async uploadAvatar(
        @CurrentUser() user: any,
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
                    new FileTypeValidator({ fileType: '.(png|jpeg|jpg|webp)' }),
                ],
                fileIsRequired: true,
            }),
        )
        file: Express.Multer.File,
    ) {
        const avatarUrl = await this.cloudinaryService.uploadImage(file, 'avatars');
        await this.usersService.updateProfile(user.id, { avatarUrl });
        return { avatarUrl };
    }

    @Get('me/checkins')
    @ApiOperation({ summary: 'Get current user check-in history' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
    @ApiResponse({ status: 200, description: 'Paginated list of user check-ins.' })
    async getMyCheckins(
        @CurrentUser() user: any,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    ) {
        return this.usersService.getUserCheckins(user.id, page, limit);
    }

    @Get('me/followers')
    @ApiOperation({ summary: 'Get users who follow the current user' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiResponse({ status: 200, description: 'Paginated list of followers.' })
    async getMyFollowers(
        @CurrentUser() user: any,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    ) {
        return this.usersService.getFollowers(user.id, page, limit);
    }

    @Get('me/following')
    @ApiOperation({ summary: 'Get users that the current user follows' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiResponse({ status: 200, description: 'Paginated list of following users.' })
    async getMyFollowing(
        @CurrentUser() user: any,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    ) {
        return this.usersService.getFollowing(user.id, page, limit);
    }

    @Get('me/favorites')
    @ApiOperation({ summary: 'Get current user favourite places' })
    @ApiResponse({ status: 200, description: 'List of favourite places.' })
    async getMyFavorites(@CurrentUser() user: any) {
        return this.usersService.getFavorites(user.id);
    }
}
