const vscode = require('vscode');
const WebSocket = require('ws');
const http = require('http');

function randomId() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function getProjectName(strategy) {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return 'no-workspace';
  const root = folders[0].uri.fsPath.split(/\\|\//).pop();
  // gitRoot strategy: heuristically same as folder for MVP
  return root || 'unknown-project';
}

function fetchTodayMinutes(httpBase, token) {
  return new Promise((resolve) => {
    try {
      const url = new URL(httpBase);
      const opts = {
        hostname: url.hostname,
        port: url.port ? Number(url.port) : (url.protocol === 'https:' ? 443 : 80),
        path: '/api/stats/summary?range=today',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      };
      const req = http.request(opts, (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => {
          try { const j = JSON.parse(body); resolve((j && j.data && j.data.totalMinutes) || 0); }
          catch { resolve(0); }
        });
      });
      req.on('error', () => resolve(0));
      req.end();
    } catch {
      resolve(0);
    }
  });
}

async function activate(context) {
  const cfg = vscode.workspace.getConfiguration();
  const serverUrl = cfg.get('codetime.serverUrl');
  const httpBase = cfg.get('codetime.httpBase');
  const token = cfg.get('codetime.authToken');
  const intervalSec = cfg.get('codetime.heartbeatIntervalSeconds');
  const idleTimeoutSec = cfg.get('codetime.idleTimeoutSeconds');
  const strategy = cfg.get('codetime.projectNameStrategy');

  let clientId = context.globalState.get('codetime.clientId');
  if (!clientId) { clientId = randomId(); await context.globalState.update('codetime.clientId', clientId); }

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.text = 'Codetime: connecting...';
  status.command = 'codetime.openDashboard';
  status.show();
  context.subscriptions.push(status);

  context.subscriptions.push(vscode.commands.registerCommand('codetime.openDashboard', async () => {
    try { await vscode.env.openExternal(vscode.Uri.parse(httpBase)); } catch {}
  }));

  let ws = null; let connecting = false; let closed = false; let backoff = 1000;
  let lastActivity = Date.now();
  let lastMinutes = 0;

  function onActivity() { lastActivity = Date.now(); }
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(onActivity));
  context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(onActivity));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(onActivity));

  function updateStatus(phase) {
    status.text = `Codetime: ${phase} ${lastMinutes ? '(' + lastMinutes + 'm today)' : ''}`.trim();
  }

  function connect() {
    if (connecting || closed) return;
    connecting = true;
    updateStatus('connecting');
    try {
      const sep = serverUrl.includes('?') ? '&' : '?';
      const url = `${serverUrl}${sep}token=${encodeURIComponent(token)}&clientId=${encodeURIComponent(clientId)}`;
      ws = new WebSocket(url);
      ws.on('open', () => {
        connecting = false; backoff = 1000; updateStatus('online');
      });
      ws.on('message', async () => {
        // On ACK, optionally refresh today minutes
        lastMinutes = await fetchTodayMinutes(httpBase, token);
        updateStatus('online');
      });
      ws.on('close', () => {
        ws = null; connecting = false; if (!closed) setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 30000); updateStatus('reconnecting');
      });
      ws.on('error', () => { /* ignore, handled by close*/ });
    } catch {
      connecting = false; setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 30000);
    }
  }

  function sendHeartbeat() {
    const idle = (Date.now() - lastActivity) > idleTimeoutSec * 1000;
    if (idle) { updateStatus('idle'); return; }
    if (!ws || ws.readyState !== WebSocket.OPEN) { connect(); return; }
    const payload = {
      projectName: getProjectName(strategy),
      editor: 'vscode',
      clientId,
      heartbeatAt: Date.now(),
      extensionVersion: '0.0.1'
    };
    try { ws.send(JSON.stringify(payload)); } catch {}
  }

  const timer = setInterval(sendHeartbeat, intervalSec * 1000);
  context.subscriptions.push(new vscode.Disposable(() => clearInterval(timer)));

  connect();
}

function deactivate() {}

module.exports = { activate, deactivate };

