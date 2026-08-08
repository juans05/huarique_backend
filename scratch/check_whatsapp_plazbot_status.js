const { Client } = require('pg');
require('dotenv').config();

async function run() {
    const client = new Client({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: process.env.DB_SSL === 'true' ? true : false,
    });
    await client.connect();

    const res = await client.query(`
        SELECT wn.id, wn.place_id, p.name AS place_name, wn.phone_number, wn.phone_number_id,
               wn.is_active, wn.verification_status,
               (wn.whatsapp_api_token IS NOT NULL AND wn.whatsapp_api_token != '') AS has_direct_meta_token,
               wn.created_at
        FROM wuarike_db.whatsapp_numbers wn
        LEFT JOIN wuarike_db.places p ON p.id = wn.place_id
        ORDER BY wn.created_at DESC
    `);

    console.log(`Total números registrados: ${res.rows.length}\n`);
    console.log(JSON.stringify(res.rows, null, 2));

    await client.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
