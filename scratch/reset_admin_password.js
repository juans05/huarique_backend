
const { DataSource } = require('typeorm');
const bcrypt = require('bcryptjs');
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

async function resetPassword() {
    try {
        const newPassword = process.env.NEW_ADMIN_PASSWORD;
        if (!newPassword) {
            console.error('Set NEW_ADMIN_PASSWORD before running this script, e.g.:');
            console.error('  NEW_ADMIN_PASSWORD=your-new-password node scratch/reset_admin_password.js');
            process.exit(1);
        }

        await AppDataSource.initialize();
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(newPassword, salt);

        const result = await AppDataSource.query(
            'UPDATE wuarike_db.users SET password_hash = $1, role = $2 WHERE email = $3',
            [hash, 'admin', 'admin@wuarike.com']
        );

        console.log('Password updated successfully for admin@wuarike.com');
        console.log('New Password:', newPassword);
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await AppDataSource.destroy();
    }
}

resetPassword();
