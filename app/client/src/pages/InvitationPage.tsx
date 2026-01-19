import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

interface InvitationInfo {
  email: string;
  role: string;
  tenantName: string;
  expiresAt: string;
}

export default function InvitationPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchInvitation();
  }, [token]);

  const fetchInvitation = async () => {
    try {
      const res = await fetch(`/api/auth/invitation/${token}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '招待の取得に失敗しました');
      }

      setInvitation(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '招待の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('パスワードが一致しません');
      return;
    }

    if (password.length < 6) {
      setError('パスワードは6文字以上で入力してください');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/register-by-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, name }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '登録に失敗しました');
      }

      // ログイン状態を保存
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      // プロジェクト一覧へリダイレクト
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登録に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="loading" style={{ minHeight: '100vh' }}>
        <div className="spinner"></div>
        <p style={{ color: 'var(--gray-500)', marginTop: '1rem', fontSize: '0.875rem' }}>招待情報を確認中...</p>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="loading" style={{ minHeight: '100vh', background: 'var(--gray-50)' }}>
        <div className="card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center', padding: '2rem' }}>
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
          <h1 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>招待が無効です</h1>
          <p style={{ color: 'var(--gray-500)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>{error}</p>
          <button onClick={() => navigate('/login')} className="btn btn-primary">
            ログインページへ
          </button>
        </div>
      </div>
    );
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin':
        return '管理者';
      case 'editor':
        return '編集者';
      default:
        return '閲覧者';
    }
  };

  return (
    <div className="loading" style={{ minHeight: '100vh', background: 'var(--gray-50)', padding: '2rem' }}>
      <div className="card" style={{ maxWidth: '450px', width: '100%', padding: '2rem' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
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
            <span style={{ color: 'var(--primary)', fontSize: '1.25rem' }}>+</span>
          </div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.25rem' }}>招待を受け取りました</h1>
          <p style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}>
            <span style={{ color: 'var(--primary)', fontWeight: 500 }}>{invitation?.tenantName}</span> への参加招待です
          </p>
        </div>

        {/* Invitation Info */}
        <div style={{
          background: 'var(--gray-50)',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1.5rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}>メールアドレス</span>
            <span style={{ fontSize: '0.875rem' }}>{invitation?.email}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}>付与される権限</span>
            <span className={`badge ${
              invitation?.role === 'admin' ? 'badge-success' :
              invitation?.role === 'editor' ? '' : ''
            }`}>
              {getRoleLabel(invitation?.role || 'viewer')}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}>有効期限</span>
            <span style={{ fontSize: '0.875rem' }}>
              {invitation?.expiresAt ? new Date(invitation.expiresAt).toLocaleDateString('ja-JP') : '-'}
            </span>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {/* Registration Form */}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">お名前</label>
            <input
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="山田 太郎"
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
              placeholder="6文字以上"
              required
              minLength={6}
            />
          </div>

          <div className="form-group">
            <label className="form-label">パスワード（確認）</label>
            <input
              type="password"
              className="form-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="もう一度入力"
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.5rem' }}
          >
            {submitting ? '登録中...' : 'アカウントを作成して参加'}
          </button>
        </form>

        {/* Footer */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--gray-200)', textAlign: 'center' }}>
          <p style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}>
            既にアカウントをお持ちですか？{' '}
            <button
              onClick={() => navigate('/login')}
              style={{
                color: 'var(--primary)',
                fontWeight: 500,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0
              }}
            >
              ログイン
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
