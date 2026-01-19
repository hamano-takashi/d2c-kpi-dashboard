// 環境変数でSQLiteとPostgreSQLを切り替え
// DATABASE_URL が設定されていればPostgreSQL、なければSQLite

const usePostgres = !!process.env.DATABASE_URL;

let dbModule;

if (usePostgres) {
  dbModule = await import('./database-pg.js');
  console.log('[DB] Using PostgreSQL');
} else {
  dbModule = await import('./database.js');
  console.log('[DB] Using SQLite');
}

export const { initDatabase, saveDatabase, getDb, run, get, all } = dbModule;
export default dbModule;
