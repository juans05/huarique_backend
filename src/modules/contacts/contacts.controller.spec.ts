import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ContactsController } from './contacts.controller';
import { QueryContactDto } from './dto/query-contact.dto';

describe('ContactsController (aislamiento por local)', () => {
    const owner = { id: 'u1' };
    const intruder = { id: 'u2' };
    let service: any;
    let placesRepo: any;
    let controller: ContactsController;

    beforeEach(() => {
        service = {
            findAll: jest.fn().mockResolvedValue({ data: [], meta: {} }),
            findById: jest.fn(),
            getImportStatus: jest.fn(),
        };
        placesRepo = {
            findOne: jest.fn(({ where }) =>
                Promise.resolve(where.id === 'p1' ? { id: 'p1', claimedByUserId: owner.id } : null)),
        };
        controller = new ContactsController(service, placesRepo);
    });

    it('findAll sin placeId -> 400 y no consulta', async () => {
        await expect(controller.findAll({} as any, owner)).rejects.toBeInstanceOf(BadRequestException);
        expect(placesRepo.findOne).not.toHaveBeenCalled();
        expect(service.findAll).not.toHaveBeenCalled();
    });

    it('findAll de un local ajeno -> 403', async () => {
        await expect(controller.findAll({ placeId: 'p1' } as any, intruder)).rejects.toBeInstanceOf(ForbiddenException);
        expect(service.findAll).not.toHaveBeenCalled();
    });

    it('findAll del dueño consulta su local', async () => {
        await controller.findAll({ placeId: 'p1' } as any, owner);
        expect(service.findAll).toHaveBeenCalledWith({ placeId: 'p1' });
    });

    it('findOne de un contacto de otro dueño -> 403', async () => {
        service.findById.mockResolvedValue({ id: 'c1', placeId: 'p1' });
        await expect(controller.findOne('c1', intruder)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('findOne inexistente -> 404', async () => {
        service.findById.mockRejectedValue(new NotFoundException());
        await expect(controller.findOne('x', owner)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('estado de importación de otro dueño -> 403', async () => {
        service.getImportStatus.mockResolvedValue({ id: 'i1', placeId: 'p1' });
        await expect(controller.getImportStatus('i1', intruder)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('QueryContactDto acepta source order y loyalty', async () => {
        for (const source of ['order', 'loyalty']) {
            const errors = await validate(plainToInstance(QueryContactDto, { placeId: 'p1', source }));
            expect(errors).toEqual([]);
        }
        expect(await validate(plainToInstance(QueryContactDto, { placeId: 'p1', source: 'x' }))).not.toEqual([]);
    });
});
