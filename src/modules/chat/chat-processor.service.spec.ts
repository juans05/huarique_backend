import { ChatProcessorService } from './chat-processor.service';

// Se usa "BAJA" porque corta el flujo justo después de registrar el mensaje, sin llamar a ningún proveedor de IA.
const build = (
  existingConversation: any = null,
  opts: { businessType?: string | null; placeName?: string | null; botConfig?: any; menuOptions?: any[] } = {},
) => {
  const conversationRepo = {
    findOne: jest.fn(async () => existingConversation),
    create: jest.fn((x: any) => ({ id: 'conv1', ...x })),
    save: jest.fn(async (x: any) => x),
  };
  const messageRepo = {
    exist: jest.fn(async () => false),
    find: jest.fn(async () => []),
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => x),
    manager: { query: jest.fn(async () => undefined) },
  };
  const sender = { sendText: jest.fn(async () => undefined) };
  const emitter = { emit: jest.fn() };
  const contacts = { upsertByPhone: jest.fn().mockResolvedValue(null) };
  const vector = { searchSimilarity: jest.fn(async () => []) };
  const menuFormatter = { formatMenuToMarkdown: jest.fn(async () => '## 📋 Catálogo de prueba') };
  const botConfigService = {
    findByPlaceId: jest.fn(async () =>
      opts.botConfig !== undefined
        ? opts.botConfig
        : { botName: 'Wari', restaurantName: 'Local de prueba', tone: 'professional', systemPrompt: null, responseMode: 'ai' },
    ),
  };
  const menuOptionService = { findByPlaceId: jest.fn(async () => opts.menuOptions ?? []) };
  const orderAgent = { handle: jest.fn(async () => ({ handled: false, reply: '' })) };
  const bookingAgent = { handle: jest.fn(async () => ({ handled: false, reply: '' })) };
  // businessType: undefined = restaurante, null = el local no existe; placeName: undefined = 'Mi Local'
  const placeRepo = {
    findOne: jest.fn(async () =>
      opts.businessType === null
        ? null
        : { id: 'p1', businessType: opts.businessType ?? 'restaurante', name: opts.placeName === undefined ? 'Mi Local' : opts.placeName },
    ),
  };
  const svc = new ChatProcessorService(
    sender as any, vector as any, menuFormatter as any, botConfigService as any, menuOptionService as any, emitter as any,
    conversationRepo as any, messageRepo as any, orderAgent as any, bookingAgent as any, contacts as any, placeRepo as any,
  );
  // Nunca se llama a un proveedor de IA real: se simula que hay uno configurado y se intercepta generateReply.
  (svc as any).anthropic = {};
  const generateReply = jest.spyOn(svc as any, 'generateReply').mockResolvedValue('respuesta de prueba');
  return { svc, contacts, orderAgent, menuFormatter, generateReply, placeRepo, sender, messageRepo, conversationRepo };
};

describe('ChatProcessorService: cliente único', () => {
  it('una conversación nueva hace upsert del contacto (source whatsapp, sin consentimiento)', async () => {
    const { svc, contacts } = build();
    await svc.processIncomingMessage('p1', 'wn1', { name: 'Ana', phone: '51999888777' }, 'BAJA');
    expect(contacts.upsertByPhone).toHaveBeenCalledTimes(1);
    expect(contacts.upsertByPhone).toHaveBeenCalledWith('p1', '51999888777', { name: 'Ana', source: 'whatsapp' });
  });

  it('una conversación que ya estaba abierta no vuelve a tocar el contacto', async () => {
    const { svc, contacts } = build({ id: 'conv0', placeId: 'p1', customerPhone: '51999888777', mode: 'bot', status: 'abierto' });
    await svc.processIncomingMessage('p1', 'wn1', { name: 'Ana', phone: '51999888777' }, 'BAJA');
    expect(contacts.upsertByPhone).not.toHaveBeenCalled();
  });

  it('si el upsert falla, el mensaje se atiende igual', async () => {
    const { svc, contacts } = build();
    contacts.upsertByPhone.mockRejectedValue(new Error('db caída'));
    await expect(svc.processIncomingMessage('p1', 'wn1', { name: 'Ana', phone: '51999888777' }, 'BAJA')).resolves.toEqual({ success: true });
  });
});

