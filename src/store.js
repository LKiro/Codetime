const { buildPoolFromEnv } = require('./db');
const { hashToken } = require('./auth');

function toLocalISODate(tsMs) {
  const d = new Date(tsMs);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function minuteBucket(tsMs) { return Math.floor(tsMs / 60000); }

class InMemoryStore {
  constructor(policy) {
    this.policy = policy || 'exclusive';
    this.minuteSet = new Set(); // `${user}\u0001${project}\u0001${minute}`
    this.minuteChosen = new Map(); // `${user}\u0001${minute}` => project
    this.dailyAgg = new Map(); // `${user}\u0001${project}\u0001${date}` => minutes
  }
  async addMinute(user, project, minuteInt) {
    if (!user) user = 'anonymous';
    if (!project) return false;
    const nowMs = minuteInt * 60000;
    const dateStr = toLocalISODate(nowMs);
    if (this.policy === 'exclusive') {
      const keyUP = `${user}\u0001${minuteInt}`;
      if (this.minuteChosen.has(keyUP)) {
        const chosen = this.minuteChosen.get(keyUP);
        if (chosen !== project) return false;
        const mKey = `${user}\u0001${project}\u0001${minuteInt}`;
        if (this.minuteSet.has(mKey)) return false;
        this.minuteSet.add(mKey);
      } else {
        this.minuteChosen.set(keyUP, project);
        const mKey = `${user}\u0001${project}\u0001${minuteInt}`;
        if (this.minuteSet.has(mKey)) return false;
        this.minuteSet.add(mKey);
      }
    } else {
      const mKey = `${user}\u0001${project}\u0001${minuteInt}`;
      if (this.minuteSet.has(mKey)) return false;
      this.minuteSet.add(mKey);
    }
    const dKey = `${user}\u0001${project}\u0001${dateStr}`;
    this.dailyAgg.set(dKey, (this.dailyAgg.get(dKey) || 0) + 1);
    return true;
  }
  _datesInRange(start, end) {
    const dates = [];
    for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) {
      dates.push(toLocalISODate(d.getTime()));
    }
    return dates;
  }
  async summarize(range, user, project, parseRange) {
    const re = parseRange(range);
    if (!re) return { totalMinutes: 0, byProject: [], daily: [] };
    const { start, end } = re;
    // end is exclusive in parseRange; align to end-1 day
    const endInclusive = new Date(end.getTime() - 86400000);
    const dates = this._datesInRange(start, endInclusive);
    const dailyTotals = new Map();
    const byProject = new Map();
    for (const [key, minutes] of this.dailyAgg.entries()) {
      const [u, p, dateStr] = key.split('\u0001');
      if (user && u !== user) continue;
      if (project && p !== project) continue;
      if (!dates.includes(dateStr)) continue;
      dailyTotals.set(dateStr, (dailyTotals.get(dateStr) || 0) + minutes);
      byProject.set(p, (byProject.get(p) || 0) + minutes);
    }
    return {
      totalMinutes: Array.from(dailyTotals.values()).reduce((a, b) => a + b, 0),
      byProject: Array.from(byProject.entries()).map(([p, minutes]) => ({ project: p, minutes })).sort((a, b) => b.minutes - a.minutes),
      daily: dates.map((d) => ({ date: d, minutes: dailyTotals.get(d) || 0 }))
    };
  }
  async dailyRange(fromISO, toISO, user, project) {
    // from/to inclusive, format YYYY-MM-DD
    const start = new Date(`${fromISO}T00:00:00`);
    const end = new Date(`${toISO}T00:00:00`);
    const dates = this._datesInRange(start, end);
    const dailyTotals = new Map();
    for (const [key, minutes] of this.dailyAgg.entries()) {
      const [u, p, dateStr] = key.split('\u0001');
      if (user && u !== user) continue;
      if (project && p !== project) continue;
      if (!dates.includes(dateStr)) continue;
      dailyTotals.set(dateStr, (dailyTotals.get(dateStr) || 0) + minutes);
    }
    return {
      range: { from: fromISO, to: toISO },
      series: dates.map((d) => ({ date: d, minutes: dailyTotals.get(d) || 0 }))
    };
  }
  async listProjects(range, user, parseRange) {
    if (!range) {
      const set = new Set();
      for (const key of this.dailyAgg.keys()) {
        const [u, p] = key.split('\u0001');
        if (user && u !== user) continue;
        set.add(p);
      }
      return Array.from(set).map((p) => ({ project: p }));
    }
    const data = await this.summarize(range, user, undefined, parseRange);
    return data.byProject;
  }
}

