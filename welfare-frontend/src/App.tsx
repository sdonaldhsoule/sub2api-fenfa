import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { LoginPage } from './pages/LoginPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { CheckinPage } from './pages/CheckinPage';
import { AdminPage } from './pages/AdminPage';

function AuthLoadingScreen() {
  return (
    <div className="page page-center">
      <div className="card auth-card">
        <span className="eyebrow">身份验证</span>
        <h1 className="hero-title">正在校验会话</h1>
        <p className="loading-text">请稍候...</p>
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const location = useLocation();
  const { status } = useAuth();

  if (status === 'loading') {
    return <AuthLoadingScreen />;
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        path="/checkin"
        element={
          <RequireAuth>
            <CheckinPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/checkin" replace />} />
    </Routes>
  );
}
