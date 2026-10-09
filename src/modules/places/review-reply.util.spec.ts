import { starsOf } from './review-reply.util';

describe('review-reply.util', () => {
    it('maps Google star enums to numbers', () => {
        expect(starsOf({ starRating: 'FIVE' })).toBe(5);
        expect(starsOf({ starRating: 'THREE' })).toBe(3);
        expect(starsOf({ starRating: 'STAR_RATING_UNSPECIFIED' })).toBe(0);
        expect(starsOf({})).toBe(0);
    });
});
