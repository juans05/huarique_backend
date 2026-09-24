import { contactChannel } from './public-feedback.controller';

describe('contactChannel', () => {
  it('routes emails, Peruvian mobiles and international numbers', () => {
    expect(contactChannel(' ana@mail.com ')).toEqual({ type: 'email', email: 'ana@mail.com' });
    expect(contactChannel('987 654 321')).toEqual({ type: 'whatsapp', phone: '51987654321' });
    expect(contactChannel('+51 987654321')).toEqual({ type: 'whatsapp', phone: '51987654321' });
    expect(contactChannel('+34 612 345 678')).toEqual({ type: 'whatsapp', phone: '34612345678' });
  });

  it('returns null when there is no usable contact', () => {
    expect(contactChannel(null)).toBeNull();
    expect(contactChannel('')).toBeNull();
    expect(contactChannel('mi instagram @ana')).toBeNull();
    expect(contactChannel('12345')).toBeNull();
  });
});
