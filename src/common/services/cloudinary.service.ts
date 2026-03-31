import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import * as streamifier from 'streamifier';

@Injectable()
export class CloudinaryService {
    constructor() {
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        const apiKey = process.env.CLOUDINARY_API_KEY;
        const apiSecret = process.env.CLOUDINARY_API_SECRET;

        console.log('🔵 [Cloudinary] Inicializing Cloudinary Service');
        console.log('🔵 [Cloudinary] Cloud Name:', cloudName || 'NOT SET');
        console.log('🔵 [Cloudinary] API Key:', apiKey ? `${apiKey.substring(0, 6)}...` : 'NOT SET');
        console.log('🔵 [Cloudinary] API Secret:', apiSecret ? 'SET' : 'NOT SET');

        if (!cloudName || !apiKey || !apiSecret) {
            const missingVars = [];
            if (!cloudName) missingVars.push('CLOUDINARY_CLOUD_NAME');
            if (!apiKey) missingVars.push('CLOUDINARY_API_KEY');
            if (!apiSecret) missingVars.push('CLOUDINARY_API_SECRET');

            const errorMsg = `❌ Cloudinary credentials missing: ${missingVars.join(', ')}. Please set these environment variables.`;
            console.error(errorMsg);
            throw new Error(errorMsg);
        }

        cloudinary.config({
            cloud_name: cloudName,
            api_key: apiKey,
            api_secret: apiSecret,
        });

        console.log('✅ [Cloudinary] Configuración completada');
    }

    async uploadImage(file: Express.Multer.File, folder: string = 'avatars'): Promise<string> {
        console.log('🔵 [Cloudinary] Iniciando upload de imagen');
        console.log('🔵 [Cloudinary] Folder:', folder);
        console.log('🔵 [Cloudinary] File buffer length:', file.buffer?.length || 'NO BUFFER');

        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder,
                    transformation: [
                        { width: 500, height: 500, crop: 'fill', gravity: 'face' },
                        { quality: 'auto' },
                    ],
                },
                (error, result) => {
                    if (error) {
                        console.log('❌ [Cloudinary] Error al subir imagen:');
                        console.log('   - Error:', error.message || error);
                        console.log('   - Error completo:', JSON.stringify(error, null, 2));
                        return reject(error);
                    }

                    console.log('✅ [Cloudinary] Imagen subida exitosamente');
                    console.log('✅ [Cloudinary] Secure URL:', result.secure_url);
                    console.log('✅ [Cloudinary] Public ID:', result.public_id);
                    resolve(result.secure_url);
                },
            );

            streamifier.createReadStream(file.buffer).pipe(uploadStream);
        });
    }

    async deleteImage(publicId: string): Promise<void> {
        await cloudinary.uploader.destroy(publicId);
    }
}
