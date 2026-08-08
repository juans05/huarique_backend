require('dotenv').config();
const { Client } = require('pg');

async function runMigration() {
    const client = new Client({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USERNAME || process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'wuarike_db',
        ssl: false,
    });

    try {
        await client.connect();
        console.log('✅ Conectado a la base de datos');

        // place.entity.ts declara @Column({ name: 'is_featured', default: false })
        // pero la columna nunca se agregó a la tabla real — rompía GET /places
        // con "column place.is_featured does not exist". TypeORM apunta al
        // schema DB_SCHEMA (default "wuarike_db", ver database.config.ts), no
        // al schema "public" por defecto de pg — hay que calificarlo.
        const schema = process.env.DB_SCHEMA || 'wuarike_db';
        await client.query(`
            ALTER TABLE "${schema}".places
            ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;
        `);

        console.log('✅ Migración ejecutada exitosamente');
        console.log('   - Agregada columna: is_featured (BOOLEAN, default false)');
    } catch (error) {
        console.error('❌ Error en migración:', error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

runMigration();
