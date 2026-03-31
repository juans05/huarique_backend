const { Client } = require('pg');

async function runMigration() {
    const client = new Client({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USER || 'doadmin',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'wuarike_db',
        ssl: false,
    });

    try {
        await client.connect();
        console.log('✅ Conectado a la base de datos');

        // Ejecutar migración
        await client.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS pronouns VARCHAR(50),
            ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
            ADD COLUMN IF NOT EXISTS birth_date DATE;
        `);

        console.log('✅ Migración ejecutada exitosamente');
        console.log('   - Agregada columna: pronouns (VARCHAR 50)');
        console.log('   - Agregada columna: gender (VARCHAR 20)');
        console.log('   - Agregada columna: birth_date (DATE)');

    } catch (error) {
        console.error('❌ Error en migración:', error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

runMigration();
