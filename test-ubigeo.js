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
    const res = await client.query('SELECT DISTINCT department FROM ubigeos ORDER BY department');
    console.log('Departamentos encontrados:');
    console.log(res.rows);
    await client.end();
}).catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
