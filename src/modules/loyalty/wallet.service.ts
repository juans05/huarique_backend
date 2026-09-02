import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import * as crypto from 'crypto';

// Mismo esquema de firma (ECv2SigningOnly) que usan los tokens de Google Pay —
// Google Wallet reutiliza el protocolo PaymentMethodToken para firmar los callbacks.
const GOOGLE_CALLBACK_PUBLIC_KEY_URL = 'https://pay.google.com/gp/m/issuer/keys';
const GOOGLE_CALLBACK_SENDER_ID = 'GooglePayPasses';
const GOOGLE_CALLBACK_PROTOCOL = 'ECv2SigningOnly';
const GOOGLE_CALLBACK_KEY_EXPIRATION_BUFFER_MS = 3600_000;

@Injectable()
export class WalletService {
  private googlePublicKeys: Buffer[] = [];
  private googlePublicKeysExpireAt = new Date(0);

  // ── GOOGLE WALLET ─────────────────────────────────────────────────────────

  getGoogleWalletSaveUrl(place: any, card: any, program: any): string {
    const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
    const saEmail = process.env.GOOGLE_WALLET_SA_EMAIL;
    const saKey = process.env.GOOGLE_WALLET_SA_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!issuerId || !saEmail || !saKey) {
      throw new ServiceUnavailableException('Google Wallet no está configurado. Agrega GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_SA_EMAIL y GOOGLE_WALLET_SA_PRIVATE_KEY al servidor.');
    }

    const classId = `${issuerId}.loyalty_${place.id.replace(/-/g, '_')}`;
    const objectId = this.buildObjectId(card.id);

    const loyaltyClass: any = {
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

    // Notificación nativa de Google Wallet cuando el cliente está cerca del local
    // (geofence propio de Google — no hace falta trackear ubicación nosotros).
    if (place.latitude != null && place.longitude != null) {
      loyaltyClass.merchantLocations = [
        { latitude: Number(place.latitude), longitude: Number(place.longitude) },
      ];
    }

    // Google nos avisa a esta URL cuando el cliente guarda o borra la tarjeta.
    // Esto va en cada clase creada por código — configurarlo solo en la consola
    // de Google no alcanza, porque las clases reales las crea este método, no la consola.
    const backendUrl = process.env.BACKEND_URL || 'https://backendwarike-production.up.railway.app';
    loyaltyClass.callbackOptions = { url: `${backendUrl}/api/public/loyalty/wallet/google/callback` };

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

  private buildObjectId(cardId: string): string {
    const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
    return `${issuerId}.card_${cardId.replace(/-/g, '_')}`;
  }

  extractCardIdFromObjectId(objectId: string): string | null {
    const prefix = `${process.env.GOOGLE_WALLET_ISSUER_ID}.card_`;
    if (!objectId?.startsWith(prefix)) return null;
    return objectId.slice(prefix.length).replace(/_/g, '-');
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

  // Server-to-server: intercambia la service account por un access token (JWT Bearer Grant, RFC 7523).
  private async getGoogleAccessToken(): Promise<string> {
    const saEmail = process.env.GOOGLE_WALLET_SA_EMAIL;
    const saKey = process.env.GOOGLE_WALLET_SA_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!saEmail || !saKey) {
      throw new ServiceUnavailableException('Google Wallet no está configurado.');
    }

    const now = Math.floor(Date.now() / 1000);
    const assertion = this.signRS256({
      iss: saEmail,
      scope: 'https://www.googleapis.com/auth/wallet_object.issuer',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }, saKey);

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!res.ok) {
      throw new ServiceUnavailableException(`No se pudo autenticar con Google Wallet: ${await res.text()}`);
    }
    const data = await res.json();
    return data.access_token;
  }

