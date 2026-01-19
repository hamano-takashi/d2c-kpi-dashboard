import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { projects } from '../utils/api';
import { Project, ROLE_LABELS } from '../types';

export default function ProjectListPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const data = await projects.list();
      setProjectList(data);
    } catch (err) {
      console.error('Failed to load projects:', err);
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
          </div>
        </div>

        {projectList.length === 0 ? (
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
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/project/${project.id}`)}
              >
                <div className="flex-between mb-2">
                  <span style={{ fontSize: '1.5rem' }}>📊</span>
                  <span className={`badge badge-${project.role === 'admin' ? 'success' : project.role === 'editor' ? 'info' : 'warning'}`}>
                    {ROLE_LABELS[project.role]}
                  </span>
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
    </div>
  );
}
