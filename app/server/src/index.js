import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';

// 環境変数でDB切り替え（PostgreSQL or SQLite）
const usePostgres = !!process.env.DATABASE_URL;
let dbModule;
if (usePostgres) {
  dbModule = await import('./database-pg.js');
  console.log('[DB] Using PostgreSQL');
} else {
  dbModule = await import('./database.js');
  console.log('[DB] Using SQLite');
}
const { initDatabase, run, get, all, saveDatabase } = dbModule;

import { initializeKpiMaster, addKpi, updateKpi, deleteKpi } from './kpi-master.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'd2c-kpi-secret-key-2024';

// CORS設定（本番環境対応）
const corsOptions = {
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// 本番環境ではフロントエンドの静的ファイルを配信
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
}

// 認証ミドルウェア
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: '認証が必要です' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'トークンが無効です' });
  }
};

// 権限チェックミドルウェア
const checkRole = (requiredRoles) => async (req, res, next) => {
  const { projectId } = req.params;
  const userId = req.user.id;

  const member = await get(
    `SELECT role FROM project_members WHERE project_id = ? AND user_id = ?`,
    [projectId, userId]
  );

  if (!member || !requiredRoles.includes(member.role)) {
    return res.status(403).json({ error: '権限がありません' });
  }

  req.userRole = member.role;
  next();
};

// ========== 認証API ==========

// ユーザー登録
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    const existing = await get('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(400).json({ error: 'このメールアドレスは既に登録されています' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    await run(
      `INSERT INTO users (id, email, password, name) VALUES (?, ?, ?, ?)`,
      [userId, email, hashedPassword, name]
    );

    const token = jwt.sign({ id: userId, email, name }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user: { id: userId, email, name } });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'ユーザー登録に失敗しました' });
  }
});

// ログイン
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'ログインに失敗しました' });
  }
});

// 現在のユーザー情報取得
app.get('/api/auth/me', authenticate, async (req, res) => {
  const user = await get('SELECT id, email, name FROM users WHERE id = ?', [req.user.id]);
  res.json(user);
});

// ========== プロジェクトAPI ==========

// プロジェクト一覧取得
app.get('/api/projects', authenticate, async (req, res) => {
  const projects = await all(`
    SELECT p.*, pm.role, u.name as owner_name
    FROM projects p
    JOIN project_members pm ON p.id = pm.project_id
    JOIN users u ON p.owner_id = u.id
    WHERE pm.user_id = ?
  `, [req.user.id]);

  res.json(projects);
});

// プロジェクト作成
app.post('/api/projects', authenticate, async (req, res) => {
  try {
    const { name } = req.body;
    const projectId = uuidv4();

    await run(
      `INSERT INTO projects (id, name, owner_id) VALUES (?, ?, ?)`,
      [projectId, name, req.user.id]
    );

    // オーナーを管理者として追加
    await run(
      `INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, 'admin')`,
      [projectId, req.user.id]
    );

    res.json({ id: projectId, name, owner_id: req.user.id });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'プロジェクト作成に失敗しました' });
  }
});

// プロジェクト詳細取得
app.get('/api/projects/:projectId', authenticate, checkRole(['admin', 'editor', 'viewer']), async (req, res) => {
  const project = await get(`
    SELECT p.*, u.name as owner_name
    FROM projects p
    JOIN users u ON p.owner_id = u.id
    WHERE p.id = ?
  `, [req.params.projectId]);

  if (!project) {
    return res.status(404).json({ error: 'プロジェクトが見つかりません' });
  }

  res.json({ ...project, userRole: req.userRole });
});

// ========== メンバー管理API ==========

// メンバー一覧取得
app.get('/api/projects/:projectId/members', authenticate, checkRole(['admin', 'editor', 'viewer']), async (req, res) => {
  const members = await all(`
    SELECT u.id, u.email, u.name, pm.role, pm.created_at
    FROM project_members pm
    JOIN users u ON pm.user_id = u.id
    WHERE pm.project_id = ?
  `, [req.params.projectId]);

  res.json(members);
});

// メンバー追加
app.post('/api/projects/:projectId/members', authenticate, checkRole(['admin']), async (req, res) => {
  try {
    const { email, role } = req.body;
    const { projectId } = req.params;

    const user = await get('SELECT id FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(404).json({ error: 'ユーザーが見つかりません。先にユーザー登録が必要です。' });
    }

    const existing = await get(
      `SELECT * FROM project_members WHERE project_id = ? AND user_id = ?`,
      [projectId, user.id]
    );

    if (existing) {
      return res.status(400).json({ error: 'このユーザーは既にメンバーです' });
    }

    await run(
      `INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)`,
      [projectId, user.id, role]
    );

    res.json({ message: 'メンバーを追加しました' });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ error: 'メンバー追加に失敗しました' });
  }
});

// メンバー権限変更
app.put('/api/projects/:projectId/members/:userId', authenticate, checkRole(['admin']), async (req, res) => {
  try {
    const { role } = req.body;
    const { projectId, userId } = req.params;

    await run(
      `UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?`,
      [role, projectId, userId]
    );

    res.json({ message: '権限を変更しました' });
  } catch (error) {
    res.status(500).json({ error: '権限変更に失敗しました' });
  }
});

