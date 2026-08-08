const { DataSource } = require('typeorm');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const EMAIL = 'admin@wuarike.com';
const NEW_PASSWORD = process.env.NEW_ADMIN_PASSWORD;
if (!NEW_PASSWORD) {
    console.error('Set NEW_ADMIN_PASSWORD before running this script, e.g.:');
    console.error('  NEW_ADMIN_PASSWORD=your-new-password node scratch/fix_admin_login.js');
    process.exit(1);
}

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

    console.log('--- Diagnóstico ANTES ---');
    const before = await AppDataSource.query(
        'SELECT email, role, is_verified, is_banned, length(password_hash) as hash_len FROM wuarike_db.users WHERE lower(email) = lower($1)',
        [EMAIL]
    );
    console.log(before);
    if (before.length === 0) {
        console.log(`❌ No existe ninguna fila con email = ${EMAIL} (ni variando mayúsculas). Ese es el problema real.`);
        await AppDataSource.destroy();
        return;
    }
    if (before.length > 1) {
        console.log(`⚠️ Hay ${before.length} filas con ese email — posible duplicado.`);
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(NEW_PASSWORD, salt);

    const result = await AppDataSource.query(
        `UPDATE wuarike_db.users
         SET password_hash = $1, role = 'admin', is_verified = true, is_banned = false
         WHERE lower(email) = lower($2)
         RETURNING email, role, is_verified, is_banned`,
        [hash, EMAIL]
    );
    console.log('--- Filas actualizadas ---');
    console.log(result);

    console.log('--- Verificación bcrypt post-update ---');
    const after = await AppDataSource.query(
        'SELECT password_hash FROM wuarike_db.users WHERE lower(email) = lower($1)',
        [EMAIL]
    );
    const matches = await bcrypt.compare(NEW_PASSWORD, after[0].password_hash);
    console.log(`¿La contraseña nueva coincide con el hash guardado?`, matches ? '✅ SI' : '❌ NO (algo está mal)');

    console.log('\nNueva contraseña para', EMAIL, ':', NEW_PASSWORD);

    await AppDataSource.destroy();
}

run().catch(e => { console.error('Error:', e); process.exit(1); });
