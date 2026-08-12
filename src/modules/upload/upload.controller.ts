import {
    Controller,
    Post,
    UseInterceptors,
    UploadedFile,
    UseGuards,
    ParseFilePipe,
    MaxFileSizeValidator,
    FileTypeValidator,
    Logger,
    InternalServerErrorException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody, ApiResponse } from '@nestjs/swagger';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('upload')
@Controller('upload')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UploadController {
    private readonly logger = new Logger(UploadController.name);

    constructor(private readonly uploadService: UploadService) { }

    @Post('image')
    @ApiOperation({ summary: 'Upload an image to Cloudinary' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                },
            },
        },
    })
    @ApiResponse({ status: 201, description: 'Returns { url, publicId } from Cloudinary.' })
    @ApiResponse({ status: 400, description: 'File too large or invalid type.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    @UseInterceptors(FileInterceptor('file'))
    async uploadImage(
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 5 }), // 5MB
                    new FileTypeValidator({ fileType: '.(png|jpeg|jpg|webp)' }),
                ],
            }),
        )
        file: Express.Multer.File,
    ) {
        try {
            const result = await this.uploadService.uploadImage(file);
            return {
                url: result.secure_url,
                publicId: result.public_id,
            };
        } catch (error) {
            this.logger.error('Failed to upload image:', error);
            throw new InternalServerErrorException({
                message: 'Error al subir la imagen a Cloudinary',
                error: error.message || error,
            });
        }
    }

    @Post('document')
    @ApiOperation({ summary: 'Upload a catalog document (image or PDF) to Cloudinary' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                },
            },
        },
    })
    @ApiResponse({ status: 201, description: 'Returns { url, publicId } from Cloudinary.' })
    @ApiResponse({ status: 400, description: 'File too large or invalid type.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    @UseInterceptors(FileInterceptor('file'))
    async uploadDocument(
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 10 }), // 10MB
                    new FileTypeValidator({ fileType: /^(image\/(png|jpe?g|webp)|application\/pdf)$/ }),
                ],
            }),
        )
        file: Express.Multer.File,
    ) {
        try {
            const result = await this.uploadService.uploadImage(file, 'wuarike/catalogs');
            return {
                url: result.secure_url,
                publicId: result.public_id,
            };
        } catch (error) {
            this.logger.error('Failed to upload document:', error);
            throw new InternalServerErrorException({
                message: 'Error al subir el documento a Cloudinary',
                error: error.message || error,
            });
        }
    }

    @Post('video')
    @ApiOperation({ summary: 'Upload a video to Cloudinary' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                },
            },
        },
    })
    @ApiResponse({ status: 201, description: 'Returns { url, publicId } from Cloudinary.' })
    @ApiResponse({ status: 400, description: 'File too large or invalid type.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    @UseInterceptors(FileInterceptor('file'))
    async uploadVideo(
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 16 }), // 16MB — límite de WhatsApp para video
                    new FileTypeValidator({ fileType: /^video\/(mp4|3gpp)$/ }),
                ],
            }),
        )
        file: Express.Multer.File,
    ) {
        try {
            const result = await this.uploadService.uploadVideo(file);
            return {
                url: result.secure_url,
                publicId: result.public_id,
            };
        } catch (error) {
            this.logger.error('Failed to upload video:', error);
            throw new InternalServerErrorException({
                message: 'Error al subir el video a Cloudinary',
                error: error.message || error,
            });
        }
    }
}
