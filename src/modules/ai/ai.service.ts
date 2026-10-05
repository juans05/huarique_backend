import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class AiService {
    private readonly client: OpenAI;
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
    }

    // Sin max_tokens OpenRouter reserva el máximo del modelo (~65k) y rechaza con 402 si el saldo no alcanza para esa reserva.
    async chat(
        messages: OpenAI.Chat.ChatCompletionMessageParam[],
        model: string = this.defaultModel,
        maxTokens = 1024,
    ): Promise<string> {
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
