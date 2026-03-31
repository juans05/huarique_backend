import { Controller, Get, Patch, Body, Query, UseGuards, ParseIntPipe, Post, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CloudinaryService } from '../../common/services/cloudinary.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
    constructor(
        private readonly usersService: UsersService,
        private readonly cloudinaryService: CloudinaryService,
    ) { }

    @Get('me/profile')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get current user profile' })
    async getMyProfile(@CurrentUser() user: any) {
        return this.usersService.getProfile(user.id);
    }

    @Patch('me/profile')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update current user profile' })
    async updateMyProfile(
        @CurrentUser() user: any,
        @Body() updateProfileDto: UpdateProfileDto,
    ) {
        console.log('🔵 [Controller] Update profile request recibida');
        console.log('🔵 [Controller] User ID:', user.id);
        console.log('🔵 [Controller] DTO recibido:', JSON.stringify(updateProfileDto, null, 2));
        console.log('🔵 [Controller] Campos individuales:');
        console.log('   - fullName:', updateProfileDto.fullName);
        console.log('   - bio:', updateProfileDto.bio);
        console.log('   - pronouns:', updateProfileDto.pronouns);
        console.log('   - gender:', updateProfileDto.gender);
        console.log('   - birthDate:', updateProfileDto.birthDate);
        console.log('   - avatarUrl:', updateProfileDto.avatarUrl);

        await this.usersService.updateProfile(user.id, updateProfileDto);

        console.log('✅ [Controller] Perfil actualizado en BD');
        return { message: 'Perfil actualizado exitosamente' };
    }

    @Post('me/avatar')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Upload user avatar' })
    @ApiConsumes('multipart/form-data')
    @UseInterceptors(FileInterceptor('file'))
    async uploadAvatar(
        @CurrentUser() user: any,
        @UploadedFile() file: Express.Multer.File,
    ) {
        console.log('🔵 [Controller] Upload avatar request recibida');
        console.log('🔵 [Controller] User ID:', user.id);
        console.log('🔵 [Controller] File recibido:', file ? 'SÍ' : 'NO');

        if (!file) {
            console.log('❌ [Controller] Error: No se recibió archivo');
            throw new Error('No file uploaded');
        }

        console.log('🔵 [Controller] File details:');
        console.log('   - Filename:', file.originalname);
        console.log('   - MimeType:', file.mimetype);
        console.log('   - Size:', file.size, 'bytes');
        console.log('   - Buffer length:', file.buffer?.length || 'N/A');

        try {
            console.log('🔵 [Controller] Llamando a cloudinaryService.uploadImage...');
            const avatarUrl = await this.cloudinaryService.uploadImage(file, 'avatars');
            console.log('✅ [Controller] Avatar URL recibida de Cloudinary:', avatarUrl);

            // Actualizar el avatar del usuario
            console.log('🔵 [Controller] Actualizando perfil del usuario...');
            await this.usersService.updateProfile(user.id, { avatarUrl });
            console.log('✅ [Controller] Perfil actualizado exitosamente');

            return { avatarUrl };
        } catch (error) {
            console.log('❌ [Controller] Error al procesar upload:');
            console.log('   - Error:', error.message);
            console.log('   - Stack:', error.stack);
            throw error;
        }
    }

    @Get('me/checkins')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get current user check-ins' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async getMyCheckins(
        @CurrentUser() user: any,
        @Query('page', new ParseIntPipe({ optional: true })) page?: number,
        @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    ) {
        return this.usersService.getUserCheckins(user.id, page, limit);
    }

    @Get('me/followers')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get current user followers' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async getMyFollowers(
        @CurrentUser() user: any,
        @Query('page', new ParseIntPipe({ optional: true })) page?: number,
        @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    ) {
        return this.usersService.getFollowers(user.id, page, limit);
    }

    @Get('me/following')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get users that current user is following' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async getMyFollowing(
        @CurrentUser() user: any,
        @Query('page', new ParseIntPipe({ optional: true })) page?: number,
        @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    ) {
        return this.usersService.getFollowing(user.id, page, limit);
    }

    @Get('me/favorites')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get current user favorite places' })
    async getMyFavorites(@CurrentUser() user: any) {
        return this.usersService.getFavorites(user.id);
    }
}
