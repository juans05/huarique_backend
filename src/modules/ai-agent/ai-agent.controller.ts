import { Controller, Post, Get, Delete, Param, Body, UseGuards, UseInterceptors, UploadedFile, BadRequestException, NotFoundException, HttpException, Logger } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Anthropic } from '@anthropic-ai/sdk';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KnowledgeBase } from '../ai/entities/knowledge-base.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlaceTeamService } from '../team/place-team.service';
import { AiAgentService } from './ai-agent.service';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const TurndownService = require('turndown');

const ALLOWED_MIMES = [
    'text/plain',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
];

@UseGuards(JwtAuthGuard)
@Controller('business/knowledge-bases')
export class AiAgentController {
    private readonly logger = new Logger(AiAgentController.name);
    private gemini = process.env.GEMINI_API_KEY
        ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
        : null;
    private anthropic = process.env.ANTHROPIC_API_KEY
        ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
        : null;

    constructor(
        private aiAgentService: AiAgentService,
        private placeTeamService: PlaceTeamService,
        @InjectRepository(KnowledgeBase)
        private knowledgeBaseRepo: Repository<KnowledgeBase>,
    ) { }

    @Post(':placeId/upload')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: memoryStorage(),
            limits: { fileSize: 50 * 1024 * 1024 },
            fileFilter: (req, file, cb) => {
                if (ALLOWED_MIMES.includes(file.mimetype)) {
                    cb(null, true);
                } else {
                    cb(new BadRequestException('Formato no soportado. Acepta: PDF, TXT, DOC, DOCX, JPG, PNG, WEBP'), false);
                }
            }
        })
    )
    async uploadKnowledgeBase(
        @CurrentUser() user: any,
        @Param('placeId') placeId: string,
        @UploadedFile() file: Express.Multer.File,
        @Body() body: { fileName?: string }
    ) {

        try {
            this.logger.log(`[upload] comienzo`);

            await this.placeTeamService.assertAccess(user.id, placeId, 'ia_total');
            if (!file) throw new BadRequestException('No se proporcionó archivo');

            const fileName = body.fileName || file.originalname;
            this.logger.log(`[upload] Procesando "${fileName}" (${file.mimetype}) para placeId=${placeId}`);

            const markdown = await this.toMarkdown(file, fileName);

            if (!markdown || markdown.trim().length === 0) {
                throw new BadRequestException('El archivo no contiene texto válido');
            }

            this.logger.log(`[upload] Markdown generado: ${markdown.length} caracteres`);

            const kb = await this.aiAgentService.createKnowledgeBase(placeId, fileName, markdown);

            return {
                id: kb.id,
                fileName: kb.fileName,
                createdAt: kb.createdAt,
                status: 'Documento indexado correctamente'
            };
        } catch (error) {
            this.logger.error(`[upload] Error: ${error?.message}`);
            if (error instanceof HttpException) throw error;
            if (error?.message?.includes('429') || error?.message?.includes('quota') || error?.message?.includes('Too Many Requests')) {
                throw new BadRequestException('Cuota de Gemini excedida. Espera unos minutos o actualiza tu plan en ai.google.dev');
            }
            throw new BadRequestException(`Error procesando el archivo: ${error?.message ?? error}`);
        }
    }

    @Get(':placeId')
    async getKnowledgeBases(@CurrentUser() user: any, @Param('placeId') placeId: string) {
        await this.placeTeamService.assertAccess(user.id, placeId, 'ia_total');
        const bases = await this.aiAgentService.getKnowledgeBases(placeId);
        return { data: bases, total: bases.length };
    }

    @Post(':placeId/url')
    async indexFromUrl(
        @CurrentUser() user: any,
        @Param('placeId') placeId: string,
        @Body() body: { url: string; fileName?: string }
    ) {
        await this.placeTeamService.assertAccess(user.id, placeId, 'ia_total');
        if (!body.url) throw new BadRequestException('URL requerida');

        let url: URL;
        try {
            url = new URL(body.url);
        } catch {
            throw new BadRequestException('URL inválida');
        }

        this.logger.log(`[url] Procesando ${url.href} para placeId=${placeId}`);

        const response = await axios.get(url.href, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WarikeBot/1.0)' },
            timeout: 15000,
            responseType: 'text',
        }).catch(() => {
            throw new BadRequestException('No se pudo acceder a la URL');
        });

        const dom = new JSDOM(response.data, { url: url.href });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        let markdown: string;

        if (article && article.content) {
            const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
            const rawMd = turndown.turndown(article.content);
            const title = article.title || body.fileName || url.hostname;
            markdown = `# ${title}\n\n> Fuente: ${url.href}\n\n${rawMd}`;
        } else {
            // Fallback: extraer todo el texto visible
            const text = dom.window.document.body?.textContent || '';
            markdown = this.txtToMarkdown(text, body.fileName || url.hostname);
            markdown += `\n\n> Fuente: ${url.href}`;
        }

        this.logger.log(`[url] Markdown generado: ${markdown.length} caracteres`);

        const fileName = body.fileName || url.hostname;
        const kb = await this.aiAgentService.createKnowledgeBase(placeId, fileName, markdown);

        return {
            id: kb.id,
            fileName: kb.fileName,
            createdAt: kb.createdAt,
            status: 'URL indexada correctamente'
        };
    }

    @Delete(':kbId')
    async deleteKnowledgeBase(@CurrentUser() user: any, @Param('kbId') kbId: string) {
        // Esta ruta nunca había validado acceso — cualquier usuario autenticado podía
        // borrar cualquier base de conocimiento de cualquier sede con solo saber el id.
        const kb = await this.knowledgeBaseRepo.findOne({ where: { id: kbId } });
        if (!kb) throw new NotFoundException('Base de conocimiento no encontrada');
        await this.placeTeamService.assertAccess(user.id, kb.placeId, 'ia_total');

        await this.aiAgentService.deleteKnowledgeBase(kbId);
        return { message: 'Base de conocimiento eliminada' };
    }

    // ── Conversores ──────────────────────────────────────────────────────────

    private async toMarkdown(file: Express.Multer.File, fileName: string): Promise<string> {
        const mime = file.mimetype;

        if (mime === 'text/plain') {
            return this.txtToMarkdown(file.buffer.toString('utf-8'), fileName);
        }

        if (mime === 'application/pdf') {
            const pdfData = await pdfParse(file.buffer);
            // pdf-parse solo lee la capa de texto embebida. Un PDF escaneado (foto guardada
            // como PDF) no tiene esa capa y devuelve texto vacío/basura — en ese caso lo
            // tratamos igual que una imagen y lo mandamos a Gemini/Claude para OCR.
            if (pdfData.text.trim().length >= 20) {
                return this.txtToMarkdown(pdfData.text, fileName);
            }
            return this.fileToMarkdownViaAI(file.buffer, mime, fileName);
        }

        if (mime === 'application/msword' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const result = await mammoth.convertToMarkdown({ buffer: file.buffer });
            return `# ${fileName}\n\n${result.value}`;
        }

        if (mime.startsWith('image/')) {
            return this.fileToMarkdownViaAI(file.buffer, mime, fileName);
        }

        throw new BadRequestException('Formato no soportado');
    }

    private txtToMarkdown(text: string, fileName: string): string {
        const lines = text.split('\n');
        const md: string[] = [`# ${fileName}`, ''];

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) { md.push(''); continue; }

            // Detectar posibles títulos (línea corta sin punto al final, en mayúsculas o con números)
            if (trimmed.length < 60 && !trimmed.endsWith('.') && !trimmed.endsWith(',') &&
                (trimmed === trimmed.toUpperCase() || /^[\d]+[.)]\s/.test(trimmed))) {
                md.push(`## ${trimmed}`);
            } else if (/^[-*•]\s/.test(trimmed)) {
                md.push(`- ${trimmed.replace(/^[-*•]\s/, '')}`);
            } else {
                md.push(trimmed);
            }
        }

        return md.join('\n');
    }

    // Extrae texto vía IA (Gemini → Claude) de una imagen o de un PDF escaneado sin capa
    // de texto. Gemini acepta PDF directamente como inlineData igual que una imagen;
    // Claude necesita un bloque 'document' en vez de 'image' para PDFs.
    private async fileToMarkdownViaAI(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
        if (!this.gemini) {
            return `# ${fileName}\n\n*(Archivo subido — se necesita GEMINI_API_KEY para extraer texto)*`;
        }

        // Intentar modelos en orden hasta que uno funcione
        const models = ['gemini-2.0-flash-lite', 'gemini-2.0-flash'];
        const prompt = `Extrae TODO el texto de este archivo y conviértelo a formato Markdown estructurado.
             Usa # para títulos principales, ## para subtítulos, - para listas, **negrita** para énfasis.
             Si es un menú, organiza por secciones con precios. Si es texto libre, mantén la estructura original.
             Responde SOLO con el markdown, sin explicaciones.`;

        for (const modelName of models) {
            try {
                this.logger.log(`[fileToMarkdownViaAI] Intentando con ${modelName}`);
                const model = this.gemini.getGenerativeModel({ model: modelName });
                const result = await model.generateContent([
                    { inlineData: { mimeType, data: buffer.toString('base64') } },
                    prompt,
                ]);
                const text = result.response.text();
                this.logger.log(`[fileToMarkdownViaAI] Éxito con ${modelName}`);
                return `# ${fileName}\n\n${text}`;
            } catch (err) {
                const isSkippable = err?.message?.includes('429') || err?.message?.includes('quota') ||
                    err?.message?.includes('Too Many Requests') || err?.message?.includes('404') ||
                    err?.message?.includes('not found');
                if (isSkippable) {
                    this.logger.warn(`[fileToMarkdownViaAI] Modelo ${modelName} no disponible: ${err?.message?.slice(0, 80)}`);
                    continue;
                }
                throw err;
            }
        }

        // Gemini agotó cuota en todos sus modelos — Claude es más caro por token,
        // por eso va último, pero evita que la subida falle solo porque el nivel
        // gratuito de Gemini se acabó por hoy.
        if (this.anthropic) {
            try {
                this.logger.log(`[fileToMarkdownViaAI] Gemini no disponible, probando con Claude`);
                const isPdf = mimeType === 'application/pdf';
                const response = await this.anthropic.messages.create({
                    model: 'claude-haiku-4-5-20251001',
                    max_tokens: 4096,
                    messages: [{
                        role: 'user',
                        content: [
                            isPdf
                                ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } }
                                : { type: 'image', source: { type: 'base64', media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: buffer.toString('base64') } },
                            { type: 'text', text: prompt },
                        ],
                    }],
                });
                const text = response.content[0].type === 'text' ? response.content[0].text : '';
                if (text) {
                    this.logger.log(`[fileToMarkdownViaAI] Éxito con Claude`);
                    return `# ${fileName}\n\n${text}`;
                }
            } catch (err) {
                this.logger.warn(`[fileToMarkdownViaAI] Claude también falló: ${err?.message}`);
            }
        }

        // Todos los proveedores agotaron cuota — no hay forma de extraer el texto ahora.
        // Antes esto guardaba un placeholder como si fuera contenido real (quedaba
        // "indexado" para siempre sin que el bot tuviera nada que leer). Mejor fallar
        // claro para que el usuario reintente cuando la cuota se renueve.
        throw new Error('quota exceeded: no se pudo extraer el texto del archivo');
    }
}
