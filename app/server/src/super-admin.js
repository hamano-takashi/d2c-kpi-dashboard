// スーパー管理者（プラットフォーム管理者）API
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

const router = Router();

// 環境変数でDB切り替え
const usePostgres = !!process.env.DATABASE_URL;
let dbModule;
if (usePostgres) {
  dbModule = await import('./database-pg.js');
} else {
  dbModule = await import('./database.js');
}
const { run, get, all, saveDatabase } = dbModule;

const JWT_SECRET = process.env.JWT_SECRET || 'd2c-kpi-secret-key-2024';
const SUPER_ADMIN_SECRET = process.env.SUPER_ADMIN_SECRET || 'super-admin-secret-2024';

// スーパー管理者認証ミドルウェア
const authenticateSuperAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: '認証が必要です' });
  }
  try {
    const decoded = jwt.verify(token, SUPER_ADMIN_SECRET);
    if (!decoded.isSuperAdmin) {
      return res.status(403).json({ error: 'スーパー管理者権限が必要です' });
    }
    req.superAdmin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'トークンが無効です' });
  }
};

// ========== スーパー管理者認証 ==========

// スーパー管理者登録（初回のみ/セキュアなエンドポイント）
router.post('/setup', async (req, res) => {
  try {
    const { email, password, name, setupKey } = req.body;

    // セットアップキーの検証（環境変数で設定）
    const validSetupKey = process.env.SUPER_ADMIN_SETUP_KEY || 'initial-setup-key-change-me';
    if (setupKey !== validSetupKey) {
      return res.status(403).json({ error: 'セットアップキーが無効です' });
    }

    // 既存のスーパー管理者がいるか確認
    const existingAdmin = await get('SELECT id FROM super_admins LIMIT 1');
    if (existingAdmin) {
      return res.status(400).json({ error: 'スーパー管理者は既に登録されています' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const adminId = uuidv4();

    await run(
      `INSERT INTO super_admins (id, email, password, name) VALUES (?, ?, ?, ?)`,
      [adminId, email, hashedPassword, name]
    );

    const token = jwt.sign(
      { id: adminId, email, name, isSuperAdmin: true },
      SUPER_ADMIN_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, admin: { id: adminId, email, name } });
  } catch (error) {
    console.error('Super admin setup error:', error);
    res.status(500).json({ error: 'スーパー管理者登録に失敗しました' });
  }
});

// スーパー管理者ログイン
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await get('SELECT * FROM super_admins WHERE email = ?', [email]);
    if (!admin) {
      return res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません' });
    }

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) {
      return res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません' });
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email, name: admin.name, isSuperAdmin: true },
      SUPER_ADMIN_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, admin: { id: admin.id, email: admin.email, name: admin.name } });
  } catch (error) {
    console.error('Super admin login error:', error);
    res.status(500).json({ error: 'ログインに失敗しました' });
  }
});

// 現在のスーパー管理者情報取得
router.get('/me', authenticateSuperAdmin, async (req, res) => {
  const admin = await get('SELECT id, email, name FROM super_admins WHERE id = ?', [req.superAdmin.id]);
  res.json(admin);
});

// ========== テナント管理 ==========

// テナント一覧取得
router.get('/tenants', authenticateSuperAdmin, async (req, res) => {
  const tenants = await all(`
    SELECT t.*,
           (SELECT COUNT(*) FROM users WHERE tenant_id = t.id) as user_count,
           (SELECT COUNT(*) FROM projects WHERE tenant_id = t.id) as project_count
    FROM tenants t
    WHERE t.status != 'deleted'
    ORDER BY t.created_at DESC
  `);
  res.json(tenants);
});

