import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
}

interface Project {
  id: string;
  name: string;
  created_at: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  token: string;
  expires_at: string;
  used_at: string | null;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  user_count: number;
  project_count: number;
  created_at: string;
  users: User[];
  projects: Project[];
}

export default function TenantDetailPage() {
  const navigate = useNavigate();
  const { tenantId } = useParams();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'user' | 'tenant'; id: string; name: string } | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('admin');
  const [inviteLink, setInviteLink] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem('superAdminToken');

  useEffect(() => {
    if (!token) {
      navigate('/super-admin/login');
      return;
    }
    fetchTenant();
    fetchInvitations();
  }, [token, tenantId, navigate]);

  const fetchTenant = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/super-admin/tenants/${tenantId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('テナントの取得に失敗しました');
      setTenant(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchInvitations = async () => {
    try {
      const res = await fetch(`/api/super-admin/tenants/${tenantId}/invitations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('招待の取得に失敗しました');
      setInvitations(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInviteLink('');

    try {
      const res = await fetch(`/api/super-admin/tenants/${tenantId}/invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '招待の作成に失敗しました');
      }

      setInviteLink(data.inviteUrl);
      fetchInvitations();
    } catch (err) {
      setError(err instanceof Error ? err.message : '招待の作成に失敗しました');
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      await fetch(`/api/super-admin/tenants/${tenantId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: tenant?.name, status: newStatus }),
      });
      fetchTenant();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const res = await fetch(`/api/super-admin/tenants/${tenantId}/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'ユーザー削除に失敗しました');
      }

      setShowDeleteModal(false);
      setDeleteTarget(null);
      fetchTenant();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'ユーザー削除に失敗しました');
    }
  };

  const handleDeleteTenant = async () => {
    try {
      const res = await fetch(`/api/super-admin/tenants/${tenantId}/permanent`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'テナント削除に失敗しました');
      }

      navigate('/super-admin');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'テナント削除に失敗しました');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('クリップボードにコピーしました');
  };

  const openDeleteModal = (type: 'user' | 'tenant', id: string, name: string) => {
    setDeleteTarget({ type, id, name });
    setShowDeleteModal(true);
  };

  if (loading) {
    return (
      <div className="loading" style={{ minHeight: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="loading" style={{ minHeight: '100vh' }}>
        <p style={{ color: 'var(--gray-500)' }}>テナントが見つかりません</p>
      </div>
    );
  }

  return (
    <div className="app-container" style={{ background: 'var(--gray-50)' }}>
      {/* Header */}
      <header className="header" style={{ margin: 0, padding: '1rem 2rem', position: 'sticky', top: 0, zIndex: 10 }}>
        <div>
          <button
            onClick={() => navigate('/super-admin')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--gray-500)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              marginBottom: '0.5rem',
              padding: 0
            }}
          >
            ← ダッシュボードに戻る
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '40px',
              height: '40px',
              background: 'var(--primary)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 600,
              fontSize: '1.125rem'
            }}>
              {tenant.name.charAt(0)}
            </div>
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>{tenant.name}</h1>
              <p style={{ fontSize: '0.75rem', color: 'var(--gray-500)', fontFamily: 'monospace', margin: 0 }}>/{tenant.slug}</p>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {tenant.status === 'active' ? (
            <button onClick={() => handleStatusChange('suspended')} className="btn btn-secondary">
              一時停止
            </button>
          ) : (
            <button onClick={() => handleStatusChange('active')} className="btn btn-primary">
              有効化
            </button>
          )}
          <button onClick={() => openDeleteModal('tenant', tenant.id, tenant.name)} className="btn btn-danger">
            完全削除
          </button>
        </div>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        {/* Stats */}
        <div className="grid grid-4" style={{ marginBottom: '1.5rem' }}>
          <div className="kpi-card">
            <div className="kpi-card-header">
              <span className="kpi-card-label">ステータス</span>
            </div>
            <span className={`badge ${
              tenant.status === 'active' ? 'badge-success' :
              tenant.status === 'suspended' ? 'badge-warning' : 'badge-danger'
            }`}>
              {tenant.status === 'active' ? '有効' : tenant.status === 'suspended' ? '停止中' : '削除済み'}
            </span>
          </div>
          <div className="kpi-card">
            <div className="kpi-card-header">
              <span className="kpi-card-label">ユーザー数</span>
            </div>
            <div className="kpi-card-value">{tenant.users?.length || 0}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-card-header">
              <span className="kpi-card-label">プロジェクト数</span>
            </div>
            <div className="kpi-card-value">{tenant.projects?.length || 0}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-card-header">
              <span className="kpi-card-label">作成日</span>
            </div>
            <div style={{ fontSize: '1rem', color: 'var(--gray-900)' }}>
              {new Date(tenant.created_at).toLocaleDateString('ja-JP')}
            </div>
          </div>
        </div>

        {/* Users */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header">
            <h2 className="card-title">ユーザー</h2>
            <button onClick={() => setShowInviteModal(true)} className="btn btn-primary">
              + ユーザー招待
            </button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>名前</th>
                <th>メール</th>
                <th>権限</th>
                <th>登録日</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {tenant.users?.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        background: 'var(--primary-light)',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--primary)',
                        fontWeight: 500,
                        fontSize: '0.875rem'
                      }}>
                        {user.name.charAt(0)}
                      </div>
                      <span style={{ fontWeight: 500 }}>{user.name}</span>
                    </div>
                  </td>
                  <td style={{ color: 'var(--gray-500)' }}>{user.email}</td>
                  <td>
                    <span className={`badge ${user.role === 'tenant_admin' ? 'badge-success' : ''}`}>
                      {user.role === 'tenant_admin' ? '管理者' : 'メンバー'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--gray-500)' }}>
                    {new Date(user.created_at).toLocaleDateString('ja-JP')}
                  </td>
                  <td>
                    <button
                      onClick={() => openDeleteModal('user', user.id, user.name)}
                      className="btn btn-sm btn-danger"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!tenant.users || tenant.users.length === 0) && (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-500)' }}>
              <p>ユーザーがいません</p>
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>「ユーザー招待」からメンバーを追加してください</p>
            </div>
          )}
        </div>

        {/* Invitations */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header">
            <h2 className="card-title">招待履歴</h2>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>メール</th>
                <th>権限</th>
                <th>ステータス</th>
                <th>有効期限</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.email}</td>
                  <td style={{ color: 'var(--gray-500)' }}>{inv.role}</td>
                  <td>
                    {inv.used_at ? (
                      <span className="badge badge-success">使用済み</span>
                    ) : new Date(inv.expires_at) < new Date() ? (
                      <span className="badge badge-danger">期限切れ</span>
                    ) : (
                      <span className="badge badge-warning">未使用</span>
                    )}
                  </td>
                  <td style={{ color: 'var(--gray-500)' }}>
                    {new Date(inv.expires_at).toLocaleDateString('ja-JP')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {invitations.length === 0 && (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-500)' }}>
              招待履歴がありません
            </div>
          )}
        </div>

        {/* Projects */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">プロジェクト</h2>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>名前</th>
                <th>作成日</th>
              </tr>
            </thead>
            <tbody>
              {tenant.projects?.map((project) => (
                <tr key={project.id}>
                  <td style={{ fontWeight: 500 }}>{project.name}</td>
                  <td style={{ color: 'var(--gray-500)' }}>
                    {new Date(project.created_at).toLocaleDateString('ja-JP')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!tenant.projects || tenant.projects.length === 0) && (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-500)' }}>
              プロジェクトがありません
            </div>
          )}
        </div>
      </main>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">ユーザー招待</h3>
              <button className="modal-close" onClick={() => setShowInviteModal(false)}>&times;</button>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}

            {inviteLink ? (
              <div>
                <div style={{
                  background: 'var(--success-light)',
                  border: '1px solid var(--success)',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '1rem'
                }}>
                  <p style={{ color: 'var(--success)', fontWeight: 500, marginBottom: '0.25rem' }}>招待リンクが生成されました</p>
                  <p style={{ color: 'var(--success)', fontSize: '0.875rem' }}>以下のリンクを招待者に送信してください</p>
                </div>
                <div style={{
                  background: 'var(--gray-100)',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  marginBottom: '1rem'
                }}>
                  <code style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{inviteLink}</code>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <button onClick={() => copyToClipboard(inviteLink)} className="btn btn-primary">
                    コピー
                  </button>
                  <button
                    onClick={() => {
                      setShowInviteModal(false);
                      setInviteLink('');
                      setInviteEmail('');
                    }}
                    className="btn btn-secondary"
                  >
                    閉じる
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleInvite}>
                <div className="form-group">
                  <label className="form-label">メールアドレス</label>
                  <input
                    type="email"
                    className="form-input"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="user@example.com"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">権限</label>
                  <select
                    className="form-select"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                  >
                    <option value="admin">管理者</option>
                    <option value="editor">編集者</option>
                    <option value="viewer">閲覧者</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button type="button" onClick={() => setShowInviteModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                    キャンセル
                  </button>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                    招待リンク生成
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deleteTarget && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '400px' }}>
            <div style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{
                width: '48px',
                height: '48px',
                background: 'var(--danger-light)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem'
              }}>
                <span style={{ color: 'var(--danger)', fontSize: '1.5rem' }}>!</span>
              </div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                {deleteTarget.type === 'tenant' ? 'テナントを完全に削除' : 'ユーザーを削除'}
              </h3>
              <p style={{ color: 'var(--gray-500)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 500, color: 'var(--gray-700)' }}>{deleteTarget.name}</span> を削除しますか？
              </p>
              {deleteTarget.type === 'tenant' && (
                <p style={{ color: 'var(--danger)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                  この操作は取り消せません。すべてのユーザー、プロジェクト、データが削除されます。
                </p>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', padding: '1rem 1.5rem', background: 'var(--gray-50)', borderTop: '1px solid var(--gray-200)' }}>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteTarget(null);
                }}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  if (deleteTarget.type === 'tenant') {
                    handleDeleteTenant();
                  } else {
                    handleDeleteUser(deleteTarget.id);
                  }
                }}
                className="btn btn-danger"
                style={{ flex: 1 }}
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
