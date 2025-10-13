// Health check script
const http = require('http');
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

http.get({ hostname: 'localhost', port, path: '/api/health', headers: { 'Accept': 'application/json' } }, (res) => {
  let body = '';
  res.on('data', (c) => body += c);
  res.on('end', () => {
    console.log('HTTP /api/health', res.statusCode, body);
  });
}).on('error', (err) => {
  console.error('Health error:', err.message);
  process.exit(1);
});

