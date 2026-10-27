import { ConflictException, NotFoundException } from '@nestjs/common';
import { ContactsService } from './contacts.service';

/** Repo de contactos en memoria: findOne por igualdad, create, save (asigna id y respeta el índice único place+phone). */
const memContacts = (seed: any[] = []) => {
    const rows: any[] = seed.map((r, i) => ({ id: `c${i + 1}`, name: null, email: null, dni: null, tags: null, customFields: null, marketingConsent: false, source: 'import', ...r }));
    let n = rows.length;
    const matches = (r: any, w: any) => Object.entries(w).every(([k, v]) => r[k] === v);
    const repo = {
        rows,
        create: jest.fn((x: any) => ({ marketingConsent: false, ...x })),
        findOne: jest.fn(async ({ where }: any) => (Array.isArray(where) ? where : [where]).map((w: any) => rows.find((r) => matches(r, w))).find(Boolean) ?? null),
        save: jest.fn(async (x: any) => {
            if (!x.id) {
                if (x.phone && rows.some((r) => r.placeId === x.placeId && r.phone === x.phone)) throw Object.assign(new Error('duplicate key'), { code: '23505' });
                x.id = `c${++n}`;
                rows.push(x);
            }
            return x;
        }),
        update: jest.fn(async (where: any, patch: any) => {
            rows.filter((r) => matches(r, where)).forEach((r) => Object.assign(r, patch));
        }),
        query: jest.fn(async () => []),
    };
    return repo;
};

const memImports = () => ({
    create: jest.fn((x: any) => ({ id: 'imp1', ...x })),
    save: jest.fn(async (x: any) => x),
});

/** QueryBuilder falso: encadena y devuelve `result` al final. */
const qb = (result: any) => {
    const chain: any = {};
    for (const m of ['where', 'andWhere', 'orderBy', 'take']) chain[m] = jest.fn(() => chain);
    chain.getMany = jest.fn(async () => result);
    chain.getOne = jest.fn(async () => result);
    return chain;
};

const build = (seed: any[] = [], extra: { orders?: any[]; conversations?: any[]; card?: any; appointments?: any[] } = {}) => {
    const contacts = memContacts(seed);
    const imports = memImports();
    const audit = { log: jest.fn(async () => undefined) };
    const orders = { createQueryBuilder: jest.fn(() => qb(extra.orders ?? [])) };
    const conversations = { createQueryBuilder: jest.fn(() => qb(extra.conversations ?? [])) };
    const cards = { createQueryBuilder: jest.fn(() => qb(extra.card ?? null)) };
    const appointments = { createQueryBuilder: jest.fn(() => qb(extra.appointments ?? [])) };
    const svc = new ContactsService(contacts as any, imports as any, audit as any, orders as any, conversations as any, cards as any, appointments as any);
    return { svc, contacts, imports, audit, orders, conversations, cards, appointments };
};

