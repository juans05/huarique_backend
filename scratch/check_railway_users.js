
const https = require('https');

function post(url, data) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(data);
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': body.length,
            },
        };

        const req = https.request(url, options, (res) => {
            let resData = '';
            res.on('data', (chunk) => resData += chunk);
            res.on('end', () => {
                try {
                    const json = resData ? JSON.parse(resData) : {};
                    resolve({ status: res.statusCode, data: json });
                } catch (e) {
                    resolve({ status: res.statusCode, data: resData });
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function run() {
    const registerUrl = 'https://backendwarike-production.up.railway.app/auth/register';
    
    console.log('Checking if user exists on Railway by trying to register...');
    
    const emails = ['admin@wuarike.com', 'demo@warike.com'];

    for (const email of emails) {
        const res = await post(registerUrl, {
            email,
            password: 'somepassword',
            fullName: 'Test User'
        });
        if (res.status === 409 || (res.data && res.data.message && res.data.message.includes('ya está registrado'))) {
            console.log(`👤 User ${email} EXISTS on Railway.`);
        } else if (res.status === 201 || res.status === 200) {
            console.log(`🆕 User ${email} DID NOT EXIST and was just created on Railway!`);
        } else {
            console.log(`❓ Error checking ${email}:`, res.status, res.data);
        }
    }
}

run();
