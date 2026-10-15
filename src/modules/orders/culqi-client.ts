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
        // Sin query (lleva el email del cliente) ni el cuerpo de Culqi: solo ruta, tipo y código.
        logger.error(`Culqi ${method} ${path.split('?')[0]} ${res.status}: ${data?.type ?? '-'} ${data?.code ?? ''} ${message}`);
        throw new BadRequestException(message);
    }
    return data;
}