// メンバー削除
app.delete('/api/projects/:projectId/members/:userId', authenticate, checkRole(['admin']), async (req, res) => {
  try {
    const { projectId, userId } = req.params;

    // オーナーは削除不可
    const project = await get('SELECT owner_id FROM projects WHERE id = ?', [projectId]);
    if (project.owner_id === userId) {
      return res.status(400).json({ error: 'オーナーは削除できません' });
    }

    await run(
      `DELETE FROM project_members WHERE project_id = ? AND user_id = ?`,
      [projectId, userId]
    );

    res.json({ message: 'メンバーを削除しました' });
  } catch (error) {
    res.status(500).json({ error: 'メンバー削除に失敗しました' });
  }
});

// ========== KPI API ==========

// KPIマスター一覧取得
app.get('/api/kpi-master', async (req, res) => {
  const kpis = await all('SELECT * FROM kpi_master ORDER BY level, agent, category, id');
  res.json(kpis);
});

// KPI追加
app.post('/api/kpi-master', authenticate, async (req, res) => {
  try {
    const kpi = await addKpi(req.body);
    res.json(kpi);
  } catch (error) {
    console.error('Add KPI error:', error);
    res.status(400).json({ error: error.message || 'KPI追加に失敗しました' });
  }
});

// KPI更新
app.put('/api/kpi-master/:kpiId', authenticate, async (req, res) => {
  try {
    const kpi = await updateKpi(req.params.kpiId, req.body);
    res.json(kpi);
  } catch (error) {
    console.error('Update KPI error:', error);
    res.status(400).json({ error: error.message || 'KPI更新に失敗しました' });
  }
});

// KPI削除
app.delete('/api/kpi-master/:kpiId', authenticate, async (req, res) => {
  try {
    await deleteKpi(req.params.kpiId);
    res.json({ message: 'KPIを削除しました' });
  } catch (error) {
    console.error('Delete KPI error:', error);
    res.status(400).json({ error: error.message || 'KPI削除に失敗しました' });
  }
});

// KPI目標値取得
app.get('/api/projects/:projectId/targets', authenticate, checkRole(['admin', 'editor', 'viewer']), async (req, res) => {
  const { year } = req.query;
  const targets = await all(
    `SELECT * FROM kpi_targets WHERE project_id = ? AND year = ?`,
    [req.params.projectId, year || new Date().getFullYear()]
  );

  res.json(targets);
});

// KPI目標値設定
app.post('/api/projects/:projectId/targets', authenticate, checkRole(['admin']), async (req, res) => {
  try {
    const { targets } = req.body;
    const { projectId } = req.params;

    for (const item of targets) {
      await run(
        `INSERT INTO kpi_targets (project_id, kpi_id, target_value, year, month)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (project_id, kpi_id, year, month) DO UPDATE SET target_value = EXCLUDED.target_value`,
        [projectId, item.kpi_id, item.target_value, item.year, item.month || null]
      );
    }

    res.json({ message: '目標値を保存しました' });
  } catch (error) {
    console.error('Save targets error:', error);
    res.status(500).json({ error: '目標値の保存に失敗しました' });
  }
});

// KPI実績値取得
app.get('/api/projects/:projectId/actuals', authenticate, checkRole(['admin', 'editor', 'viewer']), async (req, res) => {
  const { year, month } = req.query;
  let query = `SELECT * FROM kpi_actuals WHERE project_id = ?`;
  const params = [req.params.projectId];

  if (year) {
    query += ' AND year = ?';
    params.push(year);
  }
  if (month) {
    query += ' AND month = ?';
    params.push(month);
  }

  const actuals = await all(query, params);
  res.json(actuals);
});

// KPI実績値入力
app.post('/api/projects/:projectId/actuals', authenticate, checkRole(['admin', 'editor']), async (req, res) => {
  try {
    const { actuals } = req.body;
    const { projectId } = req.params;

    for (const item of actuals) {
      await run(
        `INSERT INTO kpi_actuals (project_id, kpi_id, actual_value, year, month, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (project_id, kpi_id, year, month) DO UPDATE SET actual_value = EXCLUDED.actual_value, updated_by = EXCLUDED.updated_by`,
        [projectId, item.kpi_id, item.actual_value, item.year, item.month, req.user.id]
      );
    }

    res.json({ message: '実績値を保存しました' });
  } catch (error) {
    console.error('Save actuals error:', error);
    res.status(500).json({ error: '実績値の保存に失敗しました' });
  }
});

// ========== ダッシュボードAPI ==========

