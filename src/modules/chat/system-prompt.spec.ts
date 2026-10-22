import { buildSystemPrompt } from './system-prompt';

const BASE_RULES = (tone: string) => [
  'REGLAS BASE (siempre aplica estas reglas):',
  `- ${tone}`,
  '- Habla como una persona real, no como un robot.',
  '- Varía cómo empiezas cada respuesta.',
  '- Presenta SIEMPRE lo que sí sabes con confianza. Nunca digas "no tengo el menú completo" ni "mi información es limitada" — simplemente comparte lo que tienes.',
  '- Si el cliente pregunta algo puntual que no encuentras, ofrece conectarlo con el equipo solo si realmente no tienes esa info específica.',
  '- No inventes precios ni datos que no tengas.',
];
const BASE_TAIL = [
  '- Respuestas cortas: máximo 3–4 oraciones salvo que el cliente pida detalle.',
  '',
];
const WHATSAPP_FORMAT = [
  'FORMATO OBLIGATORIO PARA WHATSAPP:',
  '- NUNCA uses ## ni ### — WhatsApp no los renderiza.',
  '- NUNCA uses ** para negrita — usa *texto* en su lugar.',
  '- Para listas usa guiones (–), no asteriscos ni markdown.',
  '- Prefiere texto corrido y natural sobre listas cuando sea posible.',
];
const INSTAGRAM_FORMAT = [
  'FORMATO OBLIGATORIO PARA INSTAGRAM:',
  '- Texto plano: NUNCA uses markdown (#, **, *, listas con viñetas) — Instagram no lo renderiza.',
  '- Mensajes breves y directos (máximo ~600 caracteres), como en un chat.',
  '- Si el cliente quiere reservar o pedir, indícale que escriba por WhatsApp o visite el local si no puedes resolverlo aquí.',
  '- Si el cliente pide hablar con una persona o tiene una queja, pídele amablemente que deje su consulta y dile que el equipo le responderá por este mismo chat.',
];

// Textos escritos a mano a partir del método privado ChatProcessorService.buildSystemPrompt de ANTES del multirrubro
// y verificados contra ese método (pasaron con el código viejo antes de refactorizar): gastronomía no puede cambiar ni una coma.
const GASTRO_FRIENDLY_FULL = [
  'Eres Wari, el asistente virtual del restaurante La Casona. Atiendes por WhatsApp en español, como si fueras parte del equipo.',
  '',
  ...BASE_RULES('Tono amistoso: cálido y cercano, usa emojis con moderación, transmite buena onda sin perder claridad.'),
  '- Si el cliente quiere hacer un pedido o reserva, indícale cómo proceder de forma sencilla.',
  ...BASE_TAIL,
  ...WHATSAPP_FORMAT,
  'INSTRUCCIONES ADICIONALES DEL RESTAURANTE (tienen prioridad sobre las reglas base):',
  'No aceptes reservas los domingos.',
  '',
  'MENÚ Y DATOS DEL RESTAURANTE (esta es tu fuente de verdad — úsala COMPLETA para responder, no digas que no tienes información si está aquí):',
  'Horario: 12:00 a 22:00',
].join('\n');

const GASTRO_EMPTY = [
  'Eres el asistente virtual, el asistente virtual del restaurante el restaurante. Atiendes por WhatsApp en español, como si fueras parte del equipo.',
  '',
  ...BASE_RULES('Tono profesional: lenguaje formal y correcto, sin emojis ni jerga, oraciones completas y precisas.'),
  '- Si el cliente quiere hacer un pedido o reserva, indícale cómo proceder de forma sencilla.',
  ...BASE_TAIL,
  ...WHATSAPP_FORMAT,
].join('\n');

const GASTRO_INSTAGRAM = [
  'Eres el asistente virtual, el asistente virtual del restaurante Cevichería Lima. Atiendes por mensajes directos de Instagram en español, como si fueras parte del equipo.',
  '',
  ...BASE_RULES('Tono profesional: lenguaje formal y correcto, sin emojis ni jerga, oraciones completas y precisas.'),
  '- Si el cliente quiere hacer un pedido o reserva, indícale cómo proceder de forma sencilla.',
  ...BASE_TAIL,
  ...INSTAGRAM_FORMAT,
  '',
  'REGLAS DE ESTE CANAL:',
  '- Responde en 2 líneas',
  '',
  'MENÚ Y DATOS DEL RESTAURANTE (esta es tu fuente de verdad — úsala COMPLETA para responder, no digas que no tienes información si está aquí):',
  'Carta X',
].join('\n');

