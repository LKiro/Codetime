// Minimal WS smoke test: connect, send one heartbeat, print ack, exit
const WebSocket = require('ws');

const token = process.env.SMOKE_TOKEN || 'test';
const url = process.env.SMOKE_URL || `ws://localhost:3000/ws?token=${encodeURIComponent(token)}&clientId=smoke`;

const ws = new WebSocket(url);

ws.on('open', () => {
  const payload = {
    projectName: process.env.SMOKE_PROJECT || 'demo',
    editor: 'vscode',
    clientId: 'smoke',
    heartbeatAt: Date.now(),
    extensionVersion: 'smoke'
  };
  ws.send(JSON.stringify(payload));
});

ws.on('message', (data) => {
  console.log('WS message:', data.toString());
  ws.close();
});

ws.on('error', (err) => {
  console.error('WS error:', err.message);
  process.exit(1);
});