// テナント作成
router.post('/tenants', authenticateSuperAdmin, async (req, res) => {
  try {
    const { name, slug, adminEmail, adminName, adminPassword, templateId } = req.body;
    const tenantId = uuidv4();

    // スラグの重複チェック
    const existingSlug = await get('SELECT id FROM tenants WHERE slug = ?', [slug]);
    if (existingSlug) {
      return res.status(400).json({ error: 'このスラグは既に使用されています' });
    }

    // テナント作成
    await run(
      `INSERT INTO tenants (id, name, slug, created_by) VALUES (?, ?, ?, ?)`,
      [tenantId, name, slug, req.superAdmin.id]
    );

    // テナント管理者ユーザー作成
    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    await run(
      `INSERT INTO users (id, tenant_id, email, password, name, role) VALUES (?, ?, ?, ?, ?, 'tenant_admin')`,
      [userId, tenantId, adminEmail, hashedPassword, adminName]
    );

    // KPIテンプレートをコピー
    await copyKpiTemplateToTenant(tenantId, templateId);

    saveDatabase();

    const tenant = await get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
    res.json({ tenant, message: 'テナントを作成しました' });
  } catch (error) {
    console.error('Create tenant error:', error);
    res.status(500).json({ error: 'テナント作成に失敗しました' });
  }
});

// テナント詳細取得
router.get('/tenants/:tenantId', authenticateSuperAdmin, async (req, res) => {
  const tenant = await get(`
    SELECT t.*,
           (SELECT COUNT(*) FROM users WHERE tenant_id = t.id) as user_count,
           (SELECT COUNT(*) FROM projects WHERE tenant_id = t.id) as project_count
    FROM tenants t
    WHERE t.id = ?
  `, [req.params.tenantId]);

  if (!tenant) {
    return res.status(404).json({ error: 'テナントが見つかりません' });
  }

  const users = await all('SELECT id, email, name, role, created_at FROM users WHERE tenant_id = ?', [req.params.tenantId]);
  const projects = await all('SELECT id, name, created_at FROM projects WHERE tenant_id = ?', [req.params.tenantId]);

  res.json({ ...tenant, users, projects });
});

// テナント更新
router.put('/tenants/:tenantId', authenticateSuperAdmin, async (req, res) => {
  try {
    const { name, status } = req.body;
    const { tenantId } = req.params;

    await run(
      `UPDATE tenants SET name = ?, status = ? WHERE id = ?`,
      [name, status, tenantId]
    );

    saveDatabase();
    const tenant = await get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
    res.json(tenant);
  } catch (error) {
    res.status(500).json({ error: 'テナント更新に失敗しました' });
  }
});

// テナント削除（論理削除）
router.delete('/tenants/:tenantId', authenticateSuperAdmin, async (req, res) => {
  try {
    await run(`UPDATE tenants SET status = 'deleted' WHERE id = ?`, [req.params.tenantId]);
    saveDatabase();
    res.json({ message: 'テナントを削除しました' });
  } catch (error) {
    res.status(500).json({ error: 'テナント削除に失敗しました' });
  }
});

// ========== テナント招待 ==========

