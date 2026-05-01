
const { Client } = require('pg');
require('dotenv').config();

async function findUser() {
    const client = new Client({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: false,
    });

    try {
        await client.connect();
        const schema = process.env.DB_SCHEMA || 'public';
        
        const query = `SELECT email, password_hash, role FROM "${schema}".users WHERE email ILIKE $1 OR email ILIKE $2 OR role = 'admin'`;
        const res = await client.query(query, ['demo@warike.com', 'admin@wuarike.com']);
        
        console.log('Results:');
        res.rows.forEach(row => {
            console.log(`Email: ${row.email} | Role: ${row.role} | Hash: ${row.password_hash}`);
        });
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
    }
}

findUser();
