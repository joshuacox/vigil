import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useColorScheme } from '../contexts/ColorSchemeContext';
import { VigilMark } from '../shared/VigilLogo';
import Loader from './Loader';
import '../../../../docs/design/console/tokens/tokens.css';
import '../styles.css';
import '../shell/shell.css';

// Shown instead of a redirect to /login when /auth/me never got a real
// answer: the session state is unknown, not signed out. Built from the
// Loader look (soc-loader styles) and the console tokens.
function BackendUnreachable({ onRetry }: { onRetry: () => void }) {
  const { scheme } = useColorScheme();
  return (
    <div
      className={`soc-console soc-loader soc-unreachable ${scheme === 'light' ? 'vg-light' : 'vg-dark'}`}
      data-theme={scheme}
    >
      <div className="soc-loader-inner soc-unreachable-inner">
        <VigilMark className="soc-loader-mark" />
        <h1 className="soc-unreachable-title">Can&rsquo;t reach Vigil</h1>
        <p className="soc-unreachable-message">
          {"Can't reach the Vigil API. Is the backend running?"}
        </p>
        <button type="button" className="soc-unreachable-retry" onClick={onRetry}>
          Retry
        </button>
      </div>
    </div>
  );
}

// Auth only. Per-screen permissions live in SocConsole's SCREEN_PERMS.
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, backendUnreachable, retryLoadUser } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <Loader />;
  }

  if (backendUnreachable) {
    return <BackendUnreachable onRetry={() => void retryLoadUser?.()} />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
