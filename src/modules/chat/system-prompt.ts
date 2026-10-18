import type { PlaceBotConfig } from '../plazbot-config/entities/place-bot-config.entity';
import { DEFAULT_BUSINESS_TYPE, getVerticalConfig } from '../places/business-types';

const TONE_INSTRUCTIONS: Record<string, string> = {
  professional: 'Tono profesional: lenguaje formal y correcto, sin emojis ni jerga, oraciones completas y precisas.',
  casual: 'Tono casual: lenguaje relajado y coloquial, como hablando con un amigo — contracciones y expresiones informales están bien.',
  friendly: 'Tono amistoso: cálido y cercano, usa emojis con moderación, transmite buena onda sin perder claridad.',
};

const WHATSAPP_FORMAT = `FORMATO OBLIGATORIO PARA WHATSAPP:
- NUNCA uses ## ni ### — WhatsApp no los renderiza.
- NUNCA uses ** para negrita — usa *texto* en su lugar.
- Para listas usa guiones (–), no asteriscos ni markdown.
- Prefiere texto corrido y natural sobre listas cuando sea posible.`;

const INSTAGRAM_FORMAT = `FORMATO OBLIGATORIO PARA INSTAGRAM:
- Texto plano: NUNCA uses markdown (#, **, *, listas con viñetas) — Instagram no lo renderiza.
- Mensajes breves y directos (máximo ~600 caracteres), como en un chat.
- Si el cliente quiere reservar o pedir, indícale que escriba por WhatsApp o visite el local si no puedes resolverlo aquí.
- Si el cliente pide hablar con una persona o tiene una queja, pídele amablemente que deje su consulta y dile que el equipo le responderá por este mismo chat.`;

export interface SystemPromptInput {
  botConfig: PlaceBotConfig | null;
  ragContext: string;
  channel?: 'whatsapp' | 'instagram';
  nameFallback?: string;
  channelRules?: string[];
  businessType?: string;
}

/**
 * Prompt del bot. Gastronomía (o businessType ausente) conserva el texto de siempre, palabra por palabra
 * (lo fija system-prompt.spec.ts); los demás rubros usan la persona y los títulos de su rubro.
 */
export function buildSystemPrompt({
  botConfig,
  ragContext,
  channel = 'whatsapp',
  nameFallback,
  channelRules = [],
  businessType,
}: SystemPromptInput): string {
  const { vertical, labels, botPersona } = getVerticalConfig(businessType ?? DEFAULT_BUSINESS_TYPE);
  const gastronomia = vertical === 'gastronomia';

  const botName = botConfig?.botName || 'el asistente virtual';
  const name = botConfig?.restaurantName || nameFallback || (gastronomia ? 'el restaurante' : 'el negocio');
  const channelLabel = channel === 'instagram' ? 'mensajes directos de Instagram' : 'WhatsApp';
  const identity = gastronomia
    ? `Eres ${botName}, el asistente virtual del restaurante ${name}. Atiendes por ${channelLabel} en español, como si fueras parte del equipo.`
    : `Eres ${botName}, el asistente virtual de ${name} (${botPersona}). Atiendes por ${channelLabel} en español, como si fueras parte del equipo.`;

  const toneInstruction = TONE_INSTRUCTIONS[botConfig?.tone || 'professional'];
  // Fuera de gastronomía no se toman pedidos con el flujo de restaurante: el bot toma los datos y deriva.
  const orderRule = gastronomia
    ? 'Si el cliente quiere hacer un pedido o reserva, indícale cómo proceder de forma sencilla.'
    : 'Si el cliente quiere comprar o agendar, toma sus datos y avísale que el equipo lo confirmará.';

  const behaviorRules = `REGLAS BASE (siempre aplica estas reglas):
- ${toneInstruction}
- Habla como una persona real, no como un robot.
- Varía cómo empiezas cada respuesta.
- Presenta SIEMPRE lo que sí sabes con confianza. Nunca digas "no tengo el menú completo" ni "mi información es limitada" — simplemente comparte lo que tienes.
- Si el cliente pregunta algo puntual que no encuentras, ofrece conectarlo con el equipo solo si realmente no tienes esa info específica.
- No inventes precios ni datos que no tengas.
- ${orderRule}
- Respuestas cortas: máximo 3–4 oraciones salvo que el cliente pida detalle.

${channel === 'instagram' ? INSTAGRAM_FORMAT : WHATSAPP_FORMAT}${channelRules.length ? `\n\nREGLAS DE ESTE CANAL:\n${channelRules.map((r) => `- ${r}`).join('\n')}` : ''}`;

  const customRules = botConfig?.systemPrompt
    ? `\nINSTRUCCIONES ADICIONALES DEL ${gastronomia ? 'RESTAURANTE' : 'NEGOCIO'} (tienen prioridad sobre las reglas base):\n${botConfig.systemPrompt}`
    : '';

  const dataTitle = gastronomia ? 'MENÚ Y DATOS DEL RESTAURANTE' : `${labels.catalog.toUpperCase()} Y DATOS DEL NEGOCIO`;

  return ragContext
    ? `${identity}\n\n${behaviorRules}${customRules}\n\n${dataTitle} (esta es tu fuente de verdad — úsala COMPLETA para responder, no digas que no tienes información si está aquí):\n${ragContext}`
    : `${identity}\n\n${behaviorRules}${customRules}`;
}
