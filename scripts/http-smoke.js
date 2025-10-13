// Minimal HTTP smoke test: fetch today summary with Bearer token
const http = require('http');

const token = process.env.SMOKE_TOKEN || 'test';
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const options = {
  hostname: 'localhost',
  port,
  path: '/api/stats/summary?range=today',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json'
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('HTTP status:', res.statusCode);
    console.log('Body:', body);
  });
});

req.on('error', (err) => {
  console.error('HTTP error:', err.message);
  process.exit(1);
});

req.end();

