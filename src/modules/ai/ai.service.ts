import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class AiService {
    private readonly client: OpenAI;
    private readonly defaultModel = 'google/gemini-flash-1.5';

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

    async chat(
        messages: OpenAI.Chat.ChatCompletionMessageParam[],
        model: string = this.defaultModel,
    ): Promise<string> {
        const response = await this.client.chat.completions.create({
            model,
            messages,
        });
        return response.choices[0].message.content ?? '';
    }

    async chatStream(
        messages: OpenAI.Chat.ChatCompletionMessageParam[],
        model: string = this.defaultModel,
    ) {
        return this.client.chat.completions.create({
            model,
            messages,
            stream: true,
        });
    }
}
