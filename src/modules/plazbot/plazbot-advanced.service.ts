import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class PlazBotAdvancedService {
  private readonly logger = new Logger(PlazBotAdvancedService.name);
  private baseUrl = process.env.PLAZBOT_BASE_URL || 'https://api.plazbot.com';

  async createOpportunity(
    apiKey: string,
    workspaceId: string,
    data: {
      name: string;
      description: string;
      amount: number;
      contactId?: string;
      stageId?: string;
      pipelineId?: string;
    }
  ) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/opportunity`,
        { workspaceId, ...data },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'x-workspace-id': workspaceId,
          },
        }
      );
      return response.data.data;
    } catch (error) {
      this.logger.error('Error creating opportunity', error);
      throw error;
    }
  }

  async sendTemplateMessage(
    apiKey: string,
    workspaceId: string,
    data: {
      template: string;
      destination: string;
      variablesHeader?: { variable: string; value: string }[];
      variablesBody?: { variable: string; value: string }[];
      campaignName?: string;
    }
  ) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/conversation`,
        {
          workspaceId,
          template: data.template,
          destination: data.destination,
          variablesHeader: data.variablesHeader ?? [],
          variablesBody: data.variablesBody ?? [],
          campaignName: data.campaignName,
          sendType: 3, // API send
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
      this.logger.error('Error sending template message', error);
      throw error;
    }
  }

  async createCampaign(
    apiKey: string,
    workspaceId: string,
    data: {
      name: string;
      templateId: string;
      contacts: string[];
    }
  ) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/conversation/campaign`,
        { workspaceId, ...data },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'x-workspace-id': workspaceId,
          },
        }
      );
      return response.data.data;
    } catch (error) {
      this.logger.error('Error creating campaign', error);
      throw error;
    }
  }

  async listActiveTemplates(apiKey: string, workspaceId: string) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/api/template/actives`,
        {
          params: { workspaceId },
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'x-workspace-id': workspaceId,
          },
        }
      );
      return response.data.data || [];
    } catch (error) {
      this.logger.error('Error listing active templates', error);
      return [];
    }
  }

  async getWorkspaceMetrics(apiKey: string, workspaceId: string) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/api/workspace/${workspaceId}/metrics`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'x-workspace-id': workspaceId,
          },
        }
      );
      return response.data.data as {
        totalContacts: number;
        totalConversations: number;
        totalOpportunities: number;
        totalTasks: number;
      };
    } catch (error) {
      this.logger.error('Error fetching workspace metrics', error);
      return null;
    }
  }
}
