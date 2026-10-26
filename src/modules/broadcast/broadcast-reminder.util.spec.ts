import { allowsReminderCampaign, renderReminderVariables, validOffset } from './broadcast-reminder.util';

const data = { name: 'Luis', service: 'Corte', professional: 'Juan', date: 'lunes 26', time: '4:00 pm', place: 'El Sultán', link: 'https://x/c/t' };

describe('renderReminderVariables', () => {
    it('reemplaza los datos de la cita (sin importar mayúsculas) y deja intacto lo desconocido', () => {
        expect(renderReminderVariables(['{Nombre}', '{servicio} con {profesional}', '{fecha} {hora}', '{local}', '{enlace}', '{otro}'], data))
            .toEqual(['Luis', 'Corte con Juan', 'lunes 26 4:00 pm', 'El Sultán', 'https://x/c/t', '{otro}']);
    });

    it('nunca manda una variable vacía (Meta la rechaza)', () => {
        expect(renderReminderVariables(['  ', ''], data)).toEqual(['-', '-']);
        expect(renderReminderVariables(null, data)).toEqual([]);
    });
});

describe('reglas', () => {
    it('solo belleza; tiempo entero entre 15 min y 7 días', () => {
        expect(['barberia', 'peluqueria', 'spa'].every(allowsReminderCampaign)).toBe(true);
        expect(allowsReminderCampaign('restaurante')).toBe(false);
        expect(allowsReminderCampaign(null)).toBe(false);
        expect([15, 60, 1440, 10080].every(validOffset)).toBe(true);
        expect([14, 10081, 30.5, '60', null].some(validOffset)).toBe(false);
    });
});