describe('ChatProcessorService: bot según el rubro', () => {
  const incoming = (svc: ChatProcessorService) =>
    svc.processIncomingMessage('p1', 'wn1', { name: 'Ana', phone: '51999888777' }, 'Hola, ¿qué precios tienen?');

  it('restaurante: corre el agente de pedidos y el prompt es de restaurante', async () => {
    const { svc, orderAgent, menuFormatter, generateReply } = build();
    await incoming(svc);
    expect(orderAgent.handle).toHaveBeenCalledTimes(1);
    expect(menuFormatter.formatMenuToMarkdown).toHaveBeenCalledWith('p1', 'restaurante');
    expect(generateReply.mock.calls[0][0]).toContain('el asistente virtual del restaurante Local de prueba');
  });

  it('barbería: no corre el agente de pedidos y el prompt es de recepcionista', async () => {
    const { svc, orderAgent, menuFormatter, generateReply } = build(null, { businessType: 'barberia' });
    await expect(incoming(svc)).resolves.toEqual({ success: true });
    expect(orderAgent.handle).not.toHaveBeenCalled();
    expect(menuFormatter.formatMenuToMarkdown).toHaveBeenCalledWith('p1', 'barberia');
    const prompt = generateReply.mock.calls[0][0] as string;
    expect(prompt).toContain('recepcionista');
    expect(prompt).toContain('SERVICIOS Y DATOS DEL NEGOCIO');
    expect(prompt.toLowerCase()).not.toContain('restaurante');
  });

  it('si el local no existe se trata como gastronomía', async () => {
    const { svc, orderAgent, menuFormatter } = build(null, { businessType: null });
    await incoming(svc);
    expect(orderAgent.handle).toHaveBeenCalledTimes(1);
    expect(menuFormatter.formatMenuToMarkdown).toHaveBeenCalledWith('p1', 'restaurante');
  });

  it('processChannelMessage (Instagram/demo) también usa el rubro del local', async () => {
    const { svc, menuFormatter, generateReply } = build(null, { businessType: 'veterinaria' });
    await svc.processChannelMessage('p1', 'instagram', 'Hola');
    expect(menuFormatter.formatMenuToMarkdown).toHaveBeenCalledWith('p1', 'veterinaria');
    const prompt = generateReply.mock.calls[0][0] as string;
    expect(prompt).toContain('asistente de un negocio para mascotas');
    expect(prompt).toContain('CATÁLOGO Y DATOS DEL NEGOCIO');
  });
});

describe('ChatProcessorService: nombre del local y saludo del menú según el rubro', () => {
  const incoming = (svc: ChatProcessorService) =>
    svc.processIncomingMessage('p1', 'wn1', { name: 'Ana', phone: '51999888777' }, 'Hola');

  it('sin botConfig, fuera de gastronomía la identidad usa el nombre real del local (una sola consulta del local)', async () => {
    const { svc, generateReply, placeRepo } = build(null, { businessType: 'barberia', placeName: 'Barbería Don Pepe', botConfig: null });
    await incoming(svc);
    expect(generateReply.mock.calls[0][0]).toContain('el asistente virtual de Barbería Don Pepe (recepcionista de un local de belleza)');
    expect(placeRepo.findOne).toHaveBeenCalledTimes(1);
  });

  it('el nombre del botConfig sigue teniendo prioridad sobre el del local', async () => {
    const { svc, generateReply } = build(null, { businessType: 'barberia', placeName: 'Barbería Don Pepe' });
    await incoming(svc);
    expect(generateReply.mock.calls[0][0]).toContain('el asistente virtual de Local de prueba (recepcionista');
  });

  it('sin botConfig ni nombre del local cae en "el negocio"', async () => {
    const { svc, generateReply } = build(null, { businessType: 'spa', placeName: null, botConfig: null });
    await incoming(svc);
    expect(generateReply.mock.calls[0][0]).toContain('el asistente virtual de el negocio (recepcionista');
  });

  it('gastronomía sin botConfig conserva "el restaurante" aunque el local tenga nombre', async () => {
    const { svc, generateReply } = build(null, { placeName: 'La Casona', botConfig: null });
    await incoming(svc);
    expect(generateReply.mock.calls[0][0]).toContain('el asistente virtual del restaurante el restaurante.');
    expect(generateReply.mock.calls[0][0]).not.toContain('La Casona');
  });

  const menuBot = { botName: 'Wari', restaurantName: '', tone: 'professional', systemPrompt: null, responseMode: 'menu' };
  const menuOptions = [{ label: 'Horarios', actionType: 'text', actionValue: 'Abrimos a las 9' }];

  it('menú numerado sin nombre: restaurante saluda como "nuestro restaurante"', async () => {
    const { svc, sender } = build(null, { botConfig: menuBot, menuOptions });
    await incoming(svc);
    expect(sender.sendText).toHaveBeenCalledWith('wn1', '51999888777', expect.stringContaining('Soy el asistente de nuestro restaurante.'));
  });

  it('menú numerado sin nombre: otro rubro saluda como "nuestro negocio"', async () => {
    const { svc, sender } = build(null, { businessType: 'barberia', botConfig: menuBot, menuOptions });
    await incoming(svc);
    const text = (sender.sendText.mock.calls[0] as any[])[2] as string;
    expect(text).toContain('Soy el asistente de nuestro negocio.');
    expect(text.toLowerCase()).not.toContain('restaurante');
  });

  it('menú numerado con nombre configurado usa ese nombre en cualquier rubro', async () => {
    const { svc, sender } = build(null, { businessType: 'barberia', botConfig: { ...menuBot, restaurantName: 'Barbería Don Pepe' }, menuOptions });
    await incoming(svc);
    expect(sender.sendText).toHaveBeenCalledWith('wn1', '51999888777', expect.stringContaining('Soy el asistente de Barbería Don Pepe.'));
  });
});

