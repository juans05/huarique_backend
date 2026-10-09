const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

async function runMigration() {
    // Producción (Railway) entrega DATABASE_URL; en local se usan DB_HOST, DB_USERNAME, etc.
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
    console.log('📡 Conectando a', process.env.DATABASE_URL ? 'DATABASE_URL' : `${process.env.DB_HOST}/${process.env.DB_NAME}`);

    try {
        await client.connect();
        console.log('✅ Conectado a la base de datos');

        const migrationSQL = fs.readFileSync(
            path.join(__dirname, 'add_loyalty_marketing_consent.sql'),
            'utf8'
        );

        await client.query(migrationSQL);

        console.log('✅ Migración loyalty_cards.marketing_consent ejecutada');
    } catch (error) {
        console.error('❌ Error en migración:', error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

runMigration();
