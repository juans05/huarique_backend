import { ForbiddenException } from '@nestjs/common';
import { assertOwnAppt, canUseApp, resolveAgendaScope, scopeFor } from './agenda-scope';

describe('scopeFor', () => {
    it('admin ligado a profesional ve todo', () => {
        expect(scopeFor('admin', 'p1')).toEqual({ scope: 'all', professionalId: null });
    });
    it('supervisor ve todo', () => {
        expect(scopeFor('supervisor', 'p1')).toEqual({ scope: 'all', professionalId: null });
    });
    it('agente ligado a profesional ve solo lo suyo', () => {
        expect(scopeFor('agente', 'p1')).toEqual({ scope: 'own', professionalId: 'p1' });
    });
    it('agente sin profesional (recepcionista) sigue viendo todo', () => {
        expect(scopeFor('agente', null)).toEqual({ scope: 'all', professionalId: null });
    });
    it('mozo ligado a profesional ve solo lo suyo', () => {
        expect(scopeFor('mozo', 'p2')).toEqual({ scope: 'own', professionalId: 'p2' });
    });
});

describe('canUseApp', () => {
    it('barbero ligado, admin y supervisor sí; recepcionista no', () => {
        expect(canUseApp('agente', { scope: 'own', professionalId: 'p1' })).toBe(true);
        expect(canUseApp('admin', { scope: 'all', professionalId: null })).toBe(true);
        expect(canUseApp('supervisor', { scope: 'all', professionalId: null })).toBe(true);
        expect(canUseApp('agente', { scope: 'all', professionalId: null })).toBe(false);
    });
});

describe('assertOwnAppt', () => {
    it('cita de un compañero con alcance propio → 403', () => {
        expect(() => assertOwnAppt('p1', { professionalId: 'p2' })).toThrow(ForbiddenException);
        expect(() => assertOwnAppt('p1', { professionalId: 'p2' })).toThrow('Esa cita no es tuya');
    });
    it('cita propia o alcance total pasa', () => {
        expect(() => assertOwnAppt('p1', { professionalId: 'p1' })).not.toThrow();
        expect(() => assertOwnAppt(null, { professionalId: 'p2' })).not.toThrow();
    });
});

describe('resolveAgendaScope', () => {
    it('busca el profesional ligado al usuario en ese local', async () => {
        const prosRepo = { findOne: jest.fn().mockResolvedValue({ id: 'p9' }) };
        const res = await resolveAgendaScope({ role: 'agente', userId: 'u1', placeId: 'pl1' } as any, prosRepo as any);
        expect(prosRepo.findOne).toHaveBeenCalledWith({ where: { placeId: 'pl1', teamUserId: 'u1' }, select: ['id'] });
        expect(res).toEqual({ scope: 'own', professionalId: 'p9' });
    });
    it('admin no consulta y ve todo', async () => {
        const prosRepo = { findOne: jest.fn() };
        expect(await resolveAgendaScope({ role: 'admin', userId: 'u1', placeId: 'pl1' } as any, prosRepo as any)).toEqual({ scope: 'all', professionalId: null });
        expect(prosRepo.findOne).not.toHaveBeenCalled();
    });
});
