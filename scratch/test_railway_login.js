
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
    const baseUrl = 'https://backendwarike-production.up.railway.app/auth/login';
    
    console.log('Testing login against Railway production...');
    
    const credentials = [
        { email: 'admin@wuarike.com', password: '123456' },
        { email: 'demo@warike.com', password: 'demo123' },
        { email: 'admin@warike.com', password: '123456' },
        { email: 'demo@wuarike.com', password: 'demo123' }
    ];

    for (const cred of credentials) {
        const res = await post(baseUrl, cred);
        if (res.status === 200 || res.status === 201) {
            console.log(`✅ SUCCESS for ${cred.email}`);
        } else {
            console.log(`❌ FAILED for ${cred.email}:`, res.status, res.data.message || res.data);
        }
    }
}

run();
