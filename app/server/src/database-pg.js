import pg from 'pg';
const { Pool } = pg;

let pool = null;

// PostgreSQL接続初期化
export async function initDatabase() {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  // テーブル作成
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_members (
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (project_id, user_id),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kpi_master (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      default_target REAL,
      benchmark_min REAL,
      benchmark_max REAL,
      parent_kpi_id TEXT,
      level INTEGER DEFAULT 1,
      description TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kpi_targets (
      id SERIAL PRIMARY KEY,
      project_id TEXT NOT NULL,
      kpi_id TEXT NOT NULL,
      target_value REAL NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      UNIQUE (project_id, kpi_id, year, month)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kpi_actuals (
      id SERIAL PRIMARY KEY,
      project_id TEXT NOT NULL,
      kpi_id TEXT NOT NULL,
      actual_value REAL NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      updated_by TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (updated_by) REFERENCES users(id),
      UNIQUE (project_id, kpi_id, year, month)
    )
  `);

  console.log('[OK] PostgreSQL Database initialized');
  return pool;
}

// クエリ実行ヘルパー（SQLiteと同じインターフェース）
export async function run(sql, params = []) {
  // SQLite形式の?パラメータをPostgreSQL形式の$1,$2,...に変換
  let paramIndex = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);
  await pool.query(pgSql, params);
}

export async function get(sql, params = []) {
  let paramIndex = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);
  const result = await pool.query(pgSql, params);
  return result.rows[0] || null;
}

export async function all(sql, params = []) {
  let paramIndex = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);
  const result = await pool.query(pgSql, params);
  return result.rows;
}

export function saveDatabase() {
  // PostgreSQLでは自動保存されるため何もしない
}

export function getDb() {
  return pool;
}

export default { initDatabase, saveDatabase, getDb, run, get, all };
