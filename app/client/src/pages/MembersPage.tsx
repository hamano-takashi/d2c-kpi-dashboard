import { useState, useEffect } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { members } from '../utils/api';
import { Member, Project, User, ROLE_LABELS, RoleType } from '../types';

interface ContextType {
  project: Project;
  user: User;
}

export default function MembersPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { project, user } = useOutletContext<ContextType>();
  const [memberList, setMemberList] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<RoleType>('viewer');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isAdmin = project.userRole === 'admin';

  useEffect(() => {
    loadMembers();
  }, [projectId]);

  const loadMembers = async () => {
    if (!projectId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await members.list(projectId);
      setMemberList(data);
    } catch (err) {
      console.error('Failed to load members:', err);
      setLoadError('メンバー一覧の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !newMemberEmail.trim()) return;

    setAdding(true);
    setError('');

    try {
      await members.add(projectId, { email: newMemberEmail, role: newMemberRole });
      await loadMembers();
      setShowModal(false);
      setNewMemberEmail('');
      setNewMemberRole('viewer');
      setSuccess('メンバーを追加しました');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'メンバー追加に失敗しました');
    } finally {
      setAdding(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: RoleType) => {
    if (!projectId) return;

    try {
      await members.update(projectId, memberId, { role: newRole });
      await loadMembers();
      setSuccess('権限を変更しました');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || '権限変更に失敗しました');
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!projectId) return;
    if (!confirm(`${memberName} さんをプロジェクトから削除しますか？`)) return;

    try {
      await members.remove(projectId, memberId);
      await loadMembers();
      setSuccess('メンバーを削除しました');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'メンバー削除に失敗しました');
      setTimeout(() => setError(''), 3000);
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <div className="header">
          <h1>メンバー管理</h1>
        </div>
        <div className="card text-center" style={{ padding: '3rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ marginBottom: '0.5rem', color: 'var(--danger)' }}>エラー</h2>
          <p className="text-gray mb-4">{loadError}</p>
          <button onClick={() => loadMembers()} className="btn btn-primary">
            再読み込み
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="header">
        <h1>メンバー管理</h1>
        {isAdmin && (
          <button onClick={() => setShowModal(true)} className="btn btn-primary">
            + メンバー追加
          </button>
        )}
      </div>

      {success && <div className="alert alert-success">{success}</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>名前</th>
              <th>メールアドレス</th>
              <th>権限</th>
              <th>参加日</th>
              {isAdmin && <th>操作</th>}
            </tr>
          </thead>
          <tbody>
            {memberList.map((member) => {
              const isOwner = member.id === project.owner_id;
              const isSelf = member.id === user.id;

              return (
                <tr key={member.id}>
                  <td>
                    <div className="flex gap-2" style={{ alignItems: 'center' }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: 'var(--primary)',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 600,
                        }}
                      >
                        {member.name.charAt(0)}
                      </div>
                      <div>
                        <div>{member.name}</div>
                        {isOwner && (
                          <span className="text-xs text-gray">オーナー</span>
                        )}
                        {isSelf && (
                          <span className="text-xs" style={{ color: 'var(--primary)' }}>
                            （あなた）
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>{member.email}</td>
                  <td>
                    {isAdmin && !isOwner && !isSelf ? (
                      <select
                        className="form-select"
                        style={{ width: 'auto' }}
                        value={member.role}
                        onChange={(e) =>
                          handleRoleChange(member.id, e.target.value as RoleType)
                        }
                      >
                        <option value="admin">管理者</option>
                        <option value="editor">編集者</option>
                        <option value="viewer">閲覧者</option>
                      </select>
                    ) : (
                      <span
                        className={`badge badge-${
                          member.role === 'admin'
                            ? 'success'
                            : member.role === 'editor'
                            ? 'info'
                            : 'warning'
                        }`}
                      >
                        {ROLE_LABELS[member.role]}
                      </span>
                    )}
                  </td>
                  <td>{new Date(member.created_at).toLocaleDateString('ja-JP')}</td>
                  {isAdmin && (
                    <td>
                      {!isOwner && !isSelf && (
                        <button
                          onClick={() => handleRemoveMember(member.id, member.name)}
                          className="btn btn-sm btn-danger"
                        >
                          削除
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 権限説明 */}
      <div className="card mt-4">
        <h3 className="card-title mb-3">権限レベルについて</h3>
        <table className="table">
          <thead>
            <tr>
              <th>権限</th>
              <th>閲覧</th>
              <th>実績入力</th>
              <th>目標変更</th>
              <th>メンバー管理</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span className="badge badge-success">管理者</span></td>
              <td>○</td>
              <td>○</td>
              <td>○</td>
              <td>○</td>
            </tr>
            <tr>
              <td><span className="badge badge-info">編集者</span></td>
              <td>○</td>
              <td>○</td>
              <td>×</td>
              <td>×</td>
            </tr>
            <tr>
              <td><span className="badge badge-warning">閲覧者</span></td>
              <td>○</td>
              <td>×</td>
              <td>×</td>
              <td>×</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* メンバー追加モーダル */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">メンバー追加</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}

            <form onSubmit={handleAddMember}>
              <div className="form-group">
                <label className="form-label">メールアドレス</label>
                <input
                  type="email"
                  className="form-input"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  placeholder="追加するユーザーのメールアドレス"
                  required
                />
                <p className="text-xs text-gray mt-1">
                  ※ 登録済みのユーザーのみ追加できます
                </p>
              </div>

              <div className="form-group">
                <label className="form-label">権限</label>
                <select
                  className="form-select"
                  value={newMemberRole}
                  onChange={(e) => setNewMemberRole(e.target.value as RoleType)}
                >
                  <option value="viewer">閲覧者（閲覧のみ）</option>
                  <option value="editor">編集者（実績入力可能）</option>
                  <option value="admin">管理者（すべての操作可能）</option>
                </select>
              </div>

              <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  キャンセル
                </button>
                <button type="submit" className="btn btn-primary" disabled={adding}>
                  {adding ? '追加中...' : '追加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