describe('ContactsService.upsertByPhone', () => {
    it('tres formatos del mismo número terminan en un solo contacto', async () => {
        const { svc, contacts } = build();
        await svc.upsertByPhone('p1', '999 888 777', { source: 'order' });
        await svc.upsertByPhone('p1', '51999888777', { source: 'whatsapp' });
        await svc.upsertByPhone('p1', '+51 999-888-777', { source: 'loyalty' });
        expect(contacts.rows).toHaveLength(1);
        expect(contacts.rows[0]).toMatchObject({ placeId: 'p1', phone: '51999888777', source: 'order' });
    });

    it('el alta desde un pedido nace sin consentimiento de marketing', async () => {
        const { svc } = build();
        const c = await svc.upsertByPhone('p1', '999888777', { name: 'Ana', source: 'order' });
        expect(c).toMatchObject({ name: 'Ana', marketingConsent: false, source: 'order' });
    });

    it('el alta desde una tarjeta copia el consentimiento de la tarjeta', async () => {
        const { svc } = build();
        const c = await svc.upsertByPhone('p1', '999888777', { source: 'loyalty', marketingConsent: true });
        expect(c!.marketingConsent).toBe(true);
    });

    it('un upsert posterior desde un pedido no baja el consentimiento a false', async () => {
        const { svc, contacts } = build();
        await svc.upsertByPhone('p1', '999888777', { source: 'loyalty', marketingConsent: true });
        await svc.upsertByPhone('p1', '999888777', { source: 'order', marketingConsent: false });
        await svc.upsertByPhone('p1', '999888777', { source: 'whatsapp' });
        expect(contacts.rows).toHaveLength(1);
        expect(contacts.rows[0].marketingConsent).toBe(true);
    });

    it('una tarjeta con consentimiento sobre un contacto existente sin consentimiento lo enciende', async () => {
        const { svc, contacts } = build([{ placeId: 'p1', phone: '51999888777', source: 'order' }]);
        await svc.upsertByPhone('p1', '999888777', { source: 'loyalty', marketingConsent: true });
        expect(contacts.rows[0].marketingConsent).toBe(true);
    });

    it('sobre un contacto existente escribe solo las columnas que cambian, nunca la entidad entera', async () => {
        const { svc, contacts } = build([{ placeId: 'p1', phone: '51999888777', name: null, email: 'a@b.pe', marketingConsent: false }]);
        await svc.upsertByPhone('p1', '999888777', { name: 'Ana', source: 'order' });
        expect(contacts.update).toHaveBeenCalledTimes(1);
        expect(contacts.update).toHaveBeenCalledWith({ id: 'c1' }, { name: 'Ana' });
        expect(contacts.save).not.toHaveBeenCalled();
    });

    it('el consentimiento solo se pone en true: el update lleva únicamente marketingConsent', async () => {
        const { svc, contacts } = build([{ placeId: 'p1', phone: '51999888777', name: 'Ana', marketingConsent: false }]);
        await svc.upsertByPhone('p1', '999888777', { name: 'Otra', source: 'loyalty', marketingConsent: true });
        expect(contacts.update).toHaveBeenCalledTimes(1);
        expect(contacts.update).toHaveBeenCalledWith({ id: 'c1' }, { marketingConsent: true });
    });

    it('una lectura vieja con consentimiento true no se escribe de vuelta: si solo se completa el nombre, el update no incluye marketingConsent', async () => {
        const { svc, contacts } = build([{ placeId: 'p1', phone: '51999888777', name: null, marketingConsent: false }]);
        // La lectura trae consentimiento true, pero otro proceso (BAJA) lo dejó en false antes de nuestra escritura.
        contacts.findOne.mockImplementationOnce(async () => ({ ...contacts.rows[0], marketingConsent: true }));
        await svc.upsertByPhone('p1', '999888777', { name: 'Ana', source: 'whatsapp' });
        expect(contacts.update).toHaveBeenCalledWith({ id: 'c1' }, { name: 'Ana' });
        expect(contacts.rows[0].marketingConsent).toBe(false);
    });

    it('sin nada que completar no escribe', async () => {
        const { svc, contacts } = build([{ placeId: 'p1', phone: '51999888777', name: 'Ana', marketingConsent: true }]);
        await svc.upsertByPhone('p1', '999888777', { name: 'Otra', source: 'order', marketingConsent: false });
        expect(contacts.update).not.toHaveBeenCalled();
        expect(contacts.save).not.toHaveBeenCalled();
    });

    it('completa el nombre solo si estaba vacío', async () => {
        const { svc, contacts } = build([
            { placeId: 'p1', phone: '51999888777', name: null },
            { placeId: 'p1', phone: '51911111111', name: 'Beto' },
        ]);
        await svc.upsertByPhone('p1', '999888777', { name: 'Ana', source: 'whatsapp' });
        await svc.upsertByPhone('p1', '911111111', { name: 'Otro', source: 'whatsapp' });
        expect(contacts.rows.map((r) => r.name)).toEqual(['Ana', 'Beto']);
    });

    it('teléfono vacío o sin dígitos devuelve null y no crea nada', async () => {
        const { svc, contacts } = build();
        expect(await svc.upsertByPhone('p1', '', { source: 'order' })).toBeNull();
        expect(await svc.upsertByPhone('p1', '   ', { source: 'order' })).toBeNull();
        expect(await svc.upsertByPhone('p1', 'abc', { source: 'order' })).toBeNull();
        expect(await svc.upsertByPhone('p1', undefined as any, { source: 'order' })).toBeNull();
        expect(contacts.rows).toHaveLength(0);
    });

    it('el mismo teléfono en otro local es otro contacto', async () => {
        const { svc, contacts } = build();
        await svc.upsertByPhone('p1', '999888777', { source: 'order' });
        await svc.upsertByPhone('p2', '999888777', { source: 'order' });
        expect(contacts.rows).toHaveLength(2);
    });

    it('si otro alta gana la carrera (23505) reutiliza el contacto ganador', async () => {
        const { svc, contacts } = build();
        const winner = { id: 'win', placeId: 'p1', phone: '51999888777', name: null, marketingConsent: false, source: 'whatsapp' };
        contacts.save.mockImplementationOnce(async () => {
            contacts.rows.push(winner);
            throw Object.assign(new Error('duplicate key'), { code: '23505' });
        });
        const c = await svc.upsertByPhone('p1', '999888777', { name: 'Ana', source: 'order' });
        expect(c!.id).toBe('win');
        expect(c!.name).toBe('Ana');
        expect(contacts.rows).toHaveLength(1);
    });
});

