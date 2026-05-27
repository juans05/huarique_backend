const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Load .env file
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

        // Read and execute the migration SQL
        const migrationSQL = fs.readFileSync(
            path.join(__dirname, 'add-whatsapp-and-rag-tables.sql'),
            'utf8'
        );

        await client.query(migrationSQL);

        console.log('✅ Migración de WhatsApp y RAG ejecutada exitosamente');
        console.log('   - Creadas tablas: whatsapp_numbers, conversations, messages, broadcasts, knowledge_bases, knowledge_base_chunks');
        console.log('   - Embeddings: Almacenamiento estándar por formato TEXT (100% Compatible)');

    } catch (error) {
        console.error('❌ Error en migración:', error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

runMigration();
