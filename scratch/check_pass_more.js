
const bcrypt = require('bcryptjs');
const hash = '$2b$10$P.ENEpl9kaEecwGlgpBJve1E81SO2hnLWuxP98jdOzPRll5mLEb4e';
const passwords = ['admin123', 'demo123', 'warike123', 'warike2024', '12345678', 'password'];

passwords.forEach(password => {
    bcrypt.compare(password, hash).then(res => {
        if (res) console.log(`Matches ${password}: true`);
    });
});
