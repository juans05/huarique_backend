import {
    Controller, Get, Post, Patch, Delete, Param, Body, Query,
    UseGuards, HttpCode, HttpStatus, ForbiddenException, NotFoundException,
    UseInterceptors, UploadedFile, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator,
    Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactsService } from './contacts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Place } from '../places/entities/place.entity';
import { QueryContactDto } from './dto/query-contact.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@ApiTags('contacts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('business/contacts')
export class ContactsController {
    constructor(
        private readonly contactsService: ContactsService,
        @InjectRepository(Place)
        private readonly placesRepository: Repository<Place>,
    ) {}

    private async assertOwner(placeId: string, userId: string) {
        const place = await this.placesRepository.findOne({ where: { id: placeId } });
        if (!place) throw new NotFoundException('Local no encontrado');
        if (place.claimedByUserId !== userId) throw new ForbiddenException('No tienes permiso para gestionar este local');
        return place;
    }

    @Get()
    @ApiOperation({ summary: 'List contacts with search, filter, and pagination' })
    async findAll(@Query() query: QueryContactDto, @CurrentUser() user: any) {
        if (query.placeId) {
            await this.assertOwner(query.placeId, user.id);
        }
        return this.contactsService.findAll(query);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a single contact by ID' })
    @ApiParam({ name: 'id', description: 'Contact UUID' })
    async findOne(@Param('id') id: string) {
        return this.contactsService.findById(id);
    }

    @Post()
    @ApiOperation({ summary: 'Create a new contact manually' })
    @HttpCode(HttpStatus.CREATED)
    async create(@Body() dto: CreateContactDto, @Query('placeId') placeId: string, @CurrentUser() user: any) {
        await this.assertOwner(placeId, user.id);
        return this.contactsService.create(dto, placeId);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update a contact' })
    async update(@Param('id') id: string, @Body() dto: UpdateContactDto) {
        return this.contactsService.update(id, dto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a contact' })
    @HttpCode(HttpStatus.NO_CONTENT)
    async delete(@Param('id') id: string) {
        await this.contactsService.delete(id);
    }

    @Post('import')
    @ApiOperation({ summary: 'Import contacts from CSV or Excel file' })
    @ApiConsumes('multipart/form-data')
    @ApiQuery({ name: 'placeId', required: true })
    @UseInterceptors(FileInterceptor('file'))
    @HttpCode(HttpStatus.ACCEPTED)
    async import(
        @Query('placeId') placeId: string,
        @CurrentUser() user: any,
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 10 }),
                    new FileTypeValidator({ fileType: '.(csv|xlsx|xls)' }),
                ],
                fileIsRequired: true,
            }),
        )
        file: Express.Multer.File,
    ) {
        await this.assertOwner(placeId, user.id);

        const ext = file.originalname.split('.').pop()?.toLowerCase();
        if (ext === 'csv') {
            return this.contactsService.importCsv(placeId, file);
        } else if (ext === 'xlsx' || ext === 'xls') {
            return this.contactsService.importExcel(placeId, file);
        }
    }

    @Get('imports/list')
    @ApiOperation({ summary: 'List all imports for a place' })
    @ApiQuery({ name: 'placeId', required: true })
    async getImports(@Query('placeId') placeId: string, @CurrentUser() user: any) {
        await this.assertOwner(placeId, user.id);
        return this.contactsService.getImportsByPlace(placeId);
    }

    @Get('imports/:importId')
    @ApiOperation({ summary: 'Get import status' })
    @ApiParam({ name: 'importId', description: 'Import UUID' })
    async getImportStatus(@Param('importId') importId: string) {
        return this.contactsService.getImportStatus(importId);
    }

    @Post('export')
    @ApiOperation({ summary: 'Export contacts to CSV or Excel' })
    @ApiQuery({ name: 'placeId', required: true })
    @ApiQuery({ name: 'format', required: false, enum: ['csv', 'xlsx'] })
    @HttpCode(HttpStatus.OK)
    async export(
        @Query('placeId') placeId: string,
        @Query('format') format: 'csv' | 'xlsx',
        @CurrentUser() user: any,
        @Res() res: Response,
    ) {
        await this.assertOwner(placeId, user.id);
        const fmt = format || 'csv';
        const result = await this.contactsService.exportContacts(placeId, fmt);
        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        res.send(result.buffer);
    }

    @Post('sync')
    @ApiOperation({ summary: 'Sync contacts from conversations and public feedback' })
    @ApiQuery({ name: 'placeId', required: true })
    @HttpCode(HttpStatus.OK)
    async sync(@Query('placeId') placeId: string, @CurrentUser() user: any) {
        await this.assertOwner(placeId, user.id);
        const fromWhatsApp = await this.contactsService.syncFromConversations(placeId);
        const fromFeedback = await this.contactsService.syncFromPublicFeedback(placeId);
        return {
            message: 'Sincronización completada',
            synced: { whatsapp: fromWhatsApp, feedback: fromFeedback, total: fromWhatsApp + fromFeedback },
        };
    }
}
