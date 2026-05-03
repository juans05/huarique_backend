
const { DataSource } = require('typeorm');
require('dotenv').config();

const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: false
});

async function listColumns() {
    try {
        await AppDataSource.initialize();
        const columns = await AppDataSource.query(
            "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users'"
        );
        console.log(JSON.stringify(columns, null, 2));
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await AppDataSource.destroy();
    }
}

listColumns();
