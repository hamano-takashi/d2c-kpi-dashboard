import { useState, useEffect } from 'react';
import { NavLink, Outlet, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { projects, ApiError } from '../utils/api';
import { Project } from '../types';

export default function Layout() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (projectId) {
      setLoading(true);
      setError(null);
      projects.get(projectId)
        .then(setProject)
        .catch((err) => {
          // 401エラーはapi.tsで処理されるので、ここでは403と404を処理
          if (err instanceof ApiError) {
            if (err.status === 403) {
              setError('このプロジェクトへのアクセス権限がありません');
            } else if (err.status === 404) {
              setError('プロジェクトが見つかりません');
            } else {
              setError('プロジェクトの読み込みに失敗しました');
            }
          } else {
            setError('プロジェクトの読み込みに失敗しました');
          }
        })
        .finally(() => setLoading(false));
    }
  }, [projectId]);

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

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--gray-50)', padding: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card text-center" style={{ maxWidth: '500px', padding: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ marginBottom: '0.5rem', color: 'var(--danger)' }}>エラー</h2>
          <p className="text-gray mb-4">{error}</p>
          <div className="flex gap-2" style={{ justifyContent: 'center' }}>
            <button onClick={() => navigate('/')} className="btn btn-primary">
              プロジェクト一覧に戻る
            </button>
            <button onClick={() => window.location.reload()} className="btn btn-secondary">
              再読み込み
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="loading" style={{ minHeight: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  const navItems = [
    { to: '', icon: '📊', label: 'サマリー', end: true },
    { to: 'tree', icon: '🌳', label: 'KPIツリー' },
    { to: 'entry', icon: '📝', label: '実績入力', roles: ['admin', 'editor'] },
    { to: 'members', icon: '👥', label: 'メンバー' },
    { to: 'settings', icon: '⚙️', label: '設定', roles: ['admin'] },
  ];

  const filteredNavItems = navItems.filter(
    (item) => !item.roles || item.roles.includes(project.userRole || '')
  );

  return (
    <div className="main-layout">
      <aside className="sidebar">
        <div style={{ marginBottom: '1.5rem' }}>
          <NavLink to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>
              ← プロジェクト一覧
            </div>
          </NavLink>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginTop: '0.5rem' }}>
            {project.name}
          </h2>
        </div>

        <nav>
          <ul className="nav-list">
            {filteredNavItems.map((item) => (
              <li key={item.to} className="nav-item">
                <NavLink
                  to={`/project/${projectId}${item.to ? `/${item.to}` : ''}`}
                  end={item.end}
                  className={({ isActive }) =>
                    `nav-link ${isActive ? 'active' : ''}`
                  }
                >
                  <span className="icon">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: '2rem', borderTop: '1px solid var(--gray-200)' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--gray-600)', marginBottom: '0.5rem' }}>
            {user?.name}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginBottom: '1rem' }}>
            {project.userRole === 'admin' ? '管理者' : project.userRole === 'editor' ? '編集者' : '閲覧者'}
          </div>
          <button onClick={handleLogout} className="btn btn-secondary" style={{ width: '100%' }}>
            ログアウト
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet context={{ project, user }} />
      </main>
    </div>
  );
}
