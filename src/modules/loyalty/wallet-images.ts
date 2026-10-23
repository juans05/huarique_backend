import sharp = require('sharp');

// Imágenes de la tarjeta de fidelización para Google y Apple Wallet. Solo formas (sin texto): se ven igual en
// cualquier servidor aunque no tenga fuentes instaladas.

const MAX_STAMPS = 20;
const MAX_LOGO_BYTES = 3_000_000;
// Solo el CDN donde Wuarikes sube las imágenes: el servidor nunca descarga URLs arbitrarias (evita SSRF).
const LOGO_HOSTS = new Set(['res.cloudinary.com', ...(process.env.WALLET_LOGO_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean)]);

/** Descarga el logo de forma segura: host permitido, sin redirecciones, máx. 3 MB leídos y tope de píxeles. */
async function fetchLogo(logoUrl: string | null | undefined): Promise<sharp.Sharp | null> {
  let url: URL;
  try { url = new URL(logoUrl ?? ''); } catch { return null; }
  if (url.protocol !== 'https:' || !LOGO_HOSTS.has(url.hostname)) return null;
  try {
    const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (!res.ok || !res.body) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_LOGO_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    return sharp(Buffer.concat(chunks), { limitInputPixels: 25_000_000 });
  } catch {
    return null;
  }
}
const CHECK = 'M-9 0 L-3 6 L9 -7'; // marca del sello (centrada en 0,0, para radio ~22)
// Regalo: caja + tapa + cinta + moño (centrado en 0,0).
const GIFT = 'M-11 -2 h22 v13 h-22 z M-13 -8 h26 v6 h-26 z M-1.5 -8 v19 M1.5 -8 v19 M0 -8 c-3 -6 -10 -6 -8 -1 M0 -8 c3 -6 10 -6 8 -1';

/** Color de la tarjeta: hex válido o el naranja Wuarike. */
export function walletHex(hex?: string | null): string {
  return hex && /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : '#EE5924';
}

/** Ajusta un color (factor < 1 oscurece, > 1 aclara). */
function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(factor < 1 ? v * factor : v + (255 - v) * (factor - 1)))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * SVG de la franja de sellos: círculos ganados (con marca), pendientes (vacíos) y el último con un regalo.
 * Hasta 10 en una o dos filas; más de 10, en dos filas.
 */
export function stampsSvg(opts: { stamps: number; total: number; color: string; width: number; height: number; logo?: string | null }): string {
  const total = Math.max(1, Math.min(MAX_STAMPS, Math.floor(opts.total)));
  const stamps = Math.max(0, Math.min(total, Math.floor(opts.stamps)));
  const { width: W, height: H } = opts;
  const color = walletHex(opts.color);
  const rows = total > 6 ? 2 : 1;
  const perRow = Math.ceil(total / rows);
  const gap = W / (perRow + 1);
  const r = Math.min(gap * 0.38, (H / rows) * 0.34);
  const scale = r / 22;
  const complete = stamps >= total;

  const circles: string[] = [];
  for (let i = 0; i < total; i++) {
    const row = Math.floor(i / perRow);
    const inRow = row === rows - 1 ? total - perRow * (rows - 1) : perRow;
    const col = i % perRow;
    const cx = (W - (inRow - 1) * gap) / 2 + col * gap;
    const cy = rows === 1 ? H / 2 : H * (row === 0 ? 0.3 : 0.7);
    const earned = i < stamps;
    const last = i === total - 1;
    const t = `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) scale(${scale.toFixed(3)})`;
    if (last) {
      // Regalo: se "enciende" cuando la tarjeta se completa.
      circles.push(`<g transform="${t}">
        <circle r="22" fill="${complete ? '#FFFFFF' : 'none'}" stroke="#FFFFFF" stroke-width="3" ${complete ? '' : 'stroke-dasharray="5 4"'}/>
        <path d="${GIFT}" fill="none" stroke="${complete ? color : '#FFFFFF'}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
      </g>`);
    } else if (earned && opts.logo) {
      // Sello con el logo del local (recortado en círculo sobre blanco).
      circles.push(`<g transform="${t}">
        <circle r="22" fill="#FFFFFF"/>
        <image href="${opts.logo}" x="-16" y="-16" width="32" height="32" clip-path="url(#stamp)" preserveAspectRatio="xMidYMid meet"/>
      </g>`);
    } else if (earned) {
      circles.push(`<g transform="${t}">
        <circle r="22" fill="#FFFFFF"/>
        <circle r="17" fill="${color}"/>
        <path d="${CHECK}" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      </g>`);
    } else {
      circles.push(`<g transform="${t}"><circle r="22" fill="#FFFFFF" fill-opacity="0.12" stroke="#FFFFFF" stroke-opacity="0.75" stroke-width="2.5"/></g>`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><clipPath id="stamp"><circle r="17"/></clipPath><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${shade(color, 1.12)}"/><stop offset="1" stop-color="${shade(color, 0.78)}"/>
    </linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <circle cx="${W * 0.92}" cy="${H * 0.05}" r="${H * 0.55}" fill="#FFFFFF" fill-opacity="0.06"/>
    <circle cx="${W * 0.05}" cy="${H * 1.05}" r="${H * 0.45}" fill="#FFFFFF" fill-opacity="0.05"/>
    ${circles.join('\n')}
  </svg>`;
}

export function stampsPng(opts: { stamps: number; total: number; color: string; width: number; height: number; logo?: string | null }): Promise<Buffer> {
  return sharp(Buffer.from(stampsSvg(opts))).png().toBuffer();
}

/** Logo del local para Apple Wallet (cuadrado, fondo transparente) o, si no hay, su inicial en un círculo. */
export async function logoPng(logoUrl: string | null | undefined, name: string, size: number, color: string): Promise<Buffer> {
  const img = await fetchLogo(logoUrl);
  if (img) {
    try { return await img.resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(); } catch { /* imagen inválida: se usa la inicial */ }
  }
  const initial = (name || 'W').trim().charAt(0).toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ0-9]/, 'W');
  // Sin logo: la inicial del local sobre su color (si el servidor no tiene fuentes, queda el círculo de color).
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#FFFFFF"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.38}" fill="${walletHex(color)}"/>
      <text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="${size * 0.42}" fill="#FFFFFF">${initial}</text>
    </svg>`)).png().toBuffer();
}

const logoCache = new Map<string, { uri: string | null; at: number }>();
/** Logo del local como data URI PNG (para dibujarlo dentro de los sellos). Se guarda 1 hora en memoria. */
export async function logoDataUri(logoUrl: string | null | undefined): Promise<string | null> {
  if (!logoUrl) return null;
  const hit = logoCache.get(logoUrl);
  if (hit && Date.now() - hit.at < 3600_000) return hit.uri;
  let uri: string | null = null;
  const img = await fetchLogo(logoUrl);
  if (img) {
    try {
      const png = await img.resize(96, 96, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } }).png().toBuffer();
      uri = `data:image/png;base64,${png.toString('base64')}`;
    } catch { /* imagen inválida: el sello lleva la marca */ }
  }
  logoCache.set(logoUrl, { uri, at: Date.now() });
  return uri;
}
