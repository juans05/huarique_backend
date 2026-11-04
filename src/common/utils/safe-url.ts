import { BadRequestException } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { BlockList, isIP } from 'net';
import axios from 'axios';

// Destinos que nunca se deben pedir desde el servidor: red interna, loopback, metadatos de la nube.
const blocked = new BlockList();
for (const [net, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3]] as const) {
    blocked.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const) {
    blocked.addSubnet(net, prefix, 'ipv6');
}

export function isPrivateAddress(ip: string): boolean {
    const v = isIP(ip);
    if (v === 4) return blocked.check(ip, 'ipv4');
    if (v === 6) {
        const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
        return mapped ? blocked.check(mapped[1], 'ipv4') : blocked.check(ip, 'ipv6');
    }
    return true;
}

/** Solo http/https hacia direcciones públicas; si no, BadRequest. */
export async function assertPublicUrl(raw: string): Promise<URL> {
    let url: URL;
    try { url = new URL(raw); } catch { throw new BadRequestException('URL inválida'); }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new BadRequestException('Solo se aceptan URLs http o https');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (/(^|\.)(localhost|internal|local)$/i.test(host)) throw new BadRequestException('URL no permitida');
    const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
    if (!addrs.length) throw new BadRequestException('No se pudo acceder a la URL');
    if (addrs.some((a) => isPrivateAddress(a.address))) throw new BadRequestException('URL no permitida');
    return url;
}

/**
 * GET de una URL dada por un usuario, validando el destino en cada redirección y con tope de tamaño.
 * ponytail: valida la IP antes de conectar, pero no fija la IP resuelta (un DNS rebinding muy rápido
 * podría colarse); si hace falta, pasar un `lookup` propio al agente http.
 */
export async function fetchPublicText(raw: string, opts: { timeout?: number; maxBytes?: number; headers?: Record<string, string> } = {}) {
    let url = await assertPublicUrl(raw);
    for (let hop = 0; hop < 4; hop++) {
        const res = await axios.get<string>(url.href, {
            headers: opts.headers,
            timeout: opts.timeout ?? 15000,
            responseType: 'text',
            maxRedirects: 0,
            maxContentLength: opts.maxBytes ?? 2 * 1024 * 1024,
            validateStatus: (s) => s >= 200 && s < 400,
        });
        if (res.status < 300) return { url, data: res.data };
        const next = res.headers.location;
        if (!next) break;
        url = await assertPublicUrl(new URL(next, url).href);
    }
    throw new BadRequestException('No se pudo acceder a la URL');
}
