
const bcrypt = require('bcryptjs');
const hash = '$2b$10$/jOW1dkJi.aZqsw/ypuvIOpfnykDfk9PWrP1H6bQtOO7D.owpAxO2';
const password = 'admin.wuarike.2024';

bcrypt.compare(password, hash).then(res => {
    console.log('Matches admin.wuarike.2024:', res);
});
