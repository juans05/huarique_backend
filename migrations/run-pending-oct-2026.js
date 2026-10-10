// Corre las migraciones pendientes de la publicación de octubre 2026 (campañas Meta,
// consentimiento de fidelización, descuentos en promociones y comisiones). Todo es IF NOT EXISTS / ON CONFLICT:
// no borra ni cambia datos y se puede correr más de una vez.
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const steps = [
    ['broadcasts: plantillas de Meta', fs.readFileSync(path.join(__dirname, 'add_broadcast_templates.sql'), 'utf8')],
    ['loyalty_cards: consentimiento', fs.readFileSync(path.join(__dirname, 'add_loyalty_marketing_consent.sql'), 'utf8')],
    ['promotions: descuentos', `ALTER TABLE wuarike_db.promotions
        ADD COLUMN IF NOT EXISTS discount_type varchar(20),
        ADD COLUMN IF NOT EXISTS discount_value decimal(10,2);`],
    ['comisiones de comerciales', fs.readFileSync(path.join(__dirname, 'add_sales_commissions.sql'), 'utf8')],
];

async function run() {
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
    // Muestra a qué servidor se conecta (sin usuario ni contraseña) para confirmar que es producción.
    const target = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).host : `${process.env.DB_HOST}/${process.env.DB_NAME}`;
    console.log('📡 Conectando a', target);

    try {
        await client.connect();
        for (const [name, sql] of steps) {
            await client.query(sql);
            console.log('✅', name);
        }
        console.log('🎉 Migraciones aplicadas');
    } catch (error) {
        console.error('❌ Error en migración:', error.message);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}

run();
