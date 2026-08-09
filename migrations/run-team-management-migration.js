const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

async function runMigration() {
    console.log('📡 Configuración de conexión:');
    console.log('   Host:', process.env.DB_HOST);
    console.log('   Database:', process.env.DB_NAME);

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
            path.join(__dirname, 'add_team_management.sql'),
            'utf8'
        );

        await client.query(migrationSQL);

        console.log('✅ Migración ejecutada exitosamente');
        console.log('   - Tablas creadas: place_team_members, team_member_whatsapp_access');
        console.log('   - conversations: +whatsapp_number_id, +status, +assigned_to_user_id, +closed_at');
        console.log('   - Backfill de dueños existentes como admin completado');
    } catch (error) {
        console.error('❌ Error en migración:', error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

runMigration();
