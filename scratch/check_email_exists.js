const { DataSource } = require('typeorm');
require('dotenv').config();

const emailArg = process.argv[2];

const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: false,
});

async function run() {
    await AppDataSource.initialize();

    if (emailArg) {
        console.log(`--- Coincidencia EXACTA para "${emailArg}" ---`);
        const exact = await AppDataSource.query(
            'SELECT id, email, role, created_at FROM wuarike_db.users WHERE email = $1',
            [emailArg]
        );
        console.log(exact.length ? exact : 'Ninguna fila exacta.');

        console.log(`\n--- Coincidencia case-insensitive / con espacios para "${emailArg}" ---`);
        const loose = await AppDataSource.query(
            "SELECT id, email, role, created_at FROM wuarike_db.users WHERE lower(trim(email)) = lower(trim($1))",
            [emailArg]
        );
        console.log(loose.length ? loose : 'Ninguna fila (ni relajando mayúsculas/espacios).');
    } else {
        console.log('(No pasaste un email como argumento — solo muestro el resumen general.)');
    }

    console.log('\n--- Totales ---');
    const [{ count }] = await AppDataSource.query('SELECT count(*)::int as count FROM wuarike_db.users');
    console.log('Total de usuarios en la tabla:', count);

    console.log('\n--- Últimos 10 usuarios creados ---');
    const recent = await AppDataSource.query(
        'SELECT email, role, created_at FROM wuarike_db.users ORDER BY created_at DESC LIMIT 10'
    );
    console.log(recent);

    await AppDataSource.destroy();
}

run().catch(e => { console.error('Error:', e); process.exit(1); });
