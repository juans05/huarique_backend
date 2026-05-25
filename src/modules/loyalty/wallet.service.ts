import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class WalletService {

  // ── GOOGLE WALLET ─────────────────────────────────────────────────────────

  getGoogleWalletSaveUrl(place: any, card: any, program: any): string {
    const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
    const saEmail = process.env.GOOGLE_WALLET_SA_EMAIL;
    const saKey = process.env.GOOGLE_WALLET_SA_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!issuerId || !saEmail || !saKey) {
      throw new ServiceUnavailableException('Google Wallet no está configurado. Agrega GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_SA_EMAIL y GOOGLE_WALLET_SA_PRIVATE_KEY al servidor.');
    }

    const classId = `${issuerId}.loyalty_${place.id.replace(/-/g, '_')}`;
    const objectId = `${issuerId}.card_${card.id.replace(/-/g, '_')}`;

    const loyaltyClass = {
      id: classId,
      issuerName: place.name || 'Wuarike',
      programName: place.name || 'Programa de Fidelización',
      programLogo: {
        sourceUri: { uri: place.coverImageUrl || 'https://placehold.co/512x512/EE5924/white?text=W' },
        contentDescription: { defaultValue: { language: 'es', value: place.name } },
      },
      reviewStatus: 'UNDER_REVIEW',
      hexBackgroundColor: '#EE5924',
    };

    const stampsLabel = program?.type === 'stamps'
      ? `${card.stamps ?? 0} / ${program.stampsToReward ?? 10}`
      : `${card.points ?? 0} pts`;

    const loyaltyObject = {
      id: objectId,
      classId,
      state: 'ACTIVE',
      accountId: card.customerPhone,
      accountName: card.customerName || `+51 ${card.customerPhone}`,
      loyaltyPoints: {
        balance: { string: stampsLabel },
        label: program?.type === 'stamps' ? 'Sellos' : 'Puntos',
      },
      textModulesData: program?.rewardTitle ? [
        {
          header: 'Premio',
          body: program.rewardTitle,
          id: 'reward',
        },
      ] : undefined,
    };

    const payload = {
      iss: saEmail,
      aud: 'google',
      typ: 'savetowallet',
      iat: Math.floor(Date.now() / 1000),
      payload: {
        loyaltyClasses: [loyaltyClass],
        loyaltyObjects: [loyaltyObject],
      },
    };

    const jwt = this.signRS256(payload, saKey);
    return `https://pay.google.com/gp/v/save/${jwt}`;
  }

  private signRS256(payload: object, privateKey: string): string {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signing = `${header}.${body}`;
    const sign = crypto.createSign('SHA256');
    sign.update(signing);
    const signature = sign.sign(privateKey, 'base64url');
    return `${signing}.${signature}`;
  }

  // ── APPLE WALLET ──────────────────────────────────────────────────────────

  async getAppleWalletPass(place: any, card: any, program: any): Promise<Buffer> {
    const passTypeId = process.env.APPLE_WALLET_PASS_TYPE_ID;
    const teamId = process.env.APPLE_WALLET_TEAM_ID;
    const certBase64 = process.env.APPLE_WALLET_CERT_P12_BASE64;
    const certPassword = process.env.APPLE_WALLET_CERT_PASSWORD || '';
    const wwdrBase64 = process.env.APPLE_WALLET_WWDR_BASE64;

    if (!passTypeId || !teamId || !certBase64 || !wwdrBase64) {
      throw new ServiceUnavailableException(
        'Apple Wallet no está configurado. Necesitas: APPLE_WALLET_PASS_TYPE_ID, APPLE_WALLET_TEAM_ID, APPLE_WALLET_CERT_P12_BASE64, APPLE_WALLET_WWDR_BASE64.',
      );
    }

    const { PKPass } = await import('passkit-generator');

    const stampsLabel = program?.type === 'stamps'
      ? `${card.stamps ?? 0} / ${program.stampsToReward ?? 10}`
      : `${card.points ?? 0}`;

    const pass = new PKPass({}, {
      signerCert: Buffer.from(certBase64, 'base64'),
      signerKey: Buffer.from(certBase64, 'base64'),
      signerKeyPassphrase: certPassword,
      wwdr: Buffer.from(wwdrBase64, 'base64'),
    }, {
      passTypeIdentifier: passTypeId,
      teamIdentifier: teamId,
      serialNumber: card.id,
      organizationName: place.name || 'Wuarike',
      description: `Tarjeta de fidelización ${place.name}`,
      backgroundColor: 'rgb(238, 89, 36)',
      foregroundColor: 'rgb(255,255,255)',
      labelColor: 'rgb(255,255,255)',
    });

    pass.type = 'storeCard';

    pass.headerFields.push({ key: 'balance', label: program?.type === 'stamps' ? 'Sellos' : 'Puntos', value: stampsLabel });
    pass.primaryFields.push({ key: 'name', label: 'Cliente', value: card.customerName || card.customerPhone });
    pass.secondaryFields.push({ key: 'visits', label: 'Visitas', value: String(card.totalVisits ?? 0) });
    pass.secondaryFields.push({ key: 'level', label: 'Nivel', value: card.level || 'BRONCE' });

    if (program?.rewardTitle) {
      pass.backFields.push({ key: 'reward', label: 'Premio', value: program.rewardTitle });
      if (program.rewardDescription) {
        pass.backFields.push({ key: 'desc', label: 'Descripción', value: program.rewardDescription });
      }
    }

    return pass.getAsBuffer();
  }
}