describe('ContactsService.create', () => {
    it('normaliza el teléfono al crear', async () => {
        const { svc, contacts } = build();
        const c = await svc.create({ name: 'Ana', phone: '999 888 777' }, 'p1');
        expect(c.phone).toBe('51999888777');
        expect(contacts.rows).toHaveLength(1);
    });

    it('rechaza con 409 si ya existe un contacto con ese teléfono en el local', async () => {
        const { svc, contacts } = build([{ placeId: 'p1', phone: '51999888777' }]);
        await expect(svc.create({ phone: '+51 999 888 777' }, 'p1')).rejects.toBeInstanceOf(ConflictException);
        expect(contacts.rows).toHaveLength(1);
    });

    it('sin teléfono se crea igual (solo correo)', async () => {
        const { svc } = build();
        const c = await svc.create({ email: 'a@b.pe' }, 'p1');
        expect(c.phone).toBeNull();
    });
});

describe('ContactsService.update', () => {
    it('normaliza el teléfono y rechaza uno que ya tiene otro contacto', async () => {
        const { svc } = build([
            { placeId: 'p1', phone: '51999888777' },
            { placeId: 'p1', phone: '51911111111' },
        ]);
        await expect(svc.update('c2', { phone: '999 888 777' })).rejects.toBeInstanceOf(ConflictException);
        const ok = await svc.update('c2', { phone: '922 222 222' });
        expect(ok.phone).toBe('51922222222');
    });
});

describe('ContactsService import', () => {
    const csv = (lines: string[]) => ({ originalname: 'c.csv', buffer: Buffer.from(lines.join('\n'), 'utf-8') }) as any;

    it('duplicados dentro del archivo no rompen: se funden en un contacto; filas sin teléfono válido cuentan como fallidas', async () => {
        const { svc, contacts } = build();
        const res = await svc.importCsv('p1', csv([
            'name,phone,email',
            'Ana,999888777,',
            ',51999888777,ana@x.pe',
            'Sin tel,,s@x.pe',
            'Basura,abc,',
        ]));
        expect(contacts.rows).toHaveLength(1);
        expect(contacts.rows[0]).toMatchObject({ name: 'Ana', phone: '51999888777', email: 'ana@x.pe', source: 'import' });
        expect(res.importedRows).toBe(2);
        expect(res.failedRows).toBe(2);
    });

    it('sobre un contacto existente solo llena campos vacíos y nunca baja el consentimiento', async () => {
        const { svc, contacts } = build([{ placeId: 'p1', phone: '51999888777', name: 'Ana', email: null, marketingConsent: true, source: 'loyalty' }]);
        await svc.importCsv('p1', csv(['name,phone,email,consent', 'Otra,999888777,ana@x.pe,false']));
        expect(contacts.rows).toHaveLength(1);
        expect(contacts.rows[0]).toMatchObject({ name: 'Ana', email: 'ana@x.pe', marketingConsent: true, source: 'loyalty' });
        expect(contacts.update).toHaveBeenCalledWith({ id: 'c1' }, { email: 'ana@x.pe' });
    });

    it('una importación nunca sube el consentimiento de un contacto existente (no es un opt-in y podría deshacer una BAJA)', async () => {
        const { svc, contacts } = build([{ placeId: 'p1', phone: '51999888777', name: 'Ana', email: null, marketingConsent: false, source: 'loyalty' }]);
        await svc.importCsv('p1', csv(['name,phone,email,consent', 'Ana,999888777,ana@x.pe,true']));
        expect(contacts.rows[0]).toMatchObject({ email: 'ana@x.pe', marketingConsent: false });
        for (const [, patch] of contacts.update.mock.calls) expect(patch).not.toHaveProperty('marketingConsent');
    });

    it('en contactos nuevos mantiene el consentimiento que traiga el archivo', async () => {
        const { svc, contacts } = build();
        await svc.importCsv('p1', csv(['name,phone,consent', 'Ana,999888777,true', 'Beto,911111111,']));
        expect(contacts.rows.map((r) => r.marketingConsent)).toEqual([true, false]);
    });
});

