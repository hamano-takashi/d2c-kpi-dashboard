import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { auth, ApiError } from '../utils/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // api.tsからの401エラー時のログアウトイベントを監視
    const handleAuthLogout = () => {
      setUser(null);
    };
    window.addEventListener('auth:logout', handleAuthLogout);

    const token = localStorage.getItem('token');
    if (token) {
      auth.me()
        .then(setUser)
        .catch((err) => {
          // 401エラーの場合のみトークンを削除（api.tsで処理済みだが念のため）
          // ネットワークエラーやタイムアウトではトークンを保持
          if (err instanceof ApiError && err.status === 401) {
            localStorage.removeItem('token');
          } else {
            // ネットワークエラー等の場合は、トークンを保持したままユーザー情報なしで続行
            // 後続のAPIコールで再認証を試みる
            console.warn('Failed to fetch user info, keeping token:', err);
          }
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }

    return () => {
      window.removeEventListener('auth:logout', handleAuthLogout);
    };
  }, []);

  const login = async (email: string, password: string) => {
    const { token, user } = await auth.login({ email, password });
    localStorage.setItem('token', token);
    setUser(user);
  };

  const register = async (email: string, password: string, name: string) => {
    const { token, user } = await auth.register({ email, password, name });
    localStorage.setItem('token', token);
    setUser(user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
