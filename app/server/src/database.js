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
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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

  db.run(`
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

// クエリ実行ヘルパー
export function run(sql, params = []) {
  db.run(sql, params);
  saveDatabase();
}

export function get(sql, params = []) {
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

export function all(sql, params = []) {
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