// 招待リンク生成
router.post('/tenants/:tenantId/invitations', authenticateSuperAdmin, async (req, res) => {
  try {
    const { email, role } = req.body;
    const { tenantId } = req.params;

    const invitationId = uuidv4();
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7日後

    await run(
      `INSERT INTO tenant_invitations (id, tenant_id, email, role, token, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [invitationId, tenantId, email, role || 'admin', token, expiresAt.toISOString()]
    );

    saveDatabase();

    const tenant = await get('SELECT name FROM tenants WHERE id = ?', [tenantId]);
    const inviteUrl = `${process.env.APP_URL || 'http://localhost:3000'}/invite/${token}`;

    res.json({
      invitation: { id: invitationId, email, role, token, expires_at: expiresAt },
      inviteUrl,
      message: `招待リンクを生成しました。${tenant.name}への招待メールを送信してください。`
    });
  } catch (error) {
    console.error('Create invitation error:', error);
    res.status(500).json({ error: '招待の生成に失敗しました' });
  }
});

// 招待一覧取得
router.get('/tenants/:tenantId/invitations', authenticateSuperAdmin, async (req, res) => {
  const invitations = await all(
    `SELECT * FROM tenant_invitations WHERE tenant_id = ? ORDER BY created_at DESC`,
    [req.params.tenantId]
  );
  res.json(invitations);
});

// ========== テナントユーザー管理 ==========

// ユーザー削除
router.delete('/tenants/:tenantId/users/:userId', authenticateSuperAdmin, async (req, res) => {
  try {
    const { tenantId, userId } = req.params;

    // ユーザーがテナントに所属しているか確認
    const user = await get('SELECT * FROM users WHERE id = ? AND tenant_id = ?', [userId, tenantId]);
    if (!user) {
      return res.status(404).json({ error: 'ユーザーが見つかりません' });
    }

    // プロジェクトメンバーから削除
    await run('DELETE FROM project_members WHERE user_id = ?', [userId]);

    // ユーザーが所有するプロジェクトのオーナーを変更（またはプロジェクト削除）
    const ownedProjects = await all('SELECT id FROM projects WHERE owner_id = ?', [userId]);
    for (const project of ownedProjects) {
      // 他のメンバーがいれば最初のメンバーをオーナーに
      const otherMember = await get(
        'SELECT user_id FROM project_members WHERE project_id = ? AND user_id != ? LIMIT 1',
        [project.id, userId]
      );
      if (otherMember) {
        await run('UPDATE projects SET owner_id = ? WHERE id = ?', [otherMember.user_id, project.id]);
      } else {
        // 他のメンバーがいなければプロジェクトを削除
        await run('DELETE FROM kpi_actuals WHERE project_id = ?', [project.id]);
        await run('DELETE FROM kpi_targets WHERE project_id = ?', [project.id]);
        await run('DELETE FROM project_members WHERE project_id = ?', [project.id]);
        await run('DELETE FROM projects WHERE id = ?', [project.id]);
      }
    }

    // ユーザー削除
    await run('DELETE FROM users WHERE id = ?', [userId]);

    saveDatabase();
    res.json({ message: 'ユーザーを削除しました' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'ユーザー削除に失敗しました' });
  }
});

// テナント完全削除（物理削除）
router.delete('/tenants/:tenantId/permanent', authenticateSuperAdmin, async (req, res) => {
  try {
    const { tenantId } = req.params;

    // テナントの存在確認
    const tenant = await get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
    if (!tenant) {
      return res.status(404).json({ error: 'テナントが見つかりません' });
    }

    // テナントに関連するデータを全て削除
    // 1. KPI実績データ
    await run(`
      DELETE FROM kpi_actuals WHERE project_id IN (
        SELECT id FROM projects WHERE tenant_id = ?
      )
    `, [tenantId]);

    // 2. KPI目標データ
    await run(`
      DELETE FROM kpi_targets WHERE project_id IN (
        SELECT id FROM projects WHERE tenant_id = ?
      )
    `, [tenantId]);

    // 3. プロジェクトメンバー
    await run(`
      DELETE FROM project_members WHERE project_id IN (
        SELECT id FROM projects WHERE tenant_id = ?
      )
    `, [tenantId]);

    // 4. プロジェクト
    await run('DELETE FROM projects WHERE tenant_id = ?', [tenantId]);

    // 5. KPIマスター
    await run('DELETE FROM kpi_master WHERE tenant_id = ?', [tenantId]);

    // 6. 招待
    await run('DELETE FROM tenant_invitations WHERE tenant_id = ?', [tenantId]);

    // 7. ユーザー
    await run('DELETE FROM users WHERE tenant_id = ?', [tenantId]);

    // 8. テナント本体
    await run('DELETE FROM tenants WHERE id = ?', [tenantId]);

    saveDatabase();
    res.json({ message: 'テナントを完全に削除しました' });
  } catch (error) {
    console.error('Permanent delete tenant error:', error);
    res.status(500).json({ error: 'テナント削除に失敗しました' });
  }
});

// ========== KPIテンプレート管理 ==========

// テンプレート一覧取得
router.get('/kpi-templates', authenticateSuperAdmin, async (req, res) => {
  const templates = await all(`
    SELECT t.*,
           (SELECT COUNT(*) FROM kpi_template_items WHERE template_id = t.id) as item_count
    FROM kpi_templates t
    ORDER BY t.is_default DESC, t.created_at DESC
  `);
  res.json(templates);
});

// テンプレート作成
router.post('/kpi-templates', authenticateSuperAdmin, async (req, res) => {
  try {
    const { name, description, isDefault, items } = req.body;
    const templateId = uuidv4();

    await run(
      `INSERT INTO kpi_templates (id, name, description, is_default) VALUES (?, ?, ?, ?)`,
      [templateId, name, description, isDefault ? 1 : 0]
    );

    // テンプレート項目を追加
    if (items && items.length > 0) {
      for (const item of items) {
        const itemId = `${templateId}_${item.id}`;
        await run(
          `INSERT INTO kpi_template_items (id, template_id, agent, category, name, unit, default_target, benchmark_min, benchmark_max, parent_kpi_id, level, description)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [itemId, templateId, item.agent, item.category, item.name, item.unit, item.default_target, item.benchmark_min, item.benchmark_max, item.parent_kpi_id, item.level, item.description]
        );
      }
    }

    saveDatabase();
    res.json({ id: templateId, message: 'テンプレートを作成しました' });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ error: 'テンプレート作成に失敗しました' });
  }
});

