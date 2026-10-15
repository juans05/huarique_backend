/**
 * Crea un local de PRUEBA para probar Pedidos de punta a punta (no aparece en el mapa: status 'pending').
 *
 *   cd huarique_backend
 *   railway run npx ts-node src/scripts/seed-demo-pedidos.ts
 *     (o con DATABASE_URL=<url pública de Railway> DB_SSL=true npx ts-node src/scripts/seed-demo-pedidos.ts)
 *
 * Crea: dueño (rol admin del local), usuario de cocina, 3 platos con precio, pedidos activados en modo
 * cuenta abierta (cobro LOCAL, sin llaves: se pegan las de PRUEBA de Culqi desde el panel) y 2 mesas con PIN.
 * Es idempotente: si ya existe, no duplica y solo muestra los datos. Las contraseñas se generan al azar y se
 * muestran SOLO en esta consola: guárdalas, no se vuelven a mostrar.
 * Para borrarlo todo al terminar: ver el SQL de limpieza al final de este archivo.
 */
import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomInt } from 'crypto';

const S = 'wuarike_db';
const PLACE_NAME = '[PRUEBA] Wuarikes Demo Pedidos';
const OWNER_EMAIL = 'demo.pedidos.dueno@wuarikes.com';
const KITCHEN_EMAIL = 'demo.pedidos.cocina@wuarikes.com';
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://admin.wuarikes.com';

const ds = new DataSource(
    process.env.DATABASE_URL
        ? { type: 'postgres', url: process.env.DATABASE_URL, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false }
        : { type: 'postgres', host: process.env.DB_HOST, port: Number(process.env.DB_PORT) || 5432, username: process.env.DB_USER || process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME },
);

const newPassword = () => randomBytes(9).toString('base64url');
const newToken = () => randomBytes(16).toString('hex');
const newPin = () => String(randomInt(0, 10000)).padStart(4, '0');

async function upsertUser(email: string, fullName: string): Promise<{ id: string; password: string | null }> {
    const [existing] = await ds.query(`SELECT id FROM ${S}.users WHERE email = $1`, [email]);
    if (existing) return { id: existing.id, password: null };
    const password = newPassword();
    const [row] = await ds.query(
        `INSERT INTO ${S}.users (email, password_hash, full_name, role, is_verified) VALUES ($1, $2, $3, 'business', true) RETURNING id`,
        [email, await bcrypt.hash(password, 10), fullName],
    );
    return { id: row.id, password };
}

async function main() {
    await ds.initialize();

    const owner = await upsertUser(OWNER_EMAIL, 'Dueño Demo Pedidos');
    const kitchen = await upsertUser(KITCHEN_EMAIL, 'Cocina Demo Pedidos');

    let [place] = await ds.query(`SELECT id FROM ${S}.places WHERE name = $1`, [PLACE_NAME]);
    if (!place) {
        [place] = await ds.query(
            `INSERT INTO ${S}.places (name, status, claimed_by_user_id, country_code, address) VALUES ($1, 'pending', $2, 'PE', 'Local de prueba') RETURNING id`,
            [PLACE_NAME, owner.id],
        );
    }
    const placeId: string = place.id;

    for (const [userId, role] of [[owner.id, 'admin'], [kitchen.id, 'cocina']] as const) {
        await ds.query(
            `INSERT INTO ${S}.place_team_members (user_id, place_id, role)
             SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM ${S}.place_team_members WHERE user_id = $1 AND place_id = $2)`,
            [userId, placeId, role],
        );
    }

    const [dishCount] = await ds.query(`SELECT COUNT(*)::int AS n FROM ${S}.dishes WHERE place_id = $1`, [placeId]);
    if (dishCount.n === 0) {
        const [category] = await ds.query(
            `INSERT INTO ${S}.menu_categories (name, place_id, display_order, category_type) VALUES ('Platos de prueba', $1, 0, 'food') RETURNING id`,
            [placeId],
        );
        const dishes: [string, string, string][] = [
            ['Lomo saltado', 'Plato de prueba para Pedidos', '35.00'],
            ['Ceviche clásico', 'Plato de prueba para Pedidos', '32.00'],
            ['Chicha morada', 'Bebida de prueba para Pedidos', '8.50'],
        ];
        for (const [i, [name, description, price]] of dishes.entries()) {
            await ds.query(
                `INSERT INTO ${S}.dishes (name, description, price, is_available, display_order, place_id, category_id) VALUES ($1, $2, $3, true, $4, $5, $6)`,
                [name, description, price, i, placeId, category.id],
            );
        }
    }

    await ds.query(
        `INSERT INTO ${S}.place_order_settings (place_id, orders_enabled, table_payment_mode, payment_destination, pickup_enabled, delivery_enabled)
         VALUES ($1, true, 'CUENTA_ABIERTA', 'LOCAL', true, false) ON CONFLICT (place_id) DO NOTHING`,
        [placeId],
    );

    const [tableCount] = await ds.query(`SELECT COUNT(*)::int AS n FROM ${S}.place_tables WHERE place_id = $1`, [placeId]);
    if (tableCount.n === 0) {
        for (const [i, name] of ['Mesa 1', 'Mesa 2'].entries()) {
            await ds.query(
                `INSERT INTO ${S}.place_tables (place_id, name, capacity, display_order, qr_token, pin, active) VALUES ($1, $2, 4, $3, $4, $5, true)`,
                [placeId, name, i, newToken(), newPin()],
            );
        }
    }
    const tables = await ds.query(`SELECT name, qr_token, pin FROM ${S}.place_tables WHERE place_id = $1 ORDER BY display_order`, [placeId]);

    console.log('\n=== Local de prueba para Pedidos ===');
    console.log(`Local: ${PLACE_NAME} (${placeId}) — no aparece en el mapa (status pending)`);
    console.log(`Panel: ${DASHBOARD_URL}/login`);
    console.log(`Dueño:  ${OWNER_EMAIL}  ${owner.password ? `contraseña: ${owner.password}` : '(ya existía: usa su contraseña o "¿Olvidaste tu contraseña?")'}`);
    console.log(`Cocina: ${KITCHEN_EMAIL}  ${kitchen.password ? `contraseña: ${kitchen.password}` : '(ya existía: usa su contraseña o "¿Olvidaste tu contraseña?")'}`);
    for (const t of tables) console.log(`${t.name}: PIN ${t.pin} · QR ${DASHBOARD_URL}/menu/${placeId}?mesa=${t.qr_token}`);
    console.log('\nSiguiente paso: entra como dueño → Pedidos → Configurar pedidos y mesas → pega las llaves de PRUEBA de Culqi.\n');

    await ds.destroy();
}

main().catch(async (err) => {
    console.error('No se pudo crear el local de prueba:', err.message);
    await ds.destroy().catch(() => undefined);
    process.exit(1);
});

/*
 * Limpieza (correr en Railway → Postgres → Query cuando termines las pruebas):
 *
 * DELETE FROM wuarike_db.places WHERE name = '[PRUEBA] Wuarikes Demo Pedidos';   -- borra en cascada mesas, pedidos, platos, ajustes
 * DELETE FROM wuarike_db.users WHERE email IN ('demo.pedidos.dueno@wuarikes.com', 'demo.pedidos.cocina@wuarikes.com');
 */
