import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

const ZERNIO_BASE_URL = 'https://zernio.com/api/v1';

// Plataformas que Zernio permite conectar/publicar.
export const ZERNIO_ALLOWED_PLATFORMS = ['instagram', 'facebook', 'tiktok', 'youtube'];
// De esas, solo estas exponen lectura/respuesta de comentarios por su API.
export const ZERNIO_COMMENT_PLATFORMS = ['instagram', 'facebook'];

export interface ZernioAccount {
    platform: string;
    username: string;
    accountId: string;
}

export function normalizeZernioAccounts(raw: any[]): ZernioAccount[] {
    return (raw || [])
        .filter((acc) => ZERNIO_ALLOWED_PLATFORMS.includes(acc.platform))
        .map((acc) => ({
            platform: acc.platform,
            username: acc.username || acc.name || '',
            accountId: acc.accountId || acc.id || acc._id || '',
        }));
}

@Injectable()
export class ZernioService {
    private readonly logger = new Logger(ZernioService.name);
    private readonly api: AxiosInstance;

    constructor() {
        this.api = axios.create({
            baseURL: ZERNIO_BASE_URL,
            headers: {
                Authorization: `Bearer ${process.env.ZERNIO_API_KEY}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        });

        // Retry con backoff exponencial + jitter en 5xx/429, respetando Retry-After.
        let retryCount = 0;
        this.api.interceptors.response.use(
            (response) => {
                retryCount = 0;
                return response;
            },
            async (error) => {
                const config = error.config;
                if (!config || config.__isRetry) return Promise.reject(error);

                const status = error.response?.status;
                const isRetryable = !status || (status >= 500 && status <= 599) || status === 429;
                if (!isRetryable || retryCount >= 3) {
                    retryCount = 0;
                    return Promise.reject(error);
                }

                retryCount++;
                config.__isRetry = true;
                let delay = Math.min(1000 * Math.pow(2, retryCount - 1) + Math.random() * 1000, 10000);
                if (status === 429 && error.response?.headers?.['retry-after']) {
                    delay = parseInt(error.response.headers['retry-after'], 10) * 1000;
                }
                this.logger.warn(`Zernio retry ${config.url} (intento ${retryCount}, status ${status})`);
                await new Promise((resolve) => setTimeout(resolve, delay));
                return this.api(config);
            },
        );
    }

    /** Crea el "perfil" Zernio (workspace) para un Place. Uno por local. */
    async createProfile(name: string): Promise<string> {
        const { data } = await this.api.post('/profiles', { name });
        return data.profile?._id || data._id;
    }

    /** URL de OAuth para que el dueño conecte una cuenta de Instagram/Facebook/etc. */
    async generateConnectUrl(profileId: string, platform: string, redirectUrl: string): Promise<string> {
        const { data } = await this.api.get(`/connect/${platform}`, {
            params: { profileId, redirectUrl },
        });
        return data.authUrl;
    }

    /** Cuentas conectadas al perfil, ya normalizadas. */
    async getActivePlatforms(profileId: string): Promise<ZernioAccount[]> {
        const { data } = await this.api.get('/accounts', { params: { profileId } });
        return normalizeZernioAccounts(data.accounts || data.data || []);
    }

    supportsComments(platform: string): boolean {
        return ZERNIO_COMMENT_PLATFORMS.includes(platform);
    }

    /** Desconecta una cuenta puntual del perfil (no borra el perfil, que puede tener otras plataformas). */
    async disconnectAccount(accountId: string, profileId: string): Promise<void> {
        await this.api.delete(`/accounts/${accountId}`, { params: { profileId } });
    }

    /**
     * OJO: pese al nombre del endpoint, esto devuelve POSTS (con commentCount), no comentarios.
     * Para los comentarios reales de un post hay que llamar getPostComments(postId, accountId).
     */
    async getProfilePosts(profileId: string, limit = 20, cursor: string | null = null) {
        const params: any = { profileId, limit };
        if (cursor) params.cursor = cursor;
        const { data } = await this.api.get('/inbox/comments', { params });
        return data;
    }

    /** Comentarios reales de un post puntual. */
    async getPostComments(postId: string, accountId: string, limit = 50, cursor: string | null = null) {
        const params: any = { accountId, limit };
        if (cursor) params.cursor = cursor;
        const { data } = await this.api.get(`/inbox/comments/${postId}`, { params });
        return data;
    }

    /** Responde públicamente a un comentario (o crea uno nuevo si commentId es null). */
    async postCommentReply(postId: string, accountId: string, message: string, commentId: string | null = null) {
        const payload: any = { accountId, message };
        if (commentId) payload.commentId = commentId;
        const { data } = await this.api.post(`/inbox/comments/${postId}`, payload);
        return data;
    }

    /** Conversaciones de DM (mensajes directos), agregadas de todas las cuentas del perfil. */
    async getConversations(profileId: string, limit = 20, cursor: string | null = null) {
        const params: any = { profileId, limit };
        if (cursor) params.cursor = cursor;
        const { data } = await this.api.get('/inbox/conversations', { params });
        return data;
    }

    /** Mensajes de una conversación de DM puntual. */
    async getConversationMessages(conversationId: string, accountId: string, limit = 50, cursor: string | null = null) {
        const params: any = { accountId, limit };
        if (cursor) params.cursor = cursor;
        const { data } = await this.api.get(`/inbox/conversations/${conversationId}/messages`, { params });
        return data;
    }

    /** Envía un DM en una conversación existente. */
    async sendMessage(conversationId: string, accountId: string, message: string) {
        const { data } = await this.api.post(`/inbox/conversations/${conversationId}/messages`, { accountId, message });
        return data;
    }

    /** Solo para scripts de verificación/cleanup — no se usa en el flujo de producción. */
    async deleteProfile(profileId: string): Promise<void> {
        await this.api.delete(`/profiles/${profileId}`);
    }
}
