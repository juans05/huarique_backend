
const { DataSource } = require('typeorm');
require('dotenv').config();

const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false }
});

async function checkAdmin() {
    try {
        await AppDataSource.initialize();
        const users = await AppDataSource.query('SELECT email, role FROM wuarike_db.users WHERE email = $1', ['admin@wuarike.com']);
        console.log('User found:', users);
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await AppDataSource.destroy();
    }
}

checkAdmin();
