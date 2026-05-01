
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
        
        const query = `SELECT email, role, is_verified FROM "${schema}".users`;
        const res = await client.query(query);
        
        console.log('User Verification Status:');
        res.rows.forEach(row => {
            console.log(`Email: ${row.email} | Role: ${row.role} | Verified: ${row.is_verified}`);
        });
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
    }
}

findUser();
