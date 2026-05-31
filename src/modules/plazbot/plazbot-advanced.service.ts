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

  async createTemplate(
    apiKey: string,
    workspaceId: string,
    data: {
      elementName: string;
      category: string;
      languageCode: string;
      headerText?: string;
      body: string;
      footer?: string;
      quickReplies?: { text: string }[];
      ctaButtons?: { text: string; type: string; value: string }[];
    }
  ) {
    const buttons: any[] = [];
    (data.quickReplies || []).filter(q => q.text).forEach(q => {
      buttons.push({ type: 'QUICK_REPLY', text: q.text });
    });
    (data.ctaButtons || []).filter(c => c.text).forEach(c => {
      buttons.push({ type: c.type === 'PHONE' ? 'PHONE_NUMBER' : 'URL', text: c.text, ...(c.type === 'URL' ? { url: c.value } : { phoneNumber: c.value }) });
    });

    const response = await axios.post(
      `${this.baseUrl}/api/template`,
      {
        workspaceId,
        name: data.elementName,
        category: data.category,
        language: data.languageCode,
        header: data.headerText ? { type: 'TEXT', text: data.headerText } : undefined,
        body: { text: data.body },
        footer: data.footer ? { text: data.footer } : undefined,
        buttons: buttons.length ? buttons : undefined,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'x-workspace-id': workspaceId,
        },
      }
    );
    return response.data.data;
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
