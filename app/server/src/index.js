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

import { initializeKpiMaster, initializeDefaultTemplate, addKpi, updateKpi, deleteKpi } from './kpi-master.js';
import superAdminRouter from './super-admin.js';

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

// スーパー管理者API
app.use('/api/super-admin', superAdminRouter);

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

// ユーザー登録（テナントなし - 後方互換用）
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, tenantId } = req.body;

    const existing = await get('SELECT id FROM users WHERE email = ? AND (tenant_id = ? OR tenant_id IS NULL)', [email, tenantId || null]);
    if (existing) {
      return res.status(400).json({ error: 'このメールアドレスは既に登録されています' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    await run(
      `INSERT INTO users (id, tenant_id, email, password, name, role) VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, tenantId || null, email, hashedPassword, name, tenantId ? 'member' : 'tenant_admin']
    );

    const token = jwt.sign({ id: userId, email, name, tenantId: tenantId || null }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user: { id: userId, email, name, tenantId: tenantId || null } });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'ユーザー登録に失敗しました' });
  }
});

// 招待からの登録
app.post('/api/auth/register-by-invitation', async (req, res) => {
  try {
    const { token: inviteToken, password, name } = req.body;

    // 招待トークンの検証
    const invitation = await get(
      `SELECT * FROM tenant_invitations WHERE token = ? AND used_at IS NULL AND expires_at > datetime('now')`,
      [inviteToken]
    );

    if (!invitation) {
      return res.status(400).json({ error: '招待が無効または期限切れです' });
    }

    // 既存ユーザーチェック
    const existing = await get('SELECT id FROM users WHERE email = ? AND tenant_id = ?', [invitation.email, invitation.tenant_id]);
    if (existing) {
      return res.status(400).json({ error: 'このメールアドレスは既にこのテナントに登録されています' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    // ユーザー作成
    await run(
      `INSERT INTO users (id, tenant_id, email, password, name, role) VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, invitation.tenant_id, invitation.email, hashedPassword, name, invitation.role === 'admin' ? 'tenant_admin' : 'member']
    );

    // 招待を使用済みに
    await run(`UPDATE tenant_invitations SET used_at = datetime('now') WHERE id = ?`, [invitation.id]);

    const tenant = await get('SELECT name FROM tenants WHERE id = ?', [invitation.tenant_id]);

    const jwtToken = jwt.sign(
      { id: userId, email: invitation.email, name, tenantId: invitation.tenant_id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token: jwtToken,
      user: { id: userId, email: invitation.email, name, tenantId: invitation.tenant_id },
      tenant: { id: invitation.tenant_id, name: tenant.name }
    });
  } catch (error) {
    console.error('Invitation registration error:', error);
    res.status(500).json({ error: '登録に失敗しました' });
  }
});

// 招待情報取得（トークンから）
app.get('/api/auth/invitation/:token', async (req, res) => {
  const invitation = await get(
    `SELECT i.*, t.name as tenant_name
     FROM tenant_invitations i
     JOIN tenants t ON i.tenant_id = t.id
     WHERE i.token = ? AND i.used_at IS NULL AND i.expires_at > datetime('now')`,
    [req.params.token]
  );

  if (!invitation) {
    return res.status(404).json({ error: '招待が見つからないか、期限切れです' });
  }

  res.json({
    email: invitation.email,
    role: invitation.role,
    tenantName: invitation.tenant_name,
    expiresAt: invitation.expires_at
  });
});

// ログイン
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, tenantSlug } = req.body;

    let user;
    if (tenantSlug) {
      // テナント指定でログイン
      const tenant = await get('SELECT id FROM tenants WHERE slug = ? AND status = "active"', [tenantSlug]);
      if (!tenant) {
        return res.status(404).json({ error: 'テナントが見つかりません' });
      }
      user = await get('SELECT * FROM users WHERE email = ? AND tenant_id = ?', [email, tenant.id]);
    } else {
      // テナントなしでログイン（後方互換）
      user = await get('SELECT * FROM users WHERE email = ? AND tenant_id IS NULL', [email]);
      if (!user) {
        // テナントありのユーザーを検索
        user = await get('SELECT * FROM users WHERE email = ?', [email]);
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, tenantId: user.tenant_id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // テナント情報も取得
    let tenant = null;
    if (user.tenant_id) {
      tenant = await get('SELECT id, name, slug FROM tenants WHERE id = ?', [user.tenant_id]);
    }

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, tenantId: user.tenant_id, role: user.role },
      tenant
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'ログインに失敗しました' });
  }
});

// 現在のユーザー情報取得
app.get('/api/auth/me', authenticate, async (req, res) => {
  const user = await get('SELECT id, email, name, tenant_id, role FROM users WHERE id = ?', [req.user.id]);

  let tenant = null;
  if (user.tenant_id) {
    tenant = await get('SELECT id, name, slug FROM tenants WHERE id = ?', [user.tenant_id]);
  }

  res.json({ ...user, tenant });
});

// アカウント削除（自分自身のアカウントを削除）
app.delete('/api/auth/account', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { password } = req.body;

    // パスワード確認
    const user = await get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'ユーザーが見つかりません' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'パスワードが正しくありません' });
    }

    // オーナーになっているプロジェクトがあるか確認
    const ownedProjects = await all('SELECT id, name FROM projects WHERE owner_id = ?', [userId]);
    if (ownedProjects.length > 0) {
      return res.status(400).json({
        error: 'オーナーになっているプロジェクトがあるため削除できません。先にプロジェクトを削除するか、オーナーを変更してください。',
        projects: ownedProjects
      });
    }

    // プロジェクトメンバーシップを削除
    await run('DELETE FROM project_members WHERE user_id = ?', [userId]);

    // ユーザーを削除
    await run('DELETE FROM users WHERE id = ?', [userId]);

    saveDatabase();

    res.json({ message: 'アカウントを削除しました' });
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({ error: 'アカウント削除に失敗しました' });
  }
});

