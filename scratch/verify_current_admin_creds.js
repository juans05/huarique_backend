const { Client } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const candidates = [
    { email: 'admin@wuarike.com', passwords: ['123456', 'admin.wuarike.2024', 'Password123!'] },
    { email: 'juans0520@gmail.com', passwords: ['123456', 'admin.wuarike.2024', 'Password123!'] },
];

async function run() {
    const client = new Client({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USERNAME || process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: false,
    });
    await client.connect();

    for (const c of candidates) {
        const res = await client.query(
            'SELECT email, role, password_hash, is_verified FROM wuarike_db.users WHERE email = $1',
            [c.email]
        );
        if (res.rows.length === 0) {
            console.log(`❌ No existe usuario con email ${c.email}`);
            continue;
        }
        const user = res.rows[0];
        console.log(`👤 ${user.email} — role: ${user.role}, verified: ${user.is_verified}`);
        for (const pw of c.passwords) {
            const matches = await bcrypt.compare(pw, user.password_hash);
            console.log(`   ¿"${pw}" coincide? ${matches ? '✅ SI' : '❌ no'}`);
        }
    }

    await client.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
