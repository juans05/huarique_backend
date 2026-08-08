const { DataSource } = require('typeorm');
require('dotenv').config();

const placeId = process.argv[2];

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

    const [{ count: totalConvs }] = await AppDataSource.query(
        'SELECT count(*)::int as count FROM wuarike_db.conversations'
    );
    console.log('Total conversaciones (todas las empresas):', totalConvs);

    const [{ count: totalMsgs }] = await AppDataSource.query(
        'SELECT count(*)::int as count FROM wuarike_db.messages'
    );
    console.log('Total mensajes (todas las empresas):', totalMsgs);

    if (placeId) {
        console.log(`\n--- Local ${placeId} ---`);
        const convs = await AppDataSource.query(
            'SELECT id, customer_phone, customer_name, mode, created_at FROM wuarike_db.conversations WHERE place_id = $1 ORDER BY created_at DESC',
            [placeId]
        );
        console.log(`Conversaciones de este local: ${convs.length}`);
        console.log(convs);

        if (convs.length > 0) {
            const ids = convs.map(c => c.id);
            const msgCount = await AppDataSource.query(
                'SELECT count(*)::int as count FROM wuarike_db.messages WHERE conversation_id = ANY($1)',
                [ids]
            );
            console.log('Mensajes de esas conversaciones:', msgCount[0].count);
        }

        const numbers = await AppDataSource.query(
            'SELECT phone_number, is_active FROM wuarike_db.whatsapp_numbers WHERE place_id = $1',
            [placeId]
        );
        console.log('Números de WhatsApp de este local:', numbers);
    } else {
        console.log('\n(Pasa un placeId como argumento para ver el detalle de un local específico.)');
    }

    await AppDataSource.destroy();
}

run().catch(e => { console.error('Error:', e); process.exit(1); });
