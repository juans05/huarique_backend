const bcrypt = require('bcrypt');

const password = 'WuarikeSuperAdmin2026!';

bcrypt.hash(password, 10, (err, hash) => {
  if (err) {
    console.error('Error:', err);
    process.exit(1);
  }
  console.log('\n=== CREDENCIALES DE SUPERADMIN ===\n');
  console.log('📧 Email: admin@wuarike.com');
  console.log('🔐 Contraseña: ' + password);
  console.log('\n🔑 Hash (usar en BD):\n' + hash);
  console.log('\n=====================================\n');
});
