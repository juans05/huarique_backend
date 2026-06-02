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
    this.logger.log(`[createOpportunity] name=${data.name} contactId=${data.contactId} workspace=${workspaceId}`);
    this.logger.log(`[createOpportunity] Payload: ${JSON.stringify({ workspaceId, ...data })}`);
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
      this.logger.log(`[createOpportunity] Respuesta status=${response.status} data=${JSON.stringify(response.data)}`);
      return response.data.data;
    } catch (error) {
      this.logger.error(`[createOpportunity] Error status=${error?.response?.status} body=${JSON.stringify(error?.response?.data)}`, error?.message);
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
    this.logger.log(`[sendTemplateMessage] template=${data.template} destination=${data.destination} workspace=${workspaceId}`);
    const payload = {
      workspaceId,
      template: data.template,
      destination: data.destination,
      variablesHeader: data.variablesHeader ?? [],
      variablesBody: data.variablesBody ?? [],
      campaignName: data.campaignName,
      sendType: 3,
    };
    this.logger.log(`[sendTemplateMessage] Payload: ${JSON.stringify(payload)}`);
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/conversation`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'x-workspace-id': workspaceId,
          },
        }
      );
      this.logger.log(`[sendTemplateMessage] Respuesta status=${response.status} data=${JSON.stringify(response.data)}`);
      return response.data?.data ?? response.data ?? { success: true };
    } catch (error) {
      this.logger.error(`[sendTemplateMessage] Error status=${error?.response?.status} body=${JSON.stringify(error?.response?.data)}`, error?.message);
      const apiError = error?.response?.data;
      throw new Error(apiError?.message || apiError?.error || error?.message || 'Error al enviar template');
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
    this.logger.log(`[createCampaign] name=${data.name} templateId=${data.templateId} contacts=${data.contacts.length} workspace=${workspaceId}`);
    this.logger.log(`[createCampaign] Payload: ${JSON.stringify({ workspaceId, ...data })}`);
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
      this.logger.log(`[createCampaign] Respuesta status=${response.status} data=${JSON.stringify(response.data)}`);
      return response.data?.data ?? response.data ?? { success: true };
    } catch (error) {
      this.logger.error(`[createCampaign] Error status=${error?.response?.status} body=${JSON.stringify(error?.response?.data)}`, error?.message);
      const apiError = error?.response?.data;
      throw new Error(apiError?.message || apiError?.error || error?.message || 'Error al crear campaña');
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
      variableSamples?: Record<number, { value: string; type: string }>;
    }
  ) {
    const buttons: any[] = [];
    (data.quickReplies || []).filter(q => q.text).forEach(q => {
      buttons.push({ type: 'QUICK_REPLY', text: q.text });
    });
    (data.ctaButtons || []).filter(c => c.text).forEach(c => {
      buttons.push({ type: c.type === 'PHONE' ? 'PHONE_NUMBER' : 'URL', text: c.text, ...(c.type === 'URL' ? { url: c.value } : { phoneNumber: c.value }) });
    });

    // Build body example values for Meta's approval (required when template has {{N}} variables)
    const bodyExamples = data.variableSamples
      ? Object.keys(data.variableSamples)
          .sort((a, b) => Number(a) - Number(b))
          .map(k => data.variableSamples![Number(k)]?.value || `sample_${k}`)
      : undefined;

    const components: any[] = [];

    if (data.headerText) {
      components.push({ type: 'HEADER', format: 'TEXT', text: data.headerText });
    }

    components.push({
      type: 'BODY',
      text: data.body,
      ...(bodyExamples?.length ? { example: { body_text: [bodyExamples] } } : {}),
    });

    if (data.footer) {
      components.push({ type: 'FOOTER', text: data.footer });
    }

    if (buttons.length) {
      components.push({ type: 'BUTTONS', buttons });
    }

    const payload = {
      workspaceId,
      payloadTemplate: {
        name: data.elementName,
        category: data.category,
        language: data.languageCode,
        components,
      },
    };
    this.logger.log(`[createTemplate] name=${data.elementName} category=${data.category} workspace=${workspaceId}`);
    this.logger.log(`[createTemplate] Payload: ${JSON.stringify(payload)}`);
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/template`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'x-workspace-id': workspaceId,
          },
        }
      );
      this.logger.log(`[createTemplate] Respuesta status=${response.status} data=${JSON.stringify(response.data)}`);
      return response.data?.data ?? response.data ?? { success: true };
    } catch (error) {
      this.logger.error(`[createTemplate] Error status=${error?.response?.status} body=${JSON.stringify(error?.response?.data)}`, error?.message);
      const apiError = error?.response?.data;
      throw new Error(apiError?.message || apiError?.error || error?.message || 'Error al crear template en PlazBot');
    }
  }

  async listActiveTemplates(apiKey: string, workspaceId: string) {
    this.logger.log(`[listActiveTemplates] workspace=${workspaceId}`);
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
      this.logger.log(`[listActiveTemplates] Respuesta status=${response.status} items=${response.data.data?.length ?? 0}`);
      this.logger.debug(`[listActiveTemplates] Raw response: ${JSON.stringify(response.data)}`);
      return response.data.data || [];
    } catch (error) {
      this.logger.error(`[listActiveTemplates] Error status=${error?.response?.status} body=${JSON.stringify(error?.response?.data)}`, error?.message);
      return [];
    }
  }

  async getWorkspaceMetrics(apiKey: string, workspaceId: string) {
    this.logger.log(`[getWorkspaceMetrics] workspace=${workspaceId}`);
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
      this.logger.log(`[getWorkspaceMetrics] Respuesta status=${response.status} data=${JSON.stringify(response.data)}`);
      return response.data.data as {
        totalContacts: number;
        totalConversations: number;
        totalOpportunities: number;
        totalTasks: number;
      };
    } catch (error) {
      this.logger.error(`[getWorkspaceMetrics] Error status=${error?.response?.status} body=${JSON.stringify(error?.response?.data)}`, error?.message);
      return null;
    }
  }
}