// ========== プロジェクトAPI ==========

// プロジェクト一覧取得（テナント対応）
app.get('/api/projects', authenticate, async (req, res) => {
  const tenantId = req.user.tenantId;

  let query;
  let params;

  if (tenantId) {
    // テナントに所属している場合、テナント内のプロジェクトのみ取得
    query = `
      SELECT p.*, pm.role, u.name as owner_name
      FROM projects p
      JOIN project_members pm ON p.id = pm.project_id
      JOIN users u ON p.owner_id = u.id
      WHERE pm.user_id = ? AND p.tenant_id = ?
    `;
    params = [req.user.id, tenantId];
  } else {
    // テナントなしの場合（後方互換）、テナントなしのプロジェクトのみ
    query = `
      SELECT p.*, pm.role, u.name as owner_name
      FROM projects p
      JOIN project_members pm ON p.id = pm.project_id
      JOIN users u ON p.owner_id = u.id
      WHERE pm.user_id = ? AND p.tenant_id IS NULL
    `;
    params = [req.user.id];
  }

  const projects = await all(query, params);
  res.json(projects);
});

// プロジェクト作成（テナント対応）
app.post('/api/projects', authenticate, async (req, res) => {
  try {
    const { name } = req.body;
    const projectId = uuidv4();
    const tenantId = req.user.tenantId || null;

    await run(
      `INSERT INTO projects (id, tenant_id, name, owner_id) VALUES (?, ?, ?, ?)`,
      [projectId, tenantId, name, req.user.id]
    );

    // オーナーを管理者として追加
    await run(
      `INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, 'admin')`,
      [projectId, req.user.id]
    );

    res.json({ id: projectId, tenant_id: tenantId, name, owner_id: req.user.id });
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

// プロジェクト削除（オーナーのみ）
app.delete('/api/projects/:projectId', authenticate, checkRole(['admin']), async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    // プロジェクトの存在とオーナー確認
    const project = await get('SELECT * FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      return res.status(404).json({ error: 'プロジェクトが見つかりません' });
    }

    // オーナーのみ削除可能
    if (project.owner_id !== userId) {
      return res.status(403).json({ error: 'プロジェクトを削除できるのはオーナーのみです' });
    }

    // 関連データを削除
    await run('DELETE FROM kpi_actuals WHERE project_id = ?', [projectId]);
    await run('DELETE FROM kpi_targets WHERE project_id = ?', [projectId]);
    await run('DELETE FROM project_members WHERE project_id = ?', [projectId]);
    await run('DELETE FROM projects WHERE id = ?', [projectId]);

    saveDatabase();

    res.json({ message: 'プロジェクトを削除しました' });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'プロジェクト削除に失敗しました' });
  }
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

// KPIマスター一覧取得（テナント対応）
app.get('/api/kpi-master', authenticate, async (req, res) => {
  const tenantId = req.user.tenantId;
  let kpis;
  if (tenantId) {
    kpis = await all('SELECT * FROM kpi_master WHERE tenant_id = ? ORDER BY level, agent, category, id', [tenantId]);
  } else {
    // テナントなし（後方互換）
    kpis = await all('SELECT * FROM kpi_master WHERE tenant_id IS NULL ORDER BY level, agent, category, id');
  }
  res.json(kpis);
});

// KPI追加（テナント対応）
app.post('/api/kpi-master', authenticate, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const kpi = await addKpi(req.body, tenantId);
    res.json(kpi);
  } catch (error) {
    console.error('Add KPI error:', error);
    res.status(400).json({ error: error.message || 'KPI追加に失敗しました' });
  }
});

// KPI更新（テナント対応 - 権限チェック）
app.put('/api/kpi-master/:kpiId', authenticate, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const existingKpi = await get('SELECT * FROM kpi_master WHERE id = ?', [req.params.kpiId]);
    if (!existingKpi) {
      return res.status(404).json({ error: 'KPIが見つかりません' });
    }
    if (tenantId && existingKpi.tenant_id !== tenantId) {
      return res.status(403).json({ error: '権限がありません' });
    }
    const kpi = await updateKpi(req.params.kpiId, req.body);
    res.json(kpi);
  } catch (error) {
    console.error('Update KPI error:', error);
    res.status(400).json({ error: error.message || 'KPI更新に失敗しました' });
  }
});

// KPI削除（テナント対応 - 権限チェック）
app.delete('/api/kpi-master/:kpiId', authenticate, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const existingKpi = await get('SELECT * FROM kpi_master WHERE id = ?', [req.params.kpiId]);
    if (!existingKpi) {
      return res.status(404).json({ error: 'KPIが見つかりません' });
    }
    if (tenantId && existingKpi.tenant_id !== tenantId) {
      return res.status(403).json({ error: '権限がありません' });
    }
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

    // デフォルトKPIテンプレートを初期化
    await initializeDefaultTemplate();
    console.log('[OK] Default KPI template initialized');

    // 後方互換用：テナントなしのグローバルKPIを初期化
    await initializeKpiMaster();
    console.log('[OK] KPI Master data initialized');

    app.listen(PORT, () => {
      console.log(`[Server] D2C KPI Dashboard running on http://localhost:${PORT}`);
      console.log(`[Server] Super Admin API: http://localhost:${PORT}/api/super-admin`);
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
