const { buildPoolFromEnv } = require('./db');

async function migrateIfNeeded() {
  const pool = buildPoolFromEnv();
  if (!pool) return;
  const sql = `CREATE TABLE IF NOT EXISTS tokens (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    token_hash VARCHAR(191) NOT NULL,
    label VARCHAR(100) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_token_hash (token_hash),
    KEY idx_user (user_id),
    CONSTRAINT fk_tokens_user FOREIGN KEY (user_id) REFERENCES users(id)
      ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;
  const conn = await pool.getConnection();
  try {
    await conn.execute(sql);
  } finally { conn.release(); }
}

module.exports = { migrateIfNeeded };