// テンプレート詳細取得
router.get('/kpi-templates/:templateId', authenticateSuperAdmin, async (req, res) => {
  const template = await get('SELECT * FROM kpi_templates WHERE id = ?', [req.params.templateId]);
  if (!template) {
    return res.status(404).json({ error: 'テンプレートが見つかりません' });
  }

  const items = await all('SELECT * FROM kpi_template_items WHERE template_id = ? ORDER BY level, agent, category', [req.params.templateId]);
  res.json({ ...template, items });
});

// ========== ダッシュボード統計 ==========

router.get('/stats', authenticateSuperAdmin, async (req, res) => {
  const totalTenants = await get('SELECT COUNT(*) as count FROM tenants WHERE status = "active"');
  const totalUsers = await get('SELECT COUNT(*) as count FROM users');
  const totalProjects = await get('SELECT COUNT(*) as count FROM projects');
  const recentTenants = await all('SELECT id, name, created_at FROM tenants WHERE status = "active" ORDER BY created_at DESC LIMIT 5');

  res.json({
    totalTenants: totalTenants?.count || 0,
    totalUsers: totalUsers?.count || 0,
    totalProjects: totalProjects?.count || 0,
    recentTenants
  });
});

// ========== ヘルパー関数 ==========

// KPIテンプレートをテナントにコピー
async function copyKpiTemplateToTenant(tenantId, templateId) {
  let items;
  let sourceTemplateId = templateId;

  if (templateId) {
    // 指定されたテンプレートからコピー
    items = await all('SELECT * FROM kpi_template_items WHERE template_id = ?', [templateId]);
  } else {
    // デフォルトテンプレートからコピー
    const defaultTemplate = await get('SELECT id FROM kpi_templates WHERE is_default = 1');
    if (defaultTemplate) {
      sourceTemplateId = defaultTemplate.id;
      items = await all('SELECT * FROM kpi_template_items WHERE template_id = ?', [defaultTemplate.id]);
    } else {
      // テンプレートがない場合は既存のkpi_masterからコピー（後方互換）
      items = await all('SELECT * FROM kpi_master WHERE tenant_id IS NULL');
      sourceTemplateId = null;
    }
  }

  // テナント用にKPIをコピー
  for (const item of items) {
    // テンプレートIDプレフィックスを除去してオリジナルIDを抽出
    // 例: "default_d2c_template_kgi_001" -> "kgi_001"
    let originalId;
    if (sourceTemplateId && item.id.startsWith(sourceTemplateId + '_')) {
      originalId = item.id.substring(sourceTemplateId.length + 1);
    } else {
      originalId = item.id;
    }

    const newId = `${tenantId}_${originalId}`;

    // 親KPIのIDも同様に変換
    let parentId = null;
    if (item.parent_kpi_id) {
      let originalParentId;
      if (sourceTemplateId && item.parent_kpi_id.startsWith(sourceTemplateId + '_')) {
        originalParentId = item.parent_kpi_id.substring(sourceTemplateId.length + 1);
      } else {
        originalParentId = item.parent_kpi_id;
      }
      parentId = `${tenantId}_${originalParentId}`;
    }

    await run(
      `INSERT INTO kpi_master (id, tenant_id, agent, category, name, unit, default_target, benchmark_min, benchmark_max, parent_kpi_id, level, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, tenantId, item.agent, item.category, item.name, item.unit, item.default_target, item.benchmark_min, item.benchmark_max, parentId, item.level, item.description]
    );
  }
}

export default router;
export { authenticateSuperAdmin };
