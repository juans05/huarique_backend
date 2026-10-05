import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatMsg, hasMultimodal, toGeminiRequest } from './gemini-request.util';

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name);
    private readonly client: OpenAI;
    private readonly gemini: GoogleGenerativeAI | null;
    // Modelo directo de Gemini (texto). "gemini-flash-latest" apunta siempre al flash vigente: gemini-2.5-flash ya fue
    // retirado para cuentas nuevas. Cambiable con AI_GEMINI_MODEL.
    private readonly geminiModel = process.env.AI_GEMINI_MODEL || 'gemini-flash-latest';
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
    }

    /**
     * Texto: Gemini directo (GEMINI_API_KEY) y, si falla o no hay clave, OpenRouter como respaldo.
     * Con imágenes o archivos va directo por OpenRouter (Gemini directo no descarga URLs).
     * `model` solo aplica a OpenRouter: quien lo pasa pide ese modelo concreto, así que se respeta.
     */
    async chat(
        messages: OpenAI.Chat.ChatCompletionMessageParam[],
        model?: string,
        maxTokens = 1024,
    ): Promise<string> {
        if (this.gemini && !model && !hasMultimodal(messages as ChatMsg[])) {
            try {
                return await this.chatGemini(messages, maxTokens);
            } catch (err: any) {
                this.logger.warn(`Gemini directo falló, se usa OpenRouter: ${err?.message}`);
            }
        }
        return this.chatOpenRouter(messages, model ?? this.defaultModel, maxTokens);
    }

    private async chatGemini(messages: OpenAI.Chat.ChatCompletionMessageParam[], maxTokens: number): Promise<string> {
        const { systemInstruction, contents } = toGeminiRequest(messages as ChatMsg[]);
        if (contents.length === 0) throw new Error('Sin mensajes de usuario');
        const generative = this.gemini!.getGenerativeModel({ model: this.geminiModel, systemInstruction });
        const result = await generative.generateContent({
            contents,
            // Sin "thinking": gastaría los tokens de la respuesta y la devolvería vacía.
            generationConfig: { maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } } as any,
        });
        const text = result.response.text();
        if (!text?.trim()) throw new Error('Gemini devolvió una respuesta vacía');
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
