require('dotenv').config();
const fs = require('fs');
const https = require('https');
const { Client } = require('pg');

function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (ch === '"') { inQuotes = false; }
            else field += ch;
        } else {
            if (ch === '"') inQuotes = true;
            else if (ch === ',') { row.push(field); field = ''; }
            else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
            else if (ch === '\r') { /* skip */ }
            else field += ch;
        }
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows;
}

function oembed(url) {
    return new Promise((resolve) => {
        https.get('https://www.tiktok.com/oembed?url=' + encodeURIComponent(url), (res) => {
            let data = '';
            res.on('data', (d) => (data += d));
            res.on('end', () => {
                try {
                    resolve(res.statusCode === 200 ? JSON.parse(data) : null);
                } catch {
                    resolve(null);
                }
            });
        }).on('error', () => resolve(null));
    });
}

async function main() {
    const csvPath = 'D:/Github/wuarikes/scraper/output/cruce-maps-tiktok.csv';
    const rows = parseCsv(fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, ''));
    const [header, ...data] = rows;
    const col = (name) => header.indexOf(name);

    const client = new Client({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: false,
    });
    await client.connect();

    let matched = 0;
    let videosAdded = 0;

    for (const r of data) {
        const name = r[col('name')];
        if (!name) continue;
        const shortName = name.split('|')[0].split('.')[0].trim();
        const videoUrls = (r[col('tiktokVideoUrls')] || '')
            .split(';')
            .map((u) => u.trim())
            .filter(Boolean);
        if (!shortName || videoUrls.length === 0) continue;

        const placeRes = await client.query(
            `SELECT id, name, metadata FROM wuarike_db.places WHERE name ILIKE '%' || $1 || '%' LIMIT 1`,
            [shortName.slice(0, 20)],
        );
        if (placeRes.rows.length === 0) continue;
        const place = placeRes.rows[0];

        const tiktokVideos = [];
        for (const url of videoUrls) {
            const meta = await oembed(url);
            if (!meta) continue;
            tiktokVideos.push({
                url,
                thumbnailUrl: meta.thumbnail_url || null,
                caption: (meta.title || '').slice(0, 200),
                authorName: meta.author_name || null,
            });
        }
        if (tiktokVideos.length === 0) continue;

        const existingMeta = place.metadata || {};
        const newMeta = { ...existingMeta, tiktokVideos };
        await client.query(`UPDATE wuarike_db.places SET metadata = $1 WHERE id = $2`, [
            JSON.stringify(newMeta),
            place.id,
        ]);

        matched++;
        videosAdded += tiktokVideos.length;
        console.log(`✅ ${place.name} — ${tiktokVideos.length} video(s)`);
    }

    console.log(`\nLugares actualizados: ${matched}, videos totales: ${videosAdded}`);
    await client.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
