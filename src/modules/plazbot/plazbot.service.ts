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
    contactId: string,
    message: string
  ) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/agent/send-message`,
        {
          contact_id: contactId,
          message: message,
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'x-workspace-id': workspaceId,
          },
        }
      );

      this.logger.log(`Message sent to ${contactId}`);
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
      tags?: string[];
      stage?: string;
      customFields?: Record<string, any>;
    }
  ) {
    try {
      const response = await axios.patch(
        `${this.baseUrl}/api/contact/${contactId}`,
        updateData,
        {
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
    contactId: string
  ) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/api/agent/logs`,
        {
          params: {
            contact_id: contactId,
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
}
