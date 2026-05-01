
const bcrypt = require('bcryptjs');
const hash = '$2b$10$/jOW1dkJi.aZqsw/ypuvIOpfnykDfk9PWrP1H6bQtOO7D.owpAxO2';
const password = '123456';

bcrypt.compare(password, hash).then(res => {
    console.log('Matches 123456:', res);
});
