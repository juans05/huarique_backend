import { ChatProcessorService } from './chat-processor.service';

// Se usa "BAJA" porque corta el flujo justo después de registrar el mensaje, sin llamar a ningún proveedor de IA.
const build = (existingConversation: any = null) => {
  const conversationRepo = {
    findOne: jest.fn(async () => existingConversation),
    create: jest.fn((x: any) => ({ id: 'conv1', ...x })),
    save: jest.fn(async (x: any) => x),
  };
  const messageRepo = {
    exist: jest.fn(async () => false),
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => x),
    manager: { query: jest.fn(async () => undefined) },
  };
  const sender = { sendText: jest.fn(async () => undefined) };
  const emitter = { emit: jest.fn() };
  const contacts = { upsertByPhone: jest.fn().mockResolvedValue(null) };
  const svc = new ChatProcessorService(
    sender as any, {} as any, {} as any, {} as any, {} as any, emitter as any,
    conversationRepo as any, messageRepo as any, {} as any, contacts as any,
  );
  return { svc, contacts };
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
