const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

async function runMigration() {
    console.log('📡 Configuración de conexión:');
    console.log('   Host:', process.env.DB_HOST);
    console.log('   Port:', process.env.DB_PORT);
    console.log('   Database:', process.env.DB_NAME);
    console.log('   User:', process.env.DB_USERNAME);

    const client = new Client({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: process.env.DB_SSL === 'true' ? true : false,
    });

    try {
        await client.connect();
        console.log('✅ Conectado a la base de datos');

        const migrationSQL = fs.readFileSync(
            path.join(__dirname, 'add_marketing_consent_to_public_feedback.sql'),
            'utf8'
        );

        await client.query(migrationSQL);

        console.log('✅ Migración ejecutada exitosamente');
        console.log('   - Agregada columna: marketing_consent (BOOLEAN, default FALSE)');
        console.log('   - Agregada columna: consent_timestamp (TIMESTAMP, nullable)');
        console.log('   - Crear índice: idx_public_feedback_marketing_consent (parcial)');
        console.log('   - Crear índice: idx_public_feedback_consent_timestamp (parcial)');

    } catch (error) {
        console.error('❌ Error en migración:', error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

runMigration();