// "Tu día" cuenta como pendiente el chat humano cuyo último mensaje es del bot (isFromAi), p. ej. la derivación del menú.
// Los mensajes del operador salen por ConversationsController con isFromAi: false, así que un bot nunca los suplanta.
describe('ChatProcessorService: los textos automáticos del bot se guardan como del bot', () => {
  const conv = () => ({ id: 'conv0', placeId: 'p1', whatsappNumberId: 'wn1', customerPhone: '51999888777', customerName: 'Ana', mode: 'bot', status: 'abierto' });
  const menuBot = { botName: 'Wari', restaurantName: '', tone: 'professional', systemPrompt: null, responseMode: 'menu' };
  const incoming = (svc: ChatProcessorService, text: string) =>
    svc.processIncomingMessage('p1', 'wn1', { name: 'Ana', phone: '51999888777' }, text);
  const savedBot = (messageRepo: { create: jest.Mock }, body: string) =>
    messageRepo.create.mock.calls.map((c) => c[0]).find((m: any) => m.messageType === 'OUTGOING' && m.messageBody === body);

  it('la derivación a una persona desde el menú pasa el chat a modo humano y su texto queda isFromAi: true', async () => {
    const c = conv();
    const { svc, messageRepo } = build(c, { botConfig: menuBot, menuOptions: [{ label: 'Hablar con alguien', actionType: 'human', actionValue: 'Te paso con el equipo' }] });
    await incoming(svc, '1');
    expect(c.mode).toBe('human');
    expect(savedBot(messageRepo, 'Te paso con el equipo')).toMatchObject({ isFromAi: true });
  });

  it('el saludo y las respuestas de texto del menú también quedan isFromAi: true', async () => {
    const { svc, messageRepo } = build(null, { botConfig: menuBot, menuOptions: [{ label: 'Horarios', actionType: 'text', actionValue: 'Abrimos a las 9' }] });
    await incoming(svc, 'Hola'); // conversación nueva: saludo del menú
    expect(messageRepo.create.mock.calls.map((c) => c[0]).filter((m: any) => m.messageType === 'OUTGOING')).toEqual([
      expect.objectContaining({ isFromAi: true, messageBody: expect.stringContaining('Soy el asistente') }),
    ]);
    const second = build(conv(), { botConfig: menuBot, menuOptions: [{ label: 'Horarios', actionType: 'text', actionValue: 'Abrimos a las 9' }] });
    await incoming(second.svc, '1');
    expect(savedBot(second.messageRepo, 'Abrimos a las 9')).toMatchObject({ isFromAi: true });
  });

  it('la respuesta del agente de pedidos queda isFromAi: true', async () => {
    const { svc, orderAgent, messageRepo } = build(conv());
    orderAgent.handle.mockResolvedValue({ handled: true, reply: 'Tu pedido está en camino' } as any);
    await incoming(svc, 'quiero un ceviche');
    expect(savedBot(messageRepo, 'Tu pedido está en camino')).toMatchObject({ isFromAi: true });
  });
});

describe('ChatProcessorService: coexistencia (respuesta desde la app del celular)', () => {
  it('guarda el eco como mensaje del dueño, no del bot, y pasa la conversación a modo humano', async () => {
    const conv = { id: 'conv0', placeId: 'p1', customerPhone: '51999888777', mode: 'bot', status: 'abierto' };
    const { svc, messageRepo, conversationRepo, sender } = build(conv);
    await svc.recordBusinessAppEcho('p1', 'wn1', '51999888777', 'Te espero a las 4', 'wamid.e1');
    expect(conversationRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'conv0', mode: 'human' }));
    expect(messageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv0', messageType: 'OUTGOING', messageBody: 'Te espero a las 4', isFromAi: false, whatsappMessageId: 'wamid.e1' }),
    );
    expect(sender.sendText).not.toHaveBeenCalled();
  });

  it('un eco repetido por Meta no se guarda dos veces', async () => {
    const { svc, messageRepo, conversationRepo } = build();
    messageRepo.exist.mockResolvedValue(true);
    await svc.recordBusinessAppEcho('p1', 'wn1', '51999888777', 'hola', 'wamid.e1');
    expect(conversationRepo.save).not.toHaveBeenCalled();
    expect(messageRepo.save).not.toHaveBeenCalled();
  });
});
