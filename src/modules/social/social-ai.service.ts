import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { SocialBotRule } from './entities/social-bot-rule.entity';

const TONE: Record<string, string> = {
  friendly: 'Tono amigable y cercano: cálido, con emojis con moderación.',
  formal: 'Tono formal y profesional: correcto, sin jerga ni emojis.',
  casual: 'Tono jovial y moderno: relajado, como hablando con un amigo.',
};

@Injectable()
export class SocialAiService {
  constructor(private aiService: AiService) {}

  async generateCommentReply(rule: SocialBotRule, restaurantName: string, commentText: string): Promise<string | null> {
    const rules: string[] = [];
    if (!rule.replyToQuestions) rules.push('No respondas preguntas puntuales (horarios, ubicación, menú) — solo agradecé el comentario en general.');
    if (!rule.replyToCompliments) rules.push('No respondas si el comentario es solo un elogio genérico sin pregunta.');
    if (rule.redirectComplaints) rules.push('Si el comentario es una queja o algo negativo, pedile amablemente que te escriba por Mensaje Directo (DM) para resolverlo ahí — no discutas el problema en público.');
    if (!rule.revealPrices) rules.push('No menciones precios exactos aunque los pidan — invitalos a preguntar por DM o visitar el local.');
    if (rule.customInstructions) rules.push(rule.customInstructions);

    const systemPrompt = `Sos el community manager de "${restaurantName}" respondiendo comentarios de Instagram.
${TONE[rule.personality] || TONE.friendly}
Respuesta MUY breve (1-2 oraciones, menos de 150 caracteres), como se responde un comentario real, no un mensaje formal.
${rules.map(r => `- ${r}`).join('\n')}
Devolvé SOLO el texto de la respuesta, sin comillas ni prefijos.`;

    const reply = await this.aiService.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: commentText },
    ]);
    return reply?.trim() || null;
  }

  async generateDmReply(rule: SocialBotRule, restaurantName: string, messageText: string): Promise<string | null> {
    const rules: string[] = [];
    if (!rule.revealPrices) rules.push('No menciones precios exactos — invitalos a visitar el local o hablar con el equipo.');
    if (rule.customInstructions) rules.push(rule.customInstructions);

    const systemPrompt = `Sos el asistente virtual de "${restaurantName}" respondiendo mensajes directos de Instagram.
${TONE[rule.personality] || TONE.friendly}
Respuesta breve y directa (menos de 200 caracteres).
${rules.map(r => `- ${r}`).join('\n')}
Devolvé SOLO el texto de la respuesta, sin comillas ni prefijos.`;

    const reply = await this.aiService.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: messageText },
    ]);
    return reply?.trim() || null;
  }
}
