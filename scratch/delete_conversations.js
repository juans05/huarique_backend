const { DataSource } = require('typeorm');
require('dotenv').config();

const arg = process.argv[2];
if (!arg) {
    console.error('Uso:');
    console.error('  node scratch/delete_conversations.js <placeId>   — borra conversaciones+mensajes de UN local');
    console.error('  node scratch/delete_conversations.js --all       — borra TODAS las conversaciones+mensajes (todas las empresas)');
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

    const where = arg === '--all' ? '' : 'WHERE place_id = $1';
    const params = arg === '--all' ? [] : [arg];

    const convIds = await AppDataSource.query(
        `SELECT id FROM wuarike_db.conversations ${where}`,
        params
    );
    console.log(`Conversaciones a borrar: ${convIds.length}`);
    if (convIds.length === 0) {
        console.log('Nada que borrar.');
        await AppDataSource.destroy();
        return;
    }

    const ids = convIds.map(c => c.id);
    const msgResult = await AppDataSource.query(
        'DELETE FROM wuarike_db.messages WHERE conversation_id = ANY($1) RETURNING id',
        [ids]
    );
    console.log(`Mensajes borrados: ${msgResult.length}`);

    const convResult = await AppDataSource.query(
        `DELETE FROM wuarike_db.conversations ${where} RETURNING id`,
        params
    );
    console.log(`Conversaciones borradas: ${convResult.length}`);

    await AppDataSource.destroy();
}

run().catch(e => { console.error('Error:', e); process.exit(1); });
