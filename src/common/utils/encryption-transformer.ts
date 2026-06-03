import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { ValueTransformer } from 'typeorm';

function getKey(): Buffer {
    const secret = process.env.FIELD_ENCRYPTION_KEY;
    if (!secret) {
        throw new Error('FIELD_ENCRYPTION_KEY environment variable is required');
    }
    return scryptSync(secret, 'salt', 32);
}

const ALGORITHM = 'aes-256-gcm';

export const encryptTransformer: ValueTransformer = {
    to(value: string | null): string | null {
        if (value === null || value === undefined) return value;
        const key = getKey();
        const iv = randomBytes(16);
        const cipher = createCipheriv(ALGORITHM, key, iv);
        let encrypted = cipher.update(value, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        return `${iv.toString('hex')}:${authTag}:${encrypted}`;
    },

    from(value: string | null): string | null {
        if (value === null || value === undefined) return value;
        const key = getKey();
        const parts = value.split(':');
        if (parts.length !== 3) return value;
        const [ivHex, authTagHex, encrypted] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    },
};