// サマリー取得
app.get('/api/projects/:projectId/summary', authenticate, checkRole(['admin', 'editor', 'viewer']), async (req, res) => {
  const { year, month } = req.query;
  const { projectId } = req.params;
  const currentYear = year || new Date().getFullYear();
  const currentMonth = month || new Date().getMonth() + 1;

  // KGI達成状況
  const kgis = await all(`
    SELECT
      km.id, km.name, km.unit, km.benchmark_min, km.benchmark_max,
      kt.target_value,
      ka.actual_value
    FROM kpi_master km
    LEFT JOIN kpi_targets kt ON km.id = kt.kpi_id AND kt.project_id = ? AND kt.year = ?
    LEFT JOIN kpi_actuals ka ON km.id = ka.kpi_id AND ka.project_id = ? AND ka.year = ? AND ka.month = ?
    WHERE km.level = 1
  `, [projectId, currentYear, projectId, currentYear, currentMonth]);

  // エージェント別スコア
  const agentScores = await all(`
    SELECT
      km.agent,
      COUNT(*) as total,
      SUM(CASE WHEN ka.actual_value >= kt.target_value THEN 1 ELSE 0 END) as achieved
    FROM kpi_master km
    LEFT JOIN kpi_targets kt ON km.id = kt.kpi_id AND kt.project_id = ? AND kt.year = ?
    LEFT JOIN kpi_actuals ka ON km.id = ka.kpi_id AND ka.project_id = ? AND ka.year = ? AND ka.month = ?
    WHERE kt.target_value IS NOT NULL
    GROUP BY km.agent
  `, [projectId, currentYear, projectId, currentYear, currentMonth]);

  // アラート（達成率70%未満）
  const alerts = await all(`
    SELECT
      km.id, km.name, km.agent, km.unit,
      kt.target_value,
      ka.actual_value,
      ROUND(CAST(ka.actual_value AS REAL) / kt.target_value * 100, 1) as achievement_rate
    FROM kpi_master km
    JOIN kpi_targets kt ON km.id = kt.kpi_id AND kt.project_id = ? AND kt.year = ?
    JOIN kpi_actuals ka ON km.id = ka.kpi_id AND ka.project_id = ? AND ka.year = ? AND ka.month = ?
    WHERE CAST(ka.actual_value AS REAL) / kt.target_value < 0.7
    ORDER BY CAST(ka.actual_value AS REAL) / kt.target_value ASC
    LIMIT 10
  `, [projectId, currentYear, projectId, currentYear, currentMonth]);

  res.json({ kgis, agentScores, alerts });
});

// データエクスポート
app.get('/api/projects/:projectId/export', authenticate, checkRole(['admin', 'editor', 'viewer']), async (req, res) => {
  const { projectId } = req.params;

  const project = await get('SELECT * FROM projects WHERE id = ?', [projectId]);
  const members = await all(`
    SELECT u.id, u.email, u.name, pm.role
    FROM project_members pm
    JOIN users u ON pm.user_id = u.id
    WHERE pm.project_id = ?
  `, [projectId]);
  const targets = await all('SELECT * FROM kpi_targets WHERE project_id = ?', [projectId]);
  const actuals = await all('SELECT * FROM kpi_actuals WHERE project_id = ?', [projectId]);

  res.json({
    exportedAt: new Date().toISOString(),
    project,
    members,
    targets,
    actuals
  });
});

// データインポート
app.post('/api/projects/:projectId/import', authenticate, checkRole(['admin']), async (req, res) => {
  try {
    const { projectId } = req.params;
    const { targets, actuals } = req.body;

    if (targets && targets.length > 0) {
      for (const t of targets) {
        await run(
          `INSERT INTO kpi_targets (project_id, kpi_id, target_value, year, month)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (project_id, kpi_id, year, month) DO UPDATE SET target_value = EXCLUDED.target_value`,
          [projectId, t.kpi_id, t.target_value, t.year, t.month || null]
        );
      }
    }

    if (actuals && actuals.length > 0) {
      for (const a of actuals) {
        await run(
          `INSERT INTO kpi_actuals (project_id, kpi_id, actual_value, year, month, updated_by)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (project_id, kpi_id, year, month) DO UPDATE SET actual_value = EXCLUDED.actual_value, updated_by = EXCLUDED.updated_by`,
          [projectId, a.kpi_id, a.actual_value, a.year, a.month, req.user.id]
        );
      }
    }

    res.json({ message: 'インポートが完了しました' });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: 'インポートに失敗しました' });
  }
});

// 本番環境でのSPAルーティング対応
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    // API以外のリクエストはindex.htmlを返す
    if (!req.path.startsWith('/api')) {
      const clientDist = path.join(__dirname, '../../client/dist');
      res.sendFile(path.join(clientDist, 'index.html'));
    }
  });
}

// サーバー起動
async function start() {
  try {
    await initDatabase();
    console.log('[OK] Database initialized');

    await initializeKpiMaster();
    console.log('[OK] KPI Master data initialized');

    app.listen(PORT, () => {
      console.log(`[Server] D2C KPI Dashboard running on http://localhost:${PORT}`);
      if (process.env.NODE_ENV === 'production') {
        console.log('[Server] Running in production mode');
      }
    });
  } catch (error) {
    console.error('Server start error:', error);
    process.exit(1);
  }
}

start();
