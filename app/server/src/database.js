import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dataDir = join(__dirname, '..', 'data');
const dbPath = join(dataDir, 'kpi.db');

// データディレクトリ作成
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

let db = null;

// データベース初期化
export async function initDatabase() {
  const SQL = await initSqlJs();

  // 既存のDBファイルがあれば読み込み
  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // テーブル作成
  // ========== マルチテナント用テーブル ==========

  // スーパー管理者（プラットフォーム管理者）
  db.run(`
    CREATE TABLE IF NOT EXISTS super_admins (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // テナント（クライアント組織）
  db.run(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT NOT NULL,
      FOREIGN KEY (created_by) REFERENCES super_admins(id)
    )
  `);

  // テナント招待
  db.run(`
    CREATE TABLE IF NOT EXISTS tenant_invitations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT DEFAULT 'admin' CHECK (role IN ('admin', 'editor', 'viewer')),
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    )
  `);

  // ========== 既存テーブル（テナント対応） ==========

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      email TEXT NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'member' CHECK (role IN ('tenant_admin', 'member')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      UNIQUE (tenant_id, email)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (owner_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS project_members (
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (project_id, user_id),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS kpi_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      kpi_id TEXT NOT NULL,
      target_value REAL NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      UNIQUE (project_id, kpi_id, year, month)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS kpi_actuals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      kpi_id TEXT NOT NULL,
      actual_value REAL NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      updated_by TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (updated_by) REFERENCES users(id),
      UNIQUE (project_id, kpi_id, year, month)
    )
  `);

  // KPIテンプレート（グローバル - 全テナント共通の雛形）
  db.run(`
    CREATE TABLE IF NOT EXISTS kpi_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // KPIテンプレート項目
  db.run(`
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
  db.run(`
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

  saveDatabase();
  return db;
}

// データベースをファイルに保存
export function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    writeFileSync(dbPath, buffer);
  }
}

// ヘルパー関数
export function getDb() {
  return db;
}

// クエリ実行ヘルパー（async互換）
export async function run(sql, params = []) {
  // ON CONFLICT構文をSQLite互換に変換
  const sqliteSql = sql.replace(
    /ON CONFLICT \(([^)]+)\) DO UPDATE SET (.+)/gi,
    (match, columns, updates) => {
      return `ON CONFLICT(${columns}) DO UPDATE SET ${updates}`;
    }
  );
  db.run(sqliteSql, params);
  saveDatabase();
}

export async function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

export async function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

export default { initDatabase, saveDatabase, getDb, run, get, all };
