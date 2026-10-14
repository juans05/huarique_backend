import { BadRequestException, Logger } from '@nestjs/common';

const logger = new Logger('CulqiClient');

export async function culqiRequest(secretKey: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
    const res = await fetch(`https://api.culqi.com/v2${path}`, {
        method,
        headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
        const message = data?.user_message || data?.merchant_message || 'Error procesando el pago';
        logger.error(`Culqi ${method} ${path}: ${message}`, JSON.stringify(data));
        throw new BadRequestException(message);
    }
    return data;
}
