import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SuperAdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSetup, setIsSetup] = useState(false);
  const [name, setName] = useState('');
  const [setupKey, setSetupKey] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch('/api/super-admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'ログインに失敗しました');
      }

      localStorage.setItem('superAdminToken', data.token);
      localStorage.setItem('superAdmin', JSON.stringify(data.admin));
      navigate('/super-admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ログインに失敗しました');
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch('/api/super-admin/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, setupKey }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'セットアップに失敗しました');
      }

      localStorage.setItem('superAdminToken', data.token);
      localStorage.setItem('superAdmin', JSON.stringify(data.admin));
      navigate('/super-admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'セットアップに失敗しました');
    }
  };

  return (
    <div className="loading" style={{ minHeight: '100vh', background: 'var(--gray-50)' }}>
      <div className="card" style={{ maxWidth: '400px', width: '100%', padding: '2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: '48px',
            height: '48px',
            background: 'var(--primary-light)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1rem'
          }}>
            <span style={{ color: 'var(--primary)', fontSize: '1.25rem', fontWeight: 600 }}>D</span>
          </div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.25rem' }}>
            {isSetup ? 'スーパー管理者セットアップ' : 'スーパー管理者ログイン'}
          </h1>
          <p style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}>プラットフォーム管理</p>
        </div>

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={isSetup ? handleSetup : handleLogin}>
          {isSetup && (
            <>
              <div className="form-group">
                <label className="form-label">名前</label>
                <input
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">セットアップキー</label>
                <input
                  type="text"
                  className="form-input"
                  value={setupKey}
                  onChange={(e) => setSetupKey(e.target.value)}
                  placeholder="initial-setup-key-change-me"
                  required
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label className="form-label">メールアドレス</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">パスワード</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
            {isSetup ? 'セットアップ' : 'ログイン'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <button
            onClick={() => setIsSetup(!isSetup)}
            style={{
              color: 'var(--primary)',
              fontWeight: 500,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontSize: '0.875rem'
            }}
          >
            {isSetup ? 'ログインに戻る' : '初回セットアップ'}
          </button>
        </div>

        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--gray-200)', textAlign: 'center' }}>
          <a
            href="/login"
            style={{
              color: 'var(--gray-500)',
              fontSize: '0.875rem',
              textDecoration: 'none'
            }}
          >
            通常ログインへ
          </a>
        </div>
      </div>
    </div>
  );
}
