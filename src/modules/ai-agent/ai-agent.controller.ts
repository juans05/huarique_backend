import { Controller, Post, Get, Delete, Param, Body, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiAgentService } from './ai-agent.service';

// Use require for pdf-parse due to CommonJS module issues
const pdfParse = require('pdf-parse');

@UseGuards(JwtAuthGuard)
@Controller('business/knowledge-bases')
export class AiAgentController {
    constructor(private aiAgentService: AiAgentService) {}

    // Upload and process document (PDF or TXT)
    @Post(':placeId/upload')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: memoryStorage(),
            fileFilter: (req, file, cb) => {
                const allowedMimes = ['text/plain', 'application/pdf'];
                if (allowedMimes.includes(file.mimetype)) {
                    cb(null, true);
                } else {
                    cb(new BadRequestException('Solo se aceptan archivos TXT y PDF'), false);
                }
            }
        })
    )
    async uploadKnowledgeBase(
        @Param('placeId') placeId: string,
        @UploadedFile() file: Express.Multer.File,
        @Body() body: { fileName?: string }
    ) {
        if (!file) {
            throw new BadRequestException('No file provided');
        }

        let rawText = '';

        // Extract text based on file type
        if (file.mimetype === 'text/plain') {
            rawText = file.buffer.toString('utf-8');
        } else if (file.mimetype === 'application/pdf') {
            try {
                const pdfData = await pdfParse(file.buffer);
                rawText = pdfData.text;
            } catch (error) {
                throw new BadRequestException('Error parsing PDF: ' + error.message);
            }
        }

        if (!rawText || rawText.trim().length === 0) {
            throw new BadRequestException('El archivo no contiene texto válido');
        }

        const fileName = body.fileName || file.originalname;
        const kb = await this.aiAgentService.createKnowledgeBase(placeId, fileName, rawText);

        return {
            id: kb.id,
            fileName: kb.fileName,
            createdAt: kb.createdAt,
            status: 'Documento indexado correctamente'
        };
    }

    // List knowledge bases for a place
    @Get(':placeId')
    async getKnowledgeBases(@Param('placeId') placeId: string) {
        const bases = await this.aiAgentService.getKnowledgeBases(placeId);
        return {
            data: bases,
            total: bases.length
        };
    }

    // Delete knowledge base
    @Delete(':kbId')
    async deleteKnowledgeBase(@Param('kbId') kbId: string) {
        await this.aiAgentService.deleteKnowledgeBase(kbId);
        return { message: 'Base de conocimiento eliminada' };
    }
}
