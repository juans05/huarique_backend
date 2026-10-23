import { generateKeyPairSync } from 'crypto';
import { WalletService } from './wallet.service';
import { stampsSvg } from './wallet-images';

const place = { id: '68b4534f-aef8-4fa8-9718-2ef1183095d5', name: 'La Bajadita', logoUrl: 'https://cdn.test/logo.png', metadata: { walletColor: '#C84B31' } };
const card = { id: '11111111-2222-3333-4444-555555555555', customerPhone: '51999888777', customerName: 'Luis', stamps: 4 };

function decode(saveUrl: string) {
    const jwt = saveUrl.split('/save/')[1];
    return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).payload;
}

describe('WalletService (Google)', () => {
    beforeAll(() => {
        const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
        process.env.GOOGLE_WALLET_ISSUER_ID = '3388000000000000000';
        process.env.GOOGLE_WALLET_SA_EMAIL = 'test@wallet.iam.gserviceaccount.com';
        process.env.GOOGLE_WALLET_SA_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
        process.env.BACKEND_URL = 'https://api.test';
    });

    it('tarjeta de sellos: lleva la imagen con los círculos (con saldo, color y logo en la URL) y el color de marca', () => {
        const { loyaltyClasses, loyaltyObjects } = decode(new WalletService().getGoogleWalletSaveUrl(place, card, { type: 'stamps', stampsToReward: 10, rewardTitle: 'Postre gratis' }));
        expect(loyaltyClasses[0].hexBackgroundColor).toBe('#C84B31');
        expect(loyaltyObjects[0].heroImage.sourceUri.uri).toMatch(/^https:\/\/api\.test\/api\/public\/loyalty\/wallet\/stamps\/68b4534f-aef8-4fa8-9718-2ef1183095d5\/4\/10\.png\?c=C84B31&l=[0-9a-f]{8}$/);
        expect(loyaltyObjects[0].loyaltyPoints.balance.string).toBe('4 / 10');
    });

    it('tarjeta de puntos: sin imagen de sellos', () => {
        const { loyaltyObjects } = decode(new WalletService().getGoogleWalletSaveUrl(place, { ...card, points: 120 }, { type: 'points' }));
        expect(loyaltyObjects[0].heroImage).toBeUndefined();
    });
});

describe('stampsSvg', () => {
    it('dibuja un círculo por sello y el último es el regalo', () => {
        const svg = stampsSvg({ stamps: 3, total: 10, color: '#C84B31', width: 1032, height: 336 });
        expect((svg.match(/<g transform=/g) ?? []).length).toBe(10);
        expect((svg.match(/stroke-dasharray/g) ?? []).length).toBe(1); // regalo aún no ganado
        expect((svg.match(/M-9 0 L-3 6 L9 -7/g) ?? []).length).toBe(3); // 3 sellos con marca
    });
    it('al completar, el regalo se enciende', () => {
        expect(stampsSvg({ stamps: 10, total: 10, color: '#C84B31', width: 1032, height: 336 })).not.toMatch(/stroke-dasharray/);
    });
});
