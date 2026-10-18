import { ChatProcessorService } from './chat-processor.service';

// Se usa "BAJA" porque corta el flujo justo después de registrar el mensaje, sin llamar a ningún proveedor de IA.
const build = (existingConversation: any = null, opts: { businessType?: string | null } = {}) => {
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
    findByPlaceId: jest.fn(async () => ({ botName: 'Wari', restaurantName: 'Local de prueba', tone: 'professional', systemPrompt: null, responseMode: 'ai' })),
  };
  const orderAgent = { handle: jest.fn(async () => ({ handled: false, reply: '' })) };
  // businessType: undefined = restaurante, null = el local no existe
  const placeRepo = {
    findOne: jest.fn(async () => (opts.businessType === null ? null : { id: 'p1', businessType: opts.businessType ?? 'restaurante' })),
  };
  const svc = new ChatProcessorService(
    sender as any, vector as any, menuFormatter as any, botConfigService as any, {} as any, emitter as any,
    conversationRepo as any, messageRepo as any, orderAgent as any, contacts as any, placeRepo as any,
  );
  // Nunca se llama a un proveedor de IA real: se simula que hay uno configurado y se intercepta generateReply.
  (svc as any).anthropic = {};
  const generateReply = jest.spyOn(svc as any, 'generateReply').mockResolvedValue('respuesta de prueba');
  return { svc, contacts, orderAgent, menuFormatter, generateReply, placeRepo };
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
