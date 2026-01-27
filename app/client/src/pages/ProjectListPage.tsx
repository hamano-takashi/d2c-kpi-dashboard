import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { projects, auth } from '../utils/api';
import { Project, ROLE_LABELS } from '../types';

export default function ProjectListPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [showProjectDeleteModal, setShowProjectDeleteModal] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async (retry = true) => {
    setLoadError(false);
    try {
      const data = await projects.list();
      setProjectList(data);
    } catch (err) {
      console.error('Failed to load projects:', err);
      if (retry) {
        // サーバーのコールドスタート対策: 3秒後にリトライ
        await new Promise(resolve => setTimeout(resolve, 3000));
        try {
          const data = await projects.list();
          setProjectList(data);
          return;
        } catch (retryErr) {
          console.error('Retry failed:', retryErr);
        }
      }
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setCreating(true);
    try {
      const newProject = await projects.create({ name: newProjectName });
      navigate(`/project/${newProject.id}`);
    } catch (err) {
      console.error('Failed to create project:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletePassword) return;

    setDeleting(true);
    setDeleteError('');

    try {
      await auth.deleteAccount(deletePassword);
      logout();
      navigate('/login');
    } catch (err: any) {
      setDeleteError(err.message || 'アカウント削除に失敗しました');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;

    setDeletingProject(true);
    try {
      await projects.delete(projectToDelete.id);
      setShowProjectDeleteModal(false);
      setProjectToDelete(null);
      // 削除成功後、リストから直接除外してからリロード
      setProjectList(prev => prev.filter(p => p.id !== projectToDelete.id));
      loadProjects(false);
    } catch (err: any) {
      alert(err.message || 'プロジェクト削除に失敗しました');
    } finally {
      setDeletingProject(false);
    }
  };

  const openProjectDeleteModal = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    setProjectToDelete(project);
    setShowProjectDeleteModal(true);
  };

  if (loading) {
    return (
      <div className="loading" style={{ minHeight: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--gray-50)', padding: '2rem' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <div className="flex-between mb-4">
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>プロジェクト一覧</h1>
            <p className="text-gray text-sm">{user?.name} さん</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowModal(true)} className="btn btn-primary">
              + 新規プロジェクト
            </button>
            <button onClick={handleLogout} className="btn btn-secondary">
              ログアウト
            </button>
            <button onClick={() => setShowDeleteModal(true)} className="btn btn-danger">
              アカウント削除
            </button>
          </div>
        </div>

        {loadError ? (
          <div className="card text-center" style={{ padding: '3rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
            <h2 style={{ marginBottom: '0.5rem' }}>データの読み込みに失敗しました</h2>
            <p className="text-gray mb-4">サーバーに接続できませんでした。しばらく待ってから再試行してください。</p>
            <button
              onClick={() => {
                setLoading(true);
                loadProjects();
              }}
              className="btn btn-primary"
            >
              再読み込み
            </button>
          </div>
        ) : projectList.length === 0 ? (
          <div className="card text-center" style={{ padding: '3rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
            <h2 style={{ marginBottom: '0.5rem' }}>プロジェクトがありません</h2>
            <p className="text-gray mb-4">新規プロジェクトを作成して、KPI管理を始めましょう</p>
            <button onClick={() => setShowModal(true)} className="btn btn-primary">
              + 新規プロジェクト作成
            </button>
          </div>
        ) : (
          <div className="grid grid-3">
            {projectList.map((project) => (
              <div
                key={project.id}
                className="card"
                style={{ cursor: 'pointer', position: 'relative' }}
                onClick={() => navigate(`/project/${project.id}`)}
              >
                <div className="flex-between mb-2">
                  <span style={{ fontSize: '1.5rem' }}>📊</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className={`badge badge-${project.role === 'admin' ? 'success' : project.role === 'editor' ? 'info' : 'warning'}`}>
                      {ROLE_LABELS[project.role]}
                    </span>
                    {project.role === 'admin' && (
                      <button
                        onClick={(e) => openProjectDeleteModal(project, e)}
                        className="btn btn-sm"
                        style={{
                          padding: '0.25rem 0.75rem',
                          fontSize: '0.75rem',
                          background: 'var(--danger)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          zIndex: 10,
                          position: 'relative',
                        }}
                      >
                        削除
                      </button>
                    )}
                  </div>
                </div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  {project.name}
                </h3>
                <p className="text-gray text-sm">
                  オーナー: {project.owner_name}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">新規プロジェクト作成</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleCreateProject}>
              <div className="form-group">
                <label className="form-label">プロジェクト名</label>
                <input
                  type="text"
                  className="form-input"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="例: D2C事業KPI管理"
                  required
                />
              </div>

              <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  キャンセル
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? '作成中...' : '作成'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ color: 'var(--danger)' }}>アカウント削除</h2>
              <button className="modal-close" onClick={() => setShowDeleteModal(false)}>
                ×
              </button>
            </div>

            <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
              この操作は取り消せません。アカウントを削除すると、すべてのデータが失われます。
            </div>

            {deleteError && (
              <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
                {deleteError}
              </div>
            )}

            <form onSubmit={handleDeleteAccount}>
              <div className="form-group">
                <label className="form-label">パスワードを入力して確認</label>
                <input
                  type="password"
                  className="form-input"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="現在のパスワード"
                  required
                />
              </div>

              <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeletePassword('');
                    setDeleteError('');
                  }}
                >
                  キャンセル
                </button>
                <button type="submit" className="btn btn-danger" disabled={deleting}>
                  {deleting ? '削除中...' : 'アカウントを削除'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showProjectDeleteModal && projectToDelete && (
        <div className="modal-overlay" onClick={() => setShowProjectDeleteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ color: 'var(--danger)' }}>プロジェクト削除</h2>
              <button className="modal-close" onClick={() => setShowProjectDeleteModal(false)}>
                ×
              </button>
            </div>

            <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
              この操作は取り消せません。プロジェクト「{projectToDelete.name}」と、関連するすべてのデータ（目標値、実績値）が削除されます。
            </div>

            <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowProjectDeleteModal(false);
                  setProjectToDelete(null);
                }}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDeleteProject}
                disabled={deletingProject}
              >
                {deletingProject ? '削除中...' : 'プロジェクトを削除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