describe('ContactsService sync', () => {
    it('syncFromConversations no duplica un teléfono que ya existe por otra vía', async () => {
        const { svc, contacts } = build([{ placeId: 'p1', phone: '51999888777', source: 'order' }]);
        contacts.query.mockResolvedValueOnce([
            { customer_phone: '51999888777', customer_name: 'Ana' },
            { customer_phone: '51911111111', customer_name: 'Beto' },
        ]);
        const synced = await svc.syncFromConversations('p1');
        expect(synced).toBe(1);
        expect(contacts.rows.map((r) => r.phone)).toEqual(['51999888777', '51911111111']);
        expect(contacts.rows[0].name).toBe('Ana');
    });

    it('syncFromPublicFeedback normaliza teléfonos, conserva el consentimiento explícito y mantiene el camino de correos', async () => {
        const { svc, contacts } = build();
        contacts.query.mockResolvedValueOnce([
            { customer_name: 'Ana', customer_contact: '999 888 777', marketing_consent: true },
            { customer_name: 'Luz', customer_contact: 'luz@x.pe', marketing_consent: false },
            { customer_name: 'X', customer_contact: 'abc', marketing_consent: false },
        ]);
        const synced = await svc.syncFromPublicFeedback('p1');
        expect(synced).toBe(2);
        expect(contacts.rows).toHaveLength(2);
        expect(contacts.rows[0]).toMatchObject({ phone: '51999888777', marketingConsent: true, source: 'feedback' });
        expect(contacts.rows[1]).toMatchObject({ email: 'luz@x.pe', source: 'feedback' });
    });
});

describe('ContactsService.getProfile', () => {
    it('404 si el contacto es de otro local', async () => {
        const { svc } = build([{ placeId: 'p2', phone: '51999888777' }]);
        await expect(svc.getProfile('p1', 'c1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('arma la línea de tiempo con pedidos, conversaciones y tarjeta, de la más reciente a la más antigua', async () => {
        const card = { id: 'card1', createdAt: new Date('2026-03-01T10:00:00Z'), lastVisitAt: new Date('2026-09-01T10:00:00Z'), totalVisits: 4 };
        const { svc, orders, conversations, cards } = build([{ placeId: 'p1', phone: '51999888777' }], {
            orders: [
                { number: 7, status: 'ENTREGADO', total: 5000, createdAt: new Date('2026-08-01T10:00:00Z') },
                { number: 3, status: 'CANCELADO', total: 1200, createdAt: new Date('2026-02-01T10:00:00Z') },
            ],
            conversations: [{ status: 'cerrado', createdAt: new Date('2026-05-01T10:00:00Z') }],
            card,
        });
        const profile = await svc.getProfile('p1', 'c1');
        expect(profile.contact.id).toBe('c1');
        expect(profile.loyaltyCard).toBe(card);
        expect(profile.timeline.map((e) => e.kind)).toEqual(['loyalty', 'order', 'conversation', 'loyalty', 'order']);
        const dates = profile.timeline.map((e) => e.at);
        expect([...dates].sort().reverse()).toEqual(dates);
        expect(profile.timeline[1]).toMatchObject({ kind: 'order', amount: 5000, title: expect.stringContaining('#7') });
        // cada fuente se busca por local y por los últimos 9 dígitos del teléfono
        for (const repo of [orders, conversations, cards]) expect(repo.createQueryBuilder).toHaveBeenCalledTimes(1);
    });

    it('las citas del mismo teléfono entran con su servicio, estado y precio', async () => {
        const { svc, appointments } = build([{ placeId: 'p1', phone: '51999888777' }], {
            appointments: [{ serviceName: 'Corte + barba', status: 'ATENDIDA', price: 3500, startsAt: new Date('2026-10-20T15:00:00Z') }],
        });
        const profile = await svc.getProfile('p1', 'c1');
        expect(profile.timeline).toEqual([{ at: '2026-10-20T15:00:00.000Z', kind: 'appointment', title: 'Cita · Corte + barba · Atendida', amount: 3500 }]);
        expect(appointments.createQueryBuilder).toHaveBeenCalledTimes(1);
    });

    it('la línea de tiempo tiene como máximo 100 entradas', async () => {
        const many = Array.from({ length: 150 }, (_, i) => ({ number: i, status: 'NUEVO', total: 100, createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)) }));
        const { svc } = build([{ placeId: 'p1', phone: '51999888777' }], { orders: many });
        const profile = await svc.getProfile('p1', 'c1');
        expect(profile.timeline).toHaveLength(100);
        expect(profile.timeline[0].title).toContain('#149');
    });

    it('sin tarjeta, pedidos ni conversaciones: tarjeta null y línea de tiempo vacía', async () => {
        const { svc } = build([{ placeId: 'p1', phone: '51999888777' }]);
        const profile = await svc.getProfile('p1', 'c1');
        expect(profile.loyaltyCard).toBeNull();
        expect(profile.timeline).toEqual([]);
    });
});
