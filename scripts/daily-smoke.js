// Query /api/stats/daily for today range using Bearer token
const http = require('http');

const token = process.env.SMOKE_TOKEN || 'test';
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const iso = todayISO();
const path = `/api/stats/daily?from=${iso}&to=${iso}`;

const req = http.request({
  hostname: 'localhost',
  port,
  path,
  method: 'GET',
  headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
}, (res) => {
  let body = '';
  res.on('data', (c) => body += c);
  res.on('end', () => {
    console.log('HTTP', path, res.statusCode, body);
  });
});

req.on('error', (err) => {
  console.error('Daily error:', err.message);
  process.exit(1);
});

req.end();

