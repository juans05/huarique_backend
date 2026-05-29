import { Controller, Post, Put, Get, Param, Body, UseGuards, Request } from '@nestjs/common';
import { DocumentsService } from './documents.service';

@Controller('api/documents')
export class DocumentsController {
  constructor(private documents: DocumentsService) {}

  @Post()
  async createDocument(@Body() dto: any, @Request() req) {
    const userId = (req as any).user?.id;
    if (!userId) throw new Error('User not found');
    return this.documents.createDocument(userId, dto);
  }

  @Put(':documentId')
  async updateDocument(
    @Param('documentId') documentId: string,
    @Body() dto: { content: string },
    @Request() req
  ) {
    const userId = (req as any).user?.id;
    if (!userId) throw new Error('User not found');
    return this.documents.updateDocument(userId, documentId, dto.content);
  }

  @Get(':type')
  async getDocument(@Param('type') type: string, @Request() req) {
    const userId = (req as any).user?.id;
    if (!userId) throw new Error('User not found');
    return this.documents.getDocument(userId, type);
  }
}