class MySQLStore {
  constructor(pool) {
    this.pool = pool;
  }
  async getOrCreateUserByUsername(username) {
    const conn = await this.pool.getConnection();
    try {
      await conn.execute('INSERT IGNORE INTO users (username, token_hash) VALUES (?, "")', [username]);
      const [rows] = await conn.execute('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
      return rows[0].id;
    } finally { conn.release(); }
  }
  async getUserIdByToken(plainToken) {
    if (!plainToken) return null;
    const tokenHash = hashToken(plainToken);
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.execute('SELECT user_id FROM tokens WHERE token_hash = ? AND revoked_at IS NULL LIMIT 1', [tokenHash]);
      if (rows.length) return rows[0].user_id;
      if (String(process.env.DEV_TOKEN_AUTO).toLowerCase() === 'true') {
        // auto-provision: create a user and bind this token
        const uname = 'user_' + tokenHash.slice(0, 8);
        await conn.beginTransaction();
        await conn.execute('INSERT IGNORE INTO users (username, token_hash) VALUES (?, "")', [uname]);
        const [urows] = await conn.execute('SELECT id FROM users WHERE username = ? LIMIT 1', [uname]);
        const uid = urows[0].id;
        await conn.execute('INSERT IGNORE INTO tokens (user_id, token_hash, label) VALUES (?, ?, ?)', [uid, tokenHash, 'auto']);
        await conn.commit();
        return uid;
      }
      return null;
    } catch (e) {
      try { await conn.rollback(); } catch {}
      throw e;
    } finally { conn.release(); }
  }
  async createToken(userId, label) {
    const plain = cryptoRandom(32);
    const tokenHash = hashToken(plain);
    const conn = await this.pool.getConnection();
    try {
      await conn.execute('INSERT INTO tokens (user_id, token_hash, label) VALUES (?, ?, ?)', [userId, tokenHash, label || null]);
      return { token: plain };
    } finally { conn.release(); }
  }
  async listTokens(userId) {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.execute('SELECT id, label, created_at, revoked_at FROM tokens WHERE user_id = ? ORDER BY id DESC', [userId]);
      return rows;
    } finally { conn.release(); }
  }
  async revokeToken(userId, tokenId) {
    const conn = await this.pool.getConnection();
    try {
      await conn.execute('UPDATE tokens SET revoked_at = NOW() WHERE id = ? AND user_id = ? AND revoked_at IS NULL', [tokenId, userId]);
      return true;
    } finally { conn.release(); }
  }
  async addMinute(userToken, projectName, minuteInt) {
    const userId = await this.getUserIdByToken(userToken);
    if (!userId) { const err = new Error('UNAUTHORIZED'); err.code = 'UNAUTHORIZED'; throw err; }
    const projectId = await this._getOrCreateProject(userId, projectName);
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [res] = await conn.execute(
        'INSERT IGNORE INTO usage_minute (user_id, project_id, minute_ts) VALUES (?, ?, ?)',
        [userId, projectId, minuteInt]
      );
      if (res.affectedRows === 1) {
        const date = new Date(minuteInt * 60000);
        const yyyy = date.getUTCFullYear();
        const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(date.getUTCDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        await conn.execute(
          'INSERT INTO usage_daily (user_id, project_id, date, minutes) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE minutes = minutes + 1',
          [userId, projectId, dateStr]
        );
      }
      await conn.commit();
      return true;
    } catch (e) {
      try { await conn.rollback(); } catch {}
      throw e;
    } finally { conn.release(); }
  }
  async _getOrCreateProject(userId, name) {
    const conn = await this.pool.getConnection();
    try {
      await conn.execute('INSERT IGNORE INTO projects (user_id, name) VALUES (?, ?)', [userId, name]);
      const [rows] = await conn.execute('SELECT id FROM projects WHERE user_id = ? AND name = ? LIMIT 1', [userId, name]);
      return rows[0].id;
    } finally { conn.release(); }
  }
  _yyyyMmDd(d) { return d.toISOString().slice(0, 10); }
  _rangeToDates(range) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const start = new Date(today);
    const end = new Date(today);
    if (range === 'today') {
      end.setUTCDate(end.getUTCDate() + 1);
    } else if (range === 'yesterday') {
      start.setUTCDate(start.getUTCDate() - 1);
    } else if (range === 'last3d') {
      start.setUTCDate(start.getUTCDate() - 2);
      end.setUTCDate(end.getUTCDate() + 1);
    } else if (range === 'last7d') {
      start.setUTCDate(start.getUTCDate() - 6);
      end.setUTCDate(end.getUTCDate() + 1);
    } else {
      return null;
    }
    return { start, end };
  }
  async summarize(range, userToken, projectName) {
    const r = this._rangeToDates(range);
    if (!r) return { totalMinutes: 0, byProject: [], daily: [] };
    const userId = await this.getUserIdByToken(userToken);
    if (!userId) return { totalMinutes: 0, byProject: [], daily: [] };
    const conn = await this.pool.getConnection();
    try {
      const startDate = this._yyyyMmDd(r.start);
      const endExclusive = new Date(r.end.getTime() - 1);
      const endDate = this._yyyyMmDd(endExclusive);
      const params = [userId, startDate, endDate];
      let byProjSql = `SELECT p.name as project, SUM(d.minutes) as minutes
                       FROM usage_daily d
                       JOIN projects p ON p.id = d.project_id
                       WHERE d.user_id = ? AND d.date BETWEEN ? AND ?`;
      if (projectName) { byProjSql += ' AND p.name = ?'; params.push(projectName); }
      byProjSql += ' GROUP BY p.name ORDER BY minutes DESC';
      const [byProjectRows] = await conn.execute(byProjSql, params);
      const [dailyRows] = await conn.execute(
        `SELECT d.date as date, SUM(d.minutes) as minutes
         FROM usage_daily d
         WHERE d.user_id = ? AND d.date BETWEEN ? AND ?
         GROUP BY d.date
         ORDER BY d.date ASC`,
        [userId, startDate, endDate]
      );
      const totalMinutes = dailyRows.reduce((acc, r) => acc + Number(r.minutes || 0), 0);
      return {
        totalMinutes,
        byProject: byProjectRows.map((r) => ({ project: r.project, minutes: Number(r.minutes || 0) })),
        daily: dailyRows.map((r) => ({ date: this._yyyyMmDd(r.date), minutes: Number(r.minutes || 0) }))
      };
    } finally { conn.release(); }
  }
  async dailyRange(fromISO, toISO, userToken, projectName) {
    const userId = await this.getUserIdByToken(userToken);
    if (!userId) return { range: { from: fromISO, to: toISO }, series: [] };
    const conn = await this.pool.getConnection();
    try {
      const params = [userId, fromISO, toISO];
      let sql = `SELECT d.date as date, SUM(d.minutes) as minutes
                 FROM usage_daily d
                 JOIN projects p ON p.id = d.project_id
                 WHERE d.user_id = ? AND d.date BETWEEN ? AND ?`;
      if (projectName) { sql += ' AND p.name = ?'; params.push(projectName); }
      sql += ' GROUP BY d.date ORDER BY d.date ASC';
      const [rows] = await conn.execute(sql, params);
      const start = new Date(`${fromISO}T00:00:00.000Z`);
      const end = new Date(`${toISO}T00:00:00.000Z`);
      const map = new Map(rows.map(r => [this._yyyyMmDd(r.date), Number(r.minutes || 0)]));
      const series = [];
      for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) {
        const k = this._yyyyMmDd(d);
        series.push({ date: k, minutes: map.get(k) || 0 });
      }
      return { range: { from: fromISO, to: toISO }, series };
    } finally { conn.release(); }
  }
}

function cryptoRandom(bytes) {
  return require('crypto').randomBytes(bytes).toString('hex');
}

function createStore() {
  const pool = buildPoolFromEnv();
  if (pool) { return new MySQLStore(pool); }
  const policy = (process.env.CODETIME_CONCURRENCY_POLICY || 'exclusive').toLowerCase();
  return new InMemoryStore(policy);
}

module.exports = { createStore, InMemoryStore, MySQLStore, minuteBucket };
