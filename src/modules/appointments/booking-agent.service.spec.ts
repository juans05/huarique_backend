import { BookingAgentService } from './booking-agent.service';
import { addDays, limaDate } from './appointments.rules';

const DAY = addDays(limaDate(new Date()), 1);

// La IA se simula (solo traduce el mensaje a acciones); horarios, resumen y reserva son del servidor.
const SERVICE = { id: 's1', name: 'Corte clásico', price: 2500, durationMin: 30 };
const PEDRO = { id: 'p2', name: 'Pedro', station: 'Silla 2', serviceIds: [] };
const JUAN = { id: 'p1', name: 'Juan', station: 'Silla 1', serviceIds: [] };

function build(aiActions: any[][], slots: string[] = ['16:00', '16:30', '17:00', '17:30']) {
    const drafts: any[] = [];
    const draftsRepo = {
        findOne: jest.fn(async () => drafts.find((d) => d.status === 'ARMANDO') ?? null),
        create: jest.fn((d) => ({ ...d })),
        save: jest.fn(async (d) => { if (!drafts.includes(d)) drafts.push(d); d.updatedAt = new Date(); return d; }),
        update: jest.fn(async () => ({})),
    };
    const appointments = {
        services: jest.fn(async () => [SERVICE]),
        professionals: jest.fn(async () => [JUAN, PEDRO]),
        doesService: () => true,
        availability: jest.fn(async () => ({ professionals: [{ id: 'p2', slots }], any: slots })),
        book: jest.fn(async (_p, dto) => ({ id: 'a1', publicToken: 'tok', professional: PEDRO, ...dto })),
    };
    let turn = 0;
    const ai = { chat: jest.fn(async () => JSON.stringify({ reply: 'ok', actions: aiActions[turn++] ?? [] })) };
    const team = { assertPlaceTier: jest.fn(async () => undefined) };
    const config = { get: () => 'https://panel.test' };
    const svc = new BookingAgentService(draftsRepo as any, appointments as any, ai as any, team as any, config as any);
    const say = (message: string) => svc.handle({ placeId: 'pl', customerName: 'Luis', customerPhone: '51999', message, history: [] });
    return { say, appointments };
}

describe('BookingAgentService', () => {
    it('no toma mensajes que no son de reserva', async () => {
        const { say } = build([]);
        expect(await say('¿Dónde quedan?')).toEqual({ handled: false });
    });

    it('servicio + profesional + día → ofrece horarios libres reales → hora → resumen → confirma y agenda', async () => {
        const { say, appointments } = build([
            [{ type: 'set_service', serviceId: 's1' }, { type: 'set_professional', professionalId: 'p2' }, { type: 'set_date', date: DAY }],
            [{ type: 'set_time', time: '17:00' }],
            [{ type: 'confirm' }],
        ]);
        const r1: any = await say('quiero un corte con Pedro el sábado');
        expect(r1.reply).toMatch(/Horarios libres .* Pedro \(Silla 2\): 4:00 pm, 4:30 pm, 5:00 pm, 5:30 pm/);
        const r2: any = await say('a las 5');
        expect(r2.reply).toMatch(/¿Confirmo tu cita\? Corte clásico con Pedro \(Silla 2\), .* a las 5:00 pm/);
        expect(appointments.book).not.toHaveBeenCalled();
        const r3: any = await say('sí');
        expect(appointments.book).toHaveBeenCalledWith('pl', expect.objectContaining({ serviceId: 's1', professionalId: 'p2', date: DAY, time: '17:00', customerPhone: '51999' }), 'BOT', null);
        expect(r3.reply).toMatch(/Tu cita quedó agendada.*https:\/\/panel\.test\/reservar\/cita\/tok/);
    });

    it('si la hora pedida está ocupada ofrece las más cercanas, sin agendar', async () => {
        const { say, appointments } = build([
            [{ type: 'set_service', serviceId: 's1' }, { type: 'set_professional', professionalId: 'p2' }, { type: 'set_date', date: DAY }, { type: 'set_time', time: '18:00' }, { type: 'confirm' }],
        ], ['10:00', '17:00', '17:30']);
        const r: any = await say('corte con Pedro el 10 a las 6, confirma');
        expect(r.reply).toMatch(/A las 6:00 pm ya no hay cupo/);
        expect(r.reply).toMatch(/5:30 pm/);
        expect(appointments.book).not.toHaveBeenCalled();
    });

    it('con varios profesionales pregunta con quién (o cualquiera)', async () => {
        const { say } = build([[{ type: 'set_service', serviceId: 's1' }]]);
        const r: any = await say('quiero agendar un corte');
        expect(r.reply).toMatch(/¿Con quién.*Juan \(Silla 1\).*Pedro \(Silla 2\).*Cualquiera/s);
    });
});
