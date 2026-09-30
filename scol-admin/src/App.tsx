import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ensureAuth, getAccessToken } from './lib/api';
import {
  getWorkSession,
  workSessionPath,
} from './lib/workSession';
import { LoginPage } from './pages/LoginPage';
import { RowEditorPage } from './pages/RowEditorPage';
import { UniversitiesPage } from './pages/UniversitiesPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureAuth();
      if (!cancelled) {
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-600">
        Loading…
      </div>
    );
  }

  if (!getAccessToken()) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return children;
}

function RootRedirect() {
  const session = getWorkSession();
  if (getAccessToken() && session) {
    return <Navigate to={workSessionPath(session)} replace />;
  }
  if (getAccessToken()) {
    return <Navigate to="/universities" replace />;
  }
  return <Navigate to="/login" replace />;
}

function UniversitiesGate() {
  const session = getWorkSession();
  if (session) {
    return <Navigate to={workSessionPath(session)} replace />;
  }
  return (
    <RequireAuth>
      <UniversitiesPage />
    </RequireAuth>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/universities" element={<UniversitiesGate />} />
      <Route
        path="/work/:batchId/rows/:rowIndex"
        element={
          <RequireAuth>
            <RowEditorPage />
          </RequireAuth>
        }
      />
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}