const botConfig = {
  botName: 'Wari',
  restaurantName: 'La Casona',
  tone: 'friendly',
  systemPrompt: 'No aceptes reservas los domingos.',
} as any;

describe('buildSystemPrompt: gastronomía queda idéntica', () => {
  it.each([undefined, 'restaurante', 'cafeteria', 'tipo_desconocido'])(
    'botConfig + RAG + instrucciones propias (businessType=%s)',
    (businessType) => {
      expect(buildSystemPrompt({ botConfig, ragContext: 'Horario: 12:00 a 22:00', businessType })).toBe(GASTRO_FRIENDLY_FULL);
    },
  );

  it('sin botConfig ni RAG', () => {
    expect(buildSystemPrompt({ botConfig: null, ragContext: '' })).toBe(GASTRO_EMPTY);
    expect(buildSystemPrompt({ botConfig: null, ragContext: '', businessType: 'restaurante' })).toBe(GASTRO_EMPTY);
  });

  it('canal Instagram con nombre de respaldo y reglas del canal', () => {
    const input = {
      botConfig: null,
      ragContext: 'Carta X',
      channel: 'instagram' as const,
      nameFallback: 'Cevichería Lima',
      channelRules: ['Responde en 2 líneas'],
    };
    expect(buildSystemPrompt(input)).toBe(GASTRO_INSTAGRAM);
    expect(buildSystemPrompt({ ...input, businessType: 'heladeria' })).toBe(GASTRO_INSTAGRAM);
  });
});

describe('buildSystemPrompt: otros rubros', () => {
  const barberia = (over: Record<string, unknown> = {}) =>
    buildSystemPrompt({
      botConfig: { botName: 'Wari', restaurantName: 'Barbería Don Pepe', tone: 'casual', systemPrompt: 'No cortamos los lunes.' } as any,
      ragContext: '## 📋 Servicios\n- **Corte clásico** — S/ 35.00 · 30 min',
      businessType: 'barberia',
      ...over,
    });

  it('usa la persona del rubro, los títulos de negocio y no menciona restaurante', () => {
    const out = barberia();
    expect(out).toContain(
      'Eres Wari, el asistente virtual de Barbería Don Pepe (recepcionista de un local de belleza). Atiendes por WhatsApp en español, como si fueras parte del equipo.',
    );
    expect(out).toContain('recepcionista');
    expect(out).toContain('INSTRUCCIONES ADICIONALES DEL NEGOCIO (tienen prioridad sobre las reglas base):\nNo cortamos los lunes.');
    expect(out).toContain('SERVICIOS Y DATOS DEL NEGOCIO (esta es tu fuente de verdad');
    expect(out).toContain('Corte clásico');
    expect(out.toLowerCase()).not.toContain('restaurante');
  });

  it('cambia la regla de pedido/reserva por comprar/agendar (sin flujo de pedidos de restaurante)', () => {
    const out = barberia();
    expect(out).toContain('- Si el cliente quiere comprar o agendar, toma sus datos y avísale que el equipo lo confirmará.');
    expect(out).not.toContain('hacer un pedido o reserva');
  });

  it('el título sigue al catálogo del rubro', () => {
    expect(barberia({ businessType: 'boutique' })).toContain('PRODUCTOS Y DATOS DEL NEGOCIO');
    expect(barberia({ businessType: 'veterinaria' })).toContain('CATÁLOGO Y DATOS DEL NEGOCIO');
  });

  it('sin nombre cae en "el negocio"; sin RAG ni instrucciones no agrega esas secciones', () => {
    const out = buildSystemPrompt({ botConfig: null, ragContext: '', businessType: 'spa', channel: 'instagram' });
    expect(out).toContain('Eres el asistente virtual, el asistente virtual de el negocio (recepcionista de un local de belleza). Atiendes por mensajes directos de Instagram');
    expect(out).not.toContain('Y DATOS DEL NEGOCIO');
    expect(out).not.toContain('INSTRUCCIONES ADICIONALES');
    expect(out.toLowerCase()).not.toContain('restaurante');
  });
});
