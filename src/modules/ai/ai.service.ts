import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatMsg, hasMultimodal, toGeminiRequest } from './gemini-request.util';

// Cada proveedor tiene este tiempo antes de pasar al siguiente: Gemini saturado puede colgarse minutos sin responder.
const PROVIDER_TIMEOUT_MS = 15_000;

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name);
    private readonly client: OpenAI;
    private readonly gemini: GoogleGenerativeAI | null;
    private readonly anthropic: Anthropic | null;
    // Modelos directos de Gemini, en orden. Flash-Lite primero: es el más barato y el que menos se satura.
    // Cambiable con AI_GEMINI_MODELS (lista separada por comas).
    private readonly geminiModels = (process.env.AI_GEMINI_MODELS || 'gemini-3.1-flash-lite,gemini-flash-latest')
        .split(',').map((m) => m.trim()).filter(Boolean);
    // Respaldo de otra empresa: si Google se satura, Anthropic no. Cambiable con AI_CLAUDE_MODEL.
    private readonly claudeModel = process.env.AI_CLAUDE_MODEL || 'claude-haiku-5-5';
    // gemini-flash-1.5 fue retirado de OpenRouter (404 "No endpoints found"): rompía todo lo que usa este servicio.
    // Se puede cambiar sin tocar código con AI_DEFAULT_MODEL.
    private readonly defaultModel = process.env.AI_DEFAULT_MODEL || 'google/gemini-2.5-flash';

    constructor(private configService: ConfigService) {
        this.client = new OpenAI({
            baseURL: 'https://openrouter.ai/api/v1',
            apiKey: this.configService.get<string>('OPENROUTER_API_KEY'),
            defaultHeaders: {
                'HTTP-Referer': this.configService.get<string>('FRONTEND_URL') || 'https://warike.up.railway.app',
                'X-Title': 'Warike',
            },
        });
        const geminiKey = this.configService.get<string>('GEMINI_API_KEY');
        this.gemini = geminiKey ? new GoogleGenerativeAI(geminiKey) : null;
        const anthropicKey = this.configService.get<string>('ANTHROPIC_API_KEY');
        this.anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey, timeout: PROVIDER_TIMEOUT_MS, maxRetries: 1 }) : null;
    }

    /**
     * Texto: Gemini directo (cada modelo de AI_GEMINI_MODELS) → Claude (ANTHROPIC_API_KEY) → OpenRouter. Se salta el
     * proveedor sin clave. Con imágenes o archivos va directo por OpenRouter (Gemini directo no descarga URLs).
     * `model` solo aplica a OpenRouter: quien lo pasa pide ese modelo concreto, así que se respeta.
     */
    async chat(
        messages: OpenAI.Chat.ChatCompletionMessageParam[],
        model?: string,
        maxTokens = 1024,
    ): Promise<string> {
        if (!model && !hasMultimodal(messages as ChatMsg[])) {
            if (this.gemini) {
                for (const geminiModel of this.geminiModels) {
                    try {
                        return await this.chatGemini(messages, geminiModel, maxTokens);
                    } catch (err: any) {
                        this.logger.warn(`Gemini ${geminiModel} falló: ${err?.message}`);
                    }
                }
            }
            if (this.anthropic) {
                try {
                    return await this.chatClaude(messages, maxTokens);
                } catch (err: any) {
                    this.logger.warn(`Claude ${this.claudeModel} falló, se usa OpenRouter: ${err?.message}`);
                }
            }
        }
        try {
            return await this.chatOpenRouter(messages, model ?? this.defaultModel, maxTokens);
        } catch (err: any) {
            this.logger.error(`OpenRouter falló, no queda proveedor de IA: ${err?.message}`);
            throw new ServiceUnavailableException('La IA está ocupada en este momento. Intenta de nuevo en unos minutos.');
        }
    }

    private async chatGemini(messages: OpenAI.Chat.ChatCompletionMessageParam[], model: string, maxTokens: number): Promise<string> {
        const { systemInstruction, contents } = toGeminiRequest(messages as ChatMsg[]);
        if (contents.length === 0) throw new Error('Sin mensajes de usuario');
        const generative = this.gemini!.getGenerativeModel({ model, systemInstruction }, { timeout: PROVIDER_TIMEOUT_MS });
        const result = await generative.generateContent({
            contents,
            // Sin "thinking": gastaría los tokens de la respuesta y la devolvería vacía. Los Flash-Lite no piensan por
            // defecto y rechazan thinkingBudget con 400, así que a ellos no se les manda.
            generationConfig: { maxOutputTokens: maxTokens, ...(/lite/.test(model) ? {} : { thinkingConfig: { thinkingBudget: 0 } }) } as any,
        });
        const text = result.response.text();
        if (!text?.trim()) throw new Error('Gemini devolvió una respuesta vacía');
        return text;
    }

    private async chatClaude(messages: OpenAI.Chat.ChatCompletionMessageParam[], maxTokens: number): Promise<string> {
        // Mismas reglas que Gemini (empieza con el usuario, turnos alternados): se reusa la conversión.
        const { systemInstruction, contents } = toGeminiRequest(messages as ChatMsg[]);
        if (contents.length === 0) throw new Error('Sin mensajes de usuario');
        const response = await this.anthropic!.messages.create({
            model: this.claudeModel,
            max_tokens: maxTokens,
            ...(systemInstruction ? { system: systemInstruction } : {}),
            messages: contents.map((c) => ({
                role: c.role === 'model' ? ('assistant' as const) : ('user' as const),
                content: c.parts.map((p) => p.text).join('\n'),
            })),
        });
        const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
        if (!text.trim()) throw new Error('Claude devolvió una respuesta vacía');
        return text;
    }

    // Sin max_tokens OpenRouter reserva el máximo del modelo (~65k) y rechaza con 402 si el saldo no alcanza para esa reserva.
    private async chatOpenRouter(messages: OpenAI.Chat.ChatCompletionMessageParam[], model: string, maxTokens: number): Promise<string> {
        const response = await this.client.chat.completions.create({
            model,
            messages,
            max_tokens: maxTokens,
        });
        return response.choices[0].message.content ?? '';
    }

    async chatStream(
        messages: OpenAI.Chat.ChatCompletionMessageParam[],
        model: string = this.defaultModel,
        maxTokens = 1024,
    ) {
        return this.client.chat.completions.create({
            model,
            messages,
            max_tokens: maxTokens,
            stream: true,
        });
    }
}
