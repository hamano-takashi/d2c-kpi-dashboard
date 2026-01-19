import { useState, useEffect } from 'react';
import { NavLink, Outlet, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { projects } from '../utils/api';
import { Project } from '../types';

export default function Layout() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    if (projectId) {
      projects.get(projectId)
        .then(setProject)
        .catch(() => navigate('/'));
    }
  }, [projectId, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

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
