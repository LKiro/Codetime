const mysql = require('mysql2/promise');

function buildPoolFromEnv() {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_DATABASE } = process.env;
  if (!DB_HOST || !DB_USER || !DB_DATABASE) return null;
  const port = DB_PORT ? Number(DB_PORT) : 3306;
  const pool = mysql.createPool({
    host: DB_HOST,
    port,
    user: DB_USER,
    password: DB_PASSWORD || '',
    database: DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: 'Z' // use UTC
  });
  return pool;
}

module.exports = { buildPoolFromEnv };
