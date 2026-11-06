import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { HOME_BY_ROLE, ROLES } from './utils/roles';
import LoadingScreen from './components/LoadingScreen';
import AppShell from './components/AppShell';

import LoginPage from './pages/auth/LoginPage';

// Agent
import AgentHome from './pages/agent/AgentHome';
import SubmitResultPage from './pages/agent/SubmitResultPage';
import SubmitIncidentPage from './pages/agent/SubmitIncidentPage';
import OfflineQueuePage from './pages/agent/OfflineQueuePage';

// Admin
import AdminDashboard from './pages/admin/AdminDashboard';
import DashboardState from './pages/admin/DashboardState';
import DashboardLGA from './pages/admin/DashboardLGA';
import DashboardWard from './pages/admin/DashboardWard';
import ResultsReviewPage from './pages/admin/ResultsReviewPage';
import IncidentsPage from './pages/admin/IncidentsPage';
import ElectionsPage from './pages/admin/ElectionsPage';
import PartiesPage from './pages/admin/PartiesPage';

import NotFoundPage from './pages/NotFoundPage';

const ADMIN_ROLES = [
  ROLES.NATIONAL_SUPER_ADMIN,
  ROLES.STATE_ADMIN,
  ROLES.LGA_ADMIN,
  ROLES.WARD_ADMIN,
  ROLES.OBSERVER,
];

function RequireAuth({ roles }) {
  const { isAuthenticated, loading, user } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={HOME_BY_ROLE[user.role] || '/'} replace />;
  }
  return <Outlet />;
}

// Scroll to top on every navigation — critical for drill-downs where the
// user clicks a state row, lands on the state page mid-scroll, and expects
// to be at the top.
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}

export default function App() {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) return <LoadingScreen />;

  return (
    <>
      <ScrollToTop />
      <Routes>
        {/* ---- Auth ---- */}
        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate to={HOME_BY_ROLE[user.role] || '/'} replace />
            ) : (
              <LoginPage />
            )
          }
        />

        {/* ---- Agent area ---- */}
        <Route element={<RequireAuth roles={[ROLES.POLLING_UNIT_AGENT]} />}>
          <Route path="/agent" element={<AgentHome />} />
          <Route path="/agent/submit-result" element={<SubmitResultPage />} />
          <Route path="/agent/submit-incident" element={<SubmitIncidentPage />} />
          <Route path="/agent/queue" element={<OfflineQueuePage />} />
        </Route>

        {/* ---- Admin area (wrapped in AppShell for nav + notifications) ---- */}
        <Route element={<RequireAuth roles={ADMIN_ROLES} />}>
          <Route element={<AppShell />}>
            <Route path="/admin/dashboard" element={<AdminDashboard />} />

            {/* Drill-downs */}
            <Route path="/admin/dashboard/state/:code" element={<DashboardState />} />
            <Route path="/admin/dashboard/lga/:code" element={<DashboardLGA />} />
            <Route path="/admin/dashboard/ward/:code" element={<DashboardWard />} />

            <Route path="/admin/results" element={<ResultsReviewPage />} />
            <Route path="/admin/incidents" element={<IncidentsPage />} />
            
            {/* --- NEW ROUTES --- */}
            <Route path="/admin/elections" element={<ElectionsPage />} />
            <Route path="/admin/parties" element={<PartiesPage />} />
          </Route>
        </Route>

        {/* ---- Default + 404 ---- */}
        <Route
          path="/"
          element={
            isAuthenticated ? (
              <Navigate to={HOME_BY_ROLE[user.role] || '/'} replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
