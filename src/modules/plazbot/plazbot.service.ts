import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class PlazBotService {
  private readonly logger = new Logger(PlazBotService.name);
  private baseUrl = process.env.PLAZBOT_BASE_URL || 'https://api.plazbot.com';

  async getContact(apiKey: string, workspaceId: string, phoneNumber: string) {
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
      return response.data.data?.[0] || null;
    } catch (error) {
      this.logger.error('Error getting contact', error);
      return null;
    }
  }

  async createContact(
    apiKey: string,
    workspaceId: string,
    data: { name: string; phone: string }
  ) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/contact`,
        {
          name: data.name,
          platformId: 2, // WhatsApp
          internalWhatsappNumber: data.phone,
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'x-workspace-id': workspaceId,
          },
        }
      );
      return response.data.data;
    } catch (error) {
      this.logger.error('Error creating contact', error);
      throw error;
    }
  }

  async sendMessage(
    apiKey: string,
    workspaceId: string,
    recipientPhone: string,
    message: string
  ) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/message`,
        {
          content: message,
          recipientPhone,
          workspaceId,
          conversationId: null,
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'x-workspace-id': workspaceId,
          },
        }
      );

      this.logger.log(`Message sent to ${recipientPhone}`);
      return response.data;
    } catch (error) {
      this.logger.error('Error sending message', error);
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
      return response.data.data;
    } catch (error) {
      this.logger.error('Error updating contact', error);
      throw error;
    }
  }

  async getConversationHistory(
    apiKey: string,
    workspaceId: string,
    agentId: string,
    contactId: string
  ) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/api/agent/logs`,
        {
          params: {
            agentId,
            contactId,
            limit: 20,
          },
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'x-workspace-id': workspaceId,
          },
        }
      );
      return response.data.data || [];
    } catch (error) {
      this.logger.warn('Could not fetch conversation history', error);
      return [];
    }
  }

  async registerWebhook(apiKey: string, workspaceId: string, phoneNumber: string): Promise<void> {
    const webhookUrl = `${process.env.BACKEND_URL || 'https://backendwarike-production.up.railway.app'}/webhooks/plazbot`;
    await axios.post(
      `${this.baseUrl}/api/workspace/${workspaceId}/whatsapp/numbers/${phoneNumber}/webhook`,
      { webhook: webhookUrl },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'x-workspace-id': workspaceId,
        },
      }
    );
    this.logger.log(`Webhook registrado para número ${phoneNumber}: ${webhookUrl}`);
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
      return true;
    } catch {
      return false;
    }
  }
}
