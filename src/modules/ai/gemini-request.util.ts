export interface ChatMsg {
    role: string;
    content: unknown;
}

export interface GeminiRequest {
    systemInstruction?: string;
    contents: { role: 'user' | 'model'; parts: { text: string }[] }[];
}

/** ¿Algún mensaje lleva imágenes o archivos? Esos siguen por OpenRouter (Gemini directo no baja URLs). */
export function hasMultimodal(messages: ChatMsg[]): boolean {
    return messages.some((m) => Array.isArray(m.content) && (m.content as any[]).some((p) => p?.type && p.type !== 'text'));
}

const textOf = (content: unknown): string =>
    typeof content === 'string' ? content : Array.isArray(content) ? (content as any[]).filter((p) => p?.type === 'text').map((p) => p.text).join('\n') : '';

/**
 * Convierte mensajes tipo OpenAI al formato de Gemini: los "system" van aparte, el rol "assistant" se llama "model",
 * y Gemini exige que la conversación empiece con el usuario y alterne roles (se fusionan los consecutivos).
 */
export function toGeminiRequest(messages: ChatMsg[]): GeminiRequest {
    const system = messages.filter((m) => m.role === 'system').map((m) => textOf(m.content)).filter(Boolean).join('\n\n');
    const contents: GeminiRequest['contents'] = [];
    for (const m of messages) {
        if (m.role === 'system') continue;
        const text = textOf(m.content).trim();
        if (!text) continue;
        const role = m.role === 'assistant' ? 'model' : 'user';
        const last = contents[contents.length - 1];
        if (last && last.role === role) last.parts[0].text += `\n${text}`;
        else contents.push({ role, parts: [{ text }] });
    }
    while (contents.length && contents[0].role === 'model') contents.shift();
    return { systemInstruction: system || undefined, contents };
}
