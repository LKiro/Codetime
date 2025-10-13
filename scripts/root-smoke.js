const http = require('http');
const port = process.env.PORT ? Number(process.env.PORT) : 3000;
http.get({ hostname: 'localhost', port, path: '/', headers: { 'Accept': 'text/html' } }, (res) => {
  let body = '';
  res.on('data', (c) => body += c);
  res.on('end', () => {
    console.log('GET / status:', res.statusCode);
    console.log('Body (first 200 chars):', body.slice(0, 200));
  });
}).on('error', (err) => {
  console.error('Root error:', err.message);
  process.exit(1);
});

