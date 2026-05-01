
const bcrypt = require('bcryptjs');
const hash = '$2b$10$P.ENEpl9kaEecwGlgpBJve1E81SO2hnLWuxP98jdOzPRll5mLEb4e';
const password = '123456';

bcrypt.compare(password, hash).then(res => {
    console.log('Matches 123456:', res);
});
