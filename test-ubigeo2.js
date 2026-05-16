const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

client.connect().then(async () => {
    console.log('✅ Conectado a la BD');
    const schema = process.env.DB_SCHEMA || 'wuarike_db';
    
    // Listar todas las tablas en el schema
    const res = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = $1 
        ORDER BY table_name
    `, [schema]);
    
    console.log(`\nTablas en schema "${schema}":`);
    console.log(res.rows.map(r => r.table_name));
    
    // Contar registros en ubigeos
    try {
        const count = await client.query(`SELECT COUNT(*) FROM ${schema}.ubigeos`);
        console.log(`\nRegistros en ubigeos: ${count.rows[0].count}`);
        
        const sample = await client.query(`SELECT * FROM ${schema}.ubigeos LIMIT 3`);
        console.log('\nSample data:');
        console.log(sample.rows);
    } catch (err) {
        console.log('\n❌ Error querying ubigeos:', err.message);
    }
    
    await client.end();
}).catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
