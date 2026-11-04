import { Subject, lastValueFrom, toArray } from 'rxjs';
import { cardKey, isValidCardKey } from './card-key';
import { whileAllowed } from '../../common/utils/while-allowed';

describe('clave de tarjeta', () => {
    beforeAll(() => { process.env.JWT_SECRET = 'test-secret'; });

    it('abre solo su propia tarjeta', () => {
        const k = cardKey('card-1');
        expect(isValidCardKey('card-1', k)).toBe(true);
        expect(isValidCardKey('card-2', k)).toBe(false);
        expect(isValidCardKey('card-1', undefined)).toBe(false);
        expect(isValidCardKey('card-1', 'x'.repeat(32))).toBe(false);
    });
});

describe('whileAllowed', () => {
    it('corta el stream cuando se pierde el acceso', async () => {
        jest.useFakeTimers();
        const source = new Subject<number>();
        let allowed = true;
        const done = lastValueFrom(whileAllowed(source, async () => allowed, 1000).pipe(toArray()));
        source.next(1);
        allowed = false;
        await jest.advanceTimersByTimeAsync(1000);
        source.next(2); // ya no llega
        expect(await done).toEqual([1]);
        jest.useRealTimers();
    });

    it('un error pasajero al comprobar no corta el stream', async () => {
        jest.useFakeTimers();
        const source = new Subject<number>();
        const seen: number[] = [];
        const sub = whileAllowed(source, async () => { throw new Error('db'); }, 1000).subscribe((v) => seen.push(v));
        await jest.advanceTimersByTimeAsync(3000);
        source.next(7);
        expect(seen).toEqual([7]);
        sub.unsubscribe();
        jest.useRealTimers();
    });
});
