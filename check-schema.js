const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    schema: process.env.DB_SCHEMA || 'wuarike_db'
});

client.connect().then(async () => {
    console.log('✅ Conectado');
    console.log('Schema:', process.env.DB_SCHEMA);
    
    // Contar en public schema
    const publicCount = await client.query('SELECT COUNT(*) FROM public.ubigeos');
    console.log('Registros en public schema:', publicCount.rows[0].count);
    
    // Contar en wuarike_db schema
    const wuarikeCount = await client.query('SELECT COUNT(*) FROM wuarike_db.ubigeos');
    console.log('Registros en wuarike_db schema:', wuarikeCount.rows[0].count);
    
    // Ver departamentos en wuarike_db
    const depts = await client.query('SELECT DISTINCT department FROM wuarike_db.ubigeos ORDER BY department');
    console.log('\nDepartamentos en wuarike_db:');
    console.log(depts.rows.map(r => r.department));
    
    await client.end();
}).catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
