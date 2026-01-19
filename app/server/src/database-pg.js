import pg from 'pg';
const { Pool } = pg;

let pool = null;

// PostgreSQL接続初期化
export async function initDatabase() {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  // ========== マルチテナント用テーブル ==========

  // スーパー管理者（プラットフォーム管理者）
  await pool.query(`
    CREATE TABLE IF NOT EXISTS super_admins (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // テナント（クライアント組織）
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT NOT NULL,
      FOREIGN KEY (created_by) REFERENCES super_admins(id)
    )
  `);

  // テナント招待
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenant_invitations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT DEFAULT 'admin' CHECK (role IN ('admin', 'editor', 'viewer')),
      token TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    )
  `);

  // ========== 既存テーブル（テナント対応） ==========

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      email TEXT NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'member' CHECK (role IN ('tenant_admin', 'member')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      UNIQUE (tenant_id, email)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
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

  // KPIテンプレート（グローバル - 全テナント共通の雛形）
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kpi_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      is_default INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // KPIテンプレート項目
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kpi_template_items (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      agent TEXT NOT NULL,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      default_target REAL,
      benchmark_min REAL,
      benchmark_max REAL,
      parent_kpi_id TEXT,
      level INTEGER DEFAULT 1,
      description TEXT,
      FOREIGN KEY (template_id) REFERENCES kpi_templates(id)
    )
  `);

  // KPIマスター（テナント別 - 実際に使用するKPI）
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kpi_master (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      agent TEXT NOT NULL,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      default_target REAL,
      benchmark_min REAL,
      benchmark_max REAL,
      parent_kpi_id TEXT,
      level INTEGER DEFAULT 1,
      description TEXT,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
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
