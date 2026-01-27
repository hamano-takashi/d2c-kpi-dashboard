import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  user_count: number;
  project_count: number;
  created_at: string;
}

interface IndependentUser {
  id: string;
  email: string;
  name: string;
  role: string;
  project_count: number;
  created_at: string;
}

interface Stats {
  totalTenants: number;
  totalUsers: number;
  tenantUsers: number;
  independentUsers: number;
  totalProjects: number;
  recentTenants: Tenant[];
}

type TabType = 'tenants' | 'users';

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [independentUsers, setIndependentUsers] = useState<IndependentUser[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('tenants');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<IndependentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [newTenant, setNewTenant] = useState({
    name: '',
    slug: '',
    adminEmail: '',
    adminName: '',
    adminPassword: '',
  });
  const [assignData, setAssignData] = useState({
    tenantId: '',
    role: 'member',
  });
  const [newRole, setNewRole] = useState('member');
  const [error, setError] = useState('');

  const token = localStorage.getItem('superAdminToken');

  useEffect(() => {
    if (!token) {
      navigate('/super-admin/login');
      return;
    }
    fetchData();
  }, [token, navigate]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statsRes, tenantsRes, usersRes] = await Promise.all([
        fetch('/api/super-admin/stats', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/super-admin/tenants', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/super-admin/users/independent', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!statsRes.ok || !tenantsRes.ok || !usersRes.ok) {
        throw new Error('データの取得に失敗しました');
      }

      setStats(await statsRes.json());
      setTenants(await tenantsRes.json());
      setIndependentUsers(await usersRes.json());
    } catch (err) {
      console.error(err);
      if (err instanceof Error && err.message.includes('401')) {
        localStorage.removeItem('superAdminToken');
        navigate('/super-admin/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch('/api/super-admin/tenants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newTenant),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'テナント作成に失敗しました');
      }

      setShowCreateModal(false);
      setNewTenant({ name: '', slug: '', adminEmail: '', adminName: '', adminPassword: '' });
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'テナント作成に失敗しました');
    }
  };

  const handleAssignTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedUser) return;

    try {
      const res = await fetch(`/api/super-admin/users/${selectedUser.id}/assign-tenant`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(assignData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'テナント割り当てに失敗しました');
      }

      setShowAssignModal(false);
      setSelectedUser(null);
      setAssignData({ tenantId: '', role: 'member' });
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'テナント割り当てに失敗しました');
    }
  };

  const handleChangeRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedUser) return;

    try {
      const res = await fetch(`/api/super-admin/users/${selectedUser.id}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '権限変更に失敗しました');
      }

      setShowRoleModal(false);
      setSelectedUser(null);
      setNewRole('member');
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '権限変更に失敗しました');
    }
  };

  const handleDeleteUser = async (user: IndependentUser) => {
    if (!confirm(`${user.name} を削除しますか？この操作は取り消せません。`)) {
      return;
    }

    try {
      const res = await fetch(`/api/super-admin/users/${user.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'ユーザー削除に失敗しました');
      }

      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'ユーザー削除に失敗しました');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('superAdminToken');
    localStorage.removeItem('superAdmin');
    navigate('/super-admin/login');
  };

  const openAssignModal = (user: IndependentUser) => {
    setSelectedUser(user);
    setAssignData({ tenantId: '', role: 'member' });
    setError('');
    setShowAssignModal(true);
  };

  const openRoleModal = (user: IndependentUser) => {
    setSelectedUser(user);
    setNewRole(user.role);
    setError('');
    setShowRoleModal(true);
  };

  const admin = JSON.parse(localStorage.getItem('superAdmin') || '{}');

  if (loading) {
    return (
      <div className="loading" style={{ minHeight: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="app-container" style={{ background: 'var(--gray-50)' }}>
      {/* Header */}
      <header className="header" style={{ margin: 0, padding: '1rem 2rem', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '36px',
            height: '36px',
            background: 'var(--primary)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '1.25rem'
          }}>
            D
          </div>
          <div>
            <h1 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '2px' }}>D2C KPI Platform</h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>管理者: {admin.name}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="btn btn-secondary">
          ログアウト
        </button>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        {/* Stats */}
        {stats && (
          <div className="grid grid-4" style={{ marginBottom: '2rem', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            <div className="kpi-card">
              <div className="kpi-card-header">
                <span className="kpi-card-label">テナント数</span>
              </div>
              <div className="kpi-card-value">{stats.totalTenants}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-card-header">
                <span className="kpi-card-label">テナントユーザー</span>
              </div>
              <div className="kpi-card-value">{stats.tenantUsers}</div>
            </div>
            <div className="kpi-card" style={{ background: activeTab === 'users' ? 'var(--primary-light)' : undefined }}>
              <div className="kpi-card-header">
                <span className="kpi-card-label">独立ユーザー</span>
              </div>
              <div className="kpi-card-value">{stats.independentUsers}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-card-header">
                <span className="kpi-card-label">総プロジェクト数</span>
              </div>
              <div className="kpi-card-value">{stats.totalProjects}</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button
            onClick={() => setActiveTab('tenants')}
            className={`btn ${activeTab === 'tenants' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 'none' }}
          >
            クライアント一覧
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`btn ${activeTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 'none' }}
          >
            独立ユーザー ({stats?.independentUsers || 0})
          </button>
        </div>

        {/* Tenants Tab */}
        {activeTab === 'tenants' && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">クライアント一覧</h2>
              <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
                + 新規クライアント追加
              </button>
            </div>

            <table className="table">
              <thead>
                <tr>
                  <th>クライアント名</th>
                  <th>スラグ</th>
                  <th>ユーザー</th>
                  <th>プロジェクト</th>
                  <th>ステータス</th>
                  <th>作成日</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((tenant) => (
                  <tr key={tenant.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          background: 'var(--primary)',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontWeight: 600,
                          fontSize: '0.875rem'
                        }}>
                          {tenant.name.charAt(0)}
                        </div>
                        <span style={{ fontWeight: 500 }}>{tenant.name}</span>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--gray-500)' }}>/{tenant.slug}</td>
                    <td>{tenant.user_count}</td>
                    <td>{tenant.project_count}</td>
                    <td>
                      <span className={`badge ${
                        tenant.status === 'active' ? 'badge-success' :
                        tenant.status === 'suspended' ? 'badge-warning' : 'badge-danger'
                      }`}>
                        {tenant.status === 'active' ? '有効' : tenant.status === 'suspended' ? '停止中' : '削除済み'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--gray-500)' }}>
                      {new Date(tenant.created_at).toLocaleDateString('ja-JP')}
                    </td>
                    <td>
                      <button
                        onClick={() => navigate(`/super-admin/tenants/${tenant.id}`)}
                        className="btn btn-sm btn-secondary"
                      >
                        詳細
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {tenants.length === 0 && (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-500)' }}>
                <p>クライアントがありません</p>
                <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>「新規クライアント追加」からクライアントを作成してください</p>
              </div>
            )}
          </div>
        )}

        {/* Independent Users Tab */}
        {activeTab === 'users' && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">独立ユーザー（テナント未所属）</h2>
            </div>

            <table className="table">
              <thead>
                <tr>
                  <th>名前</th>
                  <th>メールアドレス</th>
                  <th>権限</th>
                  <th>プロジェクト</th>
                  <th>登録日</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {independentUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          background: 'var(--gray-400)',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontWeight: 600,
                          fontSize: '0.875rem'
                        }}>
                          {user.name.charAt(0)}
                        </div>
                        <span style={{ fontWeight: 500 }}>{user.name}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--gray-600)' }}>{user.email}</td>
                    <td>
                      <span className={`badge ${user.role === 'tenant_admin' ? 'badge-primary' : 'badge-secondary'}`}>
                        {user.role === 'tenant_admin' ? '管理者' : 'メンバー'}
                      </span>
                    </td>
                    <td>{user.project_count}</td>
                    <td style={{ color: 'var(--gray-500)' }}>
                      {new Date(user.created_at).toLocaleDateString('ja-JP')}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => openAssignModal(user)}
                          className="btn btn-sm btn-primary"
                        >
                          テナント割当
                        </button>
                        <button
                          onClick={() => openRoleModal(user)}
                          className="btn btn-sm btn-secondary"
                        >
                          権限
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user)}
                          className="btn btn-sm btn-danger"
                          style={{ background: 'var(--red-500)', color: 'white' }}
                        >
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {independentUsers.length === 0 && (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-500)' }}>
                <p>独立ユーザーはいません</p>
                <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>通常画面から登録したユーザーがここに表示されます</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Create Tenant Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">新規クライアント作成</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>&times;</button>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}

            <form onSubmit={handleCreateTenant}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">クライアント名</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newTenant.name}
                    onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
                    placeholder="株式会社ABC"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">スラグ（URL識別子）</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newTenant.slug}
                    onChange={(e) => setNewTenant({ ...newTenant, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                    placeholder="abc-company"
                    style={{ fontFamily: 'monospace' }}
                    required
                  />
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--gray-200)', marginTop: '1rem', paddingTop: '1rem' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--gray-600)', marginBottom: '1rem' }}>管理者アカウント情報</p>

                <div className="form-group">
                  <label className="form-label">管理者名</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newTenant.adminName}
                    onChange={(e) => setNewTenant({ ...newTenant, adminName: e.target.value })}
                    placeholder="山田 太郎"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">メールアドレス</label>
                  <input
                    type="email"
                    className="form-input"
                    value={newTenant.adminEmail}
                    onChange={(e) => setNewTenant({ ...newTenant, adminEmail: e.target.value })}
                    placeholder="admin@abc-company.com"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">初期パスワード</label>
                  <input
                    type="password"
                    className="form-input"
                    value={newTenant.adminPassword}
                    onChange={(e) => setNewTenant({ ...newTenant, adminPassword: e.target.value })}
                    placeholder="6文字以上"
                    minLength={6}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  キャンセル
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  作成
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Tenant Modal */}
      {showAssignModal && selectedUser && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">テナントに割り当て</h3>
              <button className="modal-close" onClick={() => setShowAssignModal(false)}>&times;</button>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}

            <p style={{ marginBottom: '1rem', color: 'var(--gray-600)' }}>
              <strong>{selectedUser.name}</strong> ({selectedUser.email}) をテナントに割り当てます。
            </p>

            <form onSubmit={handleAssignTenant}>
              <div className="form-group">
                <label className="form-label">テナント</label>
                <select
                  className="form-input"
                  value={assignData.tenantId}
                  onChange={(e) => setAssignData({ ...assignData, tenantId: e.target.value })}
                  required
                >
                  <option value="">選択してください</option>
                  {tenants.filter(t => t.status === 'active').map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">権限</label>
                <select
                  className="form-input"
                  value={assignData.role}
                  onChange={(e) => setAssignData({ ...assignData, role: e.target.value })}
                >
                  <option value="member">メンバー</option>
                  <option value="tenant_admin">管理者</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" onClick={() => setShowAssignModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  キャンセル
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  割り当て
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Role Modal */}
      {showRoleModal && selectedUser && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">権限変更</h3>
              <button className="modal-close" onClick={() => setShowRoleModal(false)}>&times;</button>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}

            <p style={{ marginBottom: '1rem', color: 'var(--gray-600)' }}>
              <strong>{selectedUser.name}</strong> の権限を変更します。
            </p>

            <form onSubmit={handleChangeRole}>
              <div className="form-group">
                <label className="form-label">新しい権限</label>
                <select
                  className="form-input"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                >
                  <option value="member">メンバー</option>
                  <option value="tenant_admin">管理者</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" onClick={() => setShowRoleModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  キャンセル
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  変更
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