  // Empuja el saldo de sellos/puntos a la tarjeta ya guardada en el celular del cliente,
  // con notifyOnUpdate para que Google le mande la notificación push (máx. 3 en 24h por tarjeta).
  async updateGoogleWalletObject(place: any, card: any, program: any): Promise<void> {
    if (!process.env.GOOGLE_WALLET_ISSUER_ID) return;

    const objectId = this.buildObjectId(card.id);
    const stampsLabel = program?.type === 'stamps'
      ? `${card.stamps ?? 0} / ${program.stampsToReward ?? 10}`
      : `${card.points ?? 0} pts`;

    const accessToken = await this.getGoogleAccessToken();

    const res = await fetch(`https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${objectId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        loyaltyPoints: { balance: { string: stampsLabel } },
        notifyPreference: 'notifyOnUpdate',
      }),
    });

    // 404 = el cliente todavía no había guardado la tarjeta en su Wallet; no es un error real.
    if (!res.ok && res.status !== 404) {
      throw new ServiceUnavailableException(`No se pudo actualizar Google Wallet: ${await res.text()}`);
    }
  }

  // Manda un mensaje libre (no ligado al saldo) a una tarjeta ya guardada — para
  // campañas tipo "hoy 2x1". Usa addMessage, no patch: patch solo notifica cuando
  // cambia loyaltyPoints.balance.
  async sendLoyaltyMessage(cardId: string, header: string, body: string): Promise<void> {
    if (!process.env.GOOGLE_WALLET_ISSUER_ID) return;

    const objectId = this.buildObjectId(cardId);
    const accessToken = await this.getGoogleAccessToken();

    const res = await fetch(`https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${objectId}/addMessage`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: { header, body } }),
    });

    // 404 = esta tarjeta nunca se guardó en Google Wallet; no es un error real.
    if (!res.ok && res.status !== 404) {
      throw new ServiceUnavailableException(`No se pudo enviar el mensaje a Google Wallet: ${await res.text()}`);
    }
  }

  // ── GOOGLE WALLET — verificar callback firmado (save/del) ──────────────────
  // Puerta pública sin login: cualquiera puede pegarle a este endpoint, así que
  // hay que verificar la firma antes de confiar en el contenido — si no, cualquiera
  // podría mandar un "del" falso y marcar tarjetas de otros como borradas.

  private async refreshGooglePublicKeys(): Promise<void> {
    if (this.googlePublicKeys.length && this.googlePublicKeysExpireAt > new Date()) return;

    const res = await fetch(GOOGLE_CALLBACK_PUBLIC_KEY_URL);
    if (!res.ok) throw new Error('No se pudieron obtener las claves públicas de Google');
    const data = await res.json();

    let expireAt: Date | null = null;
    const keys: Buffer[] = [];
    for (const key of data.keys || []) {
      keys.push(Buffer.from(key.keyValue, 'base64'));
      const keyExpiration = new Date(Number(key.keyExpiration));
      if (!expireAt || keyExpiration < expireAt) expireAt = keyExpiration;
    }
    if (!keys.length) throw new Error('Google no devolvió claves públicas');

    this.googlePublicKeys = keys;
    this.googlePublicKeysExpireAt = new Date(expireAt!.getTime() - GOOGLE_CALLBACK_KEY_EXPIRATION_BUFFER_MS);
  }

  // Formato length-value que usa el protocolo ECv2 de Google (cada trozo va
  // precedido de su largo en 4 bytes little-endian) antes de firmar/verificar.
  private toLengthValue(...chunks: string[]): Buffer {
    const parts: Buffer[] = [];
    for (const chunk of chunks) {
      const value = Buffer.from(chunk);
      const length = Buffer.alloc(4);
      length.writeInt32LE(value.byteLength);
      parts.push(length, value);
    }
    return Buffer.concat(parts);
  }

  private verifyEcdsaSignature(publicKeyDer: Buffer, signature: Buffer, signedBytes: Buffer): boolean {
    return crypto.verify('sha256', signedBytes, {
      key: publicKeyDer,
      format: 'der',
      type: 'spki',
      dsaEncoding: 'der',
    }, signature);
  }

  // La clave intermedia viene firmada por las claves raíz de Google — hay que
  // validar esa firma antes de confiar en la clave que realmente firmó el mensaje.
  private verifyIntermediateSigningKey(payload: any): Buffer {
    const isk = payload.intermediateSigningKey;
    const signedKeyAsString: string = isk?.signedKey;
    if (!signedKeyAsString) throw new Error('Callback sin intermediateSigningKey');

    const signedBytes = this.toLengthValue(GOOGLE_CALLBACK_SENDER_ID, GOOGLE_CALLBACK_PROTOCOL, signedKeyAsString);
    const signatures: Buffer[] = (isk.signatures || []).map((s: string) => Buffer.from(s, 'base64'));

    const verified = signatures.some((sig) =>
      this.googlePublicKeys.some((pub) => this.verifyEcdsaSignature(pub, sig, signedBytes)),
    );
    if (!verified) throw new Error('No se pudo verificar la clave intermedia del callback');

    const signedKey = JSON.parse(signedKeyAsString);
    if (Number(signedKey.keyExpiration) <= Date.now()) {
      throw new Error('La clave intermedia del callback ya expiró');
    }
    return Buffer.from(signedKey.keyValue, 'base64');
  }

  // Verifica la firma completa del callback y devuelve el mensaje ya confiable
  // (classId, objectId, eventType 'save'|'del', expTimeMillis, nonce).
  async verifyGoogleCallback(payload: any): Promise<{ objectId?: string; classId?: string; eventType?: string; expTimeMillis?: string }> {
    const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
    if (!issuerId) throw new ServiceUnavailableException('Google Wallet no está configurado.');

    await this.refreshGooglePublicKeys();

    const intermediatePublicKey = this.verifyIntermediateSigningKey(payload);
    const signedMessage: string = payload.signedMessage;
    if (!payload.signature || !signedMessage) throw new Error('Callback incompleto');

    const signedBytes = this.toLengthValue(GOOGLE_CALLBACK_SENDER_ID, issuerId, GOOGLE_CALLBACK_PROTOCOL, signedMessage);
    const verified = this.verifyEcdsaSignature(intermediatePublicKey, Buffer.from(payload.signature, 'base64'), signedBytes);
    if (!verified) throw new Error('Firma del callback inválida');

    const message = JSON.parse(signedMessage);
    if (message.expTimeMillis && Number(message.expTimeMillis) < Date.now()) {
      throw new Error('El callback ya expiró');
    }
    return message;
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
