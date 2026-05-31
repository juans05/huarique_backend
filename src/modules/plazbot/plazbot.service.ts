import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class PlazBotService {
  private readonly logger = new Logger(PlazBotService.name);
  private baseUrl = process.env.PLAZBOT_BASE_URL || 'https://api.plazbot.com';

  async getContact(apiKey: string, workspaceId: string, phoneNumber: string) {
    this.logger.log(`[getContact] Buscando contacto phone=${phoneNumber} workspace=${workspaceId}`);
    try {
      const response = await axios.get(
        `${this.baseUrl}/api/contact`,
        {
          params: { search: phoneNumber },
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'x-workspace-id': workspaceId,
          },
        }
      );
      this.logger.log(`[getContact] Respuesta status=${response.status} data=${JSON.stringify(response.data)}`);
      const contact = response.data.data?.[0] || null;
      this.logger.log(`[getContact] Contacto encontrado: ${contact ? JSON.stringify(contact) : 'ninguno'}`);
      return contact;
    } catch (error) {
      this.logger.error(`[getContact] Error status=${error?.response?.status} body=${JSON.stringify(error?.response?.data)}`, error?.message);
      return null;
    }
  }

  async createContact(
    apiKey: string,
    workspaceId: string,
    data: { name: string; phone: string }
  ) {
    this.logger.log(`[createContact] Creando contacto name=${data.name} phone=${data.phone} workspace=${workspaceId}`);
    try {
      const payload = { name: data.name, platformId: 2, internalWhatsappNumber: data.phone };
      this.logger.log(`[createContact] Payload: ${JSON.stringify(payload)}`);
      const response = await axios.post(
        `${this.baseUrl}/api/contact`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'x-workspace-id': workspaceId,
          },
        }
      );
      this.logger.log(`[createContact] Respuesta status=${response.status} data=${JSON.stringify(response.data)}`);
      return response.data.data;
    } catch (error) {
      this.logger.error(`[createContact] Error status=${error?.response?.status} body=${JSON.stringify(error?.response?.data)}`, error?.message);
      throw error;
    }
  }

  async sendMessage(
    apiKey: string,
    workspaceId: string,
    recipientPhone: string,
    message: string
  ) {
    this.logger.log(`[sendMessage] Enviando mensaje a phone=${recipientPhone} workspace=${workspaceId}`);
    try {
      const payload = { content: message, recipientPhone, workspaceId, conversationId: null };
      this.logger.log(`[sendMessage] Payload: ${JSON.stringify(payload)}`);
      const response = await axios.post(
        `${this.baseUrl}/api/message`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'x-workspace-id': workspaceId,
          },
        }
      );
      this.logger.log(`[sendMessage] Respuesta status=${response.status} data=${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error) {
      this.logger.error(`[sendMessage] Error status=${error?.response?.status} body=${JSON.stringify(error?.response?.data)}`, error?.message);
      throw error;
    }
  }

  async updateContact(
    apiKey: string,
    workspaceId: string,
    contactId: string,
    updateData: {
      tags?: string[];   // IDs de tags en PlazBot, no nombres
      stageId?: string;
      customFields?: { code: string; value: string }[];
    }
  ) {
    this.logger.log(`[updateContact] Actualizando contacto id=${contactId} workspace=${workspaceId}`);
    this.logger.log(`[updateContact] Payload: ${JSON.stringify(updateData)}`);
    try {
      const response = await axios.put(
        `${this.baseUrl}/api/contact`,
        updateData,
        {
          params: { id: contactId, workspaceId },
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'x-workspace-id': workspaceId,
          },
        }
      );
      this.logger.log(`[updateContact] Respuesta status=${response.status} data=${JSON.stringify(response.data)}`);
      return response.data.data;
    } catch (error) {
      this.logger.error(`[updateContact] Error status=${error?.response?.status} body=${JSON.stringify(error?.response?.data)}`, error?.message);
      throw error;
    }
  }

  async getConversationHistory(
    apiKey: string,
    workspaceId: string,
    agentId: string,
    contactId: string
  ) {
    this.logger.log(`[getConversationHistory] agentId=${agentId} contactId=${contactId} workspace=${workspaceId}`);
    try {
      const response = await axios.get(
        `${this.baseUrl}/api/agent/logs`,
        {
          params: { agentId, contactId, limit: 20 },
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'x-workspace-id': workspaceId,
          },
        }
      );
      this.logger.log(`[getConversationHistory] Respuesta status=${response.status} items=${response.data.data?.length ?? 0}`);
      return response.data.data || [];
    } catch (error) {
      this.logger.warn(`[getConversationHistory] Error status=${error?.response?.status} body=${JSON.stringify(error?.response?.data)}`, error?.message);
      return [];
    }
  }

  async listConversations(apiKey: string, workspaceId: string): Promise<any[]> {
    this.logger.log(`[listConversations] workspace=${workspaceId} url=${this.baseUrl}/api/conversation`);
    try {
      const response = await axios.get(`${this.baseUrl}/api/conversation`, {
        params: { workspaceId },
        headers: { 'Authorization': `Bearer ${apiKey}`, 'x-workspace-id': workspaceId },
      });
      this.logger.log(`[listConversations] Respuesta status=${response.status} items=${response.data?.data?.data?.length ?? 0}`);
      this.logger.debug(`[listConversations] Raw response: ${JSON.stringify(response.data)}`);
      return response.data?.data?.data || [];
    } catch (error) {
      this.logger.error(`[listConversations] Error status=${error?.response?.status} body=${JSON.stringify(error?.response?.data)}`, error?.message);
      throw error;
    }
  }

  async getMessages(apiKey: string, workspaceId: string, conversationId: string): Promise<any[]> {
    this.logger.log(`[getMessages] conversationId=${conversationId} workspace=${workspaceId}`);
    try {
      const response = await axios.get(`${this.baseUrl}/api/message/get-all`, {
        params: { conversationId, workspaceId },
        headers: { 'Authorization': `Bearer ${apiKey}`, 'x-workspace-id': workspaceId },
      });
      this.logger.log(`[getMessages] Respuesta status=${response.status} items=${response.data?.data?.length ?? 0}`);
      this.logger.debug(`[getMessages] Raw response: ${JSON.stringify(response.data)}`);
      return response.data?.data || [];
    } catch (error) {
      this.logger.error(`[getMessages] Error status=${error?.response?.status} body=${JSON.stringify(error?.response?.data)}`, error?.message);
      throw error;
    }
  }

  async registerWebhook(apiKey: string, workspaceId: string, phoneNumber: string): Promise<void> {
    const webhookUrl = `${process.env.BACKEND_URL || 'https://backendwarike-production.up.railway.app'}/api/webhooks/plazbot`;
    this.logger.log(`[registerWebhook] Registrando webhook phone=${phoneNumber} workspace=${workspaceId} url=${webhookUrl}`);
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/workspace/${workspaceId}/whatsapp/numbers/${phoneNumber}/webhook`,
        { webhook: webhookUrl },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'x-workspace-id': workspaceId,
          },
        }
      );
      this.logger.log(`[registerWebhook] Respuesta status=${response.status} data=${JSON.stringify(response.data)}`);
      this.logger.log(`[registerWebhook] Webhook registrado para número ${phoneNumber}: ${webhookUrl}`);
    } catch (error) {
      this.logger.error(`[registerWebhook] Error status=${error?.response?.status} body=${JSON.stringify(error?.response?.data)}`, error?.message);
      throw error;
    }
  }

  async validateCredentials(apiKey: string, workspaceId: string): Promise<boolean> {
    try {
      await axios.get(
        `${this.baseUrl}/api/template/actives`,
        {
          params: { workspaceId },
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'x-workspace-id': workspaceId,
          },
        }
      );
      this.logger.log(`Conectado a PlazBot — workspace: ${workspaceId}`);
      return true;
    } catch (error) {
      this.logger.error(`Fallo al conectar a PlazBot — workspace: ${workspaceId}`, error?.message);
      return false;
    }
  }
}
