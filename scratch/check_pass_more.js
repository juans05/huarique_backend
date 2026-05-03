
const bcrypt = require('bcryptjs');
const hash = '$2b$10$CETXyXT6gut7KSp0kSDIo.bG0OhK7fcM1NXOr5CRF.JV9SkPDw9Me';
const passwords = ['Password123!', 'Demo123!', 'warike123', 'warike2024', '12345678', '123456'];

passwords.forEach(password => {
    bcrypt.compare(password, hash).then(res => {
        console.log(password, res)
        if (res) console.log(`Matches ${password}: true`);
    });
});
