import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ensureAuth, getAccessToken } from './lib/api';
import { LoginPage } from './pages/LoginPage';
import { ReimportPage } from './pages/ReimportPage';
import { WorkGate } from './pages/WorkGate';
import { UniversitiesPage } from './pages/UniversitiesPage';
import { DestinationsPage } from './pages/DestinationsPage';
import { CountryPage } from './pages/CountryPage';
import { ImportCsvPage } from './pages/ImportCsvPage';
import { DashboardPage } from './pages/DashboardPage';
import { UnpublishedCoursesPage } from './pages/UnpublishedCoursesPage';

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
  if (getAccessToken()) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        }
      />
      <Route
        path="/unpublished"
        element={
          <RequireAuth>
            <UnpublishedCoursesPage />
          </RequireAuth>
        }
      />
      <Route
        path="/destinations"
        element={
          <RequireAuth>
            <DestinationsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/destinations/:countryId"
        element={
          <RequireAuth>
            <CountryPage />
          </RequireAuth>
        }
      />
      <Route
        path="/destinations/:countryId/import"
        element={
          <RequireAuth>
            <ImportCsvPage />
          </RequireAuth>
        }
      />
      <Route
        path="/universities"
        element={
          <RequireAuth>
            <UniversitiesPage />
          </RequireAuth>
        }
      />
      <Route
        path="/reimport"
        element={
          <RequireAuth>
            <ReimportPage />
          </RequireAuth>
        }
      />
      <Route
        path="/work/:batchId/rows/:rowIndex"
        element={
          <RequireAuth>
            <WorkGate />
          </RequireAuth>
        }
      />
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}
