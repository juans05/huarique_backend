import { Module } from '@nestjs/common';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';
import { CloudinaryConfig } from '../../config/cloudinary.config';

@Module({
    controllers: [UploadController],
    providers: [UploadService, CloudinaryConfig],
    exports: [UploadService],
})
export class UploadModule { }
