# Codetime VS Code Extension

Sends a heartbeat every 60s with the current project name to a Codetime server (HTTP+WS on a single port), pauses on idle, and shows a status bar with today's minutes. It also provides a command to open the dashboard.

Configuration (Settings)
- codetime.serverUrl: ws://localhost:3000/ws
- codetime.httpBase: http://localhost:3000
- codetime.authToken: your token
- codetime.heartbeatIntervalSeconds: default 60
- codetime.idleTimeoutSeconds: default 120
- codetime.projectNameStrategy: gitRoot | folder

Commands
- Codetime: Open Dashboard – opens httpBase in your default browser.

Notes
- The extension uses Node WebSocket (ws) client; ensure dependencies are installed inside vscode-extension folder.
- Today minutes in the status bar are fetched from /api/stats/summary?range=today with Bearer token.

Develop
- Open this folder in VS Code, run:
  npm install
  F5 (Run Extension) to launch Extension Development Host.

