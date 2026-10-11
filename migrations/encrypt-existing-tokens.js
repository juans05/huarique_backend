// Encripta las llaves que quedaron en texto plano antes de agregar encryptTransformer
// (tenant_plazbot_configs."plazBotApiKey" y whatsapp_numbers.whatsapp_api_token).
// Usa el mismo formato que src/common/utils/encryption-transformer.ts (iv:authTag:datos, AES-256-GCM).
// Idempotente: salta los valores que ya tienen formato encriptado. Requiere FIELD_ENCRYPTION_KEY.
const { Client } = require('pg');
const { createCipheriv, randomBytes, scryptSync } = require('crypto');

require('dotenv').config();

const schema = process.env.DB_SCHEMA || 'wuarike_db';
const columns = [
    ['tenant_plazbot_configs', '"plazBotApiKey"'],
    ['whatsapp_numbers', 'whatsapp_api_token'],
];

function encrypt(value, key) {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = cipher.update(value, 'utf8', 'hex') + cipher.final('hex');
    return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted}`;
}

const isEncrypted = (value) => /^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/.test(value);

async function run() {
    if (!process.env.FIELD_ENCRYPTION_KEY) throw new Error('Falta FIELD_ENCRYPTION_KEY');
    const key = scryptSync(process.env.FIELD_ENCRYPTION_KEY, 'salt', 32);
    const client = process.env.DATABASE_URL
        ? new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false })
        : new Client({
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT || '5432'),
            user: process.env.DB_USERNAME,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            ssl: process.env.DB_SSL === 'true' ? true : false,
        });
    const target = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).host : `${process.env.DB_HOST}/${process.env.DB_NAME}`;
    console.log('📡 Conectando a', target);

    try {
        await client.connect();
        for (const [table, column] of columns) {
            const { rows } = await client.query(`SELECT id, ${column} AS value FROM ${schema}.${table} WHERE ${column} IS NOT NULL`);
            let count = 0;
            for (const row of rows) {
                if (!row.value || isEncrypted(row.value)) continue;
                await client.query(`UPDATE ${schema}.${table} SET ${column} = $1 WHERE id = $2`, [encrypt(row.value, key), row.id]);
                count++;
            }
            console.log(`✅ ${table}.${column}: ${count} encriptado(s), ${rows.length - count} ya estaban encriptados`);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}

run();
