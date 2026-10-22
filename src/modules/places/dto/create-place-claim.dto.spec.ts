import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreatePlaceClaimDto } from './create-place-claim.dto';

const errorsFor = (documentUrls: unknown) =>
    validateSync(plainToInstance(CreatePlaceClaimDto, { businessName: 'X', businessEmail: 'a@b.pe', businessPhone: '1', documentUrls })).length;

describe('CreatePlaceClaimDto.documentUrls', () => {
    it('acepta https y omitido', () => {
        expect(errorsFor(['https://res.cloudinary.com/wuarike/ruc.pdf'])).toBe(0);
        expect(errorsFor(undefined)).toBe(0);
    });
    it('rechaza javascript: y http:', () => {
        expect(errorsFor(['javascript:alert(1)'])).toBeGreaterThan(0);
        expect(errorsFor(['http://x.com/a.pdf'])).toBeGreaterThan(0);
    });
});
