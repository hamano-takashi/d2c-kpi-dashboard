import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProjectListPage from './pages/ProjectListPage';
import DashboardPage from './pages/DashboardPage';
import KpiTreePage from './pages/KpiTreePage';
import DataEntryPage from './pages/DataEntryPage';
import MembersPage from './pages/MembersPage';
import SettingsPage from './pages/SettingsPage';
import Layout from './components/Layout';

// Super Admin Pages
import SuperAdminLoginPage from './pages/super-admin/SuperAdminLoginPage';
import SuperAdminDashboard from './pages/super-admin/SuperAdminDashboard';
import TenantDetailPage from './pages/super-admin/TenantDetailPage';

// Invitation Page
import InvitationPage from './pages/InvitationPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  // トークンがある場合は、userがnullでもアクセスを許可
  // （ネットワークエラー等でuser取得に失敗した場合）
  // 実際の認証チェックは各APIコールで行われる
  const hasToken = !!localStorage.getItem('token');

  if (!user && !hasToken) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading" style={{ minHeight: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Routes>
        {/* Super Admin Routes */}
        <Route path="/super-admin/login" element={<SuperAdminLoginPage />} />
        <Route path="/super-admin" element={<SuperAdminDashboard />} />
        <Route path="/super-admin/tenants/:tenantId" element={<TenantDetailPage />} />

        {/* Invitation Route */}
        <Route path="/invite/:token" element={<InvitationPage />} />

        {/* Regular User Routes */}
        <Route
          path="/login"
          element={user ? <Navigate to="/" replace /> : <LoginPage />}
        />
        <Route
          path="/register"
          element={user ? <Navigate to="/" replace /> : <RegisterPage />}
        />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <ProjectListPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/project/:projectId"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="tree" element={<KpiTreePage />} />
          <Route path="entry" element={<DataEntryPage />} />
          <Route path="members" element={<MembersPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </div>
  );
}

export default App;
